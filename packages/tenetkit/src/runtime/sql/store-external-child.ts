import { Effect, Equal, Function } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  ExternalChildCapacityUnavailable,
  ExternalChildPlacementConflict,
  ExternalChildPlacementNotFound,
  ExternalChildSettlementConflict,
  suspensionIdentity,
  type Placement,
  type ReserveInput,
} from "../external-child-placement.js"
import { RunNotFound, RunTerminal } from "../errors.js"
import { RuntimeUnavailable } from "../errors.js"
import { isTerminal, RunOutcome, type RunOutcome as RunOutcomeType } from "../run.js"
import { decodeJson, encodeJson } from "./codecs.js"
import { activeChildCount, promoteChildCapacity } from "./store-child-capacity.js"
import { respond, settleAdmittedCancellation, suspend } from "./store-control.js"
import { loadRun, loadRunWait, nowIso } from "./store-helpers.js"
import type { EventHub } from "./subscribers.js"
import { appendEvent } from "./store-helpers.js"
import { requireExecutionClaim } from "./store-execution.js"

interface Row {
  placement_id: string
  parent_run_id: string
  partition: string
  external_run_id: string
  invocation_id: string
  request_digest: string
  executable_digest: string
  wait_id: string | null
  suspension_identity: string | null
  acknowledged: number
  cancel_requested: number | boolean | string
  settlement_id: string | null
  outcome_json: string | null
}

const decodeFlag = (value: number | boolean | string): boolean =>
  value === true || value === "true" || Number(value) === 1

const decode = (row: Row): Placement => ({
  placementId: row.placement_id,
  parentRunId: row.parent_run_id,
  ref: { partition: row.partition, runId: row.external_run_id },
  invocationId: row.invocation_id,
  requestDigest: row.request_digest,
  executableDigest: row.executable_digest,
  ...(row.wait_id === null ? {} : { waitId: row.wait_id }),
  ...(row.suspension_identity === null ? {} : { suspensionIdentity: row.suspension_identity }),
  acknowledged: Number(row.acknowledged) === 1,
  cancelRequested: decodeFlag(row.cancel_requested),
  settled: row.settlement_id !== null,
  ...(row.settlement_id === null ? {} : { settlementId: row.settlement_id }),
  ...(row.outcome_json === null ? {} : { outcome: decodeJson(RunOutcome, row.outcome_json) }),
})

const load = (placementId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<Row>`SELECT * FROM tenetkit_external_child_placements WHERE placement_id = ${placementId}`
    return rows[0] === undefined ? undefined : decode(rows[0])
  })

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

type ReserveEffect = Effect.Effect<
  Placement,
  | ExternalChildCapacityUnavailable
  | ExternalChildPlacementConflict
  | RunNotFound
  | RunTerminal
  | RuntimeUnavailable
  | import("./errors.js").StaleClaim,
  SqlClient.SqlClient
>

export const reserve: {
  (input: ReserveInput): (hub: EventHub) => ReserveEffect
  (hub: EventHub, input: ReserveInput): ReserveEffect
} = Function.dual(2, (hub: EventHub, input: ReserveInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const existing = yield* load(input.placementId)
    if (existing !== undefined) {
      if (!immutableEqual(existing, input)) {
        return yield* ExternalChildPlacementConflict.make({ placementId: input.placementId })
      }
      return existing
    }
    const conflicting = yield* sql<{ placement_id: string }>`
      SELECT placement_id FROM tenetkit_external_child_placements
      WHERE (${sql("partition")} = ${input.ref.partition} AND external_run_id = ${input.ref.runId})
         OR (parent_run_id = ${input.runId} AND invocation_id = ${input.invocationId})
      LIMIT 1
    `
    if (conflicting.length > 0) {
      return yield* ExternalChildPlacementConflict.make({ placementId: input.placementId })
    }
    yield* requireExecutionClaim(input)
    const parent = yield* loadRun(input.runId)
    if (parent === undefined) return yield* RunNotFound.make({ runId: input.runId })
    if (isTerminal(parent.status)) return yield* RunTerminal.make({ runId: parent.runId, status: parent.status })
    if ((yield* activeChildCount(parent.runId)) >= parent.treePolicy.maxSubagents) {
      return yield* ExternalChildCapacityUnavailable.make({
        parentRunId: parent.runId,
        limit: parent.treePolicy.maxSubagents,
      })
    }
    const createdAt = yield* nowIso
    yield* sql`INSERT INTO tenetkit_external_child_placements
      (placement_id, parent_run_id, ${sql("partition")}, external_run_id, invocation_id, request_digest,
       executable_digest, wait_id, suspension_identity, cancel_requested, created_at)
      VALUES (${input.placementId}, ${input.runId}, ${input.ref.partition}, ${input.ref.runId},
        ${input.invocationId}, ${input.requestDigest}, ${input.executableDigest},
        ${input.parentSuspension?.wait.waitId ?? null},
        ${input.parentSuspension === undefined ? null : suspensionIdentity(input.parentSuspension)},
        ${parent.cancellationRequested ? 1 : 0}, ${createdAt})`
    if (input.parentSuspension !== undefined) {
      yield* suspend(hub, { ...input, ...input.parentSuspension })
    }
    return (yield* load(input.placementId))!
  }),
)

