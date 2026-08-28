import { Clock, Effect, Function, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Prompt } from "effect/unstable/ai"
import type { Address } from "../../address.js"
import {
  nameScope,
  parseAddress,
  runAddress,
  sessionAddress,
  AgentName,
  DirectoryEntry,
} from "../../execution/agent/directory.js"
import {
  AddressNotFound,
  AgentNameConflict,
  MailboxFull,
  MailboxRateLimited,
  MessageConflict,
  RunNotFound,
  RuntimeUnavailable,
} from "../../errors.js"
import { deliveryPrompt, MailboxEntry, steeringKey, type MessageReceipt } from "../../messaging/mailbox.js"
import { Metadata } from "../../messaging/message.js"
import { isTerminal, type RunStatus } from "../../run.js"
import type { AdmitMessageInput } from "../../run/store.js"
import { digest as steeringDigest } from "../../run/steering.js"
import { decodeJson, encodeJson } from "../codec/codecs.js"
import { appendEvent, loadRun } from "./statements.js"
import type { EventHub } from "../subscribers.js"
import type { SqlError } from "effect/unstable/sql/SqlError"

interface NameRow {
  readonly scope: string
  readonly name: string
  readonly run_id: string
}

interface MessageRow {
  readonly entry_id: string
  readonly target_session_id: string
  readonly sequence: number | string
  readonly from_address: string
  readonly from_run_id: string
  readonly to_address: string
  readonly message_id: string
  readonly idempotency_key: string
  readonly digest: string
  readonly bytes: number | string
  readonly admitted_at_millis: number | string
  readonly prompt_json: string
  readonly correlation_id: string
  readonly causation_id: string | null
  readonly in_reply_to: string | null
  readonly metadata_json: string
  readonly delivered_run_id: string | null
  readonly steering_entry_id: string | null
}

const decodeEntry = (row: MessageRow): MailboxEntry => {
  const input = {
    entryId: row.entry_id,
    targetSessionId: row.target_session_id,
    sequence: Number(row.sequence),
    from: row.from_address,
    fromRunId: row.from_run_id,
    to: row.to_address,
    messageId: row.message_id,
    idempotencyKey: row.idempotency_key,
    digest: row.digest,
    bytes: Number(row.bytes),
    admittedAtMillis: Number(row.admitted_at_millis),
    prompt: decodeJson(Prompt.Prompt, row.prompt_json),
    correlationId: row.correlation_id,
    metadata: decodeJson(Metadata, row.metadata_json),
  }
  if (row.causation_id !== null) Object.assign(input, { causationId: row.causation_id })
  if (row.in_reply_to !== null) Object.assign(input, { inReplyTo: row.in_reply_to })
  if (row.delivered_run_id !== null) Object.assign(input, { deliveredRunId: row.delivered_run_id })
  if (row.steering_entry_id !== null) Object.assign(input, { steeringEntryId: row.steering_entry_id })
  return Schema.decodeSync(MailboxEntry)(input)
}

const deliverable = (entry: MailboxEntry) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const target = yield* parseAddress(entry.to).pipe(Effect.option)
    if (target._tag === "None") return false
    if (target.value._tag === "Session") return true
    const runId =
      target.value._tag === "Run"
        ? target.value.runId
        : (yield* sql<{ run_id: string }>`
              SELECT run_id FROM tenetkit_agent_names
              WHERE scope = ${target.value.scope} AND name = ${target.value.name}
            `)[0]?.run_id
    if (runId === undefined) return false
    const run = yield* loadRun(runId)
    return run !== undefined && !isTerminal(run.status)
  })

const quotaEntries = (input: { readonly sessionId: string; readonly admittedAfter?: number }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const after = input.admittedAfter === undefined ? sql`` : sql`AND m.admitted_at_millis > ${input.admittedAfter}`
    const rows = yield* sql<MessageRow>`
      SELECT * FROM tenetkit_messages m
      WHERE m.target_session_id = ${input.sessionId}
        AND m.entry_id NOT LIKE 'child-settled:%' ${after}
        AND (
          ${input.admittedAfter === undefined ? 0 : 1} = 1
          OR m.delivered_run_id IS NULL
          OR EXISTS (
            SELECT 1 FROM tenetkit_runs r
            WHERE r.run_id = m.delivered_run_id
              AND r.status IN ('succeeded', 'failed', 'cancelled')
              AND NOT EXISTS (
                SELECT 1 FROM tenetkit_run_steering s
                WHERE s.run_id = m.delivered_run_id
                  AND s.entry_id = m.steering_entry_id
                  AND s.consumed_operation_id IS NOT NULL
              )
          )
        )
    `
    const decoded = rows.map(decodeEntry)
    return yield* Effect.filter(decoded, deliverable)
  })

