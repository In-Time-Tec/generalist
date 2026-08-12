import { Effect, Function } from "effect"
import type { ChildReadiness } from "../child-readiness.js"
import type { RuntimeUnavailable } from "../errors.js"
import type { FanOutMemberResult } from "../fan-out.js"
import { isTerminal } from "../run.js"
import type { RunEvent } from "../run-event.js"
import { appendLifecycle, makeChildReadinessChanged } from "./append.js"
import type { MemoryState, StoredRun } from "./state.js"

export const activeChildCount: {
  (parent: StoredRun): (state: MemoryState) => number
  (state: MemoryState, parent: StoredRun): number
} = Function.dual(2, (state: MemoryState, parent: StoredRun): number =>
  parent.children.reduce(
    (count, childRunId) => count + (state.runs.get(childRunId)?.childReadiness === "ready" ? 1 : 0),
    0,
  ),
)

export const readinessForAdmission: {
  (parent: StoredRun): (state: MemoryState) => ChildReadiness
  (state: MemoryState, parent: StoredRun): ChildReadiness
} = Function.dual(
  2,
  (state: MemoryState, parent: StoredRun): ChildReadiness =>
    activeChildCount(state, parent) < parent.treePolicy.maxSubagents ? "ready" : "queued",
)

export const promoteChildCapacity: {
  (parentRunId: string): (state: MemoryState) => Effect.Effect<MemoryState, RuntimeUnavailable>
  (state: MemoryState, parentRunId: string): Effect.Effect<MemoryState, RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, parentRunId: string) =>
  Effect.gen(function* () {
    const parent = state.runs.get(parentRunId)
    if (
      parent === undefined ||
      isTerminal(parent.status) ||
      parent.cancellationRequested ||
      parent.treePolicy.maxSubagents === 0
    ) {
      return state
    }
    let next = state
    let active = activeChildCount(next, parent)
    for (const childRunId of parent.children) {
      if (active >= parent.treePolicy.maxSubagents) break
      const child = next.runs.get(childRunId)
      if (child?.childReadiness !== "queued" || isTerminal(child.status) || child.cancellationRequested) continue
      const group = [...next.fanOuts.values()].find((fanOut) =>
        fanOut.members.some((member) => member.childRunId === childRunId),
      )
      if (group !== undefined) {
        if (group.status !== "running") continue
        const groupActive = group.members.filter((member) => member.readiness === "ready").length
        if (groupActive >= group.concurrency) continue
      }
      const runs = new Map(next.runs)
      runs.set(childRunId, { ...child, childReadiness: "ready" })
      const fanOuts = new Map(next.fanOuts)
      if (group !== undefined) {
        fanOuts.set(group.fanOutId, {
          ...group,
          members: group.members.map((member) =>
            member.childRunId === childRunId ? { ...member, readiness: "ready", status: "running" } : member,
          ),
        })
      }
      const [, promoted] = yield* appendLifecycle(
        { ...next, runs, fanOuts },
        parentRunId,
        makeChildReadinessChanged(childRunId, "ready"),
      )
      next = promoted
      active++
    }
    return next
  }),
)

export const settleFanOutMember: {
  (event: RunEvent): (member: FanOutMemberResult) => FanOutMemberResult
  (member: FanOutMemberResult, event: RunEvent): FanOutMemberResult
} = Function.dual(2, (member: FanOutMemberResult, event: RunEvent): FanOutMemberResult => {
  if (event._tag === "RunCompleted") {
    return {
      ...member,
      readiness: "settled",
      status: "succeeded",
      terminalEventId: event.eventId,
      result: event.result,
    }
  }
  if (event._tag === "RunFailed") {
    return { ...member, readiness: "settled", status: "failed", terminalEventId: event.eventId, error: event.error }
  }
  return {
    ...member,
    readiness: "settled",
    status: "cancelled",
    terminalEventId: event.eventId,
    ...(event._tag === "RunCancelled" && event.reason !== undefined ? { reason: event.reason } : {}),
  }
})
