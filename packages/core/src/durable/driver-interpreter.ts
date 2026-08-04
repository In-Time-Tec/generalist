import { Cause, Clock, Context, Effect, Exit, Layer, Option, Ref, Schema, Stream } from "effect"
import { type Prompt, Tool } from "effect/unstable/ai"
import { fromAgent } from "./agent-ref.js"
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
import { LoopDriverState } from "./loop-driver-state.js"
import {
  chargeScheduled,
  chargeUsage as chargeCheckpointUsage,
  makeLoopDriver,
  withBudget,
  withPending,
} from "./loop-driver.js"
import type { Agent } from "../agent/agent.js"
import type { RunOptions } from "../agent/agent.js"
import { of as canonicalDigest } from "./canonical-digest.js"

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
  ) => Effect.Effect<OperationOutcome | undefined>
  readonly onCompleted: (
    operation: DriverOperation,
    outcome: OperationOutcome,
    checkpoint: DriverCheckpoint,
  ) => Effect.Effect<void>
  readonly onCheckpoint: (checkpoint: DriverCheckpoint) => Effect.Effect<void>
}

/** @experimental Optional host journal service merged into Agent.stream driver layers. */
export class DriverJournalService extends Context.Service<DriverJournalService, DriverJournal>()(
  "@batonfx/core/DriverJournal",
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
  "@batonfx/core/DriverInterpreter",
) {}

const noopJournal: DriverJournal = {
  onScheduled: () => Effect.succeed(undefined),
  onCompleted: () => Effect.void,
  onCheckpoint: () => Effect.void,
}

const outcomeFromExit = <E>(exit: Exit.Exit<unknown, E>): OperationOutcome =>
  Exit.isSuccess(exit)
    ? { _tag: "Succeeded", value: exit.value }
    : { _tag: "Failed", error: Cause.squash(exit.cause as Cause.Cause<E>) }

/** @experimental */
export const guardUnknownNeverReplay = (
  operation: DriverOperation,
  outcome: OperationOutcome,
): Effect.Effect<void, DriverUnknownReplay> =>
  outcome._tag === "Unknown" && operation.replayPolicy === "never"
    ? DriverUnknownReplay.make({ operationKey: operation.key, operationId: outcome.operationId })
    : Effect.void

