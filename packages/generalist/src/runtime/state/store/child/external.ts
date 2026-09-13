import { occurredAtMillis, type PreparedObservation } from "../../observation.js"
import { Effect, Equal, Option, Schema } from "effect"
import {
  ExternalChildCapacityUnavailable,
  ExternalChildPlacementConflict,
  ExternalChildPlacementNotFound,
  ExternalChildSettlementConflict,
  ExternalRootConflict,
  ExternalRootExecutableMismatch,
  ExternalRootNotFound,
  identifyRequest,
  PageInput,
  suspensionIdentity,
  type ExternalRoot,
  type ExternalRootSettlement,
  type Placement,
  type ParentPlacementPageInput,
  type ReserveInput,
  type ScopedAdmissionRequest,
  type ScopedCancelInput,
  type ScopedReserveInput,
} from "../../../child/external/placement.js"
import {
  ChildDepthExceeded,
  ChildLimitExceeded,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
} from "../../../errors.js"
import { isTerminal, type RunInspection, type RunOutcome } from "../../../run.js"
import type {
  ExternalRootInspection,
  Service as ExternalChildStoreService,
} from "../../../child/external/store.js"
import { budgetForEvents, projectRunSnapshot, spendForEvents, type InspectionRun } from "../../../execution/inspection.js"
import { startDigest } from "../../digest.js"
import { admitStart } from "../admission/accept.js"
import { activateRoot as activateAdmittedRoot } from "../admission/activation.js"
import {
  activeChildCount,
  familyRuns,
  promoteChildCapacity,
  readinessForAdmission,
  reserveSessions,
} from "./capacity.js"
import { sessionChildGrant } from "../admission/policy.js"
import { cancel as cancelRun, respond, suspend } from "../control.js"
import { requireExecutionClaim } from "../claim.js"
import { openRunWaits, type RuntimeState } from "../../projection.js"
import { containsChild, decodePinned } from "../../../executable/manifest-internal.js"
import { digest as registrationDigest, narrow } from "../../../executable/registration.js"
import { childGrant, Exhausted } from "../../../../core/durable/run-budget.js"
import { defaultInheritance } from "../../../../core/agent/lifecycle/fan-out.js"
import { appendLifecycle, childLinkedEvent, childReadinessChangedEvent, childSettledEvent } from "../../append.js"

const immutableEqual = (placement: Placement, input: ReserveInput): boolean =>
  placement.placementId === input.placementId &&
  placement.parentRunId === input.runId &&
  Equal.equals(placement.request, input.request) &&
  placement.invocationId === input.invocationId &&
  placement.requestDigest === input.requestDigest &&
  placement.executableDigest === input.executableDigest &&
  placement.waitId === input.parentSuspension?.wait.waitId &&
  placement.suspensionIdentity ===
    (input.parentSuspension === undefined ? undefined : suspensionIdentity(input.parentSuspension))

const scopedRequest = (request: Placement["request"]): ScopedAdmissionRequest => ({
  parent: request.parent,
  ref: request.ref,
  root: {
    message: request.root.message,
    executableRef: request.root.executableRef,
    executableManifest: request.root.executableManifest,
    registrations: request.root.registrations,
  },
})

const immutableScopedEqual = (placement: Placement, input: ScopedReserveInput): boolean =>
  placement.placementId === input.placementId &&
  placement.parentRunId === input.runId &&
  placement.invocationId === input.invocationId &&
  Equal.equals(scopedRequest(placement.request), input.request)

