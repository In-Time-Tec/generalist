import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { make as makeAddress } from "../address.js"
import {
  ChildSelectionMissing,
  FanOutConflict,
  FanOutInvalid,
  FanOutNotFound,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
} from "../errors.js"
import {
  childRunIdFor,
  digestFanOut,
  fanOutIdFor,
  FanOutJoin,
  type AdmitFanOutInput,
  type FanOutInspection,
  type FanOutMemberResult,
  type StoredFanOutMember,
} from "../fan-out.js"
import { resolveChild } from "../executable-manifest.js"
import { make as makeMessage } from "../message.js"
import { isTerminal } from "../run.js"
import type { RunEvent } from "../run-event.js"
import { decodeEvent } from "./codecs.js"
import {
  afterTerminal as defaultAfterTerminal,
  appendEvent as defaultAppendEvent,
  insertRun,
  loadRun,
  nowIso,
} from "./store-helpers.js"
import type { EventHub } from "./subscribers.js"
import { associateRegistrations, loadRegistrations } from "./executable-registrations.js"
import { narrow } from "../executable-registration.js"
import type { AdmitStartInput } from "../run-store.js"

interface FanOutRow {
  readonly fan_out_id: string
  readonly parent_run_id: string
  readonly idempotency_key: string
  readonly input_digest: string
  readonly join_json: string
  readonly remainder: FanOutInspection["remainder"]
  readonly concurrency: number
  readonly status: FanOutInspection["status"]
}

interface MemberRow {
  readonly ordinal: number
  readonly member_key: string
  readonly child_run_id: string
  readonly status: FanOutMemberResult["status"]
  readonly terminal_event_id: string | null
  readonly outcome_json: string | null
}

const loadFanOut = (fanOutId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const fanOut = (yield* sql<FanOutRow>`SELECT * FROM baton_fan_outs WHERE fan_out_id = ${fanOutId}`)[0]
    if (fanOut === undefined) return undefined
    const members = yield* sql<MemberRow>`
      SELECT * FROM baton_fan_out_members WHERE fan_out_id = ${fanOutId} ORDER BY ordinal ASC
    `
    return { fanOut, members }
  })

const decodeMember = (row: MemberRow): FanOutMemberResult => {
  const outcome = row.outcome_json === null ? {} : (JSON.parse(row.outcome_json) as Record<string, unknown>)
  return {
    ordinal: Number(row.ordinal),
    key: row.member_key,
    childRunId: row.child_run_id,
    status: row.status,
    ...(row.terminal_event_id === null ? {} : { terminalEventId: row.terminal_event_id }),
    ...(outcome.result === undefined ? {} : { result: outcome.result }),
    ...(outcome.error === undefined ? {} : { error: outcome.error }),
  }
}

export const inspectFanOut = (fanOutId: string) =>
  Effect.gen(function* () {
    const loaded = yield* loadFanOut(fanOutId)
    if (loaded === undefined) return yield* FanOutNotFound.make({ fanOutId })
    return {
      fanOutId: loaded.fanOut.fan_out_id,
      parentRunId: loaded.fanOut.parent_run_id,
      idempotencyKey: loaded.fanOut.idempotency_key,
      status: loaded.fanOut.status,
      join: Schema.decodeUnknownSync(FanOutJoin)(JSON.parse(loaded.fanOut.join_json)),
      remainder: loaded.fanOut.remainder,
      concurrency: Number(loaded.fanOut.concurrency),
      members: loaded.members.map(decodeMember),
    } satisfies FanOutInspection
  })

