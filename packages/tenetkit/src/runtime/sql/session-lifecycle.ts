import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

export const reconcileCancellationRequested = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`UPDATE baton_runs SET status = 'cancelling'
    WHERE cancellation_requested = ${true} AND status IN ('queued', 'running', 'waiting')`
})

export const sessionRoots = (sessionId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const roots = yield* sql<{ run_id: string }>`
      SELECT run_id FROM baton_runs WHERE root_run_id = run_id AND session_id = ${sessionId}
      ORDER BY created_at, run_id
    `
    return roots.map((row) => row.run_id)
  })

export const activeSessionRuns = (sessionId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const active = yield* sql<{ run_id: string }>`
      SELECT run_id FROM baton_runs
      WHERE root_run_id IN (
        SELECT run_id FROM baton_runs WHERE root_run_id = run_id AND session_id = ${sessionId}
      ) AND status NOT IN ('succeeded', 'failed', 'cancelled')
    `
    return active.map((row) => row.run_id)
  })

export const sessionRuns = (sessionId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const runs = yield* sql<{ run_id: string }>`
      SELECT r.run_id FROM baton_runs r
      JOIN baton_runs root ON root.run_id = r.root_run_id
      WHERE root.root_run_id = root.run_id AND root.session_id = ${sessionId}
      ORDER BY root.created_at, root.run_id, r.depth, r.created_at, r.run_id
    `
    return runs.map((row) => row.run_id)
  })
