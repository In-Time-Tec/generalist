import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { RunInspection, RunStatus } from "../run.js"
import { decodeRunEffect, loadRunWait } from "./store-helpers.js"
import type { RunRow } from "./rows.js"

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
    const afterFilter =
      input.afterRunId === undefined
        ? sql``
        : newest
          ? sql`AND (r.created_at, r.run_id) < (SELECT w.created_at, w.run_id FROM baton_runs w WHERE w.run_id = ${input.afterRunId})`
          : sql`AND (r.created_at, r.run_id) > (SELECT w.created_at, w.run_id FROM baton_runs w WHERE w.run_id = ${input.afterRunId})`
    const direction = newest ? sql`DESC` : sql`ASC`
    const limit = sql.literal(String(Math.max(0, Math.floor(input.limit))))
    const rows = yield* sql<RunRow>`
      SELECT * FROM baton_runs r
      WHERE r.run_id IS NOT NULL ${statusFilter} ${afterFilter}
      ORDER BY r.created_at ${direction}, r.run_id ${direction}
      LIMIT ${limit}
    `
    return yield* Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        const loaded = yield* decodeRunEffect(row)
        const activeWait = yield* loadRunWait(loaded.runId, loaded.activeWaitId)
        return {
          runId: loaded.runId,
          status: loaded.status,
          executableRef: loaded.executableRef,
          executableManifest: loaded.executableManifest,
          depth: loaded.depth,
          treePolicy: loaded.treePolicy,
          lastSequence: loaded.lastSequence,
          durability: "durable",
          ...(loaded.parentRunId === undefined ? {} : { parentRunId: loaded.parentRunId }),
          ...(activeWait === undefined ? {} : { wait: activeWait }),
        } satisfies RunInspection
      }),
    )
  })