const reserve = (state: RuntimeState, input: ReserveInput) =>
  Effect.gen(function* () {
    const identity = yield* identifyRequest(input.request)
    if (
      input.request.parent.runId !== input.runId ||
      identity.requestDigest !== input.requestDigest ||
      identity.executableDigest !== input.executableDigest
    ) {
      return yield* ExternalChildPlacementConflict.make({ placementId: input.placementId })
    }
    yield* requireExecutionClaim(state, input)
    const existing = state.externalChildPlacements.get(input.placementId)
    if (existing !== undefined) {
      if (!immutableEqual(existing, input)) {
        return yield* ExternalChildPlacementConflict.make({ placementId: input.placementId })
      }
      return [existing, state] as const
    }
    if (
      [...state.externalChildPlacements.values()].some(
        (placement) =>
          Equal.equals(placement.request.ref, input.request.ref) ||
          (placement.parentRunId === input.runId && placement.invocationId === input.invocationId),
      )
    ) {
      return yield* ExternalChildPlacementConflict.make({ placementId: input.placementId })
    }
    const parent = state.runs.get(input.runId)
    if (parent === undefined) return yield* RunNotFound.make({ runId: input.runId })
    if (isTerminal(parent.status)) return yield* RunTerminal.make({ runId: parent.runId, status: parent.status })
    if (activeChildCount(state, parent) >= parent.treePolicy.concurrency.agents) {
      return yield* ExternalChildCapacityUnavailable.make({
        parentRunId: parent.runId,
        limit: parent.treePolicy.concurrency.agents,
      })
    }
    const placement: Placement = {
      placementId: input.placementId,
      parentRunId: input.runId,
      request: input.request,
      invocationId: input.invocationId,
      requestDigest: input.requestDigest,
      executableDigest: input.executableDigest,
      readiness: "ready",
      acknowledged: false,
      cancelRequested: parent.cancellationRequested,
      settled: false,
    }
    if (input.parentSuspension !== undefined) {
      Object.assign(placement, {
        waitId: input.parentSuspension.wait.waitId,
        suspensionIdentity: suspensionIdentity(input.parentSuspension),
      })
    }
    const placements = new Map(state.externalChildPlacements)
    placements.set(input.placementId, placement)
    const reserved = { ...state, externalChildPlacements: placements }
    const next =
      input.parentSuspension === undefined
        ? reserved
        : yield* suspend(reserved, {
            ...input,
            session: input.session,
            ...input.parentSuspension,
            waits: [input.parentSuspension.wait],
          })
    return [placement, next] as const
  })