const entryFor = (input: {
  readonly runId: string
  readonly rootRunId: string
  readonly parentRunId?: string | undefined
  readonly sessionId: string
  readonly status: RunStatus
  readonly name?: AgentName | undefined
}): DirectoryEntry => {
  const entry = {
    address: runAddress(input.runId),
    runId: input.runId,
    rootRunId: input.rootRunId,
    sessionId: input.sessionId,
    status: input.status,
  }
  if (input.parentRunId !== undefined) Object.assign(entry, { parentRunId: input.parentRunId })
  if (input.name !== undefined) Object.assign(entry, { name: input.name })
  return Schema.decodeSync(DirectoryEntry)(entry)
}

const nameOf = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<NameRow>`SELECT * FROM tenetkit_agent_names WHERE run_id = ${runId}`
    return rows[0] === undefined ? undefined : yield* Schema.decodeEffect(AgentName)(rows[0].name).pipe(Effect.orDie)
  })

const directoryOfRun = (runId: string) =>
  Effect.gen(function* () {
    const run = yield* loadRun(runId)
    if (run === undefined) return undefined
    const name = yield* nameOf(runId)
    return entryFor({
      runId: run.runId,
      rootRunId: run.rootRunId,
      sessionId: run.message.sessionId,
      status: run.status,
      parentRunId: run.parentRunId,
      name,
    })
  })

export const directory = (runId: string) =>
  Effect.gen(function* () {
    const entry = yield* directoryOfRun(runId)
    if (entry === undefined) return yield* RunNotFound.make({ runId })
    return entry
  })

/**
 * Resolve an Address to the Run that currently answers for it.
 *
 * A session address names an agent identity across successive Runs, so it resolves to that
 * session's newest Run. A run address names one exact execution. A name address resolves through
 * the naming scope that owns it. None of these read authority out of the Address text.
 */
export const resolveAddress = (address: Address) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const target = yield* parseAddress(address).pipe(Effect.catch(() => AddressNotFound.make({ address })))
    let runId: string | undefined
    if (target._tag === "Run") runId = target.runId
    else if (target._tag === "Name")
      runId = (yield* sql<NameRow>`
        SELECT * FROM tenetkit_agent_names WHERE scope = ${target.scope} AND name = ${target.name}
      `)[0]?.run_id
    else
      runId = (yield* sql<{ run_id: string }>`
        SELECT run_id FROM tenetkit_runs
        WHERE session_id = ${target.sessionId}
        ORDER BY created_at DESC, run_id DESC
        LIMIT 1
      `)[0]?.run_id
    if (runId === undefined) return yield* AddressNotFound.make({ address })
    const entry = yield* directoryOfRun(runId)
    if (entry === undefined) return yield* AddressNotFound.make({ address })
    return entry
  })

export const registerAgentName = (input: { readonly runId: string; readonly name: AgentName }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(input.runId)
    if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
    const scopeInput = { runId: run.runId }
    if (run.parentRunId !== undefined) Object.assign(scopeInput, { parentRunId: run.parentRunId })
    const scope = nameScope(scopeInput)
    const existing = yield* sql<NameRow>`
      SELECT * FROM tenetkit_agent_names WHERE scope = ${scope} AND name = ${input.name}
    `
    const prior = existing[0]
    if (prior !== undefined && prior.run_id !== input.runId) {
      return yield* AgentNameConflict.make({ scope, name: input.name, existingRunId: prior.run_id })
    }
    if (prior === undefined) {
      yield* sql`INSERT INTO tenetkit_agent_names (scope, name, run_id) VALUES (${scope}, ${input.name}, ${input.runId})`
    }
    return entryFor({
      runId: run.runId,
      rootRunId: run.rootRunId,
      sessionId: run.message.sessionId,
      status: run.status,
      parentRunId: run.parentRunId,
      name: input.name,
    })
  })

