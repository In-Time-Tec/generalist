import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { Point, validateBoundary, validateRange } from "../acknowledgement.js"
import { AckBeyondCommitted, AckInvalid, RunNotFound, RuntimeUnavailable } from "../errors.js"
import { decodeEvent } from "./codec/codecs.js"
import { isoFromSql } from "./store/run-decoding.js"
import { loadRun, nowIso } from "./store/statements.js"

type AckError = RunNotFound | AckInvalid | AckBeyondCommitted | RuntimeUnavailable | SqlError

interface AckRow {
  readonly sequence: number | string
  readonly acknowledged_at: string | Date
}

/** @internal */
export const acknowledge = (input: {
  readonly runId: string
  readonly sequence: number
}): Effect.Effect<void, AckError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(input.runId)
    if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
    yield* validateRange({
      runId: input.runId,
      sequence: input.sequence,
      lastTurnCompletedSequence: run.lastTurnCompletedSequence,
    })
    const boundary =
      input.sequence === -1
        ? undefined
        : (yield* sql<{ event_json: string }>`
              SELECT event_json FROM generalist_run_events
              WHERE run_id = ${input.runId} AND sequence = ${input.sequence}
            `)[0]
    const committed = yield* Effect.try({
      try: () => boundary !== undefined && decodeEvent(boundary.event_json)._tag === "TurnCompleted",
      catch: (error) => RuntimeUnavailable.make({ message: `invalid acknowledged Run event: ${String(error)}` }),
    })
    yield* validateBoundary({ runId: input.runId, sequence: input.sequence, committed })
    const rows = yield* sql<{ sequence: number | string }>`
      SELECT sequence FROM generalist_run_acknowledgements WHERE run_id = ${input.runId}
    `
    const current = rows[0] === undefined ? undefined : Number(rows[0].sequence)
    if (current !== undefined && input.sequence <= current) return
    const acknowledgedAt = yield* nowIso
    if (current === undefined) {
      yield* sql`
        INSERT INTO generalist_run_acknowledgements (run_id, sequence, acknowledged_at)
        VALUES (${input.runId}, ${input.sequence}, ${acknowledgedAt})
      `
      return
    }
    yield* sql`
      UPDATE generalist_run_acknowledgements
      SET sequence = ${input.sequence}, acknowledged_at = ${acknowledgedAt}
      WHERE run_id = ${input.runId} AND sequence < ${input.sequence}
    `
  })

/** @internal */
export const loadAcknowledged = (
  runId: string,
): Effect.Effect<Point, RunNotFound | RuntimeUnavailable | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    const rows =
      yield* sql<AckRow>`SELECT sequence, acknowledged_at FROM generalist_run_acknowledgements WHERE run_id = ${runId}`
    const row = rows[0]
    if (row === undefined) return { runId, sequence: -1 }
    const acknowledgedAt = isoFromSql(row.acknowledged_at)
    const point = Object.assign(
      { runId, sequence: Number(row.sequence) },
      acknowledgedAt === undefined ? undefined : { acknowledgedAt },
    )
    return yield* Schema.decodeEffect(Point)(point).pipe(
      Effect.mapError((error) =>
        RuntimeUnavailable.make({ message: `invalid persisted acknowledgement: ${String(error)}` }),
      ),
    )
  })
