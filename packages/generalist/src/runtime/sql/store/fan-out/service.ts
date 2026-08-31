import { Effect, Function } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { make as makeAddress } from "../../../address.js"
import {
  ChildSelectionMissing,
  FanOutConflict,
  FanOutInvalid,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
} from "../../../errors.js"
import { FanOutJoin, type FanOutReceipt } from "../../../child/fan-out.js"
import {
  digestFanOut,
  FanOutMemberOrigin,
  validateAdmission,
  type AdmitFanOutInput,
  type StoredFanOutMember,
} from "../../../child/fan-out-internal.js"
import { resolveChild } from "../../../executable/manifest-internal.js"
import { make as makeMessage } from "../../../messaging/message.js"
import { isTerminal } from "../../../run.js"
import type { RunEvent } from "../../../run/event.js"
import { decodeEvent, decodeJson, encodeJson, encodeJsonValue } from "../../codec/codecs.js"
import { decodeMember, inspectFanOut, loadFanOut, outcomeFor, type FanOutRow } from "./rows.js"
export { inspectFanOut }
import {
  afterTerminal as defaultAfterTerminal,
  appendEvent as defaultAppendEvent,
  clearLeaseOnOwnerRelease,
  insertRun,
  loadRun,
  nowIso,
} from "../statements.js"
import { enforceChildAdmission } from "../admit-send.js"
import type { EventHub } from "../../subscribers.js"
import { associateRegistrations, loadRegistrations } from "../../executable/registrations.js"
import { narrow } from "../../../executable/registration.js"
import { resultFromInspection, waitIdForGroup } from "../../../child/group.js"
import { Prompt } from "effect/unstable/ai"
import { activeChildCount, promoteChildCapacity } from "../child/capacity.js"
import { FanOutJoinResolution } from "./join.js"
import { transitionRunWait } from "../wait-transition.js"
type FanOutEffect = Effect.Effect<
  FanOutReceipt,
  | ChildSelectionMissing
  | FanOutConflict
  | FanOutInvalid
  | RunNotFound
  | RunTerminal
  | RuntimeUnavailable
  | import("../../../errors.js").ChildDepthExceeded
  | import("../../../errors.js").ChildLimitExceeded
  | SqlError,
  SqlClient.SqlClient
