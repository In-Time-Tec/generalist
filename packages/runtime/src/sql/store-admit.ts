import { Clock, Effect, Random, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  AddressNotFound,
  IdempotencyConflict,
  RunIdConflict,
  RunNotFound,
  RunTerminal,
  ChildSelectionMissing,
  RuntimeUnavailable,
  StartInvalid,
} from "../errors.js"
import { decodePinned, equals, resolveChild, type PinnedExecutable } from "../executable-manifest.js"
import { childDigest, messageDigest, startDigest } from "../memory/digest.js"
import type { AdmitProgramChildInput, AdmitSendInput, AdmitStartInput } from "../run-store.js"
import type { SpawnInput } from "../runtime.js"
import type { Message } from "../message.js"
import { decodePinnedExecutable, decodeQueue, encodeQueue } from "./codecs.js"
import type { RunRow } from "./rows.js"
import { appendEvent, insertRun, loadRun, nowIso, promoteHead } from "./store-helpers.js"
import type { EventHub } from "./subscribers.js"
import { associateRegistrations, loadRegistrations, persistRegistrations } from "./executable-registrations.js"
import { narrow } from "../executable-registration.js"
import { make as makeAddress } from "../address.js"
import { make as makeMessage } from "../message.js"
import { admitInitialFanOuts } from "./store-fan-out.js"

const nextId = (prefix: string): Effect.Effect<string> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    const random = yield* Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER)
    return `${prefix}_${now.toString(36)}_${random.toString(36)}`
  })

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
    if (!equals(binding, admitted)) return yield* AddressNotFound.make({ address: input.message.to })
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
    yield* persistRegistrations(input.registrations)
    yield* associateRegistrations(runId, input.registrations)
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