export const admitFanOut = (hub: EventHub, input: AdmitFanOutInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const parent = yield* loadRun(input.parentRunId)
    if (parent === undefined) return yield* RunNotFound.make({ runId: input.parentRunId })
    const parentRegistrations = yield* loadRegistrations(parent.runId)
    const members: Array<StoredFanOutMember> = []
    for (const member of input.members) {
      const executableRef = resolveChild(parent.executableRef, parent.executableManifest, member.selection)
      if (executableRef === undefined) {
        return yield* ChildSelectionMissing.make({ parentRunId: parent.runId, selection: member.selection })
      }
      members.push({ ...member, executableRef })
    }
    const digest = digestFanOut({ ...input, members })
    const prior = (yield* sql<FanOutRow>`
      SELECT * FROM baton_fan_outs
      WHERE parent_run_id = ${input.parentRunId} AND idempotency_key = ${input.idempotencyKey}
    `)[0]
    if (prior !== undefined) {
      if (prior.input_digest !== digest) {
        return yield* FanOutConflict.make({
          parentRunId: input.parentRunId,
          idempotencyKey: input.idempotencyKey,
          existingFanOutId: prior.fan_out_id,
        })
      }
      const loaded = (yield* loadFanOut(prior.fan_out_id))!
      return {
        fanOutId: prior.fan_out_id,
        parentRunId: prior.parent_run_id,
        childRunIds: loaded.members.map((member) => member.child_run_id),
        duplicate: true,
      }
    }
    if (parent.pendingOutcome !== undefined) {
      return yield* FanOutInvalid.make({ message: `parent Run ${parent.runId} has a pending outcome` })
    }
    if (parent.status === "cancelling") {
      return yield* FanOutInvalid.make({ message: `parent Run ${parent.runId} is cancelling` })
    }
    if (isTerminal(parent.status)) {
      return yield* RunTerminal.make({ runId: parent.runId, status: parent.status })
    }
    const created = yield* nowIso
    yield* sql`
      INSERT INTO baton_fan_outs (
        fan_out_id, parent_run_id, idempotency_key, input_digest, join_json, remainder,
        concurrency, status, created_at, updated_at
      ) VALUES (
        ${input.fanOutId}, ${input.parentRunId}, ${input.idempotencyKey}, ${digest},
        ${JSON.stringify(input.join)}, ${input.remainder}, ${input.concurrency}, 'running', ${created}, ${created}
      )
    `
    for (const member of members) {
      const active = member.ordinal < input.concurrency
      const address = makeAddress(`fanout:${input.fanOutId}`)
      const message = makeMessage({
        id: `fanout:${input.fanOutId}:${member.ordinal}`,
        to: address,
        sessionId: member.sessionId,
        prompt: member.prompt,
        idempotencyKey: `${input.fanOutId}:${member.key}`,
        correlationId: parent.runId,
        metadata: member.metadata,
      })
      yield* insertRun({
        runId: member.childRunId,
        status: active ? "running" : "queued",
        message,
        digest,
        executableRef: member.executableRef,
        executableManifest: parent.executableManifest,
        rootRunId: parent.rootRunId,
        parentRunId: parent.runId,
        invocationId: `${input.fanOutId}:${member.key}`,
        acceptedSequence: member.ordinal,
        attempt: active ? 1 : 0,
      })
      const registrations = yield* narrow(
        { ref: member.executableRef, manifest: parent.executableManifest },
        parentRegistrations,
      ).pipe(Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) })))
      yield* associateRegistrations(member.childRunId, registrations)
      yield* sql`
        INSERT INTO baton_run_links (parent_run_id, child_run_id, invocation_id, terminal_event_id, created_at, settled_at)
        VALUES (${parent.runId}, ${member.childRunId}, ${`${input.fanOutId}:${member.key}`}, NULL, ${created}, NULL)
      `
      yield* sql`
        INSERT INTO baton_fan_out_members (fan_out_id, ordinal, member_key, child_run_id, status, terminal_event_id, outcome_json)
        VALUES (${input.fanOutId}, ${member.ordinal}, ${member.key}, ${member.childRunId}, ${active ? "running" : "pending"}, NULL, NULL)
      `
      const currentParent = (yield* loadRun(parent.runId))!
      yield* defaultAppendEvent(hub, currentParent, {
        _tag: "ChildLinked",
        childRunId: member.childRunId,
        invocationId: `${input.fanOutId}:${member.key}`,
      })
      const child = (yield* loadRun(member.childRunId))!
      yield* defaultAppendEvent(
        hub,
        child,
        { _tag: "RunAccepted", messageId: message.id, address },
        active ? "running" : "queued",
      )
      if (active) {
        const started = (yield* loadRun(member.childRunId))!
        yield* defaultAppendEvent(hub, started, { _tag: "RunAttemptStarted", attempt: 1 }, "running")
      }
    }
    const currentParent = (yield* loadRun(parent.runId))!
    yield* defaultAppendEvent(hub, currentParent, {
      _tag: "FanOutAdmitted",
      fanOutId: input.fanOutId,
      memberCount: input.members.length,
      concurrency: input.concurrency,
      join: input.join,
      remainder: input.remainder,
    })
    return {
      fanOutId: input.fanOutId,
      parentRunId: input.parentRunId,
      childRunIds: input.members.map((member) => member.childRunId),
      duplicate: false,
    }
  })

