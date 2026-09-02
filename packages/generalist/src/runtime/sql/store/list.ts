import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { RunInspection, RunStatus } from "../../run.js"
import { decodeRunEffect, loadRunWaitsByStatus } from "./statements.js"
import { loadRunBranches } from "./fork/index.js"
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
        ? sql`AND (r.created_at, r.run_id) < (SELECT w.created_at, w.run_id FROM generalist_runs w WHERE w.run_id = ${input.afterRunId})`
        : sql`AND (r.created_at, r.run_id) > (SELECT w.created_at, w.run_id FROM generalist_runs w WHERE w.run_id = ${input.afterRunId})`
    }
    const direction = newest ? sql`DESC` : sql`ASC`
    const limit = sql.literal(String(Math.max(0, Math.floor(input.limit))))
    const rows = yield* sql<RunRow>`
      SELECT * FROM generalist_runs r
      WHERE r.run_id IS NOT NULL ${statusFilter} ${afterFilter}
      ORDER BY r.created_at ${direction}, r.run_id ${direction}
      LIMIT ${limit}
    `
    return yield* Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        const loaded = yield* decodeRunEffect(row)
        const waits = yield* loadRunWaitsByStatus(loaded.runId, "open")
        const branches = yield* loadRunBranches(loaded.runId)
        const inspection: RunInspection = {
          runId: loaded.runId,
          status: loaded.status,
          executableRef: loaded.executableRef,
          executableManifest: loaded.executableManifest,
          depth: loaded.depth,
          treePolicy: loaded.treePolicy,
          waits,
          lastSequence: loaded.lastSequence,
          durability: "durable",
          branches,
        }
        if (loaded.parentRunId !== undefined) Object.assign(inspection, { parentRunId: loaded.parentRunId })
        return inspection
      }),
    )
  })
