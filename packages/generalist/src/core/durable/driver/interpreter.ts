import { Cause, Context, Effect, Exit, Function, Layer, Option, Ref, Schema, Semaphore, Stream } from "effect"
import type { DriverCheckpoint, DriverOperation, OperationOutcome } from "./contract.js"
import { DriverError, DriverStateInvalid, type DurableAgentDriver } from "../service.js"
import {
  refundUnused,
  reserveChild,
  type BudgetLimits,
  type RunBudget,
  Exhausted,
  type GrantWidened,
} from "../run-budget.js"
import { CurrentModelCallOrdinal } from "../operation-context.js"
import { LoopDriverState } from "../loop-driver-state.js"
import { applyCommit, chargeUsage as chargeCheckpointUsage, withBudget, withHandoffState } from "../loop-driver.js"
import type { ControlState } from "../../agent/handoff/state.js"
import { OperationOutcomeResolution } from "./operation-outcome.js"
import type { ToolBatchCheckpoint } from "../../agent/tools/checkpoint.js"
import { fromInput as operationFrom, modelCallOrdinal, type OperationSpec } from "./operation.js"
import { scheduleOperations } from "./schedule.js"
export type { OperationSpec } from "./operation.js"
type OperationFailure = Extract<OperationOutcome, { readonly _tag: "Failed" }>["error"]
/** @experimental Recorded operation for tests and future runtime journaling. */
export interface RecordedOperation {
  readonly operation: DriverOperation
  readonly outcome: OperationOutcome
  readonly checkpoint: DriverCheckpoint
}
/** @experimental Host hook surface for durable operation journaling without runtime imports. */
export interface Journal {
  readonly onScheduled: (
    operation: DriverOperation,
    checkpoint: DriverCheckpoint,
  ) => Effect.Effect<OperationOutcome | void, DriverError>
  readonly onCompleted: (
    operation: DriverOperation,
    outcome: OperationOutcome,
    checkpoint: DriverCheckpoint,
  ) => Effect.Effect<void, DriverError>
  readonly onCheckpoint: (checkpoint: DriverCheckpoint) => Effect.Effect<void, DriverError>
}
/** @experimental Optional host journal service merged into Agent.stream driver layers. */
export class DriverJournal extends Context.Service<DriverJournal, Journal>()(
  "generalist/core/durable/driver/interpreter/DriverJournal",
) {}
/** @experimental Caller-owned successful stream result and replay codec. */
export interface StreamSuccessCodec<A, Success, ReplayError = never, ReplayServices = never> {
  readonly observe: (value: A) => void
  /** Whether the source reached its authored semantic terminal value rather than a downstream consumer stopping early. */
  readonly isComplete?: () => boolean
  readonly complete: () => Success
  readonly replay: (success: Success) => Stream.Stream<A, ReplayError, ReplayServices>
}

/** @experimental Collect and replay one stream as its emitted values. */
export const arrayStreamCodec = <A>(): StreamSuccessCodec<A, ReadonlyArray<A>> => {
  const values = new Array<A>()
  return {
    observe: (value) => void values.push(value),
    complete: () => values,
    replay: Stream.fromIterable,
  }
}