export const admitInitialFanOuts = (hub: EventHub, parentRunId: string, fanOuts: AdmitStartInput["initialFanOuts"]) =>
  Effect.forEach(fanOuts, (fanOut) => {
    const fanOutId = fanOutIdFor(parentRunId, fanOut.idempotencyKey)
    return admitFanOut(hub, {
      parentRunId,
      fanOutId,
      idempotencyKey: fanOut.idempotencyKey,
      concurrency: Math.min(fanOut.concurrency, fanOut.members.length),
      join: fanOut.join,
      remainder: fanOut.remainder,
      members: fanOut.members.map((member, ordinal) => ({
        ordinal,
        key: member.key,
        childRunId: childRunIdFor(fanOutId, ordinal),
        selection: member.selection,
        prompt: member.prompt,
        sessionId: member.sessionId ?? `fanout:${fanOutId}`,
        metadata: member.metadata ?? {},
      })),
    }).pipe(
      Effect.mapError((error) =>
        error instanceof RunNotFound || error instanceof RunTerminal
          ? RuntimeUnavailable.make({ message: "newly admitted root unavailable during initial fan-out admission" })
          : error,
      ),
    )
  })

const outcomeFor = (event: RunEvent): Record<string, unknown> =>
  event._tag === "RunCompleted" ? { result: event.result } : event._tag === "RunFailed" ? { error: event.error } : {}