export const acknowledge = (placementId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if ((yield* load(placementId)) === undefined) {
      return yield* ExternalChildPlacementNotFound.make({ placementId })
    }
    yield* sql`UPDATE tenetkit_external_child_placements SET acknowledged = 1 WHERE placement_id = ${placementId}`
    return (yield* load(placementId))!
  })

export const cancel = (placementId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if ((yield* load(placementId)) === undefined) {
      return yield* ExternalChildPlacementNotFound.make({ placementId })
    }
    yield* sql`UPDATE tenetkit_external_child_placements SET cancel_requested = 1
      WHERE placement_id = ${placementId} AND settlement_id IS NULL`
    return (yield* load(placementId))!
  })

export const cancelForParent = (parentRunId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE tenetkit_external_child_placements SET cancel_requested = 1
      WHERE parent_run_id = ${parentRunId} AND settlement_id IS NULL`
  })

const settle = (
  hub: EventHub,
  input: { readonly placementId: string; readonly settlementId: string; readonly outcome: RunOutcomeType },
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const placement = yield* load(input.placementId)
    if (placement === undefined) return yield* ExternalChildPlacementNotFound.make({ placementId: input.placementId })
    if (placement.settled) {
      if (placement.settlementId !== input.settlementId || !Equal.equals(placement.outcome, input.outcome)) {
        return yield* ExternalChildSettlementConflict.make({
          placementId: input.placementId,
          settlementId: input.settlementId,
        })
      }
      return placement
    }
    yield* sql`UPDATE tenetkit_external_child_placements SET settlement_id = ${input.settlementId},
      outcome_json = ${encodeJson(RunOutcome, input.outcome)}, outcome_event_id = ${input.outcome.eventId},
      settled_at = ${yield* nowIso} WHERE placement_id = ${input.placementId} AND settlement_id IS NULL`
    const parent = yield* loadRun(placement.parentRunId)
    const wait =
      placement.waitId === undefined ? undefined : yield* loadRunWait(placement.parentRunId, placement.waitId)
    if (
      placement.waitId !== undefined &&
      parent !== undefined &&
      !isTerminal(parent.status) &&
      !parent.cancellationRequested &&
      parent.activeWaitId === placement.waitId &&
      wait?.status === "open"
    ) {
      yield* respond(hub, {
        runId: parent.runId,
        waitId: placement.waitId,
        resolution: { _tag: "ToolResult", result: input.outcome, encodedResult: input.outcome },
      }).pipe(Effect.mapError((error) => RuntimeUnavailable.make({ message: error._tag })))
    }
    yield* settleAdmittedCancellation(hub, placement.parentRunId).pipe(
      Effect.mapError((error) =>
        error._tag === "tenetkit/runtime/RunNotFound"
          ? RuntimeUnavailable.make({ message: "external parent cancellation missing" })
          : error,
      ),
    )
    yield* promoteChildCapacity({ hub, parentRunId: placement.parentRunId, append: appendEvent })
    return (yield* load(input.placementId))!
  })

export const externalChildSettlement = { settle }
