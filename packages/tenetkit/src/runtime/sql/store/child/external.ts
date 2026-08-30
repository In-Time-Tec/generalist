import { Effect, Equal, Function, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
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
import { isTerminal, RunOutcome, type RunOutcome as RunOutcomeType } from "../../../run.js"
import { decodeJson, encodeJson } from "../../codec/codecs.js"
import { activeChildCount, promoteChildCapacity } from "./capacity.js"
import { cancel as cancelRun, respond, settleAdmittedCancellation, suspend } from "../control.js"
import { appendEvent, loadRun, loadRunWait, nowIso } from "../statements.js"
import type { EventHub } from "../../subscribers.js"
import { requireExecutionClaim } from "../execution.js"
import type { Service as ExternalChildStoreService } from "../../../child/external/store.js"
import { startDigest } from "../../../memory/digest.js"
import { admitStart } from "../admit.js"
import { activateRoot } from "../activate.js"
import { loadRunSnapshot } from "../../inspection/service.js"

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

interface ExternalRootRow {
  placement_id: string
  parent_partition: string
  parent_run_id: string
  partition: string
  run_id: string
  session_id: string
  request_digest: string
  executable_digest: string
  admission_digest: string
  activated: number
  settlement_acknowledged: number
}

const decodeFlag = (value: number | boolean | string): boolean =>
  value === true || value === "true" || Number(value) === 1

const sqlBool = (sql: SqlClient.SqlClient, value: boolean): boolean | 0 | 1 =>
  sql.onDialectOrElse({
    pg: () => value,
    mysql: () => (value ? 1 : 0),
    orElse: () => (value ? 1 : 0),
  })

const decode = (row: Row): Placement => {
  const placement: Placement = {
    placementId: row.placement_id,
    parentRunId: row.parent_run_id,
    ref: { partition: row.partition, runId: row.external_run_id },
    invocationId: row.invocation_id,
    requestDigest: row.request_digest,
    executableDigest: row.executable_digest,
    acknowledged: row.acknowledged === 1,
    cancelRequested: decodeFlag(row.cancel_requested),
    settled: row.settlement_id !== null,
  }
  if (row.wait_id !== null) Object.assign(placement, { waitId: row.wait_id })
  if (row.suspension_identity !== null) Object.assign(placement, { suspensionIdentity: row.suspension_identity })
  if (row.settlement_id !== null) Object.assign(placement, { settlementId: row.settlement_id })
  if (row.outcome_json !== null) Object.assign(placement, { outcome: decodeJson(RunOutcome, row.outcome_json) })
  return placement
}

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
  | import("../../errors.js").StaleClaim,
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
        ${sqlBool(sql, parent.cancellationRequested)}, ${createdAt})`
    if (input.parentSuspension !== undefined) {
      yield* suspend(hub, {
        ...input,
        session: input.session,
        ...input.parentSuspension,
        waits: [input.parentSuspension.wait],
      })
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
    yield* sql`UPDATE tenetkit_external_child_placements SET cancel_requested = ${sqlBool(sql, true)}
      WHERE placement_id = ${placementId} AND settlement_id IS NULL`
    return (yield* load(placementId))!
  })

export const cancelForParent = (parentRunId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE tenetkit_external_child_placements SET cancel_requested = ${sqlBool(sql, true)}
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

type AdmitRootInput = Parameters<ExternalChildStoreService["admitRoot"]>[0]

const loadExternalRoot = (placementId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<ExternalRootRow>`
      SELECT * FROM tenetkit_external_roots WHERE placement_id = ${placementId}
    `
    return rows[0]
  })

const rootView = (row: ExternalRootRow) =>
  Effect.gen(function* () {
    const run = yield* loadRun(row.run_id)
    if (run === undefined) return yield* RuntimeUnavailable.make({ message: `external root ${row.run_id} is missing` })
    const snapshot = yield* loadRunSnapshot(row.run_id).pipe(
      Effect.mapError(() => RuntimeUnavailable.make({ message: `external root ${row.run_id} snapshot is missing` })),
    )
    const root: ExternalRoot = {
      placementId: row.placement_id,
      parent: { partition: row.parent_partition, runId: row.parent_run_id },
      ref: { partition: row.partition, runId: row.run_id },
      sessionId: row.session_id,
      requestDigest: row.request_digest,
      executableDigest: row.executable_digest,
      admissionDigest: row.admission_digest,
      activated: row.activated === 1,
      cancelRequested: run.cancellationRequested,
      settlementAcknowledged: row.settlement_acknowledged === 1,
    }
    if (!("outcome" in snapshot)) return root
    const outcome = yield* Schema.decodeUnknownEffect(RunOutcome)(snapshot.outcome).pipe(
      Effect.mapError(() => RuntimeUnavailable.make({ message: `external root ${row.run_id} outcome is invalid` })),
    )
    return { ...root, outcome }
  })

const immutableRootEqual = (row: ExternalRootRow, input: AdmitRootInput, admissionDigest: string): boolean =>
  row.placement_id === input.placementId &&
  row.parent_partition === input.parent.partition &&
  row.parent_run_id === input.parent.runId &&
  row.partition === input.ref.partition &&
  row.run_id === input.ref.runId &&
  row.session_id === input.root.message.sessionId &&
  row.request_digest === input.requestDigest &&
  row.executable_digest === input.executableDigest &&
  row.admission_digest === admissionDigest

const admitExternalRoot = (hub: EventHub, input: AdmitRootInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const root = { ...input.root, runId: input.ref.runId, initialChildren: [], initialFanOuts: [] }
    const admissionDigest = startDigest(root)
    const existing = yield* loadExternalRoot(input.placementId)
    if (existing !== undefined) {
      if (!immutableRootEqual(existing, input, admissionDigest)) {
        return yield* ExternalRootConflict.make({ placementId: input.placementId })
      }
      return yield* rootView(existing)
    }
    const conflicts = yield* sql<{ placement_id: string }>`
      SELECT placement_id FROM tenetkit_external_roots
      WHERE (${sql("partition")} = ${input.ref.partition} AND run_id = ${input.ref.runId})
         OR run_id = ${input.ref.runId}
      LIMIT 1
    `
    if (conflicts.length > 0) return yield* ExternalRootConflict.make({ placementId: input.placementId })
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
    const receipt = yield* admitStart(hub, root, { activate: false })
    if (receipt.duplicate) return yield* ExternalRootConflict.make({ placementId: input.placementId })
    yield* sql`INSERT INTO tenetkit_external_roots
      (placement_id, parent_partition, parent_run_id, ${sql("partition")}, run_id, session_id,
       request_digest, executable_digest, admission_digest, created_at)
      VALUES (${input.placementId}, ${input.parent.partition}, ${input.parent.runId}, ${input.ref.partition},
        ${input.ref.runId}, ${input.root.message.sessionId}, ${input.requestDigest}, ${input.executableDigest},
        ${admissionDigest}, ${yield* nowIso})`
    return yield* rootView((yield* loadExternalRoot(input.placementId))!)
  })

const requireExternalRoot = (placementId: string) =>
  Effect.flatMap(loadExternalRoot(placementId), (root) =>
    root === undefined ? ExternalRootNotFound.make({ placementId }) : Effect.succeed(root),
  )

const activateExternalRoot = (hub: EventHub, placementId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const root = yield* requireExternalRoot(placementId)
    if (root.activated === 1) return yield* rootView(root)
    const run = yield* loadRun(root.run_id)
    if (run === undefined) return yield* RuntimeUnavailable.make({ message: `external root ${root.run_id} is missing` })
    yield* sql`UPDATE tenetkit_external_roots SET activated = 1 WHERE placement_id = ${placementId}`
    yield* activateRoot(hub, run.runId).pipe(
      Effect.catchTag("tenetkit/runtime/RunNotFound", () =>
        RuntimeUnavailable.make({ message: `external root ${root.run_id} is missing` }),
      ),
    )
    return yield* rootView((yield* loadExternalRoot(placementId))!)
  })

export const inspectExternalRoot = (placementId: string) => Effect.flatMap(requireExternalRoot(placementId), rootView)

const cancelExternalRoot = (hub: EventHub, placementId: string, reason?: string) =>
  Effect.gen(function* () {
    const root = yield* requireExternalRoot(placementId)
    const cancelInput = { runId: root.run_id }
    yield* cancelRun(hub, reason === undefined ? cancelInput : { ...cancelInput, reason }).pipe(
      Effect.mapError(() => RuntimeUnavailable.make({ message: `external root ${root.run_id} is missing` })),
    )
    return yield* rootView(root)
  })

export const externalRootSettlement = (placementId: string) =>
  Effect.gen(function* () {
    const root = yield* inspectExternalRoot(placementId)
    if (!("outcome" in root) || root.outcome === null || root.outcome === undefined) {
      return Option.none<ExternalRootSettlement>()
    }
    const outcome = yield* Schema.decodeEffect(RunOutcome)(root.outcome).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    )
    return Option.some({
      placementId,
      ref: root.ref,
      settlementId: outcome.eventId,
      outcome,
      acknowledged: root.settlementAcknowledged,
    })
  })

export const acknowledgeExternalRootSettlement = (input: {
  readonly placementId: string
  readonly settlementId: string
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const settlement = yield* externalRootSettlement(input.placementId)
    if (Option.isNone(settlement) || settlement.value.settlementId !== input.settlementId) {
      return yield* ExternalChildSettlementConflict.make(input)
    }
    yield* sql`UPDATE tenetkit_external_roots SET settlement_acknowledged = 1
      WHERE placement_id = ${input.placementId}`
    return { ...settlement.value, acknowledged: true }
  })

export const externalRootOperations = {
  admit: admitExternalRoot,
  activate: activateExternalRoot,
  cancel: cancelExternalRoot,
}
