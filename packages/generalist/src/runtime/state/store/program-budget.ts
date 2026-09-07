import { Effect } from "effect"
import { ProgramBudgetExhausted, ProgramReplayDivergence } from "../../../core/program/capabilities.js"
import type { ProgramRunState, ReserveProgramOperationInput } from "../../program/store.js"
import type { RuntimeState } from "../projection.js"

const exhaustedDimension = (
  current: RuntimeState["programStates"] extends ReadonlyMap<string, infer State> ? State : never,
  input: ReserveProgramOperationInput,
) => {
  const dimensions = [
    ["toolCalls", input.reservation.toolCalls ?? 0, current.budget.toolCalls],
    ["agentRuns", input.reservation.agentRuns ?? 0, current.budget.agentRuns],
    ["logBytes", input.reservation.logBytes ?? 0, current.budget.logBytes],
    ["activeSlots", input.reservation.activeSlots ?? 0, current.budget.concurrency],
  ] as const
  return dimensions.find(([field, amount, limit]) => current[field] + amount > limit)
}

const checkConcurrency = (state: RuntimeState, current: ProgramRunState, input: ReserveProgramOperationInput) =>
  Effect.gen(function* () {
    const concurrencyRoot = current.concurrencyRoot ?? input.runId
    const pool = state.programStates.get(concurrencyRoot) ?? current
    let activeSlots = 0
    for (const member of state.programStates.values()) {
      if ((member.concurrencyRoot ?? member.runId) === concurrencyRoot) activeSlots += member.activeSlots
    }
    if (activeSlots + (input.reservation.activeSlots ?? 0) > pool.budget.concurrency)
      return yield* ProgramBudgetExhausted.make({ dimension: "concurrency", limit: pool.budget.concurrency })
  })

export const reserveProgramBudget = ({
  state,
  input,
  nowMillis,
}: {
  readonly state: RuntimeState
  readonly input: ReserveProgramOperationInput
  readonly nowMillis: number
}) =>
  Effect.gen(function* () {
    const current: ProgramRunState = state.programStates.get(input.runId) ?? {
      runId: input.runId,
      programPin: input.programPin,
      budget: input.budget,
      deadlineMillis: nowMillis + input.budget.wallClockMillis,
      toolCalls: 0,
      agentRuns: 0,
      tokens: 0,
      logBytes: 0,
      activeSlots: 0,
    }
    if (current.programPin !== input.programPin)
      return yield* ProgramReplayDivergence.make({
        operation: input.operation,
        expected: current.programPin,
        actual: input.programPin,
      })
    yield* checkConcurrency(state, current, input)
    if (nowMillis > current.deadlineMillis)
      return yield* ProgramBudgetExhausted.make({
        dimension: "wallClockMillis",
        limit: current.budget.wallClockMillis,
      })
    const exhausted = exhaustedDimension(current, input)
    if (exhausted !== undefined) {
      const [field, , limit] = exhausted
      return yield* ProgramBudgetExhausted.make({
        dimension: field === "activeSlots" ? "concurrency" : field,
        limit,
      })
    }
    const nextState = {
      ...current,
      toolCalls: current.toolCalls + (input.reservation.toolCalls ?? 0),
      agentRuns: current.agentRuns + (input.reservation.agentRuns ?? 0),
      logBytes: current.logBytes + (input.reservation.logBytes ?? 0),
      activeSlots: current.activeSlots + (input.reservation.activeSlots ?? 0),
    }
    return nextState
  })
