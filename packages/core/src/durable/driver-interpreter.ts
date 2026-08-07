import { Cause, Context, DateTime, Effect, Exit, Function, Layer, Option, Ref, Schema, Stream } from "effect"
import type { Prompt } from "effect/unstable/ai"
import {
  type DriverCheckpoint,
  type DriverOperation,
  type OperationOutcome,
  type ReplayPolicy,
  type DriverOperationKind,
  currentDriverVersion,
  makeOperation,
} from "./driver-contract.js"
import { DriverError, DriverStateInvalid, type DurableAgentDriver } from "./durable-driver.js"
import {
  allocate,
  assertNotExpired,
  refundUnused,
  reserveChild,
  type BudgetLimits,
  type RunBudget,
  RunBudgetExhausted,
  type RunBudgetGrantWidened,
} from "./run-budget.js"
import { CurrentModelCallOrdinal } from "./operation-context.js"
import { LoopDriverState } from "./loop-driver-state.js"
import {
  chargeScheduled,
  applyHandoffCommit,
  chargeUsage as chargeCheckpointUsage,
  makeLoopDriver,
  withBudget,
  withHandoffState,
  withPending,
} from "./loop-driver.js"
import type { Agent } from "../agent/agent.js"
import type { RunOptions } from "../agent/agent.js"
import type { HandoffControlState } from "../agent/handoff-state.js"

/** @experimental Operation scheduled at one agent-loop effect boundary. */
export interface OperationSpec {
  readonly kind: DriverOperationKind
  readonly key: string
  readonly input: unknown
  readonly replayPolicy: ReplayPolicy
}

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
  ) => Effect.Effect<OperationOutcome | void>
  readonly onCompleted: (
    operation: DriverOperation,
    outcome: OperationOutcome,
    checkpoint: DriverCheckpoint,
  ) => Effect.Effect<void>
  readonly onCheckpoint: (checkpoint: DriverCheckpoint) => Effect.Effect<void>
}

/** @experimental Optional host journal service merged into Agent.stream driver layers. */
export class DriverJournalService extends Context.Service<DriverJournalService, DriverJournal>()(
  "@batonfx/core/durable/driver-interpreter/DriverJournalService",
) {}

