import { occurredAtMillis, type PreparedObservation } from "../../observation.js"
import { Effect, Function } from "effect"
import type { ChildReadiness } from "../../../child/readiness.js"
import { ChildLimitExceeded, RuntimeUnavailable } from "../../../errors.js"
import type { FanOutMemberResult } from "../../../child/fan-out.js"
import { isTerminal } from "../../../run.js"
import type { RunEvent } from "../../../run/event.js"
import { appendLifecycle, childReadinessChangedEvent } from "../../append.js"
import { emptySession, type RuntimeSession, type RuntimeState, type StoredRun } from "../../projection.js"
import { childGrant, Exhausted, type BudgetLimits } from "../../../../core/durable/run-budget.js"
import { capGrant, split } from "../../../budget/state.js"
import { budgetForEvents } from "../../../execution/inspection.js"
import type { Message } from "../../../messaging/message.js"
import { sessionChildGrant } from "../admission/policy.js"

export interface ContinuationPlan {
  readonly continuation: RuntimeSession["continuation"]
  readonly replenish: boolean
}

export const requireOpen = (state: RuntimeState) =>
  state.closed ? Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" })) : Effect.void

type ChildGrantSelection = Parameters<typeof sessionChildGrant>[0]["selection"]

export const continuationBudgets = (input: {
  readonly state: RuntimeState
  readonly parent: StoredRun
  readonly sessionId: string
  readonly selection: ChildGrantSelection
  readonly plan: ContinuationPlan
}) =>
  Effect.gen(function* () {
    const grants = yield* continuationGrant({
      state: input.state,
      parent: input.parent,
      sessionId: input.sessionId,
      plan: input.plan,
    })
    const child = yield* sessionChildGrant({
      state: input.state,
      sessionId: input.sessionId,
      selection: input.selection,
      grant: grants.child,
      bypassRetained: input.plan.replenish,
    })
    if (grants.continuation === undefined) return { child }
    const continuation = yield* sessionChildGrant({
      state: input.state,
      sessionId: input.sessionId,
      selection: input.selection,
      grant: grants.continuation,
      bypassRetained: input.plan.replenish,
    })
    return { child, continuation }
  })

type FamilyRunOptions =
  | { readonly continuationBudget: BudgetLimits; readonly fundingRunId: string }
  | { readonly fundingRunId: string }
  | Record<never, never>

export const familyRunOptions: {
  (plan: ContinuationPlan, continuationBudget: BudgetLimits | undefined, fundingRunId: string): FamilyRunOptions
  (continuationBudget: BudgetLimits | undefined, fundingRunId: string): (plan: ContinuationPlan) => FamilyRunOptions
} = Function.dual(
  3,
  (plan: ContinuationPlan, continuationBudget: BudgetLimits | undefined, fundingRunId: string): FamilyRunOptions => {
    if (continuationBudget !== undefined) return { continuationBudget, fundingRunId }
    return plan.replenish ? { fundingRunId } : {}
  },
)

export const spawnedChild = (input: {
  readonly runId: string
  readonly parent: StoredRun
  readonly executableRef: StoredRun["executableRef"]
  readonly address: StoredRun["address"]
  readonly message: Message
  readonly childReadiness: ChildReadiness
  readonly invocationId: string
  readonly registrations: StoredRun["registrations"]
}) => ({
  runId: input.runId,
  status: "queued" as const,
  executableRef: input.executableRef,
  executableManifest: input.parent.executableManifest,
  address: input.address,
  message: input.message,
  rootRunId: input.parent.rootRunId,
  depth: input.parent.depth + 1,
  treePolicy: input.parent.treePolicy,
  parentRunId: input.parent.runId,
  childReadiness: input.childReadiness,
  invocationId: input.invocationId,
  lastSequence: -1,
  lastTurnCompletedSequence: -1,
  attempt: 0,
  attemptFence: 0,
  cancellationRequested: false,
  children: [],
  events: [],
  subscribers: new Map(),
  steering: [],
  registrations: input.registrations,
  checkpoints: new Map(),
})

