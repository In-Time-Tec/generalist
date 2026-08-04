import { Effect, Schema } from "effect"
import {
  currentDriverVersion,
  type DriverCheckpoint,
  type DriverDecision,
  type DriverOperationKind,
  makeOperation,
} from "./driver-contract.js"
import { DriverError, DriverStateInvalid, type DurableAgentDriver, type DriverInput } from "./durable-driver.js"
import { charge, type RunBudget, type RunBudgetExhausted, type BudgetLimits } from "./run-budget.js"
import { LoopDriverState, type PendingOperation } from "./loop-driver-state.js"

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
export const chargeScheduled = (
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
  })

/** @experimental Apply token usage after a model boundary without scheduling a new operation. */
export const chargeUsage = (
  checkpoint: DriverCheckpoint,
  usage: BudgetLimits,
): Effect.Effect<DriverCheckpoint, RunBudgetExhausted> =>
  Effect.gen(function* () {
    const budget = yield* charge(checkpoint.budget, usage)
    return { ...checkpoint, budget }
  })

/** @experimental Replace checkpoint budget after child reservation or refund. */
export const withBudget = (checkpoint: DriverCheckpoint, budget: RunBudget): DriverCheckpoint => ({
  ...checkpoint,
  budget,
})

/** @experimental Production durable driver backing inline Agent.stream runs. */
export const makeLoopDriver = (options: LoopDriverOptions): DurableAgentDriver => ({
  version: currentDriverVersion,
  initial: (input: DriverInput) =>
    Effect.succeed({
      driverVersion: currentDriverVersion,
      agent: input.agent,
      turn: 0,
      budget: input.budget,
      execution: input.execution ?? {
        agent: input.agent,
        driverVersion: currentDriverVersion,
        checkpointCodecVersion: "1",
        eventCodecVersion: "1",
        toolSchemaDigests: {},
        rootBudget: input.budget,
      },
      state: {
        logicalOperationId: options.logicalOperationId,
        sessionId: options.sessionId,
        modelCallOrdinal: options.modelCallOrdinalStart ?? 0,
        modelCallOrdinalStart: options.modelCallOrdinalStart ?? 0,
      } satisfies LoopDriverState,
    }),
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
        const waitInput = outcome.value as {
          readonly waitId?: string
          readonly reason?: string
          readonly token?: string
        }
        if (pending.key.startsWith("resume:")) {
          nextState = (({ wait: _wait, suspensionToken: _token, ...rest }) => rest)(nextState)
        } else {
          nextState = {
            ...nextState,
            wait: {
              waitId: waitInput.waitId ?? waitInput.token ?? "wait",
              reason: waitInput.reason ?? "suspended",
              ...(waitInput.token === undefined ? {} : { replayToken: waitInput.token }),
            },
            ...(waitInput.token === undefined ? {} : { suspensionToken: waitInput.token }),
          }
        }
        return encodeCheckpoint(checkpoint, nextState, budget)
      }
      return encodeCheckpoint({ ...checkpoint, turn: checkpoint.turn }, nextState, budget)
    }),
})

/** @experimental Attach the next pending operation before interpreter decide. */
export const withPending = (checkpoint: DriverCheckpoint, pending: PendingOperation): DriverCheckpoint => {
  const state = Schema.decodeUnknownSync(LoopDriverState)(checkpoint.state)
  return { ...checkpoint, state: { ...state, pending } }
}
