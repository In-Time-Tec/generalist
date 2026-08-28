import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SteeringDiscardReason } from "../../../run/event.js"

const discardReason = (tag: string): SteeringDiscardReason | undefined => {
  if (tag === "RunCompleted") return "completed"
  if (tag === "RunFailed") return "failed"
  if (tag === "RunCancelled") return "cancelled"
  return undefined
}

/** @experimental Atomically marks and describes pending steering when a Run terminalizes. */
export const discardPendingSteering = (input: { readonly runId: string; readonly terminalTag: string }) =>
  Effect.gen(function* () {
    const reason = discardReason(input.terminalTag)
    if (reason === undefined) return undefined
    const sql = yield* SqlClient.SqlClient
    const pending = yield* sql<{ entry_id: string }>`
      SELECT entry_id FROM tenetkit_run_steering
      WHERE run_id = ${input.runId} AND consumed_operation_id IS NULL AND discarded_reason IS NULL
      ORDER BY sequence
    `
    if (pending.length === 0) return undefined
    yield* sql`
      UPDATE tenetkit_run_steering SET discarded_reason = ${reason}
      WHERE run_id = ${input.runId} AND consumed_operation_id IS NULL AND discarded_reason IS NULL
    `
    return {
      _tag: "SteeringDiscarded" as const,
      entryIds: pending.map((entry) => entry.entry_id),
      reason,
    }
  })