export const continuationFor = (input: {
  readonly state: RuntimeState
  readonly sessionId: string
  readonly parentSessionId: string
  readonly parentRunId: string
  readonly sponsored: boolean
}): Effect.Effect<ContinuationPlan, RuntimeUnavailable | Exhausted> =>
  Effect.gen(function* () {
    if (!input.sponsored) return { continuation: undefined, replenish: false }
    const continuation = input.state.sessions.get(input.sessionId)?.continuation
    if (continuation === undefined || continuation.closed) {
      const exhaustion = {
        budget: "children" as const,
        requested: 1,
        remaining: 0,
      }
      return yield* Exhausted.make(exhaustion)
    }
    const source = input.state.runs.get(continuation.sourceRunId)
    if (source === undefined || source.message.sessionId !== input.parentSessionId) {
      return yield* RuntimeUnavailable.make({ message: "Session continuation allocation has no valid origin" })
    }
    if (continuation.remainingRuns === 0) {
      if (continuation.fundingRunId === input.parentRunId)
        return yield* Exhausted.make({ budget: "children", requested: 1, remaining: 0 })
      return { continuation, replenish: true }
    }
    return { continuation, replenish: false }
  })

export const continuationGrant = (input: {
  readonly state: RuntimeState
  readonly parent: StoredRun
  readonly sessionId: string
  readonly plan: ContinuationPlan
}) =>
  Effect.gen(function* () {
    const parentBudget =
      input.plan.continuation !== undefined && !input.plan.replenish
        ? input.plan.continuation.allocation
        : yield* budgetForEvents({ events: input.parent.events, observedMillis: yield* occurredAtMillis })
    if ((input.plan.continuation === undefined || input.plan.replenish) && parentBudget.children === 0) {
      return yield* Exhausted.make({ budget: "children", requested: 1, remaining: 0 })
    }
    if (input.plan.continuation !== undefined && !input.plan.replenish) {
      return {
        child: capGrant(childGrant(parentBudget, 1), input.plan.continuation.allocation),
      }
    }
    const reserve = parentBudget.children === undefined || parentBudget.children >= 2
    const admitted = childGrant(parentBudget, reserve ? 2 : 1)
    if (!reserve) return { child: admitted }
    const [child, continuation] = [split(2)(admitted), split(2)(admitted)]
    return { child, continuation }
  })

type MutableFanOutMemberResult = { -readonly [Key in keyof FanOutMemberResult]: FanOutMemberResult[Key] }

const continuationForRun = (
  session: RuntimeSession,
  parent: StoredRun | undefined,
  continuationBudget: BudgetLimits | undefined,
  fundingRunId: string | undefined,
): RuntimeSession["continuation"] => {
  if (continuationBudget === undefined) {
    return fundingRunId === undefined || session.continuation === undefined
      ? session.continuation
      : { ...session.continuation, fundingRunId, remainingRuns: 0 }
  }
  const sourceRunId = session.continuation?.sourceRunId ?? parent?.runId
  if (sourceRunId === undefined) return undefined
  return {
    sourceRunId,
    fundingRunId: fundingRunId ?? parent?.runId ?? sourceRunId,
    allocation: continuationBudget,
    remainingRuns: 1,
    closed: false,
  }
}

const sessionWithContinuation = (
  session: RuntimeSession,
  family: NonNullable<RuntimeSession["family"]>,
  continuation: RuntimeSession["continuation"],
  runId: string,
) => {
  const next = { ...session, family: { ...family, runIds: [...family.runIds, runId] } }
  if (continuation !== undefined) Object.assign(next, { continuation })
  return next
}