type OperationError<E> = E | DriverError | DriverStateInvalid | DriverUnknownReplay | Exhausted
type OperationSpecServices<SRD, SRE, FRD, FRE> = SRD | SRE | FRD | FRE
/** @experimental Inline interpreter executing driver operations through Effect services. */
export interface Service {
  readonly checkpoint: Effect.Effect<DriverCheckpoint>
  readonly run: <A, E, R, SRD, SRE, FRD, FRE>(
    spec: OperationSpec<A, E, SRD, SRE, FRD, FRE>,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, OperationError<E>, R | OperationSpecServices<SRD, SRE, FRD, FRE>>
  readonly runStream: <A, E, R, Success, ReplayError, ReplayServices, SRD, SRE, FRD, FRE>(
    spec: OperationSpec<Success, E, SRD, SRE, FRD, FRE>,
    stream: Stream.Stream<A, E, R>,
    options: {
      readonly successCodec: StreamSuccessCodec<A, Success, ReplayError, ReplayServices>
    },
  ) => Stream.Stream<A, OperationError<E> | ReplayError, R | ReplayServices | OperationSpecServices<SRD, SRE, FRD, FRE>>
  readonly setToolBatch: (
    checkpoint: ToolBatchCheckpoint | undefined,
  ) => Effect.Effect<void, DriverError | DriverStateInvalid>
  readonly updateToolBatch: (
    update: (checkpoint: ToolBatchCheckpoint) => ToolBatchCheckpoint,
  ) => Effect.Effect<ToolBatchCheckpoint, DriverError | DriverStateInvalid>
  readonly recorded: Effect.Effect<ReadonlyArray<RecordedOperation>>
  readonly abortPending: (
    error: OperationFailure,
  ) => Effect.Effect<void, DriverError | DriverStateInvalid | DriverUnknownReplay>
  readonly chargeUsage: (usage: BudgetLimits) => Effect.Effect<void, DriverError | Exhausted>
  readonly setBudget: (budget: RunBudget) => Effect.Effect<void, DriverError>
  readonly reserveChild: (grant: BudgetLimits) => Effect.Effect<RunBudget, DriverError | Exhausted | GrantWidened>
  readonly refundChild: (child: RunBudget) => Effect.Effect<void, DriverError>
  readonly setHandoffState: (state: ControlState) => Effect.Effect<void, DriverError | DriverStateInvalid>
}
/** @experimental */
export class DriverUnknownReplay extends Schema.TaggedError<DriverUnknownReplay>()(
  "generalist/core/DriverUnknownReplay",
  { operationKey: Schema.String, operationId: Schema.String },
) {}
/** @experimental */
export class DriverInterpreter extends Context.Service<DriverInterpreter, Service>()(
  "generalist/core/durable/driver/interpreter/DriverInterpreter",
) {}
const noopJournal: Journal = {
  onScheduled: () => Effect.void,
  onCompleted: () => Effect.void,
  onCheckpoint: () => Effect.void,
}
/** @experimental */
export const guardUnknownNeverReplay: {
  (outcome: OperationOutcome): (operation: DriverOperation) => Effect.Effect<void, DriverUnknownReplay>
  (operation: DriverOperation, outcome: OperationOutcome): Effect.Effect<void, DriverUnknownReplay>
} = Function.dual(
  2,
  (operation: DriverOperation, outcome: OperationOutcome): Effect.Effect<void, DriverUnknownReplay> =>
    outcome._tag === "Unknown" && operation.replayPolicy === "never"
      ? DriverUnknownReplay.make({ operationKey: operation.key, operationId: outcome.operationId })
      : Effect.void,
)
/** @experimental */
export const make = (input: {
  readonly driver: DurableAgentDriver
  readonly journal?: Journal
  readonly initial: DriverCheckpoint
}): Effect.Effect<Service> =>
  Effect.gen(function* () {
    const checkpointRef = yield* Ref.make(input.initial)
    const recordedRef = yield* Ref.make<ReadonlyArray<RecordedOperation>>([])
    const commitSemaphore = yield* Semaphore.make(1)
    const journal = input.journal ?? noopJournal
    const schedule = scheduleOperations({ checkpointRef, driver: input.driver, journal, semaphore: commitSemaphore })
    const codecFailure = (spec: { readonly key: string }, branch: "success" | "failure", error: Schema.SchemaError) =>
      DriverStateInvalid.make({ message: `Operation ${spec.key} has an invalid ${branch} outcome: ${error.message}` })
    const encodeOutcome = <A, E, SRD, SRE, FRD, FRE>(
      spec: OperationSpec<A, E, SRD, SRE, FRD, FRE>,
      outcome: OperationOutcome,
    ): Effect.Effect<OperationOutcome, DriverStateInvalid, SRE | FRE> => {
      if (outcome._tag === "Succeeded") {
        return Schema.encodeUnknownEffect(spec.success)(outcome.value).pipe(
          Effect.map((value): OperationOutcome => ({ _tag: "Succeeded", value })),
          Effect.mapError((error) => codecFailure(spec, "success", error)),
        )
      }
      if (outcome._tag === "Failed") {
        return Schema.encodeUnknownEffect(spec.failure)(outcome.error).pipe(
          Effect.map((error): OperationOutcome => ({ _tag: "Failed", error })),
          Effect.mapError((error) => codecFailure(spec, "failure", error)),
        )
      }
      return Effect.succeed(outcome)
    }
    const commit = (
      operation: DriverOperation,
      outcome: OperationOutcome,
      batchTool = false,
      nested = false,
      applyCheckpoint?: (checkpoint: DriverCheckpoint, outcome: OperationOutcome) => DriverCheckpoint,
    ): Effect.Effect<void, DriverError | DriverStateInvalid | DriverUnknownReplay> =>
      commitSemaphore.withPermit(
        Effect.gen(function* () {
          const before = yield* Ref.get(checkpointRef)
          let after: DriverCheckpoint
          if (nested) {
            after =
              outcome._tag === "Succeeded" && operation.kind === "handoff"
                ? yield* applyCommit(before, outcome.value)
                : before
            if (applyCheckpoint !== undefined) after = applyCheckpoint(after, outcome)
          } else if (batchTool) {
            if (applyCheckpoint === undefined) {
              return yield* DriverStateInvalid.make({
                message: `Scheduled batch tool ${operation.key} has no checkpoint transition`,
              })
            }
            after = applyCheckpoint(before, outcome)
          } else {
            after = outcome._tag === "Unknown" ? before : yield* input.driver.apply(before, outcome)
            if (applyCheckpoint !== undefined) after = applyCheckpoint(after, outcome)
          }
          yield* Ref.set(checkpointRef, after)
          yield* Ref.update(recordedRef, (current) => [...current, { operation, outcome, checkpoint: after }])
          yield* journal.onCompleted(operation, outcome, after)
        }),
      )
    const applyReplay = (
      operation: DriverOperation,
      replay: OperationOutcome,
      batchTool: boolean,
      nested: boolean,
      applyCheckpoint?: (checkpoint: DriverCheckpoint, outcome: OperationOutcome) => DriverCheckpoint,
    ): Effect.Effect<void, DriverError | DriverStateInvalid> =>
      commitSemaphore.withPermit(
        Effect.gen(function* () {
          const before = yield* Ref.get(checkpointRef)
          let after = before
          if (nested) {
            if (replay._tag === "Succeeded" && operation.kind === "handoff") {
              after = yield* applyCommit(before, replay.value)
            }
          } else if (batchTool) {
            if (applyCheckpoint === undefined) {
              return yield* DriverStateInvalid.make({
                message: `Scheduled batch tool ${operation.key} has no checkpoint transition`,
              })
            }
          } else if (replay._tag !== "Unknown") {
            after = yield* input.driver.apply(before, replay)
          }
          if (applyCheckpoint !== undefined) after = applyCheckpoint(after, replay)
          yield* Ref.set(checkpointRef, after)
        }),
      )
    const run = <A, E, R, SRD, SRE, FRD, FRE>(
      spec: OperationSpec<A, E, SRD, SRE, FRD, FRE>,
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<
      A,
      E | DriverError | DriverStateInvalid | DriverUnknownReplay | Exhausted,
      R | OperationSpecServices<SRD, SRE, FRD, FRE>
    > =>
      Effect.gen(function* () {
        const { operation, replay, batchTool, nested = false } = yield* schedule(spec)
        if (replay !== undefined) {
          yield* guardUnknownNeverReplay(operation, replay)
          if (replay._tag === "Succeeded") {
            const value = yield* Schema.decodeUnknownEffect(spec.success)(replay.value).pipe(
              Effect.mapError((error) => codecFailure(spec, "success", error)),
            )
            yield* applyReplay(operation, replay, batchTool, nested, spec.applyCheckpoint)
            return value
          }
          if (replay._tag === "Failed") {
            const failure = yield* Schema.decodeUnknownEffect(spec.failure)(replay.error).pipe(
              Effect.mapError((schemaError) => codecFailure(spec, "failure", schemaError)),
            )
            yield* applyReplay(operation, replay, batchTool, nested, spec.applyCheckpoint)
            return yield* Effect.fail(failure)
          }
          yield* applyReplay(operation, replay, batchTool, nested, spec.applyCheckpoint)
          return yield* DriverUnknownReplay.make({ operationKey: operation.key, operationId: replay.operationId })
        }
        const ordinal = modelCallOrdinal(spec)
        const exit = yield* effect.pipe(Effect.provideService(CurrentModelCallOrdinal, ordinal), Effect.exit)
        const outcome = OperationOutcomeResolution.outcomeFromExit(operation, exit)
        if (outcome !== undefined) {
          const encoded = yield* encodeOutcome(spec, outcome)
          yield* encoded._tag === "Unknown"
            ? Effect.uninterruptible(commit(operation, encoded, batchTool, nested, spec.applyCheckpoint))
            : commit(operation, encoded, batchTool, nested, spec.applyCheckpoint)
        }
        return yield* Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause)
      })
    const interpreter: Service = {
      checkpoint: Ref.get(checkpointRef),
      run,
      runStream: <A, E, R, Success, ReplayError, ReplayServices, SRD, SRE, FRD, FRE>(
        spec: OperationSpec<Success, E, SRD, SRE, FRD, FRE>,
        stream: Stream.Stream<A, E, R>,
        options: { readonly successCodec: StreamSuccessCodec<A, Success, ReplayError, ReplayServices> },
      ): Stream.Stream<
        A,
        OperationError<E> | ReplayError,
        R | ReplayServices | OperationSpecServices<SRD, SRE, FRD, FRE>
      > =>
        Stream.unwrap<
          A,
          E | DriverError | DriverStateInvalid | DriverUnknownReplay | ReplayError,
          R | ReplayServices | SRE | FRE,
          OperationError<E>,
          SRD | FRD
        >(
          Effect.gen(function* () {
            const { operation, replay, batchTool, nested = false } = yield* schedule(spec)
            const codec = options.successCodec
            if (replay !== undefined) {
              yield* guardUnknownNeverReplay(operation, replay)
              if (replay._tag === "Succeeded") {
                const success = yield* Schema.decodeUnknownEffect(spec.success)(replay.value).pipe(
                  Effect.mapError((error) => codecFailure(spec, "success", error)),
                )
                yield* applyReplay(operation, replay, batchTool, nested, spec.applyCheckpoint)
                return codec.replay(success)
              }
              if (replay._tag === "Failed") {
                const failure = yield* Schema.decodeUnknownEffect(spec.failure)(replay.error).pipe(
                  Effect.mapError((schemaError) => codecFailure(spec, "failure", schemaError)),
                )
                yield* applyReplay(operation, replay, batchTool, nested, spec.applyCheckpoint)
                return Stream.fail(failure)
              }
              yield* applyReplay(operation, replay, batchTool, nested, spec.applyCheckpoint)
              return Stream.fail(
                DriverUnknownReplay.make({ operationKey: operation.key, operationId: replay.operationId }),
              )
            }
            const ordinal = modelCallOrdinal(spec)
            return stream.pipe(
              Stream.provideService(CurrentModelCallOrdinal, ordinal),
              Stream.tap((value) => Effect.sync(() => codec.observe(value))),
              Stream.catchCause((cause) => {
                if (Cause.hasInterrupts(cause)) return Stream.failCause(cause)
                const outcome = OperationOutcomeResolution.outcomeFromExit(operation, Exit.failCause(cause))
                if (outcome === undefined) return Stream.failCause(cause)
                const persist = encodeOutcome(spec, outcome).pipe(
                  Effect.flatMap((encoded) =>
                    encoded._tag === "Unknown"
                      ? Effect.uninterruptible(commit(operation, encoded, batchTool, nested, spec.applyCheckpoint))
                      : commit(operation, encoded, batchTool, nested, spec.applyCheckpoint),
                  ),
                )
                return Stream.fromEffect(persist).pipe(Stream.drain, Stream.concat(Stream.failCause(cause)))
              }),
              Stream.onExit((exit) =>
                Effect.gen(function* () {
                  if (Exit.isSuccess(exit) || !Cause.hasInterrupts(exit.cause)) return
                  const outcome = OperationOutcomeResolution.outcomeFromExit(operation, exit)
                  if (outcome === undefined) return
                  const encoded = yield* encodeOutcome(spec, outcome)
                  yield* Effect.uninterruptible(commit(operation, encoded, batchTool, nested, spec.applyCheckpoint))
                }).pipe(Effect.orDie),
              ),
              Stream.concat(
                Stream.fromEffect(
                  Effect.gen(function* () {
                    if (codec?.isComplete?.() === false) return
                    const value = codec.complete()
                    const encoded = yield* encodeOutcome(spec, { _tag: "Succeeded", value })
                    yield* Effect.interruptible(commit(operation, encoded, batchTool, nested, spec.applyCheckpoint))
                  }),
                ).pipe(Stream.drain),
              ),
            )
          }),
        ),
      setToolBatch: (toolBatch) =>
        commitSemaphore.withPermit(
          Effect.gen(function* () {
            const current = yield* Ref.get(checkpointRef)
            const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(current.state).pipe(
              Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
            )
            const nextState =
              toolBatch === undefined ? (({ toolBatch: _toolBatch, ...rest }) => rest)(state) : { ...state, toolBatch }
            const next = { ...current, state: nextState }
            yield* Ref.set(checkpointRef, next)
            yield* journal.onCheckpoint(next)
          }),
        ),
      updateToolBatch: (update) =>
        commitSemaphore.withPermit(
          Effect.gen(function* () {
            const current = yield* Ref.get(checkpointRef)
            const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(current.state).pipe(
              Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
            )
            if (state.toolBatch === undefined) {
              return yield* DriverStateInvalid.make({ message: "Tool batch checkpoint is missing" })
            }
            const toolBatch = update(state.toolBatch)
            const next = { ...current, state: { ...state, toolBatch } }
            yield* Ref.set(checkpointRef, next)
            yield* journal.onCheckpoint(next)
            return toolBatch
          }),
        ),
      abortPending: (error) =>
        Effect.gen(function* () {
          const before = yield* Ref.get(checkpointRef)
          const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(before.state).pipe(
            Effect.mapError((invalid) => DriverStateInvalid.make({ message: String(invalid) })),
          )
          if (state.pending === undefined) return
          const operation = operationFrom(state.pending)
          yield* commit(operation, { _tag: "Failed", error })
        }),
      chargeUsage: (usage) =>
        commitSemaphore.withPermit(
          Effect.gen(function* () {
            const before = yield* Ref.get(checkpointRef)
            const after = yield* chargeCheckpointUsage(before, usage)
            yield* Ref.set(checkpointRef, after)
            yield* journal.onCheckpoint(after)
          }),
        ),
      setBudget: (budget) =>
        commitSemaphore.withPermit(
          Effect.gen(function* () {
            const before = yield* Ref.get(checkpointRef)
            const after = withBudget(before, budget)
            yield* Ref.set(checkpointRef, after)
            yield* journal.onCheckpoint(after)
          }),
        ),
      reserveChild: (grant) =>
        commitSemaphore.withPermit(
          Effect.gen(function* () {
            const before = yield* Ref.get(checkpointRef)
            const reserved = yield* reserveChild(before.budget, grant)
            const after = withBudget(before, reserved.parent)
            yield* Ref.set(checkpointRef, after)
            yield* journal.onCheckpoint(after)
            return reserved.child
          }),
        ),
      refundChild: (child) =>
        commitSemaphore.withPermit(
          Effect.gen(function* () {
            const before = yield* Ref.get(checkpointRef)
            const after = withBudget(before, refundUnused(before.budget, child))
            yield* Ref.set(checkpointRef, after)
            yield* journal.onCheckpoint(after)
          }),
        ),
      setHandoffState: (handoff) =>
        commitSemaphore.withPermit(
          Effect.gen(function* () {
            const before = yield* Ref.get(checkpointRef)
            const after = yield* withHandoffState(before, handoff)
            yield* Ref.set(checkpointRef, after)
            yield* journal.onCheckpoint(after)
          }),
        ),
      recorded: Ref.get(recordedRef),
    }
    return interpreter
  })
/** @experimental */
export const layerInline = (input: {
  readonly driver: DurableAgentDriver
  readonly journal?: Journal
  readonly initial: DriverCheckpoint
}): Layer.Layer<DriverInterpreter> =>
  Layer.effect(
    DriverInterpreter,
    Effect.gen(function* () {
      const hostJournal = yield* Effect.serviceOption(DriverJournal)
      const journal = input.journal ?? Option.getOrElse(hostJournal, () => noopJournal)
      return yield* make({ ...input, journal })
    }),
  )
/** @experimental */
export const layerTest = (input: {
  readonly driver: DurableAgentDriver
  readonly initial: DriverCheckpoint
  readonly journal?: Journal
}): Layer.Layer<DriverInterpreter> => layerInline(input)

/** @experimental */
export const operationKey = (logicalOperationId: string, ...parts: ReadonlyArray<string | number>): string =>
  [logicalOperationId, ...parts.map(String)].join(":")