/** @experimental */
export const makeInline = (input: {
  readonly driver: DurableAgentDriver
  readonly journal?: DriverJournal
  readonly initial: DriverCheckpoint
}): Effect.Effect<Interface> =>
  Effect.gen(function* () {
    const checkpointRef = yield* Ref.make(input.initial)
    const recordedRef = yield* Ref.make<ReadonlyArray<RecordedOperation>>([])
    const journal = input.journal ?? noopJournal
    const schedule = (spec: OperationSpec) =>
      Effect.gen(function* () {
        let before = yield* Ref.get(checkpointRef)
        const nowIso = new Date(yield* Clock.currentTimeMillis).toISOString()
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
        return { operation: decision.operation, replay }
      })
    const commit = (
      operation: DriverOperation,
      outcome: OperationOutcome,
    ): Effect.Effect<void, DriverError | DriverStateInvalid | DriverUnknownReplay> =>
      Effect.gen(function* () {
        yield* guardUnknownNeverReplay(operation, outcome)
        const before = yield* Ref.get(checkpointRef)
        const after = yield* input.driver.apply(before, outcome)
        yield* Ref.set(checkpointRef, after)
        yield* Ref.update(recordedRef, (current) => [...current, { operation, outcome, checkpoint: after }])
        yield* journal.onCompleted(operation, outcome, after)
        if (outcome._tag === "Unknown") {
          return yield* DriverError.make({
            message: `Operation ${operation.key} ended unknown and requires host resolution`,
          })
        }
      })
    const run = <A, E, R>(
      spec: OperationSpec,
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | DriverError | DriverStateInvalid | DriverUnknownReplay | RunBudgetExhausted, R> =>
      Effect.gen(function* () {
        const { operation, replay } = yield* schedule(spec)
        if (replay !== undefined) {
          yield* guardUnknownNeverReplay(operation, replay)
          const before = yield* Ref.get(checkpointRef)
          const after = yield* input.driver.apply(before, replay)
          yield* Ref.set(checkpointRef, after)
          return yield* replay._tag === "Succeeded"
            ? Effect.succeed(replay.value as A)
            : replay._tag === "Failed"
              ? Effect.fail(replay.error as E)
              : DriverUnknownReplay.make({ operationKey: operation.key, operationId: replay.operationId })
        }
        const exit = yield* effect.pipe(Effect.exit)
        yield* commit(operation, outcomeFromExit(exit))
        return yield* Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause)
      })
    const interpreter: Interface = {
      checkpoint: Ref.get(checkpointRef),
      run,
      runStream: <A, E, R>(spec: OperationSpec, stream: Stream.Stream<A, E, R>) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const { operation, replay } = yield* schedule(spec)
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
            return stream.pipe(Stream.onExit((exit) => commit(operation, outcomeFromExit(exit)).pipe(Effect.orDie)))
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
export const layerForRun = <Tools extends Record<string, import("effect/unstable/ai").Tool.Any>, R>(
  agent: Agent<Tools, R>,
  options: RunOptions,
  prompt: Prompt.Prompt,
  budget?: RunBudget,
): Layer.Layer<DriverInterpreter> => {
  const sessionId = options.sessionId ?? agent.name
  const logicalOperationId = options.logicalOperationId ?? sessionId
  const driver = makeLoopDriver({
    logicalOperationId,
    sessionId,
    ...(options.modelCallOrdinalStart === undefined ? {} : { modelCallOrdinalStart: options.modelCallOrdinalStart }),
  })
  const agentRef = options.agentRef ?? fromAgent(agent, "inline")
  const toolSchemaDigests = Effect.try({
    try: () =>
      Object.fromEntries(
        Object.values(agent.toolkit.tools)
          .map((tool) => [tool.name, canonicalDigest(Tool.getJsonSchema(tool))] as const)
          .toSorted(([left], [right]) => left.localeCompare(right)),
      ),
    catch: (error): DriverStateInvalid =>
      DriverStateInvalid.make({ message: `Unable to digest Agent tool schemas: ${String(error)}` }),
  })
  const initial: Effect.Effect<DriverCheckpoint, DriverError | DriverStateInvalid> = Effect.gen(function* () {
    const digests = yield* toolSchemaDigests
    if (options.driverCheckpoint === undefined) {
      return yield* driver.initial({
        agent: agentRef,
        prompt,
        budget: budget ?? allocate({}),
        execution: {
          agent: agentRef,
          driverVersion: currentDriverVersion,
          checkpointCodecVersion: "1",
          eventCodecVersion: "1",
          toolSchemaDigests: digests,
          ...(agent.model === undefined ? {} : { model: agent.model }),
          ...(agent.policy.snapshot === undefined ? {} : { portablePolicy: agent.policy.snapshot }),
          rootBudget: budget ?? allocate({}),
        },
      })
    }
    const checkpoint = options.driverCheckpoint
    if (
      checkpoint.driverVersion !== currentDriverVersion ||
      checkpoint.agent.id !== agentRef.id ||
      checkpoint.agent.version !== agentRef.version ||
      checkpoint.agent.digest !== agentRef.digest ||
      checkpoint.execution.driverVersion !== currentDriverVersion ||
      checkpoint.execution.checkpointCodecVersion !== "1" ||
      checkpoint.execution.eventCodecVersion !== "1" ||
      canonicalDigest(checkpoint.execution.toolSchemaDigests) !== canonicalDigest(digests)
    ) {
      return yield* DriverStateInvalid.make({ message: "Persisted driver checkpoint does not match the active Agent" })
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
  ) as Layer.Layer<DriverInterpreter>
}

/** @experimental */
export const layerTest = (input: {
  readonly driver: DurableAgentDriver
  readonly initial: DriverCheckpoint
  readonly journal?: DriverJournal
}): Layer.Layer<DriverInterpreter> => layerInline(input)

/** @experimental */
export const operationKey = (logicalOperationId: string, ...parts: ReadonlyArray<string | number>): string =>
  [logicalOperationId, ...parts.map(String)].join(":")