export const listRelated = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    const parent = run.parentRunId
    const rows =
      parent === undefined
        ? yield* sql<{ run_id: string }>`SELECT run_id FROM tenetkit_runs WHERE parent_run_id = ${runId}`
        : yield* sql<{ run_id: string }>`
            SELECT run_id FROM tenetkit_runs
            WHERE parent_run_id = ${runId} OR run_id = ${parent} OR parent_run_id = ${parent}
          `
    const entries: Array<DirectoryEntry> = []
    for (const row of rows) {
      if (row.run_id === runId) continue
      const entry = yield* directoryOfRun(row.run_id)
      if (entry !== undefined) entries.push(entry)
    }
    return entries
  })

/**
 * One message still owed to this session.
 *
 * Pending-ness is derived from consumption, not from binding. A message bound to a Run that reached
 * a terminal state without consuming it was never seen by any model, so it returns to pending and
 * the session's next Run takes it. Binding alone must not strand a message on a dead Run.
 */
export const pendingMessages = (input: {
  readonly sessionId: string
  readonly runId?: string
  readonly limit: number
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<MessageRow>`
      SELECT * FROM tenetkit_messages m
      WHERE m.target_session_id = ${input.sessionId}
        AND m.entry_id NOT LIKE 'child-settled:%'
        AND (
          ${input.runId === undefined ? 1 : 0} = 1
          OR m.to_address = ${sessionAddress(input.sessionId)}
          OR (
            m.to_address = ${input.runId === undefined ? "" : runAddress(input.runId)}
            AND EXISTS (
              SELECT 1 FROM tenetkit_runs target
              WHERE target.run_id = ${input.runId ?? ""}
                AND target.status NOT IN ('succeeded', 'failed', 'cancelled')
            )
          )
        )
        AND (
        m.delivered_run_id IS NULL
        OR EXISTS (
          SELECT 1 FROM tenetkit_runs r
          WHERE r.run_id = m.delivered_run_id
            AND r.status IN ('succeeded', 'failed', 'cancelled')
            AND NOT EXISTS (
              SELECT 1 FROM tenetkit_run_steering s
              WHERE s.run_id = m.delivered_run_id
                AND s.entry_id = m.steering_entry_id
                AND s.consumed_operation_id IS NOT NULL
            )
        )
      )
      ORDER BY m.sequence
      LIMIT ${sql.literal(String(Math.max(0, Math.floor(input.limit))))}
    `
    return rows.map(decodeEntry)
  })

export const admitMessage = (input: AdmitMessageInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const existing = yield* sql<MessageRow>`
      SELECT * FROM tenetkit_messages
      WHERE target_session_id = ${input.targetSessionId}
        AND message_id = ${input.messageId}
        AND idempotency_key = ${input.idempotencyKey}
    `
    const prior = existing[0]
    if (prior !== undefined) {
      if (prior.digest !== input.digest) {
        return yield* MessageConflict.make({
          to: input.to,
          messageId: input.messageId,
          idempotencyKey: input.idempotencyKey,
        })
      }
      return {
        messageId: prior.message_id,
        entryId: prior.entry_id,
        sequence: Number(prior.sequence),
        duplicate: true,
      } satisfies MessageReceipt
    }
    const now = yield* Clock.currentTimeMillis
    const pending = yield* quotaEntries({ sessionId: input.targetSessionId })
    const pendingCount = pending.length
    if (pendingCount >= input.bounds.maxPending) {
      return yield* MailboxFull.make({ to: input.to, dimension: "pending", limit: input.bounds.maxPending })
    }
    const pendingBytes = pending.reduce((total, entry) => total + entry.bytes, 0)
    if (pendingBytes + input.bytes > input.bounds.maxPendingBytes) {
      return yield* MailboxFull.make({ to: input.to, dimension: "bytes", limit: input.bounds.maxPendingBytes })
    }
    const windowStart = now - input.bounds.windowMillis
    const recent = yield* quotaEntries({ sessionId: input.targetSessionId, admittedAfter: windowStart })
    if (recent.length >= input.bounds.maxPerWindow) {
      return yield* MailboxRateLimited.make({
        to: input.to,
        limit: input.bounds.maxPerWindow,
        windowMillis: input.bounds.windowMillis,
      })
    }
    const highest = yield* sql<{ next_sequence: number | string }>`
      SELECT COALESCE(MAX(sequence), -1) + 1 AS next_sequence FROM tenetkit_messages
      WHERE target_session_id = ${input.targetSessionId}
    `
    const sequence = Number(highest[0]?.next_sequence ?? 0)
    const entryId = `${input.targetSessionId}:message:${sequence}`
    yield* sql`
      INSERT INTO tenetkit_messages (
        entry_id, target_session_id, sequence, from_address, from_run_id, to_address, message_id,
        idempotency_key, digest, bytes, admitted_at_millis, prompt_json, correlation_id, causation_id,
        in_reply_to, metadata_json, delivered_run_id, steering_entry_id
      ) VALUES (
        ${entryId}, ${input.targetSessionId}, ${sequence}, ${input.fromAddress}, ${input.fromRunId},
        ${input.to}, ${input.messageId}, ${input.idempotencyKey}, ${input.digest}, ${input.bytes}, ${now},
        ${encodeJson(Prompt.Prompt, input.prompt)}, ${input.correlationId}, ${input.causationId ?? null},
        ${input.inReplyTo ?? null}, ${encodeJson(Metadata, input.metadata)}, NULL, NULL
      )
    `
    return { messageId: input.messageId, entryId, sequence, duplicate: false } satisfies MessageReceipt
  })