const reserveScoped = (state: RuntimeState, input: ScopedReserveInput) =>
  Effect.gen(function* () {
    yield* requireExecutionClaim(state, input)
    if (input.request.parent.runId !== input.runId) {
      return yield* ExternalChildPlacementConflict.make({ placementId: input.placementId })
    }
    const existing = state.externalChildPlacements.get(input.placementId)
    if (existing !== undefined) {
      if (!immutableScopedEqual(existing, input)) {
        return yield* ExternalChildPlacementConflict.make({ placementId: input.placementId })
      }
      return [existing, state] as const
    }
    if (
      [...state.externalChildPlacements.values()].some(
        (placement) =>
          Equal.equals(placement.request.ref, input.request.ref) ||
          (placement.parentRunId === input.runId && placement.invocationId === input.invocationId),
      )
    ) {
      return yield* ExternalChildPlacementConflict.make({ placementId: input.placementId })
    }
    const parent = state.runs.get(input.runId)
    if (parent === undefined) return yield* RunNotFound.make({ runId: input.runId })
    if (isTerminal(parent.status)) return yield* RunTerminal.make({ runId: parent.runId, status: parent.status })
    const executable = yield* Effect.try({
      try: () =>
        decodePinned({
          ref: input.request.root.executableRef,
          manifest: input.request.root.executableManifest,
        }),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    if (!containsChild({ ref: parent.executableRef, manifest: parent.executableManifest }, executable)) {
      return yield* RuntimeUnavailable.make({ message: "External child is not an authorized pinned child profile" })
    }
    const registrations = yield* narrow(executable, input.request.root.registrations).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) })),
    )
    const grantedRegistrations = new Map(
      parent.registrations.map((registration) => [registration.pin, registrationDigest(registration)]),
    )
    if (
      !registrations.every(
        (registration) => grantedRegistrations.get(registration.pin) === registrationDigest(registration),
      )
    ) {
      return yield* RuntimeUnavailable.make({ message: "External child registration differs from the parent grant" })
    }
    const depth = parent.depth + 1
    yield* reserveSessions(state, parent, [input.request.root.message.sessionId])
    if (depth > parent.treePolicy.maxDepth) {
      return yield* ChildDepthExceeded.make({
        parentRunId: parent.runId,
        rootRunId: parent.rootRunId,
        parentDepth: parent.depth,
        depth,
        requested: depth,
        current: parent.depth,
        limit: parent.treePolicy.maxDepth,
      })
    }
    const sessions = new Set(
      familyRuns(state, parent.rootRunId)
        .filter((run) =>
          run.executableManifest.entries.some(
            (entry) => entry.pin === run.executableRef.active && entry._tag === "Agent",
          ),
        )
        .map((run) => run.message.sessionId),
    )
    for (const placement of state.externalChildPlacements.values()) {
      if (state.runs.get(placement.parentRunId)?.rootRunId === parent.rootRunId) {
        sessions.add(placement.request.root.message.sessionId)
      }
    }
    const currentSessions = sessions.size
    sessions.add(input.request.root.message.sessionId)
    if (sessions.size > parent.treePolicy.maxSessions) {
      return yield* ChildLimitExceeded.make({
        parentRunId: parent.runId,
        rootRunId: parent.rootRunId,
        parentDepth: parent.depth,
        depth,
        requested: sessions.size - currentSessions,
        current: currentSessions,
        limit: parent.treePolicy.maxSessions,
      })
    }
    if (parent.treePolicy.concurrency.agents === 0) {
      return yield* ChildLimitExceeded.make({
        parentRunId: parent.runId,
        rootRunId: parent.rootRunId,
        parentDepth: parent.depth,
        depth,
        requested: 1,
        current: 0,
        limit: parent.treePolicy.concurrency.agents,
      })
    }
    const readiness = readinessForAdmission(state, parent)
    const parentBudget = yield* budgetForEvents({ events: parent.events, observedMillis: yield* occurredAtMillis })
    if (parentBudget.children === 0) {
      return yield* Exhausted.make({ budget: "children", requested: 1, remaining: 0 })
    }
    const budget = yield* sessionChildGrant({
      state,
      sessionId: input.request.root.message.sessionId,
      selection: input.request.root,
      grant: childGrant(parentBudget, 1),
    })
    const request = {
      ...input.request,
      root: {
        ...input.request.root,
        registrations,
        treePolicy: parent.treePolicy,
        budget,
      },
    }
    const identity = yield* identifyRequest(request)
    const placement: Placement = {
      placementId: input.placementId,
      parentRunId: input.runId,
      request,
      invocationId: input.invocationId,
      ...identity,
      readiness,
      acknowledged: false,
      cancelRequested: parent.cancellationRequested,
      ...(parent.cancelReason === undefined ? undefined : { cancelReason: parent.cancelReason }),
      settled: false,
    }
    const placements = new Map(state.externalChildPlacements)
    placements.set(placement.placementId, placement)
    const label = input.request.root.message.metadata.childLabel
    const details: Parameters<typeof childLinkedEvent>[5] = {
      readiness,
      key: input.request.root.message.idempotencyKey,
      inherit: defaultInheritance,
      budget,
      ...(typeof label === "string" ? { label } : undefined),
    }
    const [, next] = yield* appendLifecycle(
      { ...state, externalChildPlacements: placements },
      parent.runId,
      childLinkedEvent(
        input.request.ref.runId,
        input.invocationId,
        input.request.root.executableRef.active,
        input.request.root.message.prompt,
        depth,
        details,
      ),
    )
    return [placement, next] as const
  })