export const reconcileFanOutWith = <E, R>(
  hub: EventHub,
  childRunId: string,
  terminalEventId: string,
  append: (
    hub: EventHub,
    run: Parameters<typeof defaultAppendEvent>[1],
    partial: Parameters<typeof defaultAppendEvent>[2],
    nextStatus?: Parameters<typeof defaultAppendEvent>[3],
  ) => Effect.Effect<RunEvent, E, R>,
  settle: (
    hub: EventHub,
    run: Parameters<typeof defaultAppendEvent>[1],
    terminalEventId: string,
  ) => Effect.Effect<void, E, R>,
  finalize: (hub: EventHub, run: Parameters<typeof defaultAppendEvent>[1]) => Effect.Effect<void, E, R>,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const eventRow = (yield* sql<{
      event_json: string
    }>`SELECT event_json FROM baton_run_events WHERE event_id = ${terminalEventId}`)[0]
    if (eventRow === undefined) return
    const event = decodeEvent(eventRow.event_json)
    const row = (yield* sql<{ fan_out_id: string; status: string }>`
      SELECT fan_out_id, status FROM baton_fan_out_members WHERE child_run_id = ${childRunId}
    `)[0]
    if (row === undefined || ["succeeded", "failed", "cancelled", "abandoned"].includes(row.status)) return
    const memberStatus =
      event._tag === "RunCompleted" ? "succeeded" : event._tag === "RunFailed" ? "failed" : "cancelled"
    yield* sql`
      UPDATE baton_fan_out_members SET status = ${memberStatus}, terminal_event_id = ${event.eventId},
        outcome_json = ${JSON.stringify(outcomeFor(event))}
      WHERE child_run_id = ${childRunId}
    `
    const loaded = (yield* loadFanOut(row.fan_out_id))!
    if (loaded.fanOut.status !== "running") return
    const members = loaded.members.map(decodeMember)
    const succeeded = members.filter((member) => member.status === "succeeded").length
    const failed = members.filter((member) => member.status === "failed").length
    const cancelled = members.filter((member) => member.status === "cancelled").length
    const unsettled = members.filter((member) => member.status === "pending" || member.status === "running").length
    const cancellingParent = yield* loadRun(loaded.fanOut.parent_run_id)
    if (cancellingParent?.cancellationRequested === true) {
      if (unsettled === 0) {
        const updated = yield* nowIso
        yield* sql`
          UPDATE baton_fan_outs SET status = 'cancelled', updated_at = ${updated}
          WHERE fan_out_id = ${row.fan_out_id} AND status = 'running'
        `
      }
      return
    }
    const join = Schema.decodeUnknownSync(FanOutJoin)(JSON.parse(loaded.fanOut.join_json))
    let joined: "succeeded" | "failed" | undefined
    switch (join._tag) {
      case "AllSuccess":
        joined = failed + cancelled > 0 ? "failed" : unsettled === 0 ? "succeeded" : undefined
        break
      case "AllSettled":
        joined = unsettled === 0 ? "succeeded" : undefined
        break
      case "BestEffort":
        joined = unsettled === 0 ? "succeeded" : undefined
        break
      case "FirstSuccess":
        joined = succeeded > 0 ? "succeeded" : unsettled === 0 ? "failed" : undefined
        break
      case "Quorum":
        joined = succeeded >= join.required ? "succeeded" : succeeded + unsettled < join.required ? "failed" : undefined
        break
    }
    if (joined === "succeeded" && loaded.fanOut.remainder === "await" && unsettled > 0) joined = undefined
    const remainder =
      joined === undefined || loaded.fanOut.remainder === "await"
        ? []
        : members
            .filter((member) => member.status === "pending" || member.status === "running")
            .map((member) => ({
              childRunId: member.childRunId,
              action:
                loaded.fanOut.remainder === "abandon" ? ("abandoned" as const) : ("cancellation-requested" as const),
            }))
    if (joined !== undefined && loaded.fanOut.remainder === "abandon") {
      yield* sql`
        UPDATE baton_fan_out_members SET status = 'abandoned'
        WHERE fan_out_id = ${row.fan_out_id} AND status IN ('pending', 'running')
      `
    } else if (joined !== undefined && loaded.fanOut.remainder === "request-cancel") {
      for (const member of members) {
        if (member.status !== "pending" && member.status !== "running") continue
        let run = yield* loadRun(member.childRunId)
        if (run === undefined || ["succeeded", "failed", "cancelled"].includes(run.status)) continue
        yield* append(hub, run, { _tag: "RunCancellationRequested", reason: "fan-out remainder" }, "cancelling")
        if (run.ownerWorkerId !== undefined) continue
        run = (yield* loadRun(member.childRunId))!
        const cancelledEvent = yield* append(
          hub,
          run,
          { _tag: "RunCancelled", reason: "fan-out remainder" },
          "cancelled",
        )
        yield* sql`
          UPDATE baton_fan_out_members SET status = 'cancelled', terminal_event_id = ${cancelledEvent.eventId}, outcome_json = '{}'
          WHERE child_run_id = ${member.childRunId}
        `
        yield* sql`
          UPDATE baton_run_links SET terminal_event_id = ${cancelledEvent.eventId}, settled_at = ${yield* nowIso}
          WHERE child_run_id = ${member.childRunId} AND terminal_event_id IS NULL
        `
        const parent = yield* loadRun(loaded.fanOut.parent_run_id)
        if (parent !== undefined && !["succeeded", "failed", "cancelled"].includes(parent.status)) {
          yield* append(hub, parent, {
            _tag: "ChildSettled",
            childRunId: member.childRunId,
            terminalEventId: cancelledEvent.eventId,
          })
        }
      }
    }
    if (joined === undefined) {
      const active = members.filter((member) => member.status === "running").length
      const pending = members
        .filter((member) => member.status === "pending")
        .slice(0, Math.max(0, Number(loaded.fanOut.concurrency) - active))
      for (const member of pending) {
        yield* sql`UPDATE baton_fan_out_members SET status = 'running' WHERE child_run_id = ${member.childRunId} AND status = 'pending'`
        const run = (yield* loadRun(member.childRunId))!
        yield* sql`UPDATE baton_runs SET status = 'running', attempt = 1, attempt_fence = 1 WHERE run_id = ${member.childRunId} AND status = 'queued'`
        yield* append(hub, { ...run, attempt: 1 }, { _tag: "RunAttemptStarted", attempt: 1 }, "running")
      }
      return
    }
    const updated = yield* nowIso
    yield* sql`UPDATE baton_fan_outs SET status = ${joined}, updated_at = ${updated} WHERE fan_out_id = ${row.fan_out_id} AND status = 'running'`
    const finalMembers = (yield* loadFanOut(row.fan_out_id))!.members.map(decodeMember)
    const parent = yield* loadRun(loaded.fanOut.parent_run_id)
    if (parent !== undefined && !isTerminal(parent.status)) {
      yield* append(hub, parent, {
        _tag: "FanOutJoined",
        fanOutId: row.fan_out_id,
        status: joined,
        succeeded: finalMembers.filter((member) => member.status === "succeeded").length,
        failed: finalMembers.filter((member) => member.status === "failed").length,
        cancelled: finalMembers.filter((member) => member.status === "cancelled").length,
        abandoned: finalMembers.filter((member) => member.status === "abandoned").length,
        remainder,
      })
      const currentParent = yield* loadRun(parent.runId)
      const pendingOutcome = currentParent?.pendingOutcome
      const otherRunning = yield* sql<{ fan_out_id: string }>`
        SELECT fan_out_id FROM baton_fan_outs
        WHERE parent_run_id = ${parent.runId} AND status = 'running' LIMIT 1
      `
      if (
        currentParent !== undefined &&
        pendingOutcome !== undefined &&
        !currentParent.cancellationRequested &&
        otherRunning.length === 0
      ) {
        const pending = pendingOutcome
        yield* append(
          hub,
          currentParent,
          pending._tag === "Completed"
            ? { _tag: "RunCompleted", result: pending.result }
            : { _tag: "RunFailed", error: pending.error },
          pending._tag === "Completed" ? "succeeded" : "failed",
        )
        const terminalParent = (yield* loadRun(parent.runId))!
        yield* settle(hub, terminalParent, terminalParent.terminalEventId!)
        yield* finalize(hub, terminalParent)
      }
    }
    const operations = yield* sql<{ run_id: string; operation_name: string; wait_id: string | null }>`
      SELECT run_id, operation_name, wait_id FROM baton_program_operations
      WHERE fan_out_id = ${row.fan_out_id} AND status = 'waiting'
    `
    const operation = operations[0]
    const resumeParent = parent === undefined ? undefined : yield* loadRun(parent.runId)
    if (
      resumeParent !== undefined &&
      !isTerminal(resumeParent.status) &&
      operation !== undefined &&
      operation.wait_id !== null &&
      resumeParent.activeWaitId === operation.wait_id
    ) {
      const resolution = { _tag: "Signal" as const, name: operation.wait_id }
      const closedAt = yield* nowIso
      yield* sql`
        UPDATE baton_program_operations SET status = 'running'
        WHERE run_id = ${operation.run_id} AND operation_name = ${operation.operation_name} AND status = 'waiting'
      `
      yield* sql`
        UPDATE baton_run_waits SET status = 'signaled', response_json = ${JSON.stringify(resolution)}, closed_at = ${closedAt}
        WHERE run_id = ${resumeParent.runId} AND wait_id = ${operation.wait_id} AND status = 'open'
      `
      yield* sql`UPDATE baton_runs SET owner_worker_id = NULL WHERE run_id = ${resumeParent.runId}`
      yield* append(
        hub,
        (yield* loadRun(resumeParent.runId))!,
        { _tag: "RunResumed", waitId: operation.wait_id, resolution },
        "running",
      )
    }
  })

export const reconcileFanOut = (
  hub: EventHub,
  childRunId: string,
  terminalEventId: string,
  settle: (
    hub: EventHub,
    run: Parameters<typeof defaultAppendEvent>[1],
    eventId: string,
  ) => ReturnType<typeof defaultAfterTerminal>,
) => reconcileFanOutWith(hub, childRunId, terminalEventId, defaultAppendEvent, settle, defaultAfterTerminal)
