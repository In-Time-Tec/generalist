import { DateTime, Effect, Function } from "effect"
import { RuntimeUnavailable } from "../errors.js"
import { ownsChildSuspension, resultFromChildEvent } from "../child-group.js"
import { isTerminal } from "../run.js"
import type { RunEvent } from "../run-event.js"
import { appendLifecycle, makeChildSettled, makeResumed } from "./append.js"
import type { MemoryState, StoredRun } from "./state.js"
import { admitChildSettlement } from "./store-directory.js"

const isChildTerminalEvent = (
  event: RunEvent,
): event is Extract<RunEvent, { readonly _tag: "RunCompleted" | "RunFailed" | "RunCancelled" }> =>
  event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled"

export const hasUnsettledChild: {
  (runId: string): (state: MemoryState) => boolean
  (state: MemoryState, runId: string): boolean
} = Function.dual(2, (state: MemoryState, runId: string): boolean => {
  const run = state.runs.get(runId)
  if (run === undefined) return false
  return run.children.some((childRunId) => {
    const child = state.runs.get(childRunId)
    return child !== undefined && !isTerminal(child.status)
  })
})

export const reconcileChildWait: {
  (
    parent: StoredRun,
    child: StoredRun,
    event: RunEvent,
  ): (state: MemoryState) => Effect.Effect<MemoryState, RuntimeUnavailable>
  (
    state: MemoryState,
    parent: StoredRun,
    child: StoredRun,
    event: RunEvent,
  ): Effect.Effect<MemoryState, RuntimeUnavailable>
} = Function.dual(4, (state: MemoryState, parent: StoredRun, child: StoredRun, event: RunEvent) =>
  Effect.gen(function* () {
    if (
      !isChildTerminalEvent(event) ||
      isTerminal(parent.status) ||
      parent.cancellationRequested ||
      parent.activeWaitId === undefined ||
      parent.wait?.status !== "open" ||
      !ownsChildSuspension({
        parentRunId: parent.runId,
        waitId: parent.activeWaitId,
        childRunId: child.runId,
        metadata: child.message.metadata,
        suspension: parent.suspension,
      })
    ) {
      return state
    }
    const result = resultFromChildEvent({ childRunId: child.runId, metadata: child.message.metadata, event })
    const resolution = { _tag: "ToolResult" as const, result, encodedResult: result }
    const closedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const runs = new Map(state.runs)
    const { ownerId: _, ...released } = parent
    runs.set(parent.runId, {
      ...released,
      wait: { ...parent.wait, status: "responded", resolution, closedAt },
    })
    const [, resumed] = yield* appendLifecycle(
      { ...state, runs },
      parent.runId,
      makeResumed(parent.activeWaitId, resolution),
      "running",
    )
    return resumed
  }),
)

export const settleParentChild: {
  (child: StoredRun, terminalEventId: string): (state: MemoryState) => Effect.Effect<MemoryState, RuntimeUnavailable>
  (state: MemoryState, child: StoredRun, terminalEventId: string): Effect.Effect<MemoryState, RuntimeUnavailable>
} = Function.dual(3, (state: MemoryState, child: StoredRun, terminalEventId: string) =>
  Effect.gen(function* () {
    if (child.parentRunId === undefined) return state
    const parent = state.runs.get(child.parentRunId)
    if (parent === undefined) return state
    const terminalEvent = child.events.find((event) => event.eventId === terminalEventId)
    const notified =
      terminalEvent === undefined ? state : yield* admitChildSettlement(state, { parent, child, event: terminalEvent })
    if (isTerminal(parent.status)) return notified
    const already = parent.events.some((event) => event._tag === "ChildSettled" && event.childRunId === child.runId)
    if (already) return notified
    const [, linked] = yield* appendLifecycle(notified, parent.runId, makeChildSettled(child.runId, terminalEventId))
    const currentParent = linked.runs.get(parent.runId)
    const reconciled =
      currentParent === undefined || terminalEvent === undefined
        ? linked
        : yield* reconcileChildWait(linked, currentParent, child, terminalEvent)
    const afterResume = reconciled.runs.get(parent.runId)
    if (afterResume?.status !== "queued" || hasUnsettledChild(reconciled, parent.runId)) return reconciled
    const [, started] = yield* appendLifecycle(
      reconciled,
      parent.runId,
      { _tag: "RunAttemptStarted", attempt: afterResume.attempt + 1 },
      "running",
    )
    return started
  }),
)
