import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { RunInspection, RunStatus } from "../../run.js"
import { decodeRunEffect, loadRunWait } from "./statements.js"
import type { RunRow } from "../codec/rows.js"

export const listRuns = (input: {
  readonly status?: RunStatus
  readonly limit: number
  readonly order?: "newest" | "oldest"
  readonly afterRunId?: string
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const newest = (input.order ?? "newest") === "newest"
    const statusFilter = input.status === undefined ? sql`` : sql`AND status = ${input.status}`
    let afterFilter = sql``
    if (input.afterRunId !== undefined) {
      afterFilter = newest
        ? sql`AND (r.created_at, r.run_id) < (SELECT w.created_at, w.run_id FROM tenetkit_runs w WHERE w.run_id = ${input.afterRunId})`
        : sql`AND (r.created_at, r.run_id) > (SELECT w.created_at, w.run_id FROM tenetkit_runs w WHERE w.run_id = ${input.afterRunId})`
    }
    const direction = newest ? sql`DESC` : sql`ASC`
    const limit = sql.literal(String(Math.max(0, Math.floor(input.limit))))
    const rows = yield* sql<RunRow>`
      SELECT * FROM tenetkit_runs r
      WHERE r.run_id IS NOT NULL ${statusFilter} ${afterFilter}
      ORDER BY r.created_at ${direction}, r.run_id ${direction}
      LIMIT ${limit}
    `
    return yield* Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        const loaded = yield* decodeRunEffect(row)
        const activeWait = yield* loadRunWait(loaded.runId, loaded.activeWaitId)
        const inspection: RunInspection = {
          runId: loaded.runId,
          status: loaded.status,
          executableRef: loaded.executableRef,
          executableManifest: loaded.executableManifest,
          depth: loaded.depth,
          treePolicy: loaded.treePolicy,
          lastSequence: loaded.lastSequence,
          durability: "durable",
        }
        if (loaded.parentRunId !== undefined) Object.assign(inspection, { parentRunId: loaded.parentRunId })
        if (activeWait !== undefined) Object.assign(inspection, { wait: activeWait })
        return inspection
      }),
    )
  })