>
type AppendRun = Parameters<typeof defaultAppendEvent>[1]
type AppendPartial = Parameters<typeof defaultAppendEvent>[2]
type AppendStatus = Parameters<typeof defaultAppendEvent>[3]
type AppendFn<E, R> = (
  hub: EventHub,
  run: AppendRun,
  partial: AppendPartial,
  nextStatus?: AppendStatus,
) => Effect.Effect<RunEvent, E, R>
type SettleFn<E, R> = (hub: EventHub, run: AppendRun, terminalEventId: string) => Effect.Effect<void, E, R>
type FinalizeFn<E, R> = (hub: EventHub, run: AppendRun) => Effect.Effect<void, E, R>
type ReconcileEffect<E, R> = Effect.Effect<void, E | RuntimeUnavailable | SqlError, R | SqlClient.SqlClient>
type FanOutVoidEffect = Effect.Effect<void, RuntimeUnavailable | SqlError, SqlClient.SqlClient>
type SettleFn2 = (hub: EventHub, run: AppendRun, eventId: string) => ReturnType<typeof defaultAfterTerminal>
export const admitFanOut: {
  (input: AdmitFanOutInput): (hub: EventHub) => FanOutEffect
  (hub: EventHub, input: AdmitFanOutInput): FanOutEffect
} = Function.dual(2, (hub: EventHub, input: AdmitFanOutInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const invalid = validateAdmission(input)
    if (invalid !== undefined) return yield* FanOutInvalid.make({ message: invalid })
    const parent = yield* loadRun(input.parentRunId)
    if (parent === undefined) return yield* RunNotFound.make({ runId: input.parentRunId })
    const parentRegistrations = yield* loadRegistrations(parent.runId)
    const resolveMembers = Effect.gen(function* () {
      const resolved: Array<StoredFanOutMember> = []
      for (const member of input.members) {
        const executableRef = resolveChild(parent.executableRef, parent.executableManifest, member.selection)
        if (executableRef === undefined) {
          return yield* ChildSelectionMissing.make({ parentRunId: parent.runId, selection: member.selection })
        }
        resolved.push({ ...member, executableRef })
      }
      return resolved
    })
    const members = yield* resolveMembers
    const digest = digestFanOut({ ...input, members })
    const prior = (yield* sql<FanOutRow>`
      SELECT * FROM generalist_fan_outs
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
    const validateParent = Effect.gen(function* () {
      if (parent.pendingOutcome !== undefined) {
        return yield* FanOutInvalid.make({ message: `parent Run ${parent.runId} has a pending outcome` })
      }
      if (parent.status === "cancelling") {
        return yield* FanOutInvalid.make({ message: `parent Run ${parent.runId} is cancelling` })
      }
      if (isTerminal(parent.status)) return yield* RunTerminal.make({ runId: parent.runId, status: parent.status })
    })
    yield* validateParent
    yield* enforceChildAdmission(parent, members.length)
    const concurrency = Math.min(input.concurrency ?? members.length, members.length, parent.treePolicy.maxSubagents)
    const readyCount = Math.min(
      concurrency,
      Math.max(0, parent.treePolicy.maxSubagents - (yield* activeChildCount(parent.runId))),
    )
    const created = yield* nowIso
    yield* sql`
      INSERT INTO generalist_fan_outs (
        fan_out_id, parent_run_id, idempotency_key, input_digest, join_json, remainder,
        concurrency, status, created_at, updated_at
      ) VALUES (
        ${input.fanOutId}, ${input.parentRunId}, ${input.idempotencyKey}, ${digest},
        ${encodeJson(FanOutJoin, input.join)}, ${input.remainder}, ${concurrency}, 'running', ${created}, ${created}
      )
    `
    for (const member of members) {
      const ready = member.ordinal < readyCount
      const readiness = ready ? "ready" : "queued"
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
        status: "queued",
        message,
        digest,
        executableRef: member.executableRef,
        executableManifest: parent.executableManifest,
        rootRunId: parent.rootRunId,
        depth: parent.depth + 1,
        treePolicy: parent.treePolicy,
        parentRunId: parent.runId,
        invocationId: `${input.fanOutId}:${member.key}`,
        acceptedSequence: member.ordinal,
        attempt: 0,
      })
      const registrations = yield* narrow(
        { ref: member.executableRef, manifest: parent.executableManifest },
        parentRegistrations,
      ).pipe(Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) })))
      yield* associateRegistrations(member.childRunId, registrations)
      yield* sql`
        INSERT INTO generalist_run_links (parent_run_id, child_run_id, invocation_id, readiness, terminal_event_id, created_at, settled_at)
        VALUES (${parent.runId}, ${member.childRunId}, ${`${input.fanOutId}:${member.key}`}, ${readiness}, NULL, ${created}, NULL)
      `
      yield* sql`
        INSERT INTO generalist_fan_out_members (
          fan_out_id, ordinal, member_key, selection, display_label, prompt_json, origin_json,
          child_run_id, depth, status, terminal_event_id, outcome_json
        ) VALUES (
          ${input.fanOutId}, ${member.ordinal}, ${member.key}, ${member.selection}, ${member.label ?? null},
          ${encodeJson(Prompt.Prompt, member.prompt)},
          ${member.origin === undefined ? null : encodeJson(FanOutMemberOrigin, member.origin)},
          ${member.childRunId}, ${parent.depth + 1}, ${ready ? "running" : "pending"}, NULL, NULL
        )
      `
      const currentParent = (yield* loadRun(parent.runId))!
      const linked = {
        _tag: "ChildLinked",
        childRunId: member.childRunId,
        invocationId: `${input.fanOutId}:${member.key}`,
        selection: member.selection,
        prompt: member.prompt,
        childDepth: parent.depth + 1,
        readiness,
        key: member.key,
      } satisfies AppendPartial
      if (member.label !== undefined) Object.assign(linked, { label: member.label })
      if (member.origin !== undefined) Object.assign(linked, { origin: member.origin })
      yield* defaultAppendEvent(hub, currentParent, linked)
      const child = (yield* loadRun(member.childRunId))!
      yield* defaultAppendEvent(hub, child, { _tag: "RunAccepted", messageId: message.id, address }, "queued")
    }
    const currentParent = (yield* loadRun(parent.runId))!
    yield* defaultAppendEvent(hub, currentParent, {
      _tag: "FanOutAdmitted",
      fanOutId: input.fanOutId,
      memberCount: input.members.length,
      concurrency,
      join: input.join,
      remainder: input.remainder,
    })
    return {
      fanOutId: input.fanOutId,
      parentRunId: input.parentRunId,
      childRunIds: input.members.map((member) => member.childRunId),
      duplicate: false,
    }
  }),
)
export const reconcileFanOutWith: {
  <E, R>(
    childRunId: string,
    terminalEventId: string,
    append: AppendFn<E, R>,
    settle: SettleFn<E, R>,
    finalize: FinalizeFn<E, R>,
  ): (hub: EventHub) => ReconcileEffect<E, R>
  <E, R>(
    hub: EventHub,
    childRunId: string,
    terminalEventId: string,
    append: AppendFn<E, R>,
    settle: SettleFn<E, R>,
    finalize: FinalizeFn<E, R>,
  ): ReconcileEffect<E, R>
} = Function.dual(
  6,
  <E, R>(
    hub: EventHub,
    childRunId: string,
    terminalEventId: string,
    append: AppendFn<E, R>,
    settle: SettleFn<E, R>,
    finalize: FinalizeFn<E, R>,
  ) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const promoteParent = (link: { readonly parent_run_id: string } | undefined) =>
        link === undefined ? Effect.void : promoteChildCapacity({ hub, parentRunId: link.parent_run_id, append })
      const eventRow = (yield* sql<{
        event_json: string
      }>`SELECT event_json FROM generalist_run_events WHERE event_id = ${terminalEventId}`)[0]
      if (eventRow === undefined) return
      const event = decodeEvent(eventRow.event_json)
      const row = (yield* sql<{ fan_out_id: string; status: string }>`
      SELECT fan_out_id, status FROM generalist_fan_out_members WHERE child_run_id = ${childRunId}
    `)[0]
      if (row === undefined) {
        const link = (yield* sql<{ parent_run_id: string }>`
          SELECT parent_run_id FROM generalist_run_links WHERE child_run_id = ${childRunId}
        `)[0]
        yield* promoteParent(link)
        return
      }
      const parentLink = (yield* sql<{ parent_run_id: string }>`
        SELECT parent_run_id FROM generalist_run_links WHERE child_run_id = ${childRunId}
      `)[0]
      if (["succeeded", "failed", "cancelled", "abandoned"].includes(row.status)) {
        yield* promoteParent(parentLink)
        return
      }
      const memberStatus = FanOutJoinResolution.terminalMemberStatus(event._tag)
      yield* sql`
      UPDATE generalist_fan_out_members SET status = ${memberStatus}, terminal_event_id = ${event.eventId},
        outcome_json = ${encodeJsonValue(outcomeFor(event))}
      WHERE child_run_id = ${childRunId}
    `
      const loaded = (yield* loadFanOut(row.fan_out_id))!
      if (loaded.fanOut.status !== "running") {
        yield* promoteParent(parentLink)
        return
      }
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
          UPDATE generalist_fan_outs SET status = 'cancelled', updated_at = ${updated}
          WHERE fan_out_id = ${row.fan_out_id} AND status = 'running'
        `
        }
        return
      }
      const join = decodeJson(FanOutJoin, loaded.fanOut.join_json)
      let joined = FanOutJoinResolution.joinedStatus(join, { succeeded, failed, cancelled, unsettled })
      if (joined === "succeeded" && loaded.fanOut.remainder === "await" && unsettled > 0) joined = undefined
      const remainder =
        joined === undefined || loaded.fanOut.remainder === "terminate"
          ? []
          : FanOutJoinResolution.remainderActions(members, loaded.fanOut.remainder)
      const applyRemainder = Effect.gen(function* () {
        if (joined !== undefined && loaded.fanOut.remainder === "abandon") {
          yield* sql`
        UPDATE generalist_fan_out_members SET status = 'abandoned'
        WHERE fan_out_id = ${row.fan_out_id} AND status IN ('pending', 'running')
      `
          return
        }
        if (joined !== undefined && loaded.fanOut.remainder === "request-cancel") {
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
          UPDATE generalist_fan_out_members SET status = 'cancelled', terminal_event_id = ${cancelledEvent.eventId},
            outcome_json = ${encodeJsonValue(outcomeFor(cancelledEvent))}
          WHERE child_run_id = ${member.childRunId}
        `
            yield* settle(hub, (yield* loadRun(member.childRunId))!, cancelledEvent.eventId)
          }
        }
      })
      yield* applyRemainder
      if (joined === undefined) {
        yield* promoteParent(parentLink)
        return
      }
      const updated = yield* nowIso
      yield* sql`UPDATE generalist_fan_outs SET status = ${joined}, updated_at = ${updated} WHERE fan_out_id = ${row.fan_out_id} AND status = 'running'`
      yield* promoteParent(parentLink)
      const finalMembers = (yield* loadFanOut(row.fan_out_id))!.members.map(decodeMember)
      const finishParent = Effect.gen(function* () {
        const parent = yield* loadRun(loaded.fanOut.parent_run_id)
        if (parent === undefined || isTerminal(parent.status)) return parent
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
        SELECT fan_out_id FROM generalist_fan_outs
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
        return parent
      })
      const parent = yield* finishParent
      let resumeParent = parent === undefined ? undefined : yield* loadRun(parent.runId)
      const resumeGroupWait = Effect.gen(function* () {
        const waitId = resumeParent === undefined ? undefined : waitIdForGroup(resumeParent.suspension, row.fan_out_id)
        if (resumeParent === undefined || isTerminal(resumeParent.status) || waitId === undefined) return
        const resolution = {
          _tag: "Signal" as const,
          name: waitId,
          payload: resultFromInspection(
            yield* inspectFanOut(row.fan_out_id).pipe(
              Effect.mapError(() =>
                RuntimeUnavailable.make({ message: `child group ${row.fan_out_id} disappeared during join` }),
              ),
            ),
          ),
        }
        const closedAt = yield* nowIso
        const affected = yield* transitionRunWait({
          runId: resumeParent.runId,
          waitId,
          status: "signaled",
          resolution,
          closedAt,
        })
        if (affected !== 1) return
        yield* sql`
          UPDATE generalist_runs SET owner_worker_id = NULL${clearLeaseOnOwnerRelease(sql)}
          WHERE run_id = ${resumeParent.runId}
        `
        yield* append(hub, (yield* loadRun(resumeParent.runId))!, { _tag: "RunResumed", waitId, resolution }, "running")
        resumeParent = yield* loadRun(resumeParent.runId)
      })
      yield* resumeGroupWait
      const operations = yield* sql<{ run_id: string; operation_name: string; wait_id: string | null }>`
      SELECT run_id, operation_name, wait_id FROM generalist_program_operations
      WHERE fan_out_id = ${row.fan_out_id} AND status = 'waiting'
    `
      const operation = operations[0]
      const resumeProgramWait = Effect.gen(function* () {
        if (
          resumeParent === undefined ||
          isTerminal(resumeParent.status) ||
          operation === undefined ||
          operation.wait_id === null
        )
          return
        const resolution = { _tag: "Signal" as const, name: operation.wait_id }
        const closedAt = yield* nowIso
        const affected = yield* transitionRunWait({
          runId: resumeParent.runId,
          waitId: operation.wait_id,
          status: "signaled",
          resolution,
          closedAt,
        })
        if (affected !== 1) return
        yield* sql`
        UPDATE generalist_program_operations SET status = 'running'
        WHERE run_id = ${operation.run_id} AND operation_name = ${operation.operation_name} AND status = 'waiting'
      `
        yield* sql`
          UPDATE generalist_runs SET owner_worker_id = NULL${clearLeaseOnOwnerRelease(sql)}
          WHERE run_id = ${resumeParent.runId}
        `
        yield* append(
          hub,
          (yield* loadRun(resumeParent.runId))!,
          { _tag: "RunResumed", waitId: operation.wait_id, resolution },
          "running",
        )
      })
      yield* resumeProgramWait
    }),
)
export const reconcileFanOut: {
  (childRunId: string, terminalEventId: string, settle: SettleFn2): (hub: EventHub) => FanOutVoidEffect
  (hub: EventHub, childRunId: string, terminalEventId: string, settle: SettleFn2): FanOutVoidEffect
} = Function.dual(4, (hub: EventHub, childRunId: string, terminalEventId: string, settle: SettleFn2) =>
  reconcileFanOutWith(hub, childRunId, terminalEventId, defaultAppendEvent, settle, defaultAfterTerminal),
)
