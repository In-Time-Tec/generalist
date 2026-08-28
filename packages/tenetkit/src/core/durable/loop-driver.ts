import { Effect, Function, Schema } from "effect"
import {
  currentDriverVersion,
  type DriverCheckpoint,
  type DriverDecision,
  type DriverOperationKind,
  make as makeOperation,
} from "./driver/contract.js"
import { DriverError, DriverStateInvalid, type DurableAgentDriver, type DriverInput } from "./service.js"
import { charge, type RunBudget, type RunBudgetExhausted, type BudgetLimits } from "./run-budget.js"
import { LoopDriverState, type PendingOperation } from "./loop-driver-state.js"
import { HandoffCommit, type HandoffControlState } from "../agent/handoff/state.js"

const WaitOutcome = Schema.Struct({
  waitId: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
  token: Schema.optionalKey(Schema.String),
})

/** @experimental */
export interface LoopDriverOptions {
  readonly logicalOperationId: string
  readonly sessionId: string
  readonly modelCallOrdinalStart?: number
}

const decodeState = (checkpoint: DriverCheckpoint): Effect.Effect<LoopDriverState, DriverStateInvalid> =>
  Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state).pipe(
    Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
  )

const encodeCheckpoint = (
  checkpoint: Omit<DriverCheckpoint, "state">,
  state: LoopDriverState,
  budget: RunBudget = checkpoint.budget,
): DriverCheckpoint => ({
  ...checkpoint,
  budget,
  state,
})

const applyDecodedHandoffCommit = (
  checkpoint: DriverCheckpoint,
  commit: HandoffCommit,
): Effect.Effect<DriverCheckpoint, DriverStateInvalid> =>
  Effect.gen(function* () {
    const state = yield* decodeState(checkpoint)
    const executable =
      checkpoint.executable === undefined || commit.targetAgentPin === undefined
        ? checkpoint.executable
        : { ...checkpoint.executable, active: commit.targetAgentPin }
    const nextCheckpoint = { ...checkpoint }
    if (executable !== undefined) Object.assign(nextCheckpoint, { executable })
    return encodeCheckpoint(nextCheckpoint, { ...state, handoff: commit.state })
  })

/** @internal Apply the exact successful handoff value to both durable authorities. */
type HandoffCommitInput = typeof Schema.Unknown.Type
export const applyHandoffCommit: {
  (commit: HandoffCommitInput): (checkpoint: DriverCheckpoint) => Effect.Effect<DriverCheckpoint, DriverStateInvalid>
  (checkpoint: DriverCheckpoint, commit: HandoffCommitInput): Effect.Effect<DriverCheckpoint, DriverStateInvalid>
} = Function.dual(2, (checkpoint: DriverCheckpoint, commit: HandoffCommitInput) =>
  Schema.decodeUnknownEffect(HandoffCommit)(commit).pipe(
    Effect.mapError((error) => DriverStateInvalid.make({ message: `Invalid handoff commit: ${error.message}` })),
    Effect.flatMap((decoded) => applyDecodedHandoffCommit(checkpoint, decoded)),
  ),
)

const chargeForKind = (budget: RunBudget, kind: DriverOperationKind): Effect.Effect<RunBudget, RunBudgetExhausted> => {
  if (kind === "model" || kind === "structured-output") {
    return charge(budget, { modelCalls: 1 })
  }
  if (kind === "tool") {
    return charge(budget, { toolCalls: 1 })
  }
  if (kind === "handoff") {
    return charge(budget, { handoffs: 1 })
  }
  return Effect.succeed(budget)
}

/** @experimental Charge budget at operation schedule time before execution begins. */
export const chargeScheduled: {
  (
    kind: DriverOperationKind,
  ): (checkpoint: DriverCheckpoint) => Effect.Effect<DriverCheckpoint, RunBudgetExhausted | DriverStateInvalid>
  (
    checkpoint: DriverCheckpoint,
    kind: DriverOperationKind,
  ): Effect.Effect<DriverCheckpoint, RunBudgetExhausted | DriverStateInvalid>
} = Function.dual(
  2,
  (
    checkpoint: DriverCheckpoint,
    kind: DriverOperationKind,
  ): Effect.Effect<DriverCheckpoint, RunBudgetExhausted | DriverStateInvalid> =>
    Effect.gen(function* () {
      const budget = yield* chargeForKind(checkpoint.budget, kind)
      if (kind !== "model" && kind !== "structured-output") {
        return { ...checkpoint, budget }
      }
      const state = yield* decodeState(checkpoint)
      return encodeCheckpoint(checkpoint, { ...state, modelCallOrdinal: state.modelCallOrdinal + 1 }, budget)
    }),
)

/** @experimental Apply token usage after a model boundary without scheduling a new operation. */
export const chargeUsage: {
  (usage: BudgetLimits): (checkpoint: DriverCheckpoint) => Effect.Effect<DriverCheckpoint, RunBudgetExhausted>
  (checkpoint: DriverCheckpoint, usage: BudgetLimits): Effect.Effect<DriverCheckpoint, RunBudgetExhausted>
} = Function.dual(
  2,
  (checkpoint: DriverCheckpoint, usage: BudgetLimits): Effect.Effect<DriverCheckpoint, RunBudgetExhausted> =>
    Effect.gen(function* () {
      const budget = yield* charge(checkpoint.budget, usage)
      return { ...checkpoint, budget }
    }),
)