export const admitStart = (hub: EventHub, input: AdmitStartInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const admitted = yield* Effect.try({
      try: () => decodePinned({ ref: input.executableRef, manifest: input.executableManifest }),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    if (input.initialChildren.length > 64) {
      return yield* StartInvalid.make({ message: "initialChildren cannot contain more than 64 requests" })
    }
    if (input.initialFanOuts.length > 64) {
      return yield* StartInvalid.make({ message: "initialFanOuts cannot contain more than 64 requests" })
    }
    const active = input.executableManifest.entries.find((entry) => entry.pin === input.executableRef.active)
    const invocationIds = new Set<string>()
    const idempotencySources = new Set<string>()
    for (const child of input.initialChildren) {
      if (invocationIds.has(child.invocationId)) {
        return yield* StartInvalid.make({ message: `duplicate initial child invocationId: ${child.invocationId}` })
      }
      const source = `${child.sessionId}\0${child.idempotencyKey}`
      if (idempotencySources.has(source)) {
        return yield* StartInvalid.make({ message: "duplicate initial child sessionId/idempotencyKey" })
      }
      invocationIds.add(child.invocationId)
      idempotencySources.add(source)
    }
    const resolved = input.initialChildren.map((child) => ({
      child,
      executableRef:
        active?._tag === "Agent"
          ? resolveChild(input.executableRef, input.executableManifest, child.selection)
          : undefined,
    }))
    const missing = resolved.find((entry) => entry.executableRef === undefined)
    if (missing !== undefined) {
      return yield* ChildSelectionMissing.make({
        parentRunId: input.runId ?? "pending",
        selection: missing.child.selection,
      })
    }
    yield* persistRegistrations(input.registrations)
    const digest = startDigest(input)
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
      const links = yield* sql<{
        child_run_id: string
        invocation_id: string
        session_id: string
        idempotency_key: string
      }>`
        SELECT links.child_run_id, links.invocation_id, runs.session_id, runs.idempotency_key
        FROM baton_run_links links
        JOIN baton_runs runs ON runs.run_id = links.child_run_id
        WHERE links.parent_run_id = ${prior.run_id}
      `
      const childRunIds: Array<string> = []
      for (const child of input.initialChildren) {
        const runId = links.find(
          (link) =>
            link.invocation_id === child.invocationId &&
            link.session_id === child.sessionId &&
            link.idempotency_key === child.idempotencyKey,
        )?.child_run_id
        if (runId === undefined) {
          return yield* RuntimeUnavailable.make({ message: `initial child ${child.invocationId} is missing` })
        }
        childRunIds.push(runId)
      }
      const fanOuts = [] as Array<import("../fan-out.js").FanOutReceipt>
      for (const fanOut of input.initialFanOuts) {
        const rows = yield* sql<{ fan_out_id: string }>`
          SELECT fan_out_id FROM baton_fan_outs
          WHERE parent_run_id = ${prior.run_id} AND idempotency_key = ${fanOut.idempotencyKey}
        `
        const fanOutId = rows[0]?.fan_out_id
        if (fanOutId === undefined) {
          return yield* RuntimeUnavailable.make({ message: `initial fan-out ${fanOut.idempotencyKey} is missing` })
        }
        const members = yield* sql<{ child_run_id: string }>`
          SELECT child_run_id FROM baton_fan_out_members WHERE fan_out_id = ${fanOutId} ORDER BY ordinal ASC
        `
        fanOuts.push({
          fanOutId,
          parentRunId: prior.run_id,
          childRunIds: members.map((member) => member.child_run_id),
          duplicate: true,
        })
      }
      return {
        runId: prior.run_id,
        messageId: prior.message_id,
        acceptedSequence: Number(prior.accepted_sequence),
        duplicate: true,
        childRunIds,
        fanOuts,
      }
    }
    if (input.runId !== undefined) {
      const byId = yield* sql<RunRow>`SELECT * FROM baton_runs WHERE run_id = ${input.runId}`
      if (byId[0] !== undefined) return yield* RunIdConflict.make({ runId: input.runId, existingRunId: byId[0].run_id })
    }
    const runId = input.runId ?? (yield* nextId("run"))
    yield* insertRun({
      runId,
      status: "queued",
      message: input.message,
      digest,
      executableRef: input.executableRef,
      executableManifest: input.executableManifest,
      rootRunId: runId,
      acceptedSequence: 0,
      attempt: 0,
    })
    yield* associateRegistrations(runId, input.registrations)
    const loaded = (yield* loadRun(runId))!
    yield* appendEvent(
      hub,
      loaded,
      { _tag: "RunAccepted", messageId: input.message.id, address: input.message.to },
      "queued",
    )
    if (input.initialChildren.length === 0) {
      const accepted = (yield* loadRun(runId))!
      yield* sql`UPDATE baton_runs SET attempt_fence = 1 WHERE run_id = ${runId}`
      yield* appendEvent(hub, { ...accepted, attempt: 1 }, { _tag: "RunAttemptStarted", attempt: 1 }, "running")
    }
    const childRunIds: Array<string> = []
    for (const child of input.initialChildren) {
      const address = makeAddress(`spawn:${runId}`)
      const message = makeMessage({
        id: child.messageId ?? `spawn:${child.idempotencyKey}`,
        to: address,
        sessionId: child.sessionId,
        prompt: child.prompt,
        idempotencyKey: child.idempotencyKey,
        correlationId: child.correlationId ?? runId,
        metadata: child.metadata ?? {},
      })
      const receipt = yield* admitSpawn(hub, { ...child, parentRunId: runId, message }).pipe(
        Effect.mapError((error) =>
          Schema.is(RunNotFound)(error) || Schema.is(RunTerminal)(error)
            ? RuntimeUnavailable.make({ message: "newly admitted root unavailable during initial child admission" })
            : error,
        ),
      )
      childRunIds.push(receipt.runId)
    }
    const fanOuts = yield* admitInitialFanOuts(hub, runId, input.initialFanOuts)
    return { runId, messageId: input.message.id, acceptedSequence: 0, duplicate: false, childRunIds, fanOuts }
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
    const registrations = yield* loadRegistrations(parent.runId).pipe(
      Effect.flatMap((parentRegistrations) => narrow(executable, parentRegistrations)),
      Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) })),
    )
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
    yield* associateRegistrations(runId, registrations)
    const created = yield* nowIso
    yield* sql`
      INSERT INTO baton_run_links (parent_run_id, child_run_id, invocation_id, terminal_event_id, created_at, settled_at)
      VALUES (${parent.runId}, ${runId}, ${input.invocationId}, NULL, ${created}, NULL)
    `
    yield* appendEvent(hub, parent, {
      _tag: "ChildLinked",
      childRunId: runId,
      invocationId: input.invocationId,
      selection: input.selection,
      prompt: input.message.prompt,
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

export const admitProgramChild = (hub: EventHub, input: AdmitProgramChildInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const parent = yield* loadRun(input.runId)
    if (parent === undefined) return yield* RunNotFound.make({ runId: input.runId })
    if (parent.status === "succeeded" || parent.status === "failed" || parent.status === "cancelled") {
      return yield* RunTerminal.make({ runId: parent.runId, status: parent.status })
    }
    const executable = yield* Effect.try({
      try: () => decodePinned({ ref: input.executableRef, manifest: input.executableManifest }),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    const registrations = yield* narrow(executable, input.registrations).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) })),
    )
    const digest = childDigest(input.message, input.executableRef)
    const existing = yield* sql<RunRow>`
      SELECT * FROM baton_runs
      WHERE address = ${input.message.to}
        AND session_id = ${input.message.sessionId}
        AND idempotency_key = ${input.message.idempotencyKey}
    `
    const prior = existing[0]
    if (prior !== undefined) {
      if (prior.run_id !== input.childRunId) {
        return yield* RunIdConflict.make({ runId: input.childRunId, existingRunId: prior.run_id })
      }
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
    const byId = yield* sql<RunRow>`SELECT * FROM baton_runs WHERE run_id = ${input.childRunId}`
    if (byId[0] !== undefined) {
      return yield* RunIdConflict.make({ runId: input.childRunId, existingRunId: byId[0].run_id })
    }
    yield* insertRun({
      runId: input.childRunId,
      status: "queued",
      message: input.message,
      digest,
      executableRef: input.executableRef,
      executableManifest: input.executableManifest,
      rootRunId: parent.rootRunId,
      parentRunId: parent.runId,
      invocationId: input.invocationId,
      acceptedSequence: 0,
      attempt: 0,
    })
    yield* associateRegistrations(input.childRunId, registrations)
    const created = yield* nowIso
    yield* sql`
      INSERT INTO baton_run_links (parent_run_id, child_run_id, invocation_id, terminal_event_id, created_at, settled_at)
      VALUES (${parent.runId}, ${input.childRunId}, ${input.invocationId}, NULL, ${created}, NULL)
    `
    yield* appendEvent(hub, parent, {
      _tag: "ChildLinked",
      childRunId: input.childRunId,
      invocationId: input.invocationId,
      selection: input.executableRef.active,
      prompt: input.message.prompt,
    })
    const child = (yield* loadRun(input.childRunId))!
    yield* appendEvent(
      hub,
      child,
      { _tag: "RunAccepted", messageId: input.message.id, address: input.message.to },
      "queued",
    )
    const started = (yield* loadRun(input.childRunId))!
    yield* sql`UPDATE baton_runs SET attempt_fence = 1 WHERE run_id = ${input.childRunId}`
    yield* appendEvent(hub, { ...started, attempt: 1 }, { _tag: "RunAttemptStarted", attempt: 1 }, "running")
    return { runId: input.childRunId, messageId: input.message.id, acceptedSequence: 0, duplicate: false }
  })