const modify = (
  state: RuntimeState,
  placementId: string,
  update: (placement: Placement) => Placement,
): Effect.Effect<readonly [Placement, RuntimeState], ExternalChildPlacementNotFound, PreparedObservation> => {
  const placement = state.externalChildPlacements.get(placementId)
  if (placement === undefined) return ExternalChildPlacementNotFound.make({ placementId })
  const updated = update(placement)
  const placements = new Map(state.externalChildPlacements)
  placements.set(placementId, updated)
  return Effect.succeed([updated, { ...state, externalChildPlacements: placements }] as const)
}

const acknowledge = (state: RuntimeState, placementId: string) =>
  modify(state, placementId, (placement) => (placement.acknowledged ? placement : { ...placement, acknowledged: true }))

const cancel = (state: RuntimeState, placementId: string) =>
  modify(state, placementId, (placement) =>
    placement.settled || placement.cancelRequested ? placement : { ...placement, cancelRequested: true },
  )

const cancelScoped = (state: RuntimeState, input: ScopedCancelInput) =>
  Effect.gen(function* () {
    yield* requireExecutionClaim(state, input)
    const placement = state.externalChildPlacements.get(input.placementId)
    if (placement === undefined || placement.parentRunId !== input.runId) {
      return yield* ExternalChildPlacementNotFound.make({ placementId: input.placementId })
    }
    if (placement.cancelRequested) {
      if (placement.cancelReason !== input.reason) {
        return yield* ExternalChildPlacementConflict.make({ placementId: input.placementId })
      }
      return [placement, state] as const
    }
    const updated: Placement = {
      ...placement,
      cancelRequested: true,
      ...(input.reason === undefined ? undefined : { cancelReason: input.reason }),
    }
    const placements = new Map(state.externalChildPlacements)
    placements.set(input.placementId, updated)
    return [updated, { ...state, externalChildPlacements: placements }] as const
  })

const settle = (
  state: RuntimeState,
  input: {
    readonly placementId: string
    readonly settlementId: string
    readonly outcome: RunOutcome
    readonly spend?: NonNullable<Placement["spend"]>
  },
): Effect.Effect<
  readonly [Placement, RuntimeState],
  ExternalChildPlacementNotFound | ExternalChildSettlementConflict | RuntimeUnavailable,
  PreparedObservation
> =>
  Effect.gen(function* () {
    const placement = state.externalChildPlacements.get(input.placementId)
    if (placement === undefined) return yield* ExternalChildPlacementNotFound.make({ placementId: input.placementId })
    if (placement.settled) {
      if (
        placement.settlementId !== input.settlementId ||
        !Equal.equals(placement.outcome, input.outcome) ||
        !Equal.equals(placement.spend, input.spend)
      ) {
        return yield* ExternalChildSettlementConflict.make({
          placementId: input.placementId,
          settlementId: input.settlementId,
        })
      }
      return [placement, state] as const
    }
    const updated: Placement = {
      ...placement,
      readiness: "settled",
      settled: true,
      settlementId: input.settlementId,
      outcome: input.outcome,
      ...(input.spend === undefined ? undefined : { spend: input.spend }),
    }
    const placements = new Map(state.externalChildPlacements)
    placements.set(input.placementId, updated)
    let next: RuntimeState = { ...state, externalChildPlacements: placements }
    let parent = next.runs.get(placement.parentRunId)
    if (
      parent !== undefined &&
      !isTerminal(parent.status) &&
      !parent.events.some(
        (event) => event._tag === "ChildSettled" && event.childRunId === placement.request.ref.runId,
      )
    ) {
      ;[, next] = yield* appendLifecycle(
        next,
        parent.runId,
        childReadinessChangedEvent(placement.request.ref.runId, "settled"),
      ).pipe(Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })))
      ;[, next] = yield* appendLifecycle(
        next,
        parent.runId,
        childSettledEvent({
          childRunId: placement.request.ref.runId,
          terminalEventId: input.settlementId,
          ...(input.spend === undefined ? undefined : { spend: input.spend }),
        }),
      ).pipe(Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })))
      parent = next.runs.get(placement.parentRunId)
    }
    if (
      placement.waitId !== undefined &&
      parent !== undefined &&
      !isTerminal(parent.status) &&
      !parent.cancellationRequested &&
      openRunWaits(next, parent.runId).some((wait) => wait.waitId === placement.waitId)
    ) {
      next = yield* respond(next, {
        runId: parent.runId,
        waitId: placement.waitId,
        resolution: { _tag: "ToolResult", result: input.outcome, encodedResult: input.outcome },
      }).pipe(Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) })))
    }
    if (parent?.cancellationRequested === true) {
      const cancelInput = { runId: parent.runId }
      next = yield* cancelRun(
        next,
        parent.cancelReason === undefined ? cancelInput : { ...cancelInput, reason: parent.cancelReason },
      ).pipe(Effect.mapError(() => RuntimeUnavailable.make({ message: "external parent cancellation missing" })))
    }
    next = yield* promoteChildCapacity(next, placement.parentRunId)
    return [updated, next] as const
  })

