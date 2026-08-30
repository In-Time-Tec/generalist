import { Effect, Function, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import {
  ChildSelectionMissing,
  ExecutableRegistrationConflict,
  FanOutConflict,
  FanOutInvalid,
  IdempotencyConflict,
  RunIdConflict,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  StartInvalid,
  TreePolicyInvalid,
} from "../../errors.js"
import { decodePinned, equals, resolveChild } from "../../executable/manifest-internal.js"
import { childDigest, startDigest } from "../../memory/digest.js"
import type { AdmitProgramChildInput, AdmitStartInput } from "../../run/store.js"
import type { SpawnInput } from "../../service.js"
import { make as makeMessage, type Message } from "../../messaging/message.js"
import { decodePinnedExecutable } from "../codec/codecs.js"
import type { RunRow } from "../codec/rows.js"
import { appendEvent, insertRun, loadRun, nowIso } from "./statements.js"
import { enforceChildAdmission, nextId } from "./admit-send.js"
import type { EventHub } from "../subscribers.js"
import { associateRegistrations, loadRegistrations, persistRegistrations } from "../executable/registrations.js"
import { narrow } from "../../executable/registration.js"
import { make as makeAddress } from "../../address.js"
import { admitInitialFanOuts } from "./fan-out/initial-services.js"
import { normalize as normalizeTreePolicy } from "../../tree/policy.js"
import { readinessForAdmission } from "./child/capacity.js"

type SendReceipt = { runId: string; messageId: string; acceptedSequence: number; duplicate: boolean }
type StartReceipt = SendReceipt & {
  childRunIds: string[]
  fanOuts: Array<import("../../child/fan-out.js").FanOutReceipt>
}
type StartEffect = Effect.Effect<
  StartReceipt,
  | ChildSelectionMissing
  | ExecutableRegistrationConflict
  | FanOutConflict
  | FanOutInvalid
  | IdempotencyConflict
  | RunIdConflict
  | RuntimeUnavailable
  | SqlError
  | StartInvalid
  | TreePolicyInvalid,
  SqlClient.SqlClient
>
type SpawnEffect = Effect.Effect<
  SendReceipt,
  | ChildSelectionMissing
  | IdempotencyConflict
  | RunNotFound
  | RunTerminal
  | RuntimeUnavailable
  | import("../../errors.js").ChildDepthExceeded
  | import("../../errors.js").ChildLimitExceeded
  | SqlError,
  SqlClient.SqlClient
>
type ChildEffect = Effect.Effect<
  SendReceipt,
  | IdempotencyConflict
  | RunIdConflict
  | RunNotFound
  | RunTerminal
  | RuntimeUnavailable
  | import("../../errors.js").ChildDepthExceeded
  | import("../../errors.js").ChildLimitExceeded
  | SqlError,
  SqlClient.SqlClient
>

const validateInitialRequests = (input: AdmitStartInput) => {
  if (input.initialChildren.length > 64) {
    return StartInvalid.make({ message: "initialChildren cannot contain more than 64 requests" })
  }
  if (input.initialFanOuts.length > 64) {
    return StartInvalid.make({ message: "initialFanOuts cannot contain more than 64 requests" })
  }
  const active = input.executableManifest.entries.find((entry) => entry.pin === input.executableRef.active)
  const invocationIds = new Set<string>()
  const idempotencySources = new Set<string>()
  for (const child of input.initialChildren) {
    if (invocationIds.has(child.invocationId)) {
      return StartInvalid.make({ message: `duplicate initial child invocationId: ${child.invocationId}` })
    }
    const source = `${child.sessionId}\0${child.idempotencyKey}`
    if (idempotencySources.has(source)) {
      return StartInvalid.make({ message: "duplicate initial child sessionId/idempotencyKey" })
    }
    invocationIds.add(child.invocationId)
    idempotencySources.add(source)
    if (
      active?._tag !== "Agent" ||
      resolveChild(input.executableRef, input.executableManifest, child.selection) === undefined
    ) {
      return ChildSelectionMissing.make({ parentRunId: input.runId ?? "pending", selection: child.selection })
    }
  }
  return undefined
}

const duplicateStart = (
  sql: SqlClient.SqlClient,
  input: AdmitStartInput,
  prior: RunRow,
  digest: string,
  admitted: Parameters<typeof equals>[0],
) =>
  Effect.gen(function* () {
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
    }>`SELECT links.child_run_id, links.invocation_id, runs.session_id, runs.idempotency_key
      FROM tenetkit_run_links links JOIN tenetkit_runs runs ON runs.run_id = links.child_run_id
      WHERE links.parent_run_id = ${prior.run_id}`
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
    const fanOuts: Array<import("../../child/fan-out.js").FanOutReceipt> = []
    for (const fanOut of input.initialFanOuts) {
      const rows = yield* sql<{ fan_out_id: string }>`SELECT fan_out_id FROM tenetkit_fan_outs
        WHERE parent_run_id = ${prior.run_id} AND idempotency_key = ${fanOut.idempotencyKey}`
      const fanOutId = rows[0]?.fan_out_id
      if (fanOutId === undefined) {
        return yield* RuntimeUnavailable.make({ message: `initial fan-out ${fanOut.idempotencyKey} is missing` })
      }
      const members = yield* sql<{ child_run_id: string }>`SELECT child_run_id FROM tenetkit_fan_out_members
        WHERE fan_out_id = ${fanOutId} ORDER BY ordinal ASC`
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
      acceptedSequence: prior.accepted_sequence,
      duplicate: true,
      childRunIds,
      fanOuts,
    }
  })

