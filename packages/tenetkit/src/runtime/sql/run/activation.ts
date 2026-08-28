import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { RunActivation } from "../../run/activation.js"

interface ActivationRow {
  readonly run_id: string
  readonly status: string
  readonly owner_worker_id: string | null
  readonly parent_run_id: string | null
  readonly readiness: string | null
  readonly attempt_fence: number
}

/** @experimental Read final activation state for only the Runs touched by the current transaction. */
export const readRunActivations = (runIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    if (runIds.length === 0) return new Map<string, RunActivation>()
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<ActivationRow>`
      SELECT r.run_id, r.status, r.owner_worker_id, r.parent_run_id, r.attempt_fence, l.readiness
      FROM tenetkit_runs r LEFT JOIN tenetkit_run_links l ON l.child_run_id = r.run_id
      WHERE r.run_id IN ${sql.in(runIds)}
      ORDER BY r.run_id
    `
    return new Map(
      rows.map((row) => {
        let intent: RunActivation["intent"] = "inactive"
        if (row.status === "cancelling") intent = "cancel"
        else if (
          row.owner_worker_id === null &&
          (row.status === "running" ||
            (row.status === "queued" && row.parent_run_id !== null && row.readiness === "ready"))
        )
          intent = "execute"
        return [
          row.run_id,
          intent === "inactive"
            ? { runId: row.run_id, intent }
            : { runId: row.run_id, intent, attemptFence: row.attempt_fence, runStatus: row.status },
        ] as const
      }),
    )
  })