type AdmitRootInput = Parameters<ExternalChildStoreService["admitRoot"]>[0]

const rootView = (state: RuntimeState, stored: ExternalRoot) =>
  Effect.gen(function* () {
    const run = state.runs.get(stored.ref.runId)
    if (run === undefined)
      return yield* RuntimeUnavailable.make({ message: `external root ${stored.ref.runId} is missing` })
    const inspection: RunInspection = {
      runId: run.runId,
      status: run.status,
      executableRef: run.executableRef,
      executableManifest: run.executableManifest,
      depth: run.depth,
      treePolicy: run.treePolicy,
      waits: openRunWaits(state, run.runId),
      lastSequence: run.lastSequence,
      durability: "durable",
      branches: [],
    }
    const projection: InspectionRun = {
      inspection,
      rootRunId: run.rootRunId,
      events: run.events,
      firstTreePosition: 0,
    }
    if (run.terminalEventId !== undefined) Object.assign(projection, { terminalEventId: run.terminalEventId })
    const snapshot = yield* projectRunSnapshot(projection)
    const root = {
      ...stored,
      cancelRequested: run.cancellationRequested,
    }
    return "outcome" in snapshot ? { ...root, outcome: snapshot.outcome } : root
  })

const immutableRootEqual = (stored: ExternalRoot, input: AdmitRootInput, admissionDigest: string): boolean =>
  stored.placementId === input.placementId &&
  Equal.equals(stored.parent, input.parent) &&
  Equal.equals(stored.ref, input.ref) &&
  stored.sessionId === input.root.message.sessionId &&
  stored.requestDigest === input.requestDigest &&
  stored.executableDigest === input.executableDigest &&
  stored.admissionDigest === admissionDigest

