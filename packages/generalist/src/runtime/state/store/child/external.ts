import type { PreparedObservation } from "../../observation.js"
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
  type ReserveInput,
} from "../../../child/external/placement.js"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../../errors.js"
import { isTerminal, type RunInspection, type RunOutcome } from "../../../run.js"
import type { Service as ExternalChildStoreService } from "../../../child/external/store.js"
import { projectRunSnapshot, type InspectionRun } from "../../../execution/inspection.js"
import { startDigest } from "../../digest.js"
import { admitStart } from "../admission/accept.js"
import { activateRoot as activateAdmittedRoot } from "../admission/activation.js"
import { activeChildCount, promoteChildCapacity } from "./capacity.js"
import { cancel as cancelRun, respond, suspend } from "../control.js"
import { requireExecutionClaim } from "../claim.js"
import { openRunWaits, type RuntimeState } from "../../projection.js"

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
    yield* requireExecutionClaim(state, input)
    const parent = state.runs.get(input.runId)
    if (parent === undefined) return yield* RunNotFound.make({ runId: input.runId })
    if (isTerminal(parent.status)) return yield* RunTerminal.make({ runId: parent.runId, status: parent.status })
    if (activeChildCount(state, parent) >= parent.treePolicy.maxSubagents) {
      return yield* ExternalChildCapacityUnavailable.make({
        parentRunId: parent.runId,
        limit: parent.treePolicy.maxSubagents,
      })
    }
    const placement: Placement = {
      placementId: input.placementId,
      parentRunId: input.runId,
      request: input.request,
      invocationId: input.invocationId,
      requestDigest: input.requestDigest,
      executableDigest: input.executableDigest,
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

const settle = (
  state: RuntimeState,
  input: { readonly placementId: string; readonly settlementId: string; readonly outcome: RunOutcome },
): Effect.Effect<
  readonly [Placement, RuntimeState],
  ExternalChildPlacementNotFound | ExternalChildSettlementConflict | RuntimeUnavailable,
  PreparedObservation
> =>
  Effect.gen(function* () {
    const placement = state.externalChildPlacements.get(input.placementId)
    if (placement === undefined) return yield* ExternalChildPlacementNotFound.make({ placementId: input.placementId })
    if (placement.settled) {
      if (placement.settlementId !== input.settlementId || !Equal.equals(placement.outcome, input.outcome)) {
        return yield* ExternalChildSettlementConflict.make({
          placementId: input.placementId,
          settlementId: input.settlementId,
        })
      }
      return [placement, state] as const
    }
    const updated: Placement = { ...placement, settled: true, settlementId: input.settlementId, outcome: input.outcome }
    const placements = new Map(state.externalChildPlacements)
    placements.set(input.placementId, updated)
    let next: RuntimeState = { ...state, externalChildPlacements: placements }
    const parent = next.runs.get(placement.parentRunId)
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
    const root = yield* inspectRoot(state, placementId)
    if (root.outcome === undefined) return Option.none<ExternalRootSettlement>()
    return Option.some({
      placementId,
      ref: root.ref,
      settlementId: root.outcome.eventId,
      outcome: root.outcome,
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
  reserve,
  acknowledge,
  cancel,
  settle,
  admitRoot,
  activateRoot,
  inspectRoot,
  cancelRoot,
  rootSettlement,
  acknowledgeRootSettlement,
}