export const admitStart: {
  (input: AdmitStartInput, options?: { readonly activate?: boolean }): (hub: EventHub) => StartEffect
  (hub: EventHub, input: AdmitStartInput, options?: { readonly activate?: boolean }): StartEffect
} = Function.dual(
  (args) => args.length >= 2 && "publish" in args[0],
  (hub: EventHub, input: AdmitStartInput, options?: { readonly activate?: boolean }) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const treePolicy = yield* normalizeTreePolicy(input.treePolicy)
      const normalizedInput = { ...input, treePolicy }
      const admitted = yield* Effect.try({
        try: () => decodePinned({ ref: input.executableRef, manifest: input.executableManifest }),
        catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
      })
      const invalid = validateInitialRequests(input)
      if (invalid !== undefined) return yield* invalid
      yield* persistRegistrations(input.registrations)
      const digest = startDigest(normalizedInput)
      const existing = yield* sql<RunRow>`
      SELECT * FROM tenetkit_runs
      WHERE address = ${input.message.to}
        AND session_id = ${input.message.sessionId}
        AND idempotency_key = ${input.message.idempotencyKey}
    `
      const prior = existing[0]
      if (prior !== undefined) {
        return yield* duplicateStart(sql, input, prior, digest, admitted)
      }
      if (input.runId !== undefined) {
        const byId = yield* sql<RunRow>`SELECT * FROM tenetkit_runs WHERE run_id = ${input.runId}`
        if (byId[0] !== undefined)
          return yield* RunIdConflict.make({ runId: input.runId, existingRunId: byId[0].run_id })
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
        depth: 0,
        treePolicy,
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
      if (input.initialChildren.length === 0 && options?.activate !== false) {
        const accepted = (yield* loadRun(runId))!
        yield* sql`UPDATE tenetkit_runs SET attempt_fence = 1 WHERE run_id = ${runId}`
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
    }),
)