const admitRoot = (state: RuntimeState, input: AdmitRootInput) =>
  Effect.gen(function* () {
    const identity = yield* identifyRequest({ parent: input.parent, ref: input.ref, root: input.root })
    if (identity.executableDigest !== input.executableDigest) {
      return yield* ExternalRootExecutableMismatch.make({
        placementId: input.placementId,
        expected: input.executableDigest,
        actual: identity.executableDigest,
      })
    }
    if (identity.requestDigest !== input.requestDigest)
      return yield* ExternalRootConflict.make({ placementId: input.placementId })
    const root = { ...input.root, runId: input.ref.runId, initialChildren: [], initialFanOuts: [] }
    const admissionDigest = startDigest(root)
    const existing = state.externalRoots.get(input.placementId)
    if (existing !== undefined) {
      if (!immutableRootEqual(existing, input, admissionDigest)) {
        return yield* ExternalRootConflict.make({ placementId: input.placementId })
      }
      return [yield* rootView(state, existing), state] as const
    }
    if (
      [...state.externalRoots.values()].some(
        (candidate) => Equal.equals(candidate.ref, input.ref) || candidate.ref.runId === input.ref.runId,
      )
    ) {
      return yield* ExternalRootConflict.make({ placementId: input.placementId })
    }
    const [receipt, admitted] = yield* admitStart(state, root, { activate: false })
    if (receipt.duplicate) return yield* ExternalRootConflict.make({ placementId: input.placementId })
    const stored: ExternalRoot = {
      placementId: input.placementId,
      parent: input.parent,
      ref: input.ref,
      sessionId: input.root.message.sessionId,
      requestDigest: input.requestDigest,
      executableDigest: input.executableDigest,
      admissionDigest,
      activated: false,
      cancelRequested: false,
      settlementAcknowledged: false,
    }
    const roots = new Map(admitted.externalRoots)
    roots.set(input.placementId, stored)
    const next = { ...admitted, externalRoots: roots }
    return [yield* rootView(next, stored), next] as const
  })

const requireRoot = (state: RuntimeState, placementId: string) => {
  const root = state.externalRoots.get(placementId)
  return root === undefined ? ExternalRootNotFound.make({ placementId }) : Effect.succeed(root)
}

const activateRoot = (state: RuntimeState, placementId: string) =>
  Effect.gen(function* () {
    const stored = yield* requireRoot(state, placementId)
    if (stored.activated) return [yield* rootView(state, stored), state] as const
    const run = state.runs.get(stored.ref.runId)
    if (run === undefined)
      return yield* RuntimeUnavailable.make({ message: `external root ${stored.ref.runId} is missing` })
    const [, next] = yield* activateAdmittedRoot(state, run.runId).pipe(
      Effect.catchTag("generalist/runtime/RunNotFound", () =>
        RuntimeUnavailable.make({ message: `external root ${stored.ref.runId} is missing` }),
      ),
    )
    const activated = { ...stored, activated: true }
    const roots = new Map(next.externalRoots)
    roots.set(placementId, activated)
    const activatedState = { ...next, externalRoots: roots }
    return [yield* rootView(activatedState, activated), activatedState] as const
  })

const inspectRoot = (state: RuntimeState, placementId: string) =>
  Effect.flatMap(requireRoot(state, placementId), (root) => rootView(state, root))

const inspectRootRun = (state: RuntimeState, placementId: string) =>
  Effect.gen(function* () {
    const stored = yield* requireRoot(state, placementId)
    const run = state.runs.get(stored.ref.runId)
    if (run === undefined) {
      return yield* RuntimeUnavailable.make({ message: `external root ${stored.ref.runId} is missing` })
    }
    return {
      root: yield* rootView(state, stored),
      status: run.status,
    } satisfies ExternalRootInspection
  })

const cancelRoot = (state: RuntimeState, placementId: string, reason?: string) =>
  Effect.gen(function* () {
    const stored = yield* requireRoot(state, placementId)
    const cancelInput = { runId: stored.ref.runId }
    const next = yield* cancelRun(state, reason === undefined ? cancelInput : { ...cancelInput, reason }).pipe(
      Effect.mapError(() => RuntimeUnavailable.make({ message: `external root ${stored.ref.runId} is missing` })),
    )
    return [yield* rootView(next, stored), next] as const
  })

const rootSettlement = (state: RuntimeState, placementId: string) =>
  Effect.gen(function* () {
    const stored = yield* requireRoot(state, placementId)
    const root = yield* rootView(state, stored)
    if (root.outcome === undefined) return Option.none<ExternalRootSettlement>()
    const run = state.runs.get(root.ref.runId)
    if (run === undefined) {
      return yield* RuntimeUnavailable.make({ message: `external root ${root.ref.runId} is missing` })
    }
    return Option.some({
      placementId,
      ref: root.ref,
      settlementId: root.outcome.eventId,
      outcome: root.outcome,
      spend: yield* spendForEvents({ events: run.events }),
      acknowledged: root.settlementAcknowledged,
    })
  })

