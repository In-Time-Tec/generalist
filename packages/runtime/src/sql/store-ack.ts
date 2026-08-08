import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { AckBeyondCommitted, AckInvalid, RunNotFound, RuntimeUnavailable } from "../errors.js"
import type { AckPoint } from "../run-store.js"
import { loadRun, nowIso } from "./store-helpers.js"
import { validateBoundary, validateRange } from "../acknowledgement.js"

export type AckError = RunNotFound | AckInvalid | AckBeyondCommitted | RuntimeUnavailable | SqlError

const asIso = (value: string | Date | null | undefined): string | undefined => {
  if (value === null || value === undefined) return undefined
  return value instanceof Date ? value.toISOString() : value
}

interface AckRow {
  readonly sequence: number | string
  readonly acknowledged_at: string | Date
}

/**
 * Durably record the host's processed-through point for a Run.
 *
 * Idempotent and monotonic: an ack can only move the recorded point forward; an older ack is a
 * no-op. Acking beyond the last committed `TurnCompleted` boundary fails `AckBeyondCommitted`;
 * a sequence below the cursor origin fails `AckInvalid`. Callers hold the Run write lock or a
 * transaction so the read-check-write is serialized with event emission.
 */
export const acknowledge = (input: { readonly runId: string; readonly sequence: number }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(input.runId)
    if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
    yield* validateRange({
      runId: input.runId,
      sequence: input.sequence,
      lastCommittedSequence: run.lastCommittedSequence,
    })
    const boundaryRows =
      input.sequence === -1
        ? []
        : yield* sql<{ event_tag: string }>`
            SELECT event_tag FROM baton_run_events
            WHERE run_id = ${input.runId} AND sequence = ${input.sequence}
          `
    yield* validateBoundary({
      runId: input.runId,
      sequence: input.sequence,
      committed: boundaryRows[0]?.event_tag === "TurnCompleted",
    })
    const rows = yield* sql<{ sequence: number | string }>`
      SELECT sequence FROM baton_run_acks WHERE run_id = ${input.runId}
    `
    const current = rows[0] === undefined ? undefined : Number(rows[0].sequence)
    if (current !== undefined && input.sequence <= current) return
    const acknowledgedAt = yield* nowIso
    if (current === undefined) {
      yield* sql`
        INSERT INTO baton_run_acks (run_id, sequence, acknowledged_at)
        VALUES (${input.runId}, ${input.sequence}, ${acknowledgedAt})
      `
    } else {
      yield* sql`
        UPDATE baton_run_acks SET sequence = ${input.sequence}, acknowledged_at = ${acknowledgedAt}
        WHERE run_id = ${input.runId} AND sequence < ${input.sequence}
      `
    }
  })

/** Read the durable host-acknowledged point; the origin (-1) when nothing is acknowledged. */
export const loadAcknowledged = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    const rows = yield* sql<AckRow>`
      SELECT sequence, acknowledged_at FROM baton_run_acks WHERE run_id = ${runId}
    `
    const row = rows[0]
    if (row === undefined) return { runId, sequence: -1 } satisfies AckPoint
    const acknowledgedAt = asIso(row.acknowledged_at)
    return acknowledgedAt === undefined
      ? ({ runId, sequence: Number(row.sequence) } satisfies AckPoint)
      : ({ runId, sequence: Number(row.sequence), acknowledgedAt } satisfies AckPoint)
  })
