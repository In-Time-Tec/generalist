import { Effect, Equal } from "effect"
import {
  ExternalChildCapacityUnavailable,
  ExternalChildPlacementConflict,
  ExternalChildPlacementNotFound,
  ExternalChildSettlementConflict,
  suspensionIdentity,
  type Placement,
  type ReserveInput,
} from "../external-child-placement.js"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../errors.js"
import { isTerminal, type RunOutcome } from "../run.js"
import { activeChildCount, promoteChildCapacity } from "./store-child-capacity.js"
import { cancel as cancelRun, respond, suspend } from "./store-control.js"
import { requireExecutionClaim } from "./store-execution.js"
import type { MemoryState } from "./state.js"

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
      ...(input.parentSuspension === undefined
        ? {}
        : {
            waitId: input.parentSuspension.wait.waitId,
            suspensionIdentity: suspensionIdentity(input.parentSuspension),
          }),
      acknowledged: false,
      cancelRequested: parent.cancellationRequested,
      settled: false,
    }
    const placements = new Map(state.externalChildPlacements)
    placements.set(input.placementId, placement)
    const reserved = { ...state, externalChildPlacements: placements }
    const next =
      input.parentSuspension === undefined
        ? reserved
        : yield* suspend(reserved, { ...input, ...input.parentSuspension })
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
      parent.activeWaitId === placement.waitId &&
      parent.wait?.status === "open"
    ) {
      next = yield* respond(next, {
        runId: parent.runId,
        waitId: placement.waitId,
        resolution: { _tag: "ToolResult", result: input.outcome, encodedResult: input.outcome },
      }).pipe(Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) })))
    }
    if (parent?.cancellationRequested === true) {
      next = yield* cancelRun(next, {
        runId: parent.runId,
        ...(parent.cancelReason === undefined ? {} : { reason: parent.cancelReason }),
      }).pipe(Effect.mapError(() => RuntimeUnavailable.make({ message: "external parent cancellation missing" })))
    }
    next = yield* promoteChildCapacity(next, placement.parentRunId)
    return [updated, next] as const
  })

export const externalChildOperations = { reserve, acknowledge, cancel, settle }
