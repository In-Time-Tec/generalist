import { Clock, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Prompt } from "effect/unstable/ai"
import {
  fromMetadata,
  notificationIdFor,
  observationEntry,
  payloadFromEvent,
  type Notification,
} from "../child/settlement.js"
import { RunNotFound } from "../errors.js"
import { Metadata } from "../messaging/message.js"
import { runAddress } from "../execution/agent/directory.js"
import type { RunEvent } from "../run/event.js"
import { decodeEvent, decodeJson, encodeJson } from "./codec/codecs.js"
import type { DecodedRun } from "./codec/rows.js"

type PayloadInput = Parameters<typeof payloadFromEvent>[0]
type MutablePayloadInput = { -readonly [Key in keyof PayloadInput]: PayloadInput[Key] }

interface NotificationRow {
  readonly sequence: number | string
  readonly admitted_at_millis: number | string
  readonly metadata_json: string
}

export const settlementNotifications = (input: {
  readonly parentRunId: string
  readonly afterSequence: number
  readonly limit: number
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const parents = yield* sql<{ session_id: string }>`
      SELECT session_id FROM tenetkit_runs WHERE run_id = ${input.parentRunId}
    `
    const sessionId = parents[0]?.session_id
    if (sessionId === undefined) return yield* RunNotFound.make({ runId: input.parentRunId })
    const rows = yield* sql<NotificationRow>`
      SELECT sequence, admitted_at_millis, metadata_json FROM tenetkit_messages
      WHERE target_session_id = ${sessionId} AND to_address = ${runAddress(input.parentRunId)}
        AND entry_id LIKE 'child-settled:%' AND sequence > ${input.afterSequence}
      ORDER BY sequence
      LIMIT ${sql.literal(String(Math.max(0, Math.floor(input.limit))))}
    `
    return rows.flatMap((row) => {
      const notification = fromMetadata({
        metadata: decodeJson(Metadata, row.metadata_json),
        sequence: Number(row.sequence),
        admittedAtMillis: Number(row.admitted_at_millis),
      })
      return notification?.parentRunId === input.parentRunId ? [notification] : []
    }) satisfies ReadonlyArray<Notification>
  })

export const admitChildSettlement = (input: {
  readonly parent: DecodedRun
  readonly child: DecodedRun
  readonly event: RunEvent
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const notificationId = notificationIdFor(input.child.runId)
    const existing = yield* sql<{ entry_id: string }>`
      SELECT entry_id FROM tenetkit_messages WHERE entry_id = ${notificationId}
    `
    if (existing.length > 0) return
    const member = yield* sql<{ child_run_id: string }>`
      SELECT m.child_run_id FROM tenetkit_fan_out_members m
      JOIN tenetkit_fan_outs f ON f.fan_out_id = m.fan_out_id
      WHERE f.parent_run_id = ${input.parent.runId} AND m.child_run_id = ${input.child.runId}
    `
    const payloadInput: MutablePayloadInput = {
      parentRunId: input.parent.runId,
      childRunId: input.child.runId,
      event: input.event,
    }
    if (member.length > 0) payloadInput.joined = true
    const payload = payloadFromEvent(payloadInput)
    if (payload === undefined) return
    const highest = yield* sql<{ next_sequence: number | string }>`
      SELECT COALESCE(MAX(sequence), -1) + 1 AS next_sequence FROM tenetkit_messages
      WHERE target_session_id = ${input.parent.message.sessionId}
    `
    const entry = observationEntry({
      payload,
      parentSessionId: input.parent.message.sessionId,
      sequence: Number(highest[0]?.next_sequence ?? 0),
      admittedAtMillis: yield* Clock.currentTimeMillis,
    })
    yield* sql`
      INSERT INTO tenetkit_messages (
        entry_id, target_session_id, sequence, from_address, from_run_id, to_address, message_id,
        idempotency_key, digest, bytes, admitted_at_millis, prompt_json, correlation_id, causation_id,
        in_reply_to, metadata_json, delivered_run_id, steering_entry_id
      ) VALUES (
        ${entry.entryId}, ${entry.targetSessionId}, ${entry.sequence}, ${entry.from}, ${entry.fromRunId},
        ${entry.to}, ${entry.messageId}, ${entry.idempotencyKey}, ${entry.digest}, ${entry.bytes},
        ${entry.admittedAtMillis}, ${encodeJson(Prompt.Prompt, entry.prompt)}, ${entry.correlationId}, NULL,
        NULL, ${encodeJson(Metadata, entry.metadata)}, NULL, NULL
      )
    `
  })

export const admitChildSettlementFromEventId = (input: {
  readonly parent: DecodedRun
  readonly child: DecodedRun
  readonly terminalEventId: string
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ event_json: string }>`
      SELECT event_json FROM tenetkit_run_events WHERE event_id = ${input.terminalEventId}
    `
    if (rows[0] !== undefined) {
      yield* admitChildSettlement({ parent: input.parent, child: input.child, event: decodeEvent(rows[0].event_json) })
    }
  })
