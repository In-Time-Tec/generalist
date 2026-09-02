import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

type ClaimableStatus = "queued" | "running" | undefined

/** Preserve needs-resolution until both Runtime and Program operation journals have no unknown outcome. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- this SQL transition fragment has two required direct-style arguments.
export const resolvedRunStatus = (runId: string, claimableStatus: ClaimableStatus) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const runtime = yield* sql<{ readonly unresolved: number | string }>`
      SELECT COUNT(*) AS unresolved FROM generalist_run_operations
      WHERE run_id = ${runId} AND status = 'unknown'
    `
    const program = yield* sql<{ readonly unresolved: number | string }>`
      SELECT COUNT(*) AS unresolved FROM generalist_program_operations
      WHERE run_id = ${runId} AND status = 'unknown'
    `
    if (Number(runtime[0]?.unresolved ?? 0) + Number(program[0]?.unresolved ?? 0) > 0) {
      return sql`'needs-resolution'`
    }
    const cancellationRequested = sql.onDialectOrElse({
      pg: () => sql`cancellation_requested`,
      mysql: () => sql`cancellation_requested = 1`,
      orElse: () => sql`cancellation_requested IN (1, 'true')`,
    })
    return sql`CASE WHEN ${cancellationRequested} THEN 'cancelling' ELSE ${claimableStatus} END`
  })