export const admitSpawn: {
  (input: SpawnInput & { readonly message: Message; readonly parentRunId: string }): (hub: EventHub) => SpawnEffect
  (hub: EventHub, input: SpawnInput & { readonly message: Message; readonly parentRunId: string }): SpawnEffect
} = Function.dual(2, (hub: EventHub, input: SpawnInput & { readonly message: Message; readonly parentRunId: string }) =>
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
    const childIdentity = {
      parentRunId: parent.runId,
      invocationId: input.invocationId,
    }
    if (input.label !== undefined) Object.assign(childIdentity, { label: input.label })
    if (input.origin !== undefined) Object.assign(childIdentity, { origin: input.origin })
    const digest = childDigest(input.message, executableRef, childIdentity)
    const executable = yield* Effect.try({
      try: () => decodePinned({ ref: executableRef, manifest: parent.executableManifest }),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    const registrations = yield* loadRegistrations(parent.runId).pipe(
      Effect.flatMap((parentRegistrations) => narrow(executable, parentRegistrations)),
      Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) })),
    )
    const existing = yield* sql<RunRow>`
      SELECT * FROM tenetkit_runs
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
        acceptedSequence: prior.accepted_sequence,
        duplicate: true,
      }
    }
    const runId = yield* nextId("run")
    yield* enforceChildAdmission(parent, 1)
    const childReadiness = yield* readinessForAdmission(parent)
    yield* insertRun({
      runId,
      status: "queued",
      message: input.message,
      digest,
      executableRef,
      executableManifest: parent.executableManifest,
      rootRunId: parent.rootRunId,
      depth: parent.depth + 1,
      treePolicy: parent.treePolicy,
      parentRunId: parent.runId,
      invocationId: input.invocationId,
      acceptedSequence: 0,
      attempt: 0,
    })
    yield* associateRegistrations(runId, registrations)
    const created = yield* nowIso
    yield* sql`
      INSERT INTO tenetkit_run_links (parent_run_id, child_run_id, invocation_id, readiness, terminal_event_id, created_at, settled_at)
      VALUES (${parent.runId}, ${runId}, ${input.invocationId}, ${childReadiness}, NULL, ${created}, NULL)
    `
    const linked = {
      _tag: "ChildLinked",
      childRunId: runId,
      invocationId: input.invocationId,
      selection: input.selection,
      prompt: input.message.prompt,
      childDepth: parent.depth + 1,
      readiness: childReadiness,
    }
    if (input.label !== undefined) Object.assign(linked, { label: input.label })
    if (input.origin !== undefined) Object.assign(linked, { origin: input.origin })
    yield* appendEvent(hub, parent, linked)
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
    return { runId, messageId: input.message.id, acceptedSequence: 0, duplicate: false }
  }),
)

export const admitProgramChild: {
  (input: AdmitProgramChildInput): (hub: EventHub) => ChildEffect
  (hub: EventHub, input: AdmitProgramChildInput): ChildEffect
} = Function.dual(2, (hub: EventHub, input: AdmitProgramChildInput) =>
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
      SELECT * FROM tenetkit_runs
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
        acceptedSequence: prior.accepted_sequence,
        duplicate: true,
      }
    }
    const byId = yield* sql<RunRow>`SELECT * FROM tenetkit_runs WHERE run_id = ${input.childRunId}`
    if (byId[0] !== undefined) {
      return yield* RunIdConflict.make({ runId: input.childRunId, existingRunId: byId[0].run_id })
    }
    yield* enforceChildAdmission(parent, 1)
    const childReadiness = yield* readinessForAdmission(parent)
    yield* insertRun({
      runId: input.childRunId,
      status: "queued",
      message: input.message,
      digest,
      executableRef: input.executableRef,
      executableManifest: input.executableManifest,
      rootRunId: parent.rootRunId,
      depth: parent.depth + 1,
      treePolicy: parent.treePolicy,
      parentRunId: parent.runId,
      invocationId: input.invocationId,
      acceptedSequence: 0,
      attempt: 0,
    })
    yield* associateRegistrations(input.childRunId, registrations)
    const created = yield* nowIso
    yield* sql`
      INSERT INTO tenetkit_run_links (parent_run_id, child_run_id, invocation_id, readiness, terminal_event_id, created_at, settled_at)
      VALUES (${parent.runId}, ${input.childRunId}, ${input.invocationId}, ${childReadiness}, NULL, ${created}, NULL)
    `
    yield* appendEvent(hub, parent, {
      _tag: "ChildLinked",
      childRunId: input.childRunId,
      invocationId: input.invocationId,
      selection: input.executableRef.active,
      prompt: input.message.prompt,
      childDepth: parent.depth + 1,
      readiness: childReadiness,
    })
    const child = (yield* loadRun(input.childRunId))!
    yield* appendEvent(
      hub,
      child,
      { _tag: "RunAccepted", messageId: input.message.id, address: input.message.to },
      "queued",
    )
    return { runId: input.childRunId, messageId: input.message.id, acceptedSequence: 0, duplicate: false }
  }),
)

export { admitSend } from "./admit-send.js"