/** @experimental Inline interpreter executing driver operations through Effect services. */
export interface Interface {
  readonly checkpoint: Effect.Effect<DriverCheckpoint>
  readonly run: <A, E, R>(
    spec: OperationSpec,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | DriverError | DriverStateInvalid | DriverUnknownReplay | RunBudgetExhausted, R>
  readonly runStream: <A, E, R>(
    spec: OperationSpec,
    stream: Stream.Stream<A, E, R>,
  ) => Stream.Stream<A, E | DriverError | DriverStateInvalid | DriverUnknownReplay | RunBudgetExhausted, R>
  readonly recordSuspension: (input: {
    readonly waitId: string
    readonly reason: string
    readonly token: string
  }) => Effect.Effect<void, DriverError | DriverStateInvalid | DriverUnknownReplay | RunBudgetExhausted>
  readonly bindResume: (
    token: string,
  ) => Effect.Effect<void, DriverError | DriverStateInvalid | DriverUnknownReplay | RunBudgetExhausted>
  readonly recorded: Effect.Effect<ReadonlyArray<RecordedOperation>>
  readonly abortPending: (error: unknown) => Effect.Effect<void, DriverError | DriverStateInvalid | DriverUnknownReplay>
  readonly chargeUsage: (usage: BudgetLimits) => Effect.Effect<void, RunBudgetExhausted>
  readonly setBudget: (budget: RunBudget) => Effect.Effect<void>
  readonly reserveChild: (grant: BudgetLimits) => Effect.Effect<RunBudget, RunBudgetExhausted | RunBudgetGrantWidened>
  readonly refundChild: (child: RunBudget) => Effect.Effect<void>
  readonly setHandoffState: (state: HandoffControlState) => Effect.Effect<void, DriverStateInvalid>
}

/** @experimental */
export class DriverUnknownReplay extends Schema.TaggedErrorClass<DriverUnknownReplay>()(
  "@batonfx/core/DriverUnknownReplay",
  {
    operationKey: Schema.String,
    operationId: Schema.String,
  },
) {}

/** @experimental */
export class DriverInterpreter extends Context.Service<DriverInterpreter, Interface>()(
  "@batonfx/core/durable/driver-interpreter/DriverInterpreter",
) {}

const noopJournal: DriverJournal = {
  onScheduled: () => Effect.void,
  onCompleted: () => Effect.void,
  onCheckpoint: () => Effect.void,
}

const outcomeFromExit = <E>(operation: DriverOperation, exit: Exit.Exit<unknown, E>): OperationOutcome | undefined => {
  if (Exit.isSuccess(exit)) return { _tag: "Succeeded", value: exit.value }
  if (exit.cause.reasons.length === 1 && Cause.isFailReason(exit.cause.reasons[0]!)) {
    return { _tag: "Failed", error: exit.cause.reasons[0]!.error }
  }
  return operation.replayPolicy === "never" ? { _tag: "Unknown", operationId: operation.key } : undefined
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
export const makeInline = (input: {
  readonly driver: DurableAgentDriver
  readonly journal?: DriverJournal
  readonly initial: DriverCheckpoint
}): Effect.Effect<Interface> =>
  Effect.gen(function* () {
    const checkpointRef = yield* Ref.make(input.initial)
    const recordedRef = yield* Ref.make<ReadonlyArray<RecordedOperation>>([])
    const activePendingRef = yield* Ref.make<string | undefined>(undefined)
    const journal = input.journal ?? noopJournal
    const schedule = (spec: OperationSpec) =>
      Effect.gen(function* () {
        let before = yield* Ref.get(checkpointRef)
        const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(before.state).pipe(
          Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
        )
        if (state.pending !== undefined) {
          const pending = makeOperation(state.pending)
          const requested = makeOperation(spec)
          const matches =
            pending.key === requested.key &&
            pending.kind === requested.kind &&
            pending.inputDigest === requested.inputDigest &&
            pending.replayPolicy === requested.replayPolicy
          if (!matches) {
            const activePending = yield* Ref.get(activePendingRef)
            if (activePending !== pending.key && pending.kind === requested.kind) {
              return yield* DriverStateInvalid.make({
                message: `Pending operation ${pending.key} does not match requested operation ${requested.key}`,
              })
            }
            const replay = yield* journal.onScheduled(requested, before)
            return { operation: requested, replay, nested: true }
          }
          const decision = yield* input.driver.decide(before)
          if (decision._tag !== "Execute") {
            return yield* DriverStateInvalid.make({
              message: `Expected Execute decision for ${spec.key}, received ${decision._tag}`,
            })
          }
          const replay = yield* journal.onScheduled(decision.operation, before)
          if (replay === undefined) yield* Ref.set(activePendingRef, decision.operation.key)
          return { operation: decision.operation, replay, nested: false }
        }
        const nowIso = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
        yield* assertNotExpired(before.budget, nowIso)
        before = yield* chargeScheduled(before, spec.kind)
        yield* Ref.set(checkpointRef, before)
        const scheduled = withPending(before, spec)
        yield* Ref.set(checkpointRef, scheduled)
        const decision = yield* input.driver.decide(scheduled)
        if (decision._tag !== "Execute") {
          return yield* DriverStateInvalid.make({
            message: `Expected Execute decision for ${spec.key}, received ${decision._tag}`,
          })
        }
        if (decision.operation.key !== spec.key || decision.operation.kind !== spec.kind) {
          return yield* DriverStateInvalid.make({
            message: `Driver operation mismatch for ${spec.key}`,
          })
        }
        const replay = yield* journal.onScheduled(decision.operation, scheduled)
        if (replay === undefined) yield* Ref.set(activePendingRef, decision.operation.key)
        return { operation: decision.operation, replay, nested: false }
      })
    const commit = (
      operation: DriverOperation,
      outcome: OperationOutcome,
      nested = false,
    ): Effect.Effect<void, DriverError | DriverStateInvalid | DriverUnknownReplay> =>
      Effect.gen(function* () {
        let before = yield* Ref.get(checkpointRef)
        if (nested) {
          if (outcome._tag === "Succeeded" && operation.kind === "handoff") {
            before = yield* applyHandoffCommit(before, outcome.value)
            yield* Ref.set(checkpointRef, before)
          }
          yield* Ref.update(recordedRef, (current) => [...current, { operation, outcome, checkpoint: before }])
          yield* journal.onCompleted(operation, outcome, before)
          return
        }
        const after = outcome._tag === "Unknown" ? before : yield* input.driver.apply(before, outcome)
        yield* Ref.set(checkpointRef, after)
        yield* Ref.update(recordedRef, (current) => [...current, { operation, outcome, checkpoint: after }])
        yield* journal.onCompleted(operation, outcome, after)
        yield* Ref.set(activePendingRef, undefined)
      })
    const run = <A, E, R>(
      spec: OperationSpec,
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | DriverError | DriverStateInvalid | DriverUnknownReplay | RunBudgetExhausted, R> =>
      Effect.gen(function* () {
        const { operation, replay, nested } = yield* schedule(spec)
        if (replay !== undefined) {
          yield* guardUnknownNeverReplay(operation, replay)
          const before = yield* Ref.get(checkpointRef)
          if (nested && replay._tag === "Succeeded" && operation.kind === "handoff") {
            yield* Ref.set(checkpointRef, yield* applyHandoffCommit(before, replay.value))
          } else if (!nested) {
            yield* Ref.set(checkpointRef, yield* input.driver.apply(before, replay))
          }
          return yield* replay._tag === "Succeeded"
            ? Effect.succeed(replay.value as A)
            : replay._tag === "Failed"
              ? Effect.fail(replay.error as E)
              : DriverUnknownReplay.make({ operationKey: operation.key, operationId: replay.operationId })
        }
        const ordinal =
          (spec.kind === "model" || spec.kind === "structured-output") &&
          typeof spec.input === "object" &&
          spec.input !== null &&
          "modelCallOrdinal" in spec.input &&
          typeof spec.input.modelCallOrdinal === "number"
            ? spec.input.modelCallOrdinal
            : undefined
        const exit = yield* effect.pipe(Effect.provideService(CurrentModelCallOrdinal, ordinal), Effect.exit)
        const outcome = outcomeFromExit(operation, exit)
        if (outcome !== undefined) {
          yield* outcome._tag === "Unknown"
            ? Effect.uninterruptible(commit(operation, outcome, nested))
            : commit(operation, outcome, nested)
        }
        return yield* Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause)
      })
    const interpreter: Interface = {
      checkpoint: Ref.get(checkpointRef),
      run,
      runStream: <A, E, R>(spec: OperationSpec, stream: Stream.Stream<A, E, R>) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const { operation, replay, nested } = yield* schedule(spec)
            if (replay !== undefined) {
              yield* guardUnknownNeverReplay(operation, replay)
              return (
                replay._tag === "Succeeded"
                  ? Stream.fromIterable((Array.isArray(replay.value) ? replay.value : []) as ReadonlyArray<A>)
                  : replay._tag === "Failed"
                    ? Stream.fail(replay.error as E)
                    : Stream.fail(
                        DriverUnknownReplay.make({ operationKey: operation.key, operationId: replay.operationId }),
                      )
              ) as Stream.Stream<A, E | DriverUnknownReplay, R>
            }
            const ordinal =
              (spec.kind === "model" || spec.kind === "structured-output") &&
              typeof spec.input === "object" &&
              spec.input !== null &&
              "modelCallOrdinal" in spec.input &&
              typeof spec.input.modelCallOrdinal === "number"
                ? spec.input.modelCallOrdinal
                : undefined
            return stream.pipe(
              Stream.provideService(CurrentModelCallOrdinal, ordinal),
              Stream.onExit((exit) => {
                const outcome = outcomeFromExit(operation, exit)
                return outcome === undefined
                  ? Effect.void
                  : outcome._tag === "Unknown"
                    ? Effect.uninterruptible(commit(operation, outcome, nested)).pipe(Effect.orDie)
                    : commit(operation, outcome, nested).pipe(Effect.orDie)
              }),
            )
          }),
        ) as Stream.Stream<A, E | DriverError | DriverStateInvalid | DriverUnknownReplay | RunBudgetExhausted, R>,
      recordSuspension: (suspension) =>
        run(
          {
            kind: "wait",
            key: suspension.waitId,
            input: suspension,
            replayPolicy: "pure",
          },
          Effect.succeed({ waitId: suspension.waitId, reason: suspension.reason, token: suspension.token }),
        ).pipe(Effect.asVoid),
      bindResume: (token) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(checkpointRef)
          const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(current.state).pipe(
            Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
          )
          if (state.suspensionToken !== undefined && state.suspensionToken !== token) {
            return yield* DriverError.make({ message: "Resume token does not match driver suspension checkpoint" })
          }
          yield* run(
            {
              kind: "wait",
              key: `resume:${token}`,
              input: { token },
              replayPolicy: "pure",
            },
            Effect.void,
          )
        }),
      abortPending: (error) =>
        Effect.gen(function* () {
          const before = yield* Ref.get(checkpointRef)
          const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(before.state).pipe(
            Effect.mapError((invalid) => DriverStateInvalid.make({ message: String(invalid) })),
          )
          if (state.pending === undefined) return
          const operation = makeOperation(state.pending)
          yield* commit(operation, { _tag: "Failed", error })
        }),
      chargeUsage: (usage) =>
        Effect.gen(function* () {
          const before = yield* Ref.get(checkpointRef)
          const after = yield* chargeCheckpointUsage(before, usage)
          yield* Ref.set(checkpointRef, after)
          yield* journal.onCheckpoint(after)
        }),
      setBudget: (budget) =>
        Effect.gen(function* () {
          const before = yield* Ref.get(checkpointRef)
          const after = withBudget(before, budget)
          yield* Ref.set(checkpointRef, after)
          yield* journal.onCheckpoint(after)
        }),
      reserveChild: (grant) =>
        Effect.gen(function* () {
          const before = yield* Ref.get(checkpointRef)
          const reserved = yield* reserveChild(before.budget, grant)
          const after = withBudget(before, reserved.parent)
          yield* Ref.set(checkpointRef, after)
          yield* journal.onCheckpoint(after)
          return reserved.child
        }),
      refundChild: (child) =>
        Effect.gen(function* () {
          const before = yield* Ref.get(checkpointRef)
          const after = withBudget(before, refundUnused(before.budget, child))
          yield* Ref.set(checkpointRef, after)
          yield* journal.onCheckpoint(after)
        }),
      setHandoffState: (handoff) =>
        Effect.gen(function* () {
          const before = yield* Ref.get(checkpointRef)
          const after = yield* withHandoffState(before, handoff)
          yield* Ref.set(checkpointRef, after)
          yield* journal.onCheckpoint(after)
        }),
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
      return yield* makeInline({ ...input, journal })
    }),
  )

