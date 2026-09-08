import type { PreparedObservation } from "../../observation.js"
import { Effect, Function } from "effect"
import type { ChildReadiness } from "../../../child/readiness.js"
import { ChildLimitExceeded, type RuntimeUnavailable } from "../../../errors.js"
import type { FanOutMemberResult } from "../../../child/fan-out.js"
import { isTerminal } from "../../../run.js"
import type { RunEvent } from "../../../run/event.js"
import { appendLifecycle, childReadinessChangedEvent } from "../../append.js"
import type { RuntimeState, StoredRun } from "../../projection.js"

type MutableFanOutMemberResult = { -readonly [Key in keyof FanOutMemberResult]: FanOutMemberResult[Key] }

export const familyRuns: {
  (rootRunId: string): (state: RuntimeState) => ReadonlyArray<StoredRun>
  (state: RuntimeState, rootRunId: string): ReadonlyArray<StoredRun>
} = Function.dual(2, (state: RuntimeState, rootRunId: string): ReadonlyArray<StoredRun> => {
  const runs: Array<StoredRun> = []
  const pending = [rootRunId]
  for (let index = 0; index < pending.length; index++) {
    const run = state.runs.get(pending[index]!)
    if (run === undefined || run.rootRunId !== rootRunId) continue
    runs.push(run)
    pending.push(...run.children)
  }
  return runs
})

export const activeChildCount: {
  (parent: StoredRun): (state: RuntimeState) => number
  (state: RuntimeState, parent: StoredRun): number
} = Function.dual(
  2,
  (state: RuntimeState, parent: StoredRun): number =>
    familyRuns(state, parent.rootRunId).filter(
      (run) =>
        run.rootRunId === parent.rootRunId &&
        run.childReadiness === "ready" &&
        run.status !== "waiting" &&
        run.status !== "needs-resolution" &&
        !isTerminal(run.status),
    ).length +
    [...state.externalChildPlacements.values()].filter(
      (placement) => state.runs.get(placement.parentRunId)?.rootRunId === parent.rootRunId && !placement.settled,
    ).length,
)

export const reserveSessions: {
  (
    parent: StoredRun,
    sessionIds: ReadonlyArray<string>,
  ): (state: RuntimeState) => Effect.Effect<void, ChildLimitExceeded>
  (state: RuntimeState, parent: StoredRun, sessionIds: ReadonlyArray<string>): Effect.Effect<void, ChildLimitExceeded>
} = Function.dual(
  3,
  (
    state: RuntimeState,
    parent: StoredRun,
    sessionIds: ReadonlyArray<string>,
  ): Effect.Effect<void, ChildLimitExceeded> => {
    const retained = new Set(familyRuns(state, parent.rootRunId).map((run) => run.message.sessionId))
    const current = retained.size
    for (const sessionId of sessionIds) retained.add(sessionId)
    return retained.size <= parent.treePolicy.maxSessions
      ? Effect.void
      : ChildLimitExceeded.make({
          parentRunId: parent.runId,
          rootRunId: parent.rootRunId,
          parentDepth: parent.depth,
          depth: parent.depth + 1,
          requested: retained.size - current,
          current,
          limit: parent.treePolicy.maxSessions,
        })
  },
)

export const readinessForAdmission: {
  (parent: StoredRun): (state: RuntimeState) => ChildReadiness
  (state: RuntimeState, parent: StoredRun): ChildReadiness
} = Function.dual(
  2,
  (state: RuntimeState, parent: StoredRun): ChildReadiness =>
    activeChildCount(state, parent) < parent.treePolicy.concurrency.agents ? "ready" : "queued",
)

export const promoteChildCapacity: {
  (parentRunId: string): (state: RuntimeState) => Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation>
  (state: RuntimeState, parentRunId: string): Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation>
} = Function.dual(2, (state: RuntimeState, parentRunId: string) =>
  Effect.gen(function* () {
    const parent = state.runs.get(parentRunId)
    if (
      parent === undefined ||
      isTerminal(parent.status) ||
      parent.cancellationRequested ||
      parent.treePolicy.concurrency.agents === 0
    ) {
      return state
    }
    let next = state
    let active = activeChildCount(next, parent)
    for (const childRunId of familyRuns(next, parent.rootRunId)
      .filter((run) => run.rootRunId === parent.rootRunId && run.parentRunId !== undefined)
      .map((run) => run.runId)) {
      if (active >= parent.treePolicy.concurrency.agents) break
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
        child.parentRunId!,
        childReadinessChangedEvent(childRunId, "ready"),
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
  const cancelled: MutableFanOutMemberResult = {
    ...member,
    readiness: "settled",
    status: "cancelled",
    terminalEventId: event.eventId,
  }
  if (event._tag === "RunCancelled" && event.reason !== undefined) cancelled.reason = event.reason
  return cancelled
})
