import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  AddressNotFound,
  IdempotencyConflict,
  RunIdConflict,
  RunNotFound,
  RunTerminal,
  ChildSelectionMissing,
  RuntimeUnavailable,
} from "../errors.js"
import { decodePinned, equals, resolveChild, type PinnedExecutable } from "../executable-manifest.js"
import { childDigest, messageDigest } from "../memory/digest.js"
import type { AdmitSendInput } from "../run-store.js"
import type { SpawnInput } from "../runtime.js"
import type { Message } from "../message.js"
import { decodePinnedExecutable, decodeQueue, encodeQueue } from "./codecs.js"
import type { RunRow } from "./rows.js"
import { appendEvent, insertRun, loadRun, nowIso, promoteHead } from "./store-helpers.js"
import type { EventHub } from "./subscribers.js"

const nextId = (prefix: string): Effect.Effect<string> =>
  Effect.sync(() => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`)

export const admitSend = (
  hub: EventHub,
  addressBindings: ReadonlyMap<string, PinnedExecutable>,
  input: AdmitSendInput,
  options?: { readonly promote?: boolean },
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const bound = addressBindings.get(input.message.to)
    if (bound === undefined) return yield* AddressNotFound.make({ address: input.message.to })
    const admitted = yield* Effect.try({
      try: () => decodePinned({ ref: input.executableRef, manifest: input.executableManifest }),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    const binding = yield* Effect.try({
      try: () => decodePinned(bound),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    if (!equals(binding, admitted)) {
      return yield* AddressNotFound.make({ address: input.message.to })
    }
    const digest = messageDigest(input.message)
    const existing = yield* sql<RunRow>`
      SELECT * FROM baton_runs
      WHERE address = ${input.message.to}
        AND session_id = ${input.message.sessionId}
        AND idempotency_key = ${input.message.idempotencyKey}
    `
    const prior = existing[0]
    if (prior !== undefined) {
      if (input.runId !== undefined && input.runId !== prior.run_id) {
        return yield* RunIdConflict.make({ runId: input.runId, existingRunId: prior.run_id })
      }
      const priorExecutable = yield* Effect.try({
        try: () => decodePinnedExecutable(prior.executable_ref_json, prior.executable_manifest_json),
        catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
      })
      if (prior.message_digest !== digest || !equals(priorExecutable, admitted)) {
        return yield* IdempotencyConflict.make({
          address: input.message.to,
          sessionId: input.message.sessionId,
          idempotencyKey: input.message.idempotencyKey,
          existingRunId: prior.run_id,
        })
      }
      return {
        runId: prior.run_id,
        messageId: prior.message_id,
        acceptedSequence: Number(prior.accepted_sequence),
        duplicate: true,
      }
    }
    if (input.runId !== undefined) {
      const byId = yield* sql<RunRow>`SELECT * FROM baton_runs WHERE run_id = ${input.runId}`
      if (byId[0] !== undefined) return yield* RunIdConflict.make({ runId: input.runId, existingRunId: byId[0].run_id })
    }
    const runId = input.runId ?? (yield* nextId("run"))
    const lanes = yield* sql<{ accepted_sequence: number; queue_json: string }>`
      SELECT accepted_sequence, queue_json FROM baton_lanes
      WHERE address = ${input.message.to} AND session_id = ${input.message.sessionId}
    `
    const lane = lanes[0]
    const acceptedSequence = lane === undefined ? 0 : Number(lane.accepted_sequence) + 1
    const queue = lane === undefined ? [runId] : [...decodeQueue(lane.queue_json), runId]
    if (lane === undefined) {
      yield* sql`
        INSERT INTO baton_lanes (address, session_id, accepted_sequence, queue_json)
        VALUES (${input.message.to}, ${input.message.sessionId}, ${acceptedSequence}, ${encodeQueue(queue)})
      `
    } else {
      yield* sql`
        UPDATE baton_lanes
        SET accepted_sequence = ${acceptedSequence}, queue_json = ${encodeQueue(queue)}
        WHERE address = ${input.message.to} AND session_id = ${input.message.sessionId}
      `
    }
    yield* insertRun({
      runId,
      status: "queued",
      message: input.message,
      digest,
      executableRef: input.executableRef,
      executableManifest: input.executableManifest,
      rootRunId: runId,
      acceptedSequence,
    })
    const run = (yield* loadRun(runId))!
    yield* appendEvent(
      hub,
      run,
      {
        _tag: "RunAccepted",
        messageId: input.message.id,
        address: input.message.to,
      },
      "queued",
    )
    if (options?.promote !== false && queue[0] === runId) {
      yield* promoteHead(hub, input.message.to, input.message.sessionId)
    }
    return { runId, messageId: input.message.id, acceptedSequence, duplicate: false }
  })

export const admitSpawn = (
  hub: EventHub,
  input: SpawnInput & { readonly message: Message; readonly parentRunId: string },
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const parent = yield* loadRun(input.parentRunId)
    if (parent === undefined) return yield* RunNotFound.make({ runId: input.parentRunId })
    if (parent.status === "succeeded" || parent.status === "failed" || parent.status === "cancelled") {
      return yield* RunTerminal.make({ runId: parent.runId, status: parent.status })
    }
    const executableRef = resolveChild(parent.executableRef, parent.executableManifest, input.selection)
    if (executableRef === undefined) {
      return yield* ChildSelectionMissing.make({ parentRunId: parent.runId, selection: input.selection })
    }
    const digest = childDigest(input.message, executableRef)
    const executable = yield* Effect.try({
      try: () => decodePinned({ ref: executableRef, manifest: parent.executableManifest }),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    const existing = yield* sql<RunRow>`
      SELECT * FROM baton_runs
      WHERE address = ${input.message.to}
        AND session_id = ${input.message.sessionId}
        AND idempotency_key = ${input.message.idempotencyKey}
    `
    const prior = existing[0]
    if (prior !== undefined) {
      const priorExecutable = yield* Effect.try({
        try: () => decodePinnedExecutable(prior.executable_ref_json, prior.executable_manifest_json),
        catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
      })
      if (prior.message_digest !== digest || !equals(priorExecutable, executable)) {
        return yield* IdempotencyConflict.make({
          address: input.message.to,
          sessionId: input.message.sessionId,
          idempotencyKey: input.message.idempotencyKey,
          existingRunId: prior.run_id,
        })
      }
      return {
        runId: prior.run_id,
        messageId: prior.message_id,
        acceptedSequence: Number(prior.accepted_sequence),
        duplicate: true,
      }
    }
    const runId = yield* nextId("run")
    yield* insertRun({
      runId,
      status: "queued",
      message: input.message,
      digest,
      executableRef,
      executableManifest: parent.executableManifest,
      rootRunId: parent.rootRunId,
      parentRunId: parent.runId,
      invocationId: input.invocationId,
      acceptedSequence: 0,
      attempt: 0,
    })
    const created = yield* nowIso
    yield* sql`
      INSERT INTO baton_run_links (parent_run_id, child_run_id, invocation_id, terminal_event_id, created_at, settled_at)
      VALUES (${parent.runId}, ${runId}, ${input.invocationId}, NULL, ${created}, NULL)
    `
    yield* appendEvent(hub, parent, {
      _tag: "ChildLinked",
      childRunId: runId,
      invocationId: input.invocationId,
    })
    const child = (yield* loadRun(runId))!
    yield* appendEvent(
      hub,
      child,
      {
        _tag: "RunAccepted",
        messageId: input.message.id,
        address: input.message.to,
      },
      "queued",
    )
    const started = (yield* loadRun(runId))!
    yield* sql`UPDATE baton_runs SET attempt_fence = 1 WHERE run_id = ${runId}`
    yield* appendEvent(hub, { ...started, attempt: 1 }, { _tag: "RunAttemptStarted", attempt: 1 }, "running")
    return { runId, messageId: input.message.id, acceptedSequence: 0, duplicate: false }
  })