export const familyRuns: {
  (rootRunId: string): (state: RuntimeState) => ReadonlyArray<StoredRun>
  (state: RuntimeState, rootRunId: string): ReadonlyArray<StoredRun>
} = Function.dual(2, (state: RuntimeState, rootRunId: string): ReadonlyArray<StoredRun> => {
  const root = state.runs.get(rootRunId)
  if (root === undefined) return []
  const family = state.sessions.get(root.message.sessionId)?.family
  if (family !== undefined) {
    const runs: Array<StoredRun> = []
    const sessions = [family.rootSessionId]
    for (let index = 0; index < sessions.length; index++) {
      const member = state.sessions.get(sessions[index]!)?.family
      if (member === undefined) continue
      for (const id of member.runIds) {
        const run = state.runs.get(id)
        if (run !== undefined) runs.push(run)
      }
      sessions.push(...member.childSessionIds)
    }
    const roots = new Set(runs.map((run) => run.rootRunId))
    return [
      ...runs,
      ...[...state.runs.values()].filter(
        (run) =>
          roots.has(run.rootRunId) &&
          run.executableManifest.entries.some(
            (entry) => entry.pin === run.executableRef.active && entry._tag === "Tool",
          ),
      ),
    ]
  }
  return [...state.runs.values()].filter((run) => run.rootRunId === rootRunId)
})

export const activeChildCount: {
  (parent: StoredRun): (state: RuntimeState) => number
  (state: RuntimeState, parent: StoredRun): number
} = Function.dual(
  2,
  (state: RuntimeState, parent: StoredRun): number =>
    familyRuns(state, parent.rootRunId).filter(
      (run) =>
        run.childReadiness === "ready" &&
        run.status !== "waiting" &&
        run.status !== "needs-resolution" &&
        !isTerminal(run.status),
    ).length +
    [...state.externalChildPlacements.values()].filter(
      (placement) => state.runs.get(placement.parentRunId)?.rootRunId === parent.rootRunId && !placement.settled,
    ).length,
)

interface CapacityInput {
  readonly state: RuntimeState
  readonly run: StoredRun
  readonly now: number
}

const activeToolCount = ({ state, run, now }: CapacityInput): number => {
  let count = 0
  for (const candidate of familyRuns(state, run.rootRunId)) {
    const independent = candidate.executableManifest.entries.some(
      (entry) => entry.pin === candidate.executableRef.active && entry._tag === "Tool",
    )
    if (independent && candidate.runId === run.runId) continue
    const operations = new Set(
      [...state.operations.values()]
        .filter(
          (operation) =>
            operation.runId === candidate.runId &&
            operation.kind === "tool" &&
            (operation.status === "running" || operation.status === "unknown"),
        )
        .map((operation) => operation.operationId),
    ).size
    const owner = candidate.ownerId === undefined ? undefined : state.workers.get(candidate.ownerId)
    const claimed =
      independent &&
      !isTerminal(candidate.status) &&
      candidate.ownerId !== undefined &&
      (owner === undefined || owner.expiresAt > now)
    count += Math.max(operations, claimed ? 1 : 0)
  }
  return count
}

export const requireToolCapacity = (input: CapacityInput) =>
  activeToolCount(input) >= input.run.treePolicy.concurrency.tools
    ? RuntimeUnavailable.make({ message: `Run ${input.run.runId} is awaiting family Tool capacity` })
    : Effect.void

export const requireFamilyCapacity = ({ state, run, now }: CapacityInput) =>
  Effect.gen(function* () {
    if (
      run.executableManifest.entries.some((entry) => entry.pin === run.executableRef.active && entry._tag === "Tool")
    ) {
      yield* requireToolCapacity({ state, run, now })
    }
    if (
      run.executableManifest.entries.some((entry) => entry.pin === run.executableRef.active && entry._tag === "Agent")
    ) {
      const live = familyRuns(state, run.rootRunId).filter((candidate) => {
        if (candidate.runId === run.runId || candidate.ownerId === undefined || candidate.status !== "running")
          return false
        const owner = state.workers.get(candidate.ownerId)
        return (
          (owner === undefined || owner.expiresAt > now) &&
          candidate.executableManifest.entries.some(
            (entry) => entry.pin === candidate.executableRef.active && entry._tag === "Agent",
          )
        )
      }).length
      if (live >= run.treePolicy.concurrency.agents) {
        return yield* RuntimeUnavailable.make({ message: `Run ${run.runId} is awaiting family Agent capacity` })
      }
    }
  })

