import { Cause, Context, Effect, Exit, Function, Layer, Option, Ref, Schema, Semaphore, Stream } from "effect"
import type { DriverCheckpoint, DriverOperation, OperationOutcome } from "./contract.js"
import { DriverError, DriverStateInvalid, type DurableAgentDriver } from "../service.js"
import {
  refundUnused,
  reserveChild,
  type BudgetLimits,
  type RunBudget,
  RunBudgetExhausted,
  type RunBudgetGrantWidened,
} from "../run-budget.js"
import { CurrentModelCallOrdinal } from "../operation-context.js"
import { LoopDriverState } from "../loop-driver-state.js"
import {
  applyHandoffCommit,
  chargeUsage as chargeCheckpointUsage,
  withBudget,
  withHandoffState,
} from "../loop-driver.js"
import type { HandoffControlState } from "../../agent/handoff/state.js"
import { OperationOutcomeResolution } from "./operation-outcome.js"
import type { ToolBatchCheckpoint } from "../../agent/tools/checkpoint.js"
import { decodeReplay, fromInput as operationFrom, modelCallOrdinal, type OperationSpec } from "./operation.js"
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
export interface DriverJournal {
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
export class DriverJournalService extends Context.Service<DriverJournalService, DriverJournal>()(
  "tenetkit/core/durable/driver/interpreter/DriverJournalService",
) {}
/** @experimental Caller-owned successful stream result and replay codec. */
export interface StreamSuccessCodec<A, Success, ReplayError = never, ReplayServices = never> {
  readonly observe: (value: A) => void
  /** Whether the source reached its authored semantic terminal value rather than a downstream consumer stopping early. */
  readonly isComplete?: () => boolean
  readonly complete: () => Success
  readonly replay: (success: Success) => Stream.Stream<A, ReplayError, ReplayServices>
}
type OperationError<E> = E | DriverError | DriverStateInvalid | DriverUnknownReplay | RunBudgetExhausted
/** @experimental Inline interpreter executing driver operations through Effect services. */
export interface Service {
  readonly checkpoint: Effect.Effect<DriverCheckpoint>
  readonly run: <A, E, R>(spec: OperationSpec, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, OperationError<E>, R>
  readonly runStream: {
    <A, E, R>(spec: OperationSpec, stream: Stream.Stream<A, E, R>): Stream.Stream<A, OperationError<E>, R>
    <A, E, R, Success, ReplayError, ReplayServices>(
      spec: OperationSpec,
      stream: Stream.Stream<A, E, R>,
      options: {
        readonly successCodec: StreamSuccessCodec<A, Success, ReplayError, ReplayServices>
      },
    ): Stream.Stream<A, OperationError<E> | ReplayError, R | ReplayServices>
  }
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
  readonly chargeUsage: (usage: BudgetLimits) => Effect.Effect<void, DriverError | RunBudgetExhausted>
  readonly setBudget: (budget: RunBudget) => Effect.Effect<void, DriverError>
  readonly reserveChild: (
    grant: BudgetLimits,
  ) => Effect.Effect<RunBudget, DriverError | RunBudgetExhausted | RunBudgetGrantWidened>
  readonly refundChild: (child: RunBudget) => Effect.Effect<void, DriverError>
  readonly setHandoffState: (state: HandoffControlState) => Effect.Effect<void, DriverError | DriverStateInvalid>
}
/** @experimental */
export class DriverUnknownReplay extends Schema.TaggedError<DriverUnknownReplay>()(
  "tenetkit/core/DriverUnknownReplay",
  { operationKey: Schema.String, operationId: Schema.String },
) {}
/** @experimental */
export class DriverInterpreter extends Context.Service<DriverInterpreter, Service>()(
  "tenetkit/core/durable/driver/interpreter/DriverInterpreter",
) {}
const noopJournal: DriverJournal = {
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
  readonly journal?: DriverJournal
  readonly initial: DriverCheckpoint
}): Effect.Effect<Service> =>
  Effect.gen(function* () {
    const checkpointRef = yield* Ref.make(input.initial)
    const recordedRef = yield* Ref.make<ReadonlyArray<RecordedOperation>>([])
    const commitSemaphore = yield* Semaphore.make(1)
    const journal = input.journal ?? noopJournal
    const schedule = scheduleOperations({ checkpointRef, driver: input.driver, journal, semaphore: commitSemaphore })
    const commit = (
      operation: DriverOperation,
      outcome: OperationOutcome,
      batchTool = false,
      nested = false,
      applyCheckpoint?: OperationSpec["applyCheckpoint"],
    ): Effect.Effect<void, DriverError | DriverStateInvalid | DriverUnknownReplay> =>
      commitSemaphore.withPermit(
        Effect.gen(function* () {
          const before = yield* Ref.get(checkpointRef)
          let after: DriverCheckpoint
          if (nested) {
            after =
              outcome._tag === "Succeeded" && operation.kind === "handoff"
                ? yield* applyHandoffCommit(before, outcome.value)
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
      applyCheckpoint?: OperationSpec["applyCheckpoint"],
    ): Effect.Effect<void, DriverError | DriverStateInvalid> =>
      commitSemaphore.withPermit(
        Effect.gen(function* () {
          const before = yield* Ref.get(checkpointRef)
          let after = before
          if (nested) {
            if (replay._tag === "Succeeded" && operation.kind === "handoff") {
              after = yield* applyHandoffCommit(before, replay.value)
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
    const run = <A, E, R>(
      spec: OperationSpec,
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | DriverError | DriverStateInvalid | DriverUnknownReplay | RunBudgetExhausted, R> =>
      Effect.gen(function* () {
        const { operation, replay, batchTool, nested = false } = yield* schedule(spec)
        if (replay !== undefined) {
          yield* applyReplay(operation, replay, batchTool, nested, spec.applyCheckpoint)
          yield* guardUnknownNeverReplay(operation, replay)
          if (replay._tag === "Succeeded") return decodeReplay<A>(replay.value)
          if (replay._tag === "Failed") return yield* Effect.fail(decodeReplay<E>(replay.error))
          return yield* DriverUnknownReplay.make({ operationKey: operation.key, operationId: replay.operationId })
        }
        const ordinal = modelCallOrdinal(spec)
        const exit = yield* effect.pipe(Effect.provideService(CurrentModelCallOrdinal, ordinal), Effect.exit)
        const outcome = OperationOutcomeResolution.outcomeFromExit(operation, exit)
        if (outcome !== undefined) {
          yield* outcome._tag === "Unknown"
            ? Effect.uninterruptible(commit(operation, outcome, batchTool, nested, spec.applyCheckpoint))
            : commit(operation, outcome, batchTool, nested, spec.applyCheckpoint)
        }
        return yield* Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause)
      })
    const interpreter: Service = {
      checkpoint: Ref.get(checkpointRef),
      run,
      runStream: <A, E, R, Success, ReplayError, ReplayServices>(
        spec: OperationSpec,
        stream: Stream.Stream<A, E, R>,
        options?: { readonly successCodec: StreamSuccessCodec<A, Success, ReplayError, ReplayServices> },
      ): Stream.Stream<A, OperationError<E> | ReplayError, R | ReplayServices> =>
        Stream.unwrap<
          A,
          E | DriverError | DriverStateInvalid | DriverUnknownReplay | ReplayError,
          R | ReplayServices,
          OperationError<E>,
          never
        >(
          Effect.gen(function* () {
            const { operation, replay, batchTool, nested = false } = yield* schedule(spec)
            const codec = options?.successCodec
            if (replay !== undefined) {
              yield* applyReplay(operation, replay, batchTool, nested, spec.applyCheckpoint)
              yield* guardUnknownNeverReplay(operation, replay)
              if (replay._tag === "Succeeded") {
                if (codec !== undefined) return codec.replay(decodeReplay<Success>(replay.value))
                const values = Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))(replay.value)
                return Stream.fromIterable(Option.getOrElse(values, () => []).map(decodeReplay<A>))
              }
              if (replay._tag === "Failed") return Stream.fail(decodeReplay<E>(replay.error))
              return Stream.fail(
                DriverUnknownReplay.make({ operationKey: operation.key, operationId: replay.operationId }),
              )
            }
            const ordinal = modelCallOrdinal(spec)
            const emitted = codec === undefined ? new Array<A>() : undefined
            return stream.pipe(
              Stream.provideService(CurrentModelCallOrdinal, ordinal),
              Stream.tap((value) =>
                Effect.sync(() => (codec === undefined ? void emitted!.push(value) : codec.observe(value))),
              ),
              Stream.catchCause((cause) => {
                if (Cause.hasInterrupts(cause)) return Stream.failCause(cause)
                const outcome = OperationOutcomeResolution.outcomeFromExit(operation, Exit.failCause(cause))
                if (outcome === undefined) return Stream.failCause(cause)
                const persist =
                  outcome._tag === "Unknown"
                    ? Effect.uninterruptible(commit(operation, outcome, batchTool, nested, spec.applyCheckpoint))
                    : commit(operation, outcome, batchTool, nested, spec.applyCheckpoint)
                return Stream.fromEffect(persist).pipe(Stream.drain, Stream.concat(Stream.failCause(cause)))
              }),
              Stream.onExit((exit) =>
                Effect.gen(function* () {
                  if (Exit.isSuccess(exit) || !Cause.hasInterrupts(exit.cause)) return
                  const outcome = OperationOutcomeResolution.outcomeFromExit(operation, exit)
                  if (outcome === undefined) return
                  yield* Effect.uninterruptible(commit(operation, outcome, batchTool, nested, spec.applyCheckpoint))
                }).pipe(Effect.orDie),
              ),
              Stream.concat(
                Stream.fromEffect(
                  Effect.gen(function* () {
                    if (codec?.isComplete?.() === false) return
                    const value = codec === undefined ? emitted : codec.complete()
                    yield* Effect.interruptible(
                      commit(operation, { _tag: "Succeeded", value }, batchTool, nested, spec.applyCheckpoint),
                    )
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
  readonly journal?: DriverJournal
  readonly initial: DriverCheckpoint
}): Layer.Layer<DriverInterpreter> =>
  Layer.effect(
    DriverInterpreter,
    Effect.gen(function* () {
      const hostJournal = yield* Effect.serviceOption(DriverJournalService)
      const journal = input.journal ?? Option.getOrElse(hostJournal, () => noopJournal)
      return yield* make({ ...input, journal })
    }),
  )
/** @experimental */
export const layerTest = (input: {
  readonly driver: DurableAgentDriver
  readonly initial: DriverCheckpoint
  readonly journal?: DriverJournal
}): Layer.Layer<DriverInterpreter> => layerInline(input)

/** @experimental */
export const operationKey = (logicalOperationId: string, ...parts: ReadonlyArray<string | number>): string =>
  [logicalOperationId, ...parts.map(String)].join(":")
