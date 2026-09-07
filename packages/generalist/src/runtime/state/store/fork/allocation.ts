import { Effect, Function } from "effect"
import { RunNotFound, RuntimeUnavailable } from "../../../errors.js"
import type { RunEvent } from "../../../run/event.js"
import type { ForkRunInput, RewindRunInput } from "../../../run/store-types.js"
import type { ExecutionCheckpoint } from "../../../execution/state.js"
import { budgetForEvents, spendForEvents } from "../../../execution/inspection.js"
import {
  charge,
  Invalid as BudgetInvalid,
  make as makeBudget,
  reserveChild,
  type BudgetLimits,
  type Remaining,
} from "../../../../core/durable/run-budget.js"
import { runnableLimits } from "../../../budget/state.js"
import { occurredAtMillis } from "../../observation.js"
import type { RuntimeState, StoredRun } from "../../projection.js"

const dimensions = ["tokens", "usd", "duration", "toolCalls", "children"] as const

/** Unknown priced usage cannot become spendable capacity after a branch change. */
const availableBudget = (remaining: Remaining) => makeBudget(runnableLimits(remaining))

const currentBudget = (checkpoint: ExecutionCheckpoint, remaining: Remaining): ExecutionCheckpoint =>
  "_tag" in checkpoint ? checkpoint : { ...checkpoint, budget: availableBudget(remaining) }

const reserveForkBudget = (source: StoredRun, requested: BudgetLimits | undefined) =>
  Effect.gen(function* () {
    const available = yield* budgetForEvents({ events: source.events, observedMillis: yield* occurredAtMillis })
    const accepted = source.events.find((event) => event._tag === "RunAccepted")
    if (requested === undefined) {
      if (dimensions.some((dimension) => available[dimension] !== undefined) || accepted?.budget === undefined) {
        return yield* BudgetInvalid.make({ message: "Fork requires an explicit new budget allocation" })
      }
    }
    for (const dimension of dimensions) {
      if (available[dimension] !== undefined && requested?.[dimension] === undefined) {
        return yield* BudgetInvalid.make({ message: `Fork allocation must bound ${dimension}` })
      }
    }
    const reserved = yield* reserveChild(availableBudget(available), requested ?? {})
    const parent = yield* charge(reserved.parent, { children: reserved.child.allocation.children ?? 0 })
    return { parent, child: reserved.child }
  })

/** Settled child allowances have returned upstream; their old remainder is no longer theirs to grant. */
const allocationOwner = (state: RuntimeState, source: StoredRun) =>
  Effect.gen(function* () {
    let owner = source
    const seen = new Set<string>()
    while (owner.parentRunId !== undefined) {
      if (seen.has(owner.runId))
        return yield* RuntimeUnavailable.make({ message: "Fork budget ancestry contains a cycle" })
      seen.add(owner.runId)
      const parent = state.runs.get(owner.parentRunId)
      if (parent === undefined) return yield* RuntimeUnavailable.make({ message: "Fork budget parent is missing" })
      const settlement = parent.events.findLast(
        (event): event is Extract<RunEvent, { readonly _tag: "ChildSettled" }> =>
          event._tag === "ChildSettled" && event.childRunId === owner.runId,
      )
      if (settlement === undefined) break
      const terminal = owner.events.find(
        (event) =>
          event.eventId === settlement.terminalEventId &&
          (event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled"),
      )
      if (terminal === undefined)
        return yield* RuntimeUnavailable.make({
          message: "Fork budget settlement does not match retained child history",
        })
      if (
        owner.events.some(
          (event) =>
            event._tag === "RunRewound" && event.allocation !== undefined && event.sequence > terminal.sequence,
        )
      )
        break
      owner = parent
    }
    return owner
  })

type CurrentBudget = ReturnType<typeof currentBudget>
export const withCurrentBudget: {
  (remaining: Remaining): (checkpoint: ExecutionCheckpoint) => CurrentBudget
  (checkpoint: ExecutionCheckpoint, remaining: Remaining): CurrentBudget
} = Function.dual(2, currentBudget)

export const reserveForkAllocation = ({
  state,
  input,
}: {
  readonly state: RuntimeState
  readonly input: Omit<ForkRunInput, "commandId">
}) =>
  Effect.gen(function* () {
    const source = state.runs.get(input.runId)
    if (source === undefined) return yield* RunNotFound.make({ runId: input.runId })
    if (state.runs.has(input.newRunId))
      return yield* RuntimeUnavailable.make({ message: `Fork target ${input.newRunId} already exists` })
    if (source.ownerId !== undefined)
      return yield* RuntimeUnavailable.make({
        message: "Release source execution authority before reserving a fork allocation",
      })
    const owner = yield* allocationOwner(state, source)
    if (owner.ownerId !== undefined)
      return yield* RuntimeUnavailable.make({
        message: "Release the current budget owner's authority before allocating a fork",
      })
    const allocation = yield* reserveForkBudget(owner, input.budget)
    return { source, owner, allocation }
  })

export const reserveRewindAllocation = ({
  state,
  input,
}: {
  readonly state: RuntimeState
  readonly input: Omit<RewindRunInput, "commandId">
}) =>
  Effect.gen(function* () {
    const source = state.runs.get(input.runId)
    if (source === undefined) return yield* RunNotFound.make({ runId: input.runId })
    if (state.runs.has(input.branchRunId))
      return yield* RuntimeUnavailable.make({ message: `Rewind archive ${input.branchRunId} already exists` })
    const nowMillis = yield* occurredAtMillis
    const owner = yield* allocationOwner(state, source)
    if (owner.runId !== source.runId && input.budget === undefined)
      return yield* BudgetInvalid.make({
        message: "Rewinding a settled child requires a new ancestor budget allocation",
      })
    if (owner.runId === source.runId && input.budget !== undefined)
      return yield* BudgetInvalid.make({
        message: "This Run retains its current allocation; use a budget extension to add capacity",
      })
    if (owner.runId !== source.runId && owner.ownerId !== undefined)
      return yield* RuntimeUnavailable.make({
        message: "Release the current budget owner's authority before reallocating a rewind",
      })
    const reservation = owner.runId === source.runId ? undefined : yield* reserveForkBudget(owner, input.budget)
    const available =
      reservation?.child.remaining ?? (yield* budgetForEvents({ events: source.events, observedMillis: nowMillis }))
    const baseline =
      reservation === undefined
        ? undefined
        : yield* spendForEvents({ events: source.events, observedMillis: nowMillis })
    return { source, owner, reservation, available, baseline }
  })