/**
 * Bind every pending message for a Run's session to that Run's steering inbox.
 *
 * Steering is already consumed atomically with the next model operation checkpoint, and the agent
 * loop drains it only at a turn boundary. Binding delivery to that one mechanism is what makes
 * delivery exactly-once from the consumer's view and keeps it out of an active model turn.
 */
type DeliverPendingMessagesEffect = Effect.Effect<
  ReadonlyArray<MailboxEntry>,
  RunNotFound | RuntimeUnavailable | SqlError,
  SqlClient.SqlClient
>

export const deliverPendingMessages: {
  (input: { readonly runId: string }): (hub: EventHub) => DeliverPendingMessagesEffect
  (hub: EventHub, input: { readonly runId: string }): DeliverPendingMessagesEffect
} = Function.dual(2, (hub: EventHub, input: { readonly runId: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(input.runId)
    if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
    if (isTerminal(run.status) || run.pendingOutcome !== undefined) return []
    const pending = yield* pendingMessages({
      sessionId: run.message.sessionId,
      runId: run.runId,
      limit: Number.MAX_SAFE_INTEGER,
    })
    const delivered: Array<MailboxEntry> = []
    for (const entry of pending) {
      const idempotencyKey = steeringKey(entry.entryId)
      const rows = yield* sql<{ next_sequence: number | string }>`
        SELECT COALESCE(MAX(sequence), -1) + 1 AS next_sequence
        FROM tenetkit_run_steering WHERE run_id = ${input.runId}
      `
      const sequence = Number(rows[0]?.next_sequence ?? 0)
      const steeringEntryId = `${input.runId}:steering:${sequence}`
      const prompt = deliveryPrompt(entry)
      const digest = steeringDigest(prompt)
      yield* sql`
        INSERT INTO tenetkit_run_steering (
          entry_id, run_id, sequence, idempotency_key, digest, prompt_json, consumed_operation_id, discarded_reason
        ) VALUES (
          ${steeringEntryId}, ${input.runId}, ${sequence}, ${idempotencyKey}, ${digest},
          ${encodeJson(Prompt.Prompt, prompt)}, NULL, NULL
        )
      `
      yield* sql`
        UPDATE tenetkit_messages
        SET delivered_run_id = ${input.runId}, steering_entry_id = ${steeringEntryId}
        WHERE entry_id = ${entry.entryId}
      `
      const currentRun = yield* loadRun(input.runId)
      if (currentRun === undefined) return yield* RunNotFound.make({ runId: input.runId })
      yield* appendEvent(hub, currentRun, {
        _tag: "SteeringAccepted",
        entryId: steeringEntryId,
        steeringSequence: sequence,
        idempotencyKey,
        digest,
        prompt,
      })
      const encoded = yield* Schema.encodeEffect(MailboxEntry)(entry).pipe(Effect.orDie)
      delivered.push(
        yield* Schema.decodeEffect(MailboxEntry)({
          ...encoded,
          deliveredRunId: input.runId,
          steeringEntryId,
        }).pipe(Effect.orDie),
      )
    }
    return delivered
  }),
)