export const recordFamilyRun = ({
  state,
  run,
  budget,
  continuationBudget,
  fundingRunId,
}: {
  readonly state: RuntimeState
  readonly run: StoredRun
  readonly budget: BudgetLimits
  readonly continuationBudget?: BudgetLimits
  readonly fundingRunId?: string
}): RuntimeState => {
  if (run.executableManifest.entries.some((entry) => entry.pin === run.executableRef.active && entry._tag === "Tool"))
    return state
  const sessionId = run.message.sessionId
  const session = state.sessions.get(sessionId) ?? emptySession()
  const parent = run.parentRunId === undefined ? undefined : state.runs.get(run.parentRunId)
  const parentSessionId = parent?.message.sessionId ?? null
  const parentSession = parentSessionId === null ? undefined : state.sessions.get(parentSessionId)
  const family = session.family ?? {
    rootSessionId: parentSession?.family?.rootSessionId ?? sessionId,
    parentSessionId,
    parentRunId: run.parentRunId ?? null,
    depth: run.depth,
    treePolicy: run.treePolicy,
    budget,
    runIds: [],
    childSessionIds: [],
  }
  const continuation = continuationForRun(session, parent, continuationBudget, fundingRunId)
  const sessions = new Map(state.sessions)
  const nextSession = sessionWithContinuation(session, family, continuation, run.runId)
  sessions.set(sessionId, nextSession)
  if (parentSession?.family !== undefined && !parentSession.family.childSessionIds.includes(sessionId)) {
    sessions.set(parentSessionId!, {
      ...parentSession,
      family: { ...parentSession.family, childSessionIds: [...parentSession.family.childSessionIds, sessionId] },
    })
  }
  return { ...state, sessions }
}

export const reserveSessions: {
  (
    parent: StoredRun,
    sessionIds: ReadonlyArray<string>,
  ): (state: RuntimeState) => Effect.Effect<void, ChildLimitExceeded | RuntimeUnavailable>
  (
    state: RuntimeState,
    parent: StoredRun,
    sessionIds: ReadonlyArray<string>,
  ): Effect.Effect<void, ChildLimitExceeded | RuntimeUnavailable>
} = Function.dual(
  3,
  (
    state: RuntimeState,
    parent: StoredRun,
    sessionIds: ReadonlyArray<string>,
  ): Effect.Effect<void, ChildLimitExceeded | RuntimeUnavailable> => {
    const parentFamily = state.sessions.get(parent.message.sessionId)?.family
    for (const sessionId of sessionIds) {
      const existing = state.sessions.get(sessionId)?.family
      if (
        sessionId === parent.message.sessionId ||
        (existing === undefined && state.hostSessions.has(sessionId)) ||
        (existing !== undefined &&
          (existing.rootSessionId !== parentFamily?.rootSessionId ||
            existing.parentSessionId !== parent.message.sessionId))
      )
        return RuntimeUnavailable.make({ message: "A child Session cannot replace another Session's admitted family" })
    }
    const retained = new Set(
      familyRuns(state, parent.rootRunId)
        .filter(
          (run) =>
            !run.executableManifest.entries.some(
              (entry) => entry.pin === run.executableRef.active && entry._tag === "Tool",
            ),
        )
        .map((run) => run.message.sessionId),
    )
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
    if (parent === undefined || parent.cancellationRequested || parent.treePolicy.concurrency.agents === 0) {
      return state
    }
    let next = state
    let active = activeChildCount(next, parent)
    for (const childRunId of familyRuns(next, parent.rootRunId)
      .filter((run) => run.parentRunId !== undefined)
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
