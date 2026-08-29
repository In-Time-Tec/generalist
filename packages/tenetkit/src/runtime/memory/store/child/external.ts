import { Effect, Equal, Option } from "effect"
import {
  ExternalChildCapacityUnavailable,
  ExternalChildPlacementConflict,
  ExternalChildPlacementNotFound,
  ExternalChildSettlementConflict,
  ExternalRootConflict,
  ExternalRootExecutableMismatch,
  ExternalRootNotFound,
  executableDigest,
  suspensionIdentity,
  type ExternalRoot,
  type ExternalRootSettlement,
  type Placement,
  type ReserveInput,
} from "../../../child/external/placement.js"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../../errors.js"
import { isTerminal, type RunInspection, type RunOutcome } from "../../../run.js"
import type { Interface as ExternalChildStoreInterface } from "../../../child/external/store.js"
import { projectRunSnapshot, type InspectionRun } from "../../../execution/inspection.js"
import { startDigest } from "../../digest.js"
import { admitStart } from "../admit.js"
import { activateRoot as activateAdmittedRoot } from "../activate.js"
import { activeChildCount, promoteChildCapacity } from "./capacity.js"
import { cancel as cancelRun, respond, suspend } from "../control.js"
import { requireExecutionClaim } from "../execution.js"
import { openRunWaits, type MemoryState } from "../../state.js"

const immutableEqual = (placement: Placement, input: ReserveInput): boolean =>
  placement.placementId === input.placementId &&
  placement.parentRunId === input.runId &&
  Equal.equals(placement.ref, input.ref) &&
  placement.invocationId === input.invocationId &&
  placement.requestDigest === input.requestDigest &&
  placement.executableDigest === input.executableDigest &&
  placement.waitId === input.parentSuspension?.wait.waitId &&
  placement.suspensionIdentity ===
    (input.parentSuspension === undefined ? undefined : suspensionIdentity(input.parentSuspension))

const reserve = (state: MemoryState, input: ReserveInput) =>
  Effect.gen(function* () {
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
          Equal.equals(placement.ref, input.ref) ||
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
      ref: input.ref,
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
  state: MemoryState,
  placementId: string,
  update: (placement: Placement) => Placement,
): Effect.Effect<readonly [Placement, MemoryState], ExternalChildPlacementNotFound> => {
  const placement = state.externalChildPlacements.get(placementId)
  if (placement === undefined) return ExternalChildPlacementNotFound.make({ placementId })
  const updated = update(placement)
  const placements = new Map(state.externalChildPlacements)
  placements.set(placementId, updated)
  return Effect.succeed([updated, { ...state, externalChildPlacements: placements }] as const)
}

const acknowledge = (state: MemoryState, placementId: string) =>
  modify(state, placementId, (placement) => (placement.acknowledged ? placement : { ...placement, acknowledged: true }))

const cancel = (state: MemoryState, placementId: string) =>
  modify(state, placementId, (placement) =>
    placement.settled || placement.cancelRequested ? placement : { ...placement, cancelRequested: true },
  )

const settle = (
  state: MemoryState,
  input: { readonly placementId: string; readonly settlementId: string; readonly outcome: RunOutcome },
): Effect.Effect<
  readonly [Placement, MemoryState],
  ExternalChildPlacementNotFound | ExternalChildSettlementConflict | RuntimeUnavailable
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
    let next: MemoryState = { ...state, externalChildPlacements: placements }
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

type AdmitRootInput = Parameters<ExternalChildStoreInterface["admitRoot"]>[0]

const rootView = (state: MemoryState, stored: ExternalRoot) =>
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
      durability: "ephemeral",
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

const admitRoot = (state: MemoryState, input: AdmitRootInput) =>
  Effect.gen(function* () {
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
    const actualExecutableDigest = executableDigest({
      ref: input.root.executableRef,
      manifest: input.root.executableManifest,
    })
    if (actualExecutableDigest !== input.executableDigest) {
      return yield* ExternalRootExecutableMismatch.make({
        placementId: input.placementId,
        expected: input.executableDigest,
        actual: actualExecutableDigest,
      })
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

const requireRoot = (state: MemoryState, placementId: string) => {
  const root = state.externalRoots.get(placementId)
  return root === undefined ? ExternalRootNotFound.make({ placementId }) : Effect.succeed(root)
}

const activateRoot = (state: MemoryState, placementId: string) =>
  Effect.gen(function* () {
    const stored = yield* requireRoot(state, placementId)
    if (stored.activated) return [yield* rootView(state, stored), state] as const
    const run = state.runs.get(stored.ref.runId)
    if (run === undefined)
      return yield* RuntimeUnavailable.make({ message: `external root ${stored.ref.runId} is missing` })
    const [, next] = yield* activateAdmittedRoot(state, run.runId).pipe(
      Effect.catchTag("tenetkit/runtime/RunNotFound", () =>
        RuntimeUnavailable.make({ message: `external root ${stored.ref.runId} is missing` }),
      ),
    )
    const activated = { ...stored, activated: true }
    const roots = new Map(next.externalRoots)
    roots.set(placementId, activated)
    const activatedState = { ...next, externalRoots: roots }
    return [yield* rootView(activatedState, activated), activatedState] as const
  })

const inspectRoot = (state: MemoryState, placementId: string) =>
  Effect.flatMap(requireRoot(state, placementId), (root) => rootView(state, root))

const cancelRoot = (state: MemoryState, placementId: string, reason?: string) =>
  Effect.gen(function* () {
    const stored = yield* requireRoot(state, placementId)
    const cancelInput = { runId: stored.ref.runId }
    const next = yield* cancelRun(state, reason === undefined ? cancelInput : { ...cancelInput, reason }).pipe(
      Effect.mapError(() => RuntimeUnavailable.make({ message: `external root ${stored.ref.runId} is missing` })),
    )
    return [yield* rootView(next, stored), next] as const
  })

const rootSettlement = (state: MemoryState, placementId: string) =>
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
  state: MemoryState,
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

export const externalChildOperations = {
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
