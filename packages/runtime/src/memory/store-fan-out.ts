/* oxlint-disable no-accumulating-spread */
import { Effect } from "effect"
import { make as makeAddress } from "../address.js"
import {
  FanOutConflict,
  FanOutInvalid,
  FanOutNotFound,
  ChildSelectionMissing,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
} from "../errors.js"
import type { AdmitFanOutInput, FanOutInspection, FanOutMemberResult, FanOutReceipt } from "../fan-out.js"
import { make as makeMessage } from "../message.js"
import { isTerminal } from "../run.js"
import type { RunEvent } from "../run-event.js"
import {
  appendLifecycle,
  makeAccepted,
  makeAttemptStarted,
  makeCancellationRequested,
  makeCancelled,
  makeChildLinked,
  makeChildSettled,
  makeFanOutAdmitted,
  makeFanOutJoined,
} from "./append.js"
import type { MemoryState, StoredFanOut, StoredRun } from "./state.js"
import { resolveChild } from "../executable-manifest.js"
import { digestFanOut } from "../fan-out.js"

const inspection = (fanOut: StoredFanOut): FanOutInspection => ({
  fanOutId: fanOut.fanOutId,
  parentRunId: fanOut.parentRunId,
  idempotencyKey: fanOut.idempotencyKey,
  status: fanOut.status,
  join: fanOut.join,
  remainder: fanOut.remainder,
  concurrency: fanOut.concurrency,
  members: fanOut.members,
})

export const inspectFanOut = (
  state: MemoryState,
  fanOutId: string,
): Effect.Effect<FanOutInspection, FanOutNotFound | RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const fanOut = state.fanOuts.get(fanOutId)
  return fanOut === undefined ? Effect.fail(FanOutNotFound.make({ fanOutId })) : Effect.succeed(inspection(fanOut))
}

export const admitFanOut = (
  state: MemoryState,
  input: AdmitFanOutInput,
): Effect.Effect<
  readonly [FanOutReceipt, MemoryState],
  FanOutConflict | FanOutInvalid | ChildSelectionMissing | RunNotFound | RunTerminal | RuntimeUnavailable
> =>
  Effect.gen(function* () {
    if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    const parent = state.runs.get(input.parentRunId)
    if (parent === undefined) return yield* RunNotFound.make({ runId: input.parentRunId })
    if (parent.status === "cancelling") {
      return yield* FanOutInvalid.make({ message: `parent Run ${parent.runId} is cancelling` })
    }
    if (isTerminal(parent.status)) {
      return yield* RunTerminal.make({ runId: parent.runId, status: parent.status })
    }
    const members = [] as Array<import("../fan-out.js").StoredFanOutMember>
    for (const member of input.members) {
      const executableRef = resolveChild(parent.executableRef, parent.executableManifest, member.selection)
      if (executableRef === undefined) {
        return yield* ChildSelectionMissing.make({ parentRunId: parent.runId, selection: member.selection })
      }
      members.push({ ...member, executableRef })
    }
    const resolved = { ...input, members }
    const digest = digestFanOut(resolved)
    const existing = [...state.fanOuts.values()].find(
      (fanOut) => fanOut.parentRunId === input.parentRunId && fanOut.idempotencyKey === input.idempotencyKey,
    )
    if (existing !== undefined) {
      if (existing.digest !== digest) {
        return yield* FanOutConflict.make({
          parentRunId: input.parentRunId,
          idempotencyKey: input.idempotencyKey,
          existingFanOutId: existing.fanOutId,
        })
      }
      return [
        {
          fanOutId: existing.fanOutId,
          parentRunId: existing.parentRunId,
          childRunIds: existing.members.map((member) => member.childRunId),
          duplicate: true,
        },
        state,
      ] as const
    }

    let next = state
    const memberResults: Array<FanOutMemberResult> = []
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
      const child: StoredRun = {
        runId: member.childRunId,
        status: active ? "running" : "queued",
        executableRef: member.executableRef,
        executableManifest: parent.executableManifest,
        address,
        message,
        rootRunId: parent.rootRunId,
        parentRunId: parent.runId,
        invocationId: `${input.fanOutId}:${member.key}`,
        respondedWaitIds: new Set(),
        lastSequence: -1,
        attempt: active ? 1 : 0,
        attemptFence: active ? 1 : 0,
        cancellationRequested: false,
        children: [],
        events: [],
        subscribers: new Map(),
        steering: [],
      }
      const runs = new Map(next.runs)
      runs.set(member.childRunId, child)
      runs.set(parent.runId, {
        ...runs.get(parent.runId)!,
        children: [...runs.get(parent.runId)!.children, member.childRunId],
      })
      next = { ...next, runs }
      const [, linked] = yield* appendLifecycle(
        next,
        parent.runId,
        makeChildLinked(member.childRunId, `${input.fanOutId}:${member.key}`),
      )
      next = linked
      const [, accepted] = yield* appendLifecycle(
        next,
        member.childRunId,
        makeAccepted(address, message.id),
        active ? "running" : "queued",
      )
      next = accepted
      if (active) {
        const [, started] = yield* appendLifecycle(next, member.childRunId, makeAttemptStarted(1), "running")
        next = started
      }
      memberResults.push({
        ordinal: member.ordinal,
        key: member.key,
        childRunId: member.childRunId,
        status: active ? "running" : "pending",
      })
    }
    const fanOut: StoredFanOut = { ...input, digest, status: "running", members: memberResults }
    const fanOuts = new Map(next.fanOuts)
    fanOuts.set(input.fanOutId, fanOut)
    next = { ...next, fanOuts }
    const [, admitted] = yield* appendLifecycle(
      next,
      parent.runId,
      makeFanOutAdmitted(input.fanOutId, input.members.length, input.concurrency, input.join, input.remainder),
    )
    return [
      {
        fanOutId: input.fanOutId,
        parentRunId: parent.runId,
        childRunIds: input.members.map((member) => member.childRunId),
        duplicate: false,
      },
      admitted,
    ] as const
  })