/** @experimental */
export const layerForRun: {
  <Tools extends Record<string, import("effect/unstable/ai").Tool.Any>, R>(
    options: RunOptions,
    prompt: Prompt.Prompt,
    budget?: RunBudget,
  ): (agent: Agent<Tools, R>) => Layer.Layer<DriverInterpreter, DriverError | DriverStateInvalid>
  <Tools extends Record<string, import("effect/unstable/ai").Tool.Any>, R>(
    agent: Agent<Tools, R>,
    options: RunOptions,
    prompt: Prompt.Prompt,
    budget?: RunBudget,
  ): Layer.Layer<DriverInterpreter, DriverError | DriverStateInvalid>
} = Function.dual(
  (args) => args.length >= 1 && typeof args[0] === "object" && args[0] !== null && "toolkit" in args[0],
  <Tools extends Record<string, import("effect/unstable/ai").Tool.Any>, R>(
    agent: Agent<Tools, R>,
    options: RunOptions,
    prompt: Prompt.Prompt,
    budget?: RunBudget,
  ): Layer.Layer<DriverInterpreter, DriverError | DriverStateInvalid> => {
    const sessionId = options.sessionId ?? agent.name
    const logicalOperationId = options.logicalOperationId ?? sessionId
    const driver = makeLoopDriver({
      logicalOperationId,
      sessionId,
      ...(options.modelCallOrdinalStart === undefined ? {} : { modelCallOrdinalStart: options.modelCallOrdinalStart }),
    })
    const initial: Effect.Effect<DriverCheckpoint, DriverError | DriverStateInvalid> = Effect.gen(function* () {
      if (options.driverCheckpoint === undefined) {
        return yield* driver.initial({
          ...(options.executableRef === undefined ? {} : { executable: options.executableRef }),
          prompt,
          budget: budget ?? allocate({}),
        })
      }
      const checkpoint = options.driverCheckpoint
      if (options.executableRef === undefined || checkpoint.executable === undefined) {
        return yield* DriverStateInvalid.make({
          message: "Persisted driver checkpoints require an explicit executable identity",
        })
      }
      if (
        checkpoint.driverVersion !== currentDriverVersion ||
        checkpoint.executable?.executable !== options.executableRef?.executable ||
        checkpoint.executable?.active !== options.executableRef?.active
      ) {
        return yield* DriverStateInvalid.make({
          message: "Persisted driver checkpoint does not match the active Agent",
        })
      }
      return checkpoint
    })
    return Layer.unwrap(
      initial.pipe(
        Effect.map((checkpoint) =>
          layerInline({
            driver,
            initial: checkpoint,
          }),
        ),
      ),
    )
  },
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
