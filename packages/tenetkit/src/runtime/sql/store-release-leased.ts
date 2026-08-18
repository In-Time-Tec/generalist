import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { ExecutionClaim } from "../run-store.js"

export const releaseLeasedExecution = (input: ExecutionClaim) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE baton_runs
      SET owner_worker_id = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE run_id = ${input.runId}
        AND owner_worker_id = ${input.ownerId}
        AND attempt_fence = ${input.attemptFence}
    `
  })