const terminalResult = (member: FanOutMemberResult, event: RunEvent): FanOutMemberResult => {
  if (event._tag === "RunCompleted")
    return { ...member, status: "succeeded", terminalEventId: event.eventId, result: event.result }
  if (event._tag === "RunFailed")
    return { ...member, status: "failed", terminalEventId: event.eventId, error: event.error }
  return { ...member, status: "cancelled", terminalEventId: event.eventId }
}

export const reconcileFanOut = (state: MemoryState, child: StoredRun, event: RunEvent) =>
  Effect.gen(function* () {
    const current = [...state.fanOuts.values()].find((fanOut) =>
      fanOut.members.some((member) => member.childRunId === child.runId),
    )
    if (current === undefined) return state
    const memberIndex = current.members.findIndex((member) => member.childRunId === child.runId)
    if (
      memberIndex < 0 ||
      ["succeeded", "failed", "cancelled", "abandoned"].includes(current.members[memberIndex]!.status)
    )
      return state
    const members = [...current.members]
    members[memberIndex] = terminalResult(members[memberIndex]!, event)
    if (current.status !== "running") {
      const fanOuts = new Map(state.fanOuts)
      fanOuts.set(current.fanOutId, { ...current, members })
      return { ...state, fanOuts }
    }
    const succeeded = members.filter((member) => member.status === "succeeded").length
    const failed = members.filter((member) => member.status === "failed").length
    const cancelled = members.filter((member) => member.status === "cancelled").length
    const unsettled = members.filter((member) => member.status === "pending" || member.status === "running").length
    const cancellingParent = state.runs.get(current.parentRunId)
    if (cancellingParent?.cancellationRequested === true) {
      const fanOuts = new Map(state.fanOuts)
      fanOuts.set(current.fanOutId, {
        ...current,
        status: unsettled === 0 ? "cancelled" : "running",
        members,
      })
      return { ...state, fanOuts }
    }
    let joined: "succeeded" | "failed" | undefined
    switch (current.join._tag) {
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
        joined =
          succeeded >= current.join.required
            ? "succeeded"
            : succeeded + unsettled < current.join.required
              ? "failed"
              : undefined
        break
    }
    if (joined === "succeeded" && current.remainder === "await" && unsettled > 0) joined = undefined
    const remainder =
      joined === undefined || current.remainder === "await"
        ? []
        : members
            .filter((member) => member.status === "pending" || member.status === "running")
            .map((member) => ({
              childRunId: member.childRunId,
              action: current.remainder === "abandon" ? ("abandoned" as const) : ("cancellation-requested" as const),
            }))
    let next = state
    if (joined !== undefined && current.remainder === "abandon") {
      for (let index = 0; index < members.length; index++) {
        if (members[index]!.status === "pending" || members[index]!.status === "running")
          members[index] = { ...members[index]!, status: "abandoned" }
      }
    } else if (joined !== undefined && current.remainder === "request-cancel") {
      for (let index = 0; index < members.length; index++) {
        const member = members[index]!
        if (member.status !== "pending" && member.status !== "running") continue
        const run = next.runs.get(member.childRunId)
        if (run === undefined || isTerminal(run.status)) continue
        const [, requested] = yield* appendLifecycle(
          next,
          run.runId,
          makeCancellationRequested("fan-out remainder"),
          "cancelling",
        )
        next = requested
        if (run.ownerId !== undefined) continue
        const [cancelledEvent, cancelledState] = yield* appendLifecycle(
          next,
          run.runId,
          makeCancelled("fan-out remainder"),
          "cancelled",
        )
        next = cancelledState
        const parent = next.runs.get(current.parentRunId)
        if (parent !== undefined && !isTerminal(parent.status)) {
          const [, settled] = yield* appendLifecycle(
            next,
            parent.runId,
            makeChildSettled(run.runId, cancelledEvent.eventId),
          )
          next = settled
        }
        members[index] = { ...member, status: "cancelled", terminalEventId: cancelledEvent.eventId }
      }
    }
    if (joined === undefined) {
      let active = members.filter((member) => member.status === "running").length
      const runs = new Map(next.runs)
      for (let index = 0; index < members.length && active < current.concurrency; index++) {
        if (members[index]!.status !== "pending") continue
        const run = runs.get(members[index]!.childRunId)!
        runs.set(run.runId, { ...run, status: "running", attempt: 1, attemptFence: 1 })
        members[index] = { ...members[index]!, status: "running" }
        next = { ...next, runs }
        const [, started] = yield* appendLifecycle(next, run.runId, makeAttemptStarted(1), "running")
        next = started
        active++
      }
    }
    const fanOuts = new Map(next.fanOuts)
    fanOuts.set(current.fanOutId, { ...current, status: joined ?? "running", members })
    next = { ...next, fanOuts }
    if (joined !== undefined) {
      const counts = {
        succeeded: members.filter((member) => member.status === "succeeded").length,
        failed: members.filter((member) => member.status === "failed").length,
        cancelled: members.filter((member) => member.status === "cancelled").length,
        abandoned: members.filter((member) => member.status === "abandoned").length,
      }
      const parent = next.runs.get(current.parentRunId)
      if (parent !== undefined && !isTerminal(parent.status)) {
        const [, emitted] = yield* appendLifecycle(
          next,
          parent.runId,
          makeFanOutJoined(current.fanOutId, joined, counts, remainder),
        )
        next = emitted
      }
    }
    return next
  })
