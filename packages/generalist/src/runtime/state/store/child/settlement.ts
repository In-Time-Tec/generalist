import { type PreparedObservation, occurredAt as preparedOccurredAt, occurredAtMillis } from "../../observation.js"
import { Effect, Function } from "effect"
import { RuntimeUnavailable } from "../../../errors.js"
import { ownsChildSuspension, resultFromChildEvent } from "../../../child/group.js"
import { isTerminal } from "../../../run.js"
import type { RunEvent } from "../../../run/event.js"
import { appendLifecycle, childReadinessChangedEvent, childSettledEvent, resumedEvent } from "../../append.js"
import { openRunWaits, type RuntimeState, type StoredRun } from "../../projection.js"
import { admitChildSettlement } from "../directory.js"
import { recoverBudgetSuspension } from "../control/budget.js"
import { closeWait } from "../control/wait.js"
import { spendForEvents } from "../../../execution/inspection.js"

const isChildTerminalEvent = (
  event: RunEvent,
): event is Extract<RunEvent, { readonly _tag: "RunCompleted" | "RunFailed" | "RunCancelled" }> =>
  event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled"

export const hasUnsettledChild: {
  (runId: string): (state: RuntimeState) => boolean
  (state: RuntimeState, runId: string): boolean
} = Function.dual(2, (state: RuntimeState, runId: string): boolean => {
  const run = state.runs.get(runId)
  if (run === undefined) return false
  return (
    run.children.some((childRunId) => {
      const child = state.runs.get(childRunId)
      return child !== undefined && !isTerminal(child.status)
    }) ||
    [...state.externalChildPlacements.values()].some(
      (placement) => placement.parentRunId === runId && !placement.settled,
    )
  )
})

const childSettlementMetadata = (parent: StoredRun, childRunId: string) => {
  const linked = parent.events.find((event) => event._tag === "ChildLinked" && event.childRunId === childRunId)
  if (linked?._tag !== "ChildLinked") return {}
  type Metadata = Pick<
    Extract<RunEvent, { readonly _tag: "ChildLinked" }>,
    "continuationBudget" | "sponsoredContinuation"
  >
  const metadata: Metadata = {}
  if (linked.continuationBudget !== undefined)
    Object.assign(metadata, { continuationBudget: linked.continuationBudget })
  if (linked.sponsoredContinuation !== undefined)
    Object.assign(metadata, { sponsoredContinuation: linked.sponsoredContinuation })
  return metadata
}

export const reconcileChildWait: {
  (
    parent: StoredRun,
    child: StoredRun,
    event: RunEvent,
  ): (state: RuntimeState) => Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation>
  (
    state: RuntimeState,
    parent: StoredRun,
    child: StoredRun,
    event: RunEvent,
  ): Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation>
} = Function.dual(4, (state: RuntimeState, parent: StoredRun, child: StoredRun, event: RunEvent) =>
  Effect.gen(function* () {
    const waits = openRunWaits(state, parent.runId).filter((candidate) =>
      ownsChildSuspension({
        parentRunId: parent.runId,
        waitId: candidate.waitId,
        childRunId: child.runId,
        metadata: child.message.metadata,
        suspension: parent.suspension,
      }),
    )
    if (
      !isChildTerminalEvent(event) ||
      isTerminal(parent.status) ||
      parent.cancellationRequested ||
      waits.length === 0
    ) {
      return state
    }
    const result = resultFromChildEvent({ childRunId: child.runId, metadata: child.message.metadata, event })
    const resolution = { _tag: "ToolResult" as const, result, encodedResult: result }
    const closedAt = yield* preparedOccurredAt
    const runs = new Map(state.runs)
    const { ownerId: _, ...released } = parent
    runs.set(parent.runId, released)
    let resumed: RuntimeState = { ...state, runs }
    for (const wait of waits) {
      const transitioned = closeWait(resumed, {
        runId: parent.runId,
        waitId: wait.waitId,
        status: "responded",
        resolution,
        closedAt,
      })
      if (transitioned.affected !== 1) continue
      ;[, resumed] = yield* appendLifecycle(
        transitioned.state,
        parent.runId,
        resumedEvent(wait.waitId, resolution),
        "running",
      )
    }
    return resumed
  }),
)

export const settleParentChild: {
  (
    child: StoredRun,
    terminalEventId: string,
  ): (state: RuntimeState) => Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation>
  (
    state: RuntimeState,
    child: StoredRun,
    terminalEventId: string,
  ): Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation>
} = Function.dual(3, (state: RuntimeState, child: StoredRun, terminalEventId: string) =>
  Effect.gen(function* () {
    if (
      child.parentRunId === undefined ||
      child.executableManifest.entries.some(
        (entry) => entry.pin === child.executableRef.active && entry._tag === "Tool",
      )
    )
      return state
    const parent = state.runs.get(child.parentRunId)
    if (parent === undefined) return state
    const runs = new Map(state.runs)
    runs.set(child.runId, { ...child, childReadiness: "settled" })
    const settledState = { ...state, runs }
    const terminalEvent = child.events.find((event) => event.eventId === terminalEventId)
    const metadata = childSettlementMetadata(parent, child.runId)
    const notified =
      terminalEvent === undefined
        ? settledState
        : yield* admitChildSettlement(settledState, { parent, child, event: terminalEvent })
    if (isTerminal(parent.status)) return notified
    const already = parent.events.some((event) => event._tag === "ChildSettled" && event.childRunId === child.runId)
    if (already) return notified
    const [, readinessChanged] = yield* appendLifecycle(
      notified,
      parent.runId,
      childReadinessChangedEvent(child.runId, "settled"),
    )
    const settledEvent = childSettledEvent({
      childRunId: child.runId,
      terminalEventId,
      spend: yield* spendForEvents({ events: child.events, observedMillis: yield* occurredAtMillis }),
    })
    Object.assign(settledEvent, metadata)
    const [, linked] = yield* appendLifecycle(readinessChanged, parent.runId, settledEvent)
    const currentParent = linked.runs.get(parent.runId)
    const reconciled =
      currentParent === undefined || terminalEvent === undefined
        ? linked
        : yield* reconcileChildWait(linked, currentParent, child, terminalEvent)
    const recovered = yield* recoverBudgetSuspension(reconciled, parent.runId)
    const afterResume = recovered.runs.get(parent.runId)
    if (afterResume?.status !== "queued" || hasUnsettledChild(recovered, parent.runId)) return recovered
    const [, started] = yield* appendLifecycle(
      recovered,
      parent.runId,
      { _tag: "RunAttemptStarted", attempt: afterResume.attempt + 1 },
      "running",
    )
    return started
  }),
)
