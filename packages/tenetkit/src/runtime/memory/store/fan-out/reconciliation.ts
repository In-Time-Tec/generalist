import { Effect, Function } from "effect"
import { RuntimeUnavailable } from "../../../errors.js"
import type { RunEvent } from "../../../run/event.js"
import type { FanOutMemberResult } from "../../../child/fan-out.js"
import type { MemoryState, StoredFanOut, StoredRun } from "../../state.js"
import { promoteChildCapacity, settleFanOutMember } from "../child/capacity.js"
import { completeJoin } from "./completion.js"
import { applyRemainder } from "./remainder.js"

const joinedStatus = (
  join: StoredFanOut["join"],
  counts: {
    readonly succeeded: number
    readonly failed: number
    readonly cancelled: number
    readonly unsettled: number
  },
): "succeeded" | "failed" | undefined => {
  switch (join._tag) {
    case "AllSuccess":
      if (counts.failed + counts.cancelled > 0) return "failed"
      return counts.unsettled === 0 ? "succeeded" : undefined
    case "AllSettled":
    case "BestEffort":
      return counts.unsettled === 0 ? "succeeded" : undefined
    case "FirstSuccess":
      if (counts.succeeded > 0) return "succeeded"
      return counts.unsettled === 0 ? "failed" : undefined
    case "Quorum":
      if (counts.succeeded >= join.required) return "succeeded"
      return counts.succeeded + counts.unsettled < join.required ? "failed" : undefined
  }
}

interface ReconciliationTarget {
  readonly fanOut: StoredFanOut
  readonly memberIndex: number
  readonly member: FanOutMemberResult
}

const reconciliationTarget = (state: MemoryState, childRunId: string): ReconciliationTarget | undefined => {
  const fanOut = [...state.fanOuts.values()].find((candidate) =>
    candidate.members.some((member) => member.childRunId === childRunId),
  )
  if (fanOut === undefined) return undefined
  const memberIndex = fanOut.members.findIndex((member) => member.childRunId === childRunId)
  const member = fanOut.members[memberIndex]
  return member === undefined ? undefined : { fanOut, memberIndex, member }
}

const isSettled = (member: FanOutMemberResult): boolean =>
  member.status === "succeeded" ||
  member.status === "failed" ||
  member.status === "cancelled" ||
  member.status === "abandoned"

const unsettledCount = (members: ReadonlyArray<FanOutMemberResult>): number =>
  members.filter((member) => member.status === "pending" || member.status === "running").length

const completionStatus = (
  fanOut: StoredFanOut,
  members: ReadonlyArray<FanOutMemberResult>,
): "succeeded" | "failed" | undefined => {
  const status = joinedStatus(fanOut.join, {
    succeeded: members.filter((member) => member.status === "succeeded").length,
    failed: members.filter((member) => member.status === "failed").length,
    cancelled: members.filter((member) => member.status === "cancelled").length,
    unsettled: unsettledCount(members),
  })
  return status === "succeeded" && fanOut.remainder === "await" && unsettledCount(members) > 0 ? undefined : status
}
export const reconcileFanOut: {
  (
    child: StoredRun,
    event: RunEvent,
    settlePending: (state: MemoryState, parent: StoredRun) => Effect.Effect<MemoryState, RuntimeUnavailable>,
  ): (state: MemoryState) => Effect.Effect<MemoryState, RuntimeUnavailable, never>
  (
    state: MemoryState,
    child: StoredRun,
    event: RunEvent,
    settlePending: (state: MemoryState, parent: StoredRun) => Effect.Effect<MemoryState, RuntimeUnavailable>,
  ): Effect.Effect<MemoryState, RuntimeUnavailable, never>
} = Function.dual(
  4,
  (
    state: MemoryState,
    child: StoredRun,
    event: RunEvent,
    settlePending: (state: MemoryState, parent: StoredRun) => Effect.Effect<MemoryState, RuntimeUnavailable>,
  ) =>
    Effect.gen(function* () {
      const target = reconciliationTarget(state, child.runId)
      if (target === undefined) {
        return child.parentRunId === undefined ? state : yield* promoteChildCapacity(state, child.parentRunId)
      }
      const { fanOut, memberIndex, member } = target
      if (isSettled(member)) {
        return yield* promoteChildCapacity(state, fanOut.parentRunId)
      }
      let members: Array<FanOutMemberResult> = [...fanOut.members]
      members[memberIndex] = settleFanOutMember(member, event)
      const settledFanOuts = new Map(state.fanOuts)
      settledFanOuts.set(fanOut.fanOutId, { ...fanOut, members })
      let next: MemoryState = { ...state, fanOuts: settledFanOuts }
      if (fanOut.status !== "running") {
        return yield* promoteChildCapacity(next, fanOut.parentRunId)
      }
      const unsettled = unsettledCount(members)
      const cancellingParent = next.runs.get(fanOut.parentRunId)
      if (cancellingParent?.cancellationRequested === true) {
        const fanOuts = new Map(next.fanOuts)
        fanOuts.set(fanOut.fanOutId, {
          ...fanOut,
          status: unsettled === 0 ? "cancelled" : "running",
          members,
        })
        return { ...next, fanOuts }
      }
      const joined = completionStatus(fanOut, members)
      const remainder = yield* applyRemainder(next, fanOut, members, joined)
      next = remainder.state
      members = [...remainder.members]
      const fanOuts = new Map(next.fanOuts)
      fanOuts.set(fanOut.fanOutId, { ...fanOut, status: joined ?? "running", members })
      next = { ...next, fanOuts }
      next = yield* promoteChildCapacity(next, fanOut.parentRunId)
      const promotedFanOut = next.fanOuts.get(fanOut.fanOutId)
      if (promotedFanOut === undefined) return next
      return joined === undefined
        ? next
        : yield* completeJoin({
            state: next,
            fanOut: promotedFanOut,
            joined,
            remainder: remainder.actions,
            settlePending,
          })
    }),
)