const acknowledgeRootSettlement = (
  state: RuntimeState,
  input: { readonly placementId: string; readonly settlementId: string },
) =>
  Effect.gen(function* () {
    const settlement = yield* rootSettlement(state, input.placementId)
    if (Option.isNone(settlement) || settlement.value.settlementId !== input.settlementId) {
      return yield* ExternalChildSettlementConflict.make(input)
    }
    const stored = state.externalRoots.get(input.placementId)!
    const roots = new Map(state.externalRoots)
    roots.set(input.placementId, { ...stored, settlementAcknowledged: true })
    const next = { ...state, externalRoots: roots }
    return [{ ...settlement.value, acknowledged: true }, next] as const
  })

const inspectPlacement = (state: RuntimeState, placementId: string) => {
  const placement = state.externalChildPlacements.get(placementId)
  return placement === undefined ? ExternalChildPlacementNotFound.make({ placementId }) : Effect.succeed(placement)
}

const pageWindow = <A extends { readonly placementId: string }>(values: ReadonlyArray<A>, input: PageInput) =>
  Effect.gen(function* () {
    const page = yield* Schema.decodeEffect(PageInput, { onExcessProperty: "error" })(input).pipe(
      Effect.mapError(() =>
        RuntimeUnavailable.make({
          message: "External obligation pages require a limit between 1 and 1000 and a bounded placement cursor",
        }),
      ),
    )
    const candidates = values
      .filter((value) => page.afterPlacementId === undefined || value.placementId > page.afterPlacementId)
      .toSorted((left, right) => {
        if (left.placementId < right.placementId) return -1
        return left.placementId > right.placementId ? 1 : 0
      })
      .slice(0, page.limit + 1)
    const window = candidates.slice(0, page.limit)
    const cursor = candidates.length > page.limit ? window[window.length - 1]?.placementId : undefined
    return { window, cursor }
  })

const outstandingPlacements = (state: RuntimeState, input: PageInput) =>
  Effect.gen(function* () {
    const page = yield* pageWindow([...state.externalChildPlacements.values()], input)
    const items = page.window.filter((placement) => !placement.settled)
    return page.cursor === undefined ? { items } : { items, cursor: page.cursor }
  })

const placementsByParent = (state: RuntimeState, input: ParentPlacementPageInput) =>
  Effect.gen(function* () {
    const pageInput: PageInput =
      input.afterPlacementId === undefined
        ? { limit: input.limit }
        : { limit: input.limit, afterPlacementId: input.afterPlacementId }
    const page = yield* pageWindow(
      [...state.externalChildPlacements.values()].filter(
        (placement) => placement.parentRunId === input.parentRunId,
      ),
      pageInput,
    )
    return page.cursor === undefined ? { items: page.window } : { items: page.window, cursor: page.cursor }
  })

const outstandingRoots = (state: RuntimeState, input: PageInput) =>
  Effect.gen(function* () {
    const page = yield* pageWindow([...state.externalRoots.values()], input)
    const items = yield* Effect.forEach(
      page.window.filter((root) => !root.settlementAcknowledged),
      (root) => rootView(state, root),
    )
    return page.cursor === undefined ? { items } : { items, cursor: page.cursor }
  })

export const externalChildOperations = {
  inspectPlacement,
  outstandingPlacements,
  outstandingRoots,
  placementsByParent,
  reserve,
  reserveScoped,
  acknowledge,
  cancel,
  cancelScoped,
  settle,
  admitRoot,
  activateRoot,
  inspectRoot,
  inspectRootRun,
  cancelRoot,
  rootSettlement,
  acknowledgeRootSettlement,
}
