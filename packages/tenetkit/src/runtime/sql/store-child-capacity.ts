import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import type { ChildReadiness } from "../child-readiness.js"
import type { RuntimeUnavailable } from "../errors.js"
import { isTerminal, type RunStatus } from "../run.js"
import type { RunEvent } from "../run-event.js"
import type { DecodedRun } from "./rows.js"
import { loadRun } from "./store-helpers.js"
import type { EventHub } from "./subscribers.js"

type EventPartial = { readonly _tag: string } & Record<string, unknown>
type AppendFn<E, R> = (
  hub: EventHub,
  run: DecodedRun,
  partial: EventPartial,
  nextStatus?: RunStatus,
) => Effect.Effect<RunEvent, E, R>

export const loadChildReadiness = (
  childRunId: string,
): Effect.Effect<ChildReadiness | undefined, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ readiness: ChildReadiness }>`
      SELECT readiness FROM baton_run_links WHERE child_run_id = ${childRunId}
    `
    return rows[0]?.readiness
  })

export const readinessForAdmission = (
  parent: DecodedRun,
): Effect.Effect<ChildReadiness, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ count: number | string }>`
      SELECT
        (SELECT COUNT(*) FROM baton_run_links WHERE parent_run_id = ${parent.runId} AND readiness = 'ready') +
        (SELECT COUNT(*) FROM baton_external_child_placements
          WHERE parent_run_id = ${parent.runId} AND settlement_id IS NULL) AS count
    `
    return Number(rows[0]?.count ?? 0) < parent.treePolicy.maxSubagents ? "ready" : "queued"
  })

export const activeChildCount = (parentRunId: string): Effect.Effect<number, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ count: number | string }>`
      SELECT
        (SELECT COUNT(*) FROM baton_run_links WHERE parent_run_id = ${parentRunId} AND readiness = 'ready') +
        (SELECT COUNT(*) FROM baton_external_child_placements
          WHERE parent_run_id = ${parentRunId} AND settlement_id IS NULL) AS count
    `
    return Number(rows[0]?.count ?? 0)
  })

export const promoteChildCapacity = <E, R>(input: {
  readonly hub: EventHub
  readonly parentRunId: string
  readonly append: AppendFn<E, R>
}): Effect.Effect<void, E | RuntimeUnavailable | SqlError, R | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const parent = yield* loadRun(input.parentRunId)
    if (
      parent === undefined ||
      isTerminal(parent.status) ||
      parent.cancellationRequested ||
      parent.treePolicy.maxSubagents === 0
    ) {
      return
    }
    let active = yield* activeChildCount(parent.runId)
    const queued = yield* sql<{
      child_run_id: string
      fan_out_id: string | null
      fan_out_status: string | null
      concurrency: number | string | null
    }>`
      SELECT l.child_run_id, m.fan_out_id, f.status AS fan_out_status, f.concurrency
      FROM baton_run_links l
      JOIN baton_runs r ON r.run_id = l.child_run_id
      LEFT JOIN baton_fan_out_members m ON m.child_run_id = l.child_run_id
      LEFT JOIN baton_fan_outs f ON f.fan_out_id = m.fan_out_id
      WHERE l.parent_run_id = ${parent.runId}
        AND l.readiness = 'queued'
        AND r.status NOT IN ('succeeded', 'failed', 'cancelled')
        AND r.cancellation_requested = ${false}
      ORDER BY l.created_at ASC, CASE WHEN m.ordinal IS NULL THEN -1 ELSE m.ordinal END ASC, l.child_run_id ASC
    `
    for (const candidate of queued) {
      if (active >= parent.treePolicy.maxSubagents) break
      if (candidate.fan_out_id !== null) {
        if (candidate.fan_out_status !== "running") continue
        const groupActiveRows = yield* sql<{ count: number | string }>`
          SELECT COUNT(*) AS count
          FROM baton_fan_out_members m
          JOIN baton_run_links l ON l.child_run_id = m.child_run_id
          WHERE m.fan_out_id = ${candidate.fan_out_id} AND l.readiness = 'ready'
        `
        if (Number(groupActiveRows[0]?.count ?? 0) >= Number(candidate.concurrency)) continue
      }
      yield* sql`
        UPDATE baton_run_links SET readiness = 'ready'
        WHERE parent_run_id = ${parent.runId} AND child_run_id = ${candidate.child_run_id} AND readiness = 'queued'
      `
      yield* input.hub.touchRun(candidate.child_run_id)
      if (candidate.fan_out_id !== null) {
        yield* sql`
          UPDATE baton_fan_out_members SET status = 'running'
          WHERE child_run_id = ${candidate.child_run_id} AND status = 'pending'
        `
      }
      const currentParent = yield* loadRun(parent.runId)
      if (currentParent !== undefined && !isTerminal(currentParent.status)) {
        yield* input.append(input.hub, currentParent, {
          _tag: "ChildReadinessChanged",
          childRunId: candidate.child_run_id,
          readiness: "ready",
        })
      }
      active++
    }
  })
