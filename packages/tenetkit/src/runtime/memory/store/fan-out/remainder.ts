import { Effect, Function } from "effect"
import type { FanOutMemberResult } from "../../../child/fan-out.js"
import { isTerminal } from "../../../run.js"
import type { RuntimeUnavailable } from "../../../errors.js"
import {
  appendLifecycle,
  cancellationRequestedEvent,
  cancelledEvent,
  childReadinessChangedEvent,
  childSettledEvent,
} from "../../append.js"
import type { MemoryState, StoredFanOut } from "../../state.js"
import { admitChildSettlement } from "../directory.js"

export interface RemainderAction {
  readonly childRunId: string
  readonly action: "cancellation-requested" | "abandoned"
}

interface MemberCancellation {
  readonly state: MemoryState
  readonly member: FanOutMemberResult
}

export interface AppliedRemainder {
  readonly state: MemoryState
  readonly members: ReadonlyArray<FanOutMemberResult>
  readonly actions: ReadonlyArray<RemainderAction>
}

const isUnsettled = (member: FanOutMemberResult): boolean => member.status === "pending" || member.status === "running"

const actionsFor = (fanOut: StoredFanOut, members: ReadonlyArray<FanOutMemberResult>): ReadonlyArray<RemainderAction> =>
  members.filter(isUnsettled).map((member) => ({
    childRunId: member.childRunId,
    action: fanOut.remainder === "abandon" ? "abandoned" : "cancellation-requested",
  }))

const cancelMember = (
  state: MemoryState,
  parentRunId: string,
  member: FanOutMemberResult,
): Effect.Effect<MemberCancellation, RuntimeUnavailable> =>
  Effect.gen(function* () {
    if (!isUnsettled(member)) return { state, member }
    const run = state.runs.get(member.childRunId)
    if (run === undefined || isTerminal(run.status)) return { state, member }
    const [, requested] = yield* appendLifecycle(
      state,
      run.runId,
      cancellationRequestedEvent("fan-out remainder"),
      "cancelling",
    )
    if (run.ownerId !== undefined) return { state: requested, member }
    const [cancelledRunEvent, cancelledState] = yield* appendLifecycle(
      requested,
      run.runId,
      cancelledEvent("fan-out remainder"),
      "cancelled",
    )
    let next = cancelledState
    const parent = next.runs.get(parentRunId)
    const settledChild = next.runs.get(run.runId)
    if (parent !== undefined && settledChild !== undefined) {
      next = yield* admitChildSettlement(next, { parent, child: settledChild, event: cancelledRunEvent })
    }
    if (parent !== undefined && settledChild !== undefined && !isTerminal(parent.status)) {
      const runs = new Map(next.runs)
      runs.set(run.runId, { ...settledChild, childReadiness: "settled" })
      const [, readinessChanged] = yield* appendLifecycle(
        { ...next, runs },
        parent.runId,
        childReadinessChangedEvent(run.runId, "settled"),
      )
      const [, settled] = yield* appendLifecycle(
        readinessChanged,
        parent.runId,
        childSettledEvent(run.runId, cancelledRunEvent.eventId),
      )
      next = settled
    }
    return {
      state: next,
      member: {
        ...member,
        readiness: "settled",
        status: "cancelled",
        terminalEventId: cancelledRunEvent.eventId,
        reason: "fan-out remainder",
      },
    }
  })

export const applyRemainder: {
  (
    fanOut: StoredFanOut,
    members: ReadonlyArray<FanOutMemberResult>,
    joined: "succeeded" | "failed" | undefined,
  ): (state: MemoryState) => Effect.Effect<AppliedRemainder, RuntimeUnavailable>
  (
    state: MemoryState,
    fanOut: StoredFanOut,
    members: ReadonlyArray<FanOutMemberResult>,
    joined: "succeeded" | "failed" | undefined,
  ): Effect.Effect<AppliedRemainder, RuntimeUnavailable>
} = Function.dual(
  4,
  (
    state: MemoryState,
    fanOut: StoredFanOut,
    members: ReadonlyArray<FanOutMemberResult>,
    joined: "succeeded" | "failed" | undefined,
  ) =>
    Effect.gen(function* () {
      if (joined === undefined || fanOut.remainder === "await") return { state, members, actions: [] }
      const actions = actionsFor(fanOut, members)
      if (fanOut.remainder === "abandon") {
        return {
          state,
          members: members.map((member) => (isUnsettled(member) ? { ...member, status: "abandoned" } : member)),
          actions,
        }
      }
      if (fanOut.remainder !== "request-cancel") return { state, members, actions }
      let next = state
      const cancelled: Array<FanOutMemberResult> = []
      for (const member of members) {
        const result = yield* cancelMember(next, fanOut.parentRunId, member)
        next = result.state
        cancelled.push(result.member)
      }
      return { state: next, members: cancelled, actions }
    }),
)