/** @experimental Replace checkpoint budget after child reservation or refund. */
export const withBudget: {
  (budget: RunBudget): (checkpoint: DriverCheckpoint) => DriverCheckpoint
  (checkpoint: DriverCheckpoint, budget: RunBudget): DriverCheckpoint
} = Function.dual(
  2,
  (checkpoint: DriverCheckpoint, budget: RunBudget): DriverCheckpoint => ({
    ...checkpoint,
    budget,
  }),
)

/** @internal Replace the durable handoff control snapshot without scheduling an operation. */
export const withHandoffState: {
  (handoff: HandoffControlState): (checkpoint: DriverCheckpoint) => Effect.Effect<DriverCheckpoint, DriverStateInvalid>
  (checkpoint: DriverCheckpoint, handoff: HandoffControlState): Effect.Effect<DriverCheckpoint, DriverStateInvalid>
} = Function.dual(
  2,
  (checkpoint: DriverCheckpoint, handoff: HandoffControlState): Effect.Effect<DriverCheckpoint, DriverStateInvalid> =>
    decodeState(checkpoint).pipe(Effect.map((state) => encodeCheckpoint(checkpoint, { ...state, handoff }))),
)

/** @experimental Production durable driver backing inline Agent.stream runs. */
export const make = (options: LoopDriverOptions): DurableAgentDriver => ({
  version: currentDriverVersion,
  initial: (input: DriverInput) =>
    Effect.succeed(
      Object.assign(
        {
          driverVersion: currentDriverVersion,
          turn: 0,
          budget: input.budget,
          state: {
            logicalOperationId: options.logicalOperationId,
            sessionId: options.sessionId,
            modelCallOrdinal: options.modelCallOrdinalStart ?? 0,
            modelCallOrdinalStart: options.modelCallOrdinalStart ?? 0,
          } satisfies LoopDriverState,
        },
        input.executable === undefined ? undefined : { executable: input.executable },
      ),
    ),
  decide: (checkpoint) =>
    Effect.gen(function* () {
      const state = yield* decodeState(checkpoint)
      if (state.terminal !== undefined) {
        return {
          _tag: "Complete",
          result: state.terminal,
        } satisfies DriverDecision
      }
      if (state.pending === undefined) {
        if (state.wait !== undefined) {
          return {
            _tag: "Wait",
            wait: state.wait,
          } satisfies DriverDecision
        }
        return yield* DriverStateInvalid.make({ message: "Loop driver decide without pending operation or wait" })
      }
      return {
        _tag: "Execute",
        operation: makeOperation(state.pending),
      } satisfies DriverDecision
    }),
  apply: (checkpoint, outcome) =>
    Effect.gen(function* () {
      const state = yield* decodeState(checkpoint)
      if (outcome._tag === "Unknown") {
        const pending = state.pending
        if (pending === undefined) {
          return yield* DriverError.make({
            message: `Cannot apply unknown outcome ${outcome.operationId} without a pending operation`,
          })
        }
        if (pending.replayPolicy === "never") {
          return yield* DriverError.make({
            message: `Operation ${pending.key} with replay policy never cannot accept an unknown outcome`,
          })
        }
        return yield* DriverError.make({
          message: `Unknown outcome ${outcome.operationId} requires host resolution before apply`,
        })
      }
      const pending = state.pending
      if (pending === undefined) {
        return encodeCheckpoint(checkpoint, state)
      }
      if (outcome._tag === "Failed") {
        const { pending: _pending, ...rest } = state
        return encodeCheckpoint(checkpoint, rest)
      }
      let nextState: LoopDriverState = (({ pending: _pending, ...rest }) => rest)(state)
      const budget = checkpoint.budget
      if (pending.kind === "wait") {
        const waitInput = yield* Schema.decodeUnknownEffect(WaitOutcome)(outcome.value).pipe(
          Effect.mapError((error) => DriverStateInvalid.make({ message: `Invalid wait outcome: ${String(error)}` })),
        )
        if (pending.key.startsWith("resume:")) {
          nextState = (({ wait: _wait, suspensionToken: _token, ...rest }) => rest)(nextState)
        } else {
          const wait = {
            waitId: waitInput.waitId ?? waitInput.token ?? "wait",
            reason: waitInput.reason ?? "suspended",
          }
          if (waitInput.token !== undefined) Object.assign(wait, { replayToken: waitInput.token })
          nextState = {
            ...nextState,
            wait,
          }
          if (waitInput.token !== undefined) Object.assign(nextState, { suspensionToken: waitInput.token })
        }
        return encodeCheckpoint(checkpoint, nextState, budget)
      }
      if (pending.kind === "handoff") {
        const commit = yield* Schema.decodeUnknownEffect(HandoffCommit)(outcome.value).pipe(
          Effect.mapError((error) => DriverStateInvalid.make({ message: `Invalid handoff commit: ${String(error)}` })),
        )
        return yield* applyHandoffCommit(encodeCheckpoint(checkpoint, nextState, budget), commit)
      }
      return encodeCheckpoint({ ...checkpoint, turn: checkpoint.turn }, nextState, budget)
    }),
})

/** @experimental Attach the next pending operation before interpreter decide. */
export const withPending: {
  (pending: PendingOperation, turn: number): (checkpoint: DriverCheckpoint) => DriverCheckpoint
  (checkpoint: DriverCheckpoint, pending: PendingOperation, turn: number): DriverCheckpoint
} = Function.dual(3, (checkpoint: DriverCheckpoint, pending: PendingOperation, turn: number): DriverCheckpoint => {
  const state = Schema.decodeUnknownSync(LoopDriverState)(checkpoint.state)
  return { ...checkpoint, turn, state: { ...state, pending } }
})
