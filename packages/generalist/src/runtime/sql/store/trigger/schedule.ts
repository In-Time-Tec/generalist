import { DateTime, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import type { RuntimeUnavailable } from "../../../errors.js"
import {
  ScheduleRecord as ScheduleRecordSchema,
  type ClaimedSchedule,
  type ScheduleReceipt,
  type ScheduleRecord,
} from "../../../execution/trigger/schedule.js"
import { decodeJson, encodeJson } from "../../codec/codecs.js"

interface ScheduleRow {
  readonly schedule_id: string
  readonly definition_json: string
  readonly rrule: string
  readonly next_at: string | Date
  readonly occurrence: number | string | bigint
  readonly status: "active"
  readonly owner_worker_id: string | null
  readonly lease_expires_at: string | Date | null
  readonly created_at: string | Date
}

const iso = (millis: number): string => DateTime.formatIso(DateTime.makeUnsafe(millis))
const asIso = (value: string | Date): string => DateTime.formatIso(DateTime.makeUnsafe(value))

const decodeRecord = (row: ScheduleRow): ScheduleRecord => ({
  ...decodeJson(ScheduleRecordSchema, row.definition_json),
  nextAt: asIso(row.next_at),
  occurrence: Number(row.occurrence),
})

export const registerSchedule = (
  record: ScheduleRecord,
): Effect.Effect<ScheduleReceipt, RuntimeUnavailable | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO generalist_schedules
        (schedule_id, definition_json, rrule, next_at, occurrence, status,
         owner_worker_id, lease_expires_at, created_at, updated_at)
      VALUES
        (${record.scheduleId}, ${encodeJson(ScheduleRecordSchema, record)}, ${record.rrule}, ${record.nextAt},
         ${record.occurrence}, 'active', NULL, NULL, ${record.createdAt}, ${record.createdAt})
    `
    return { scheduleId: record.scheduleId, nextAt: record.nextAt }
  })

const selectCandidates = (now: string, limit: number) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql.onDialectOrElse({
      pg: () => sql<ScheduleRow>`
        SELECT * FROM generalist_schedules
        WHERE status = 'active' AND next_at <= ${now}
          AND (lease_expires_at IS NULL OR lease_expires_at <= ${now})
        ORDER BY next_at ASC, schedule_id ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
      `,
      mysql: () => sql<ScheduleRow>`
        SELECT * FROM generalist_schedules
        WHERE status = 'active' AND next_at <= ${now}
          AND (lease_expires_at IS NULL OR lease_expires_at <= ${now})
        ORDER BY next_at ASC, schedule_id ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
      `,
      orElse: () => sql<ScheduleRow>`
        SELECT * FROM generalist_schedules
        WHERE status = 'active' AND next_at <= ${now}
          AND (lease_expires_at IS NULL OR lease_expires_at <= ${now})
        ORDER BY next_at ASC, schedule_id ASC LIMIT ${limit}
      `,
    }),
  )

export const claimSchedules = (input: {
  readonly ownerId: string
  readonly now: number
  readonly leaseMillis: number
  readonly limit: number
}): Effect.Effect<ReadonlyArray<ClaimedSchedule>, RuntimeUnavailable | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = iso(input.now)
    const leaseExpiresAt = iso(input.now + input.leaseMillis)
    const candidates = yield* selectCandidates(now, input.limit)
    const claimed: Array<ClaimedSchedule> = []
    for (const row of candidates) {
      yield* sql`
        UPDATE generalist_schedules
        SET owner_worker_id = ${input.ownerId}, lease_expires_at = ${leaseExpiresAt}, updated_at = ${now}
        WHERE schedule_id = ${row.schedule_id}
      `
      claimed.push({ ...decodeRecord(row), ownerId: input.ownerId, leaseExpiresAt })
    }
    return claimed
  })

export const advanceSchedule = (input: {
  readonly scheduleId: string
  readonly ownerId: string
  readonly occurrence: number
  readonly nextAt: string
  readonly now: number
}): Effect.Effect<void, RuntimeUnavailable | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE generalist_schedules
      SET next_at = ${input.nextAt}, occurrence = ${input.occurrence + 1},
          owner_worker_id = NULL, lease_expires_at = NULL, updated_at = ${iso(input.now)}
      WHERE schedule_id = ${input.scheduleId} AND owner_worker_id = ${input.ownerId}
        AND occurrence = ${input.occurrence}
    `
  })
