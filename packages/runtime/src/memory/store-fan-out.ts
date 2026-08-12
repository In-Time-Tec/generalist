/* oxlint-disable no-accumulating-spread */
import { DateTime, Effect, Function } from "effect"
import { make as makeAddress } from "../address.js"
import {
  FanOutConflict,
  FanOutInvalid,
  ChildSelectionMissing,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  ChildDepthExceeded,
  ChildLimitExceeded,
} from "../errors.js"
import type { AdmitFanOutInput, FanOutMemberResult, FanOutReceipt } from "../fan-out.js"
import { make as makeMessage } from "../message.js"
import { isTerminal } from "../run.js"
import type { RunEvent } from "../run-event.js"
import {
  appendLifecycle,
  makeAccepted,
  makeCancellationRequested,
  makeCancelled,
  makeChildLinked,
  makeChildReadinessChanged,
  makeChildSettled,
  makeFanOutAdmitted,
  makeFanOutJoined,
  makeResumed,
} from "./append.js"
import type { MemoryState, StoredFanOut, StoredRun } from "./state.js"
import { resolveChild } from "../executable-manifest.js"
import { digestFanOut, validateAdmission } from "../fan-out.js"
import { narrow } from "../executable-registration.js"
import { groupIdFromSuspension, resultFromInspection } from "../child-group.js"
import { admitChildSettlement } from "./store-directory.js"
import { activeChildCount, promoteChildCapacity, settleFanOutMember } from "./store-child-capacity.js"

export const admitFanOut: {
  (
    input: AdmitFanOutInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<
    readonly [FanOutReceipt, MemoryState],
    | FanOutConflict
    | FanOutInvalid
    | ChildSelectionMissing
    | RunNotFound
    | RunTerminal
    | RuntimeUnavailable
    | ChildDepthExceeded
    | ChildLimitExceeded
  >
  (
    state: MemoryState,
    input: AdmitFanOutInput,
  ): Effect.Effect<
    readonly [FanOutReceipt, MemoryState],
    | FanOutConflict
    | FanOutInvalid
    | ChildSelectionMissing
    | RunNotFound
    | RunTerminal
    | RuntimeUnavailable
    | ChildDepthExceeded
    | ChildLimitExceeded
  >
} = Function.dual(2, (state: MemoryState, input: AdmitFanOutInput) =>
  Effect.gen(function* () {
    if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    const invalid = validateAdmission(input)
    if (invalid !== undefined) return yield* FanOutInvalid.make({ message: invalid })
    const parent = state.runs.get(input.parentRunId)
    if (parent === undefined) return yield* RunNotFound.make({ runId: input.parentRunId })
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
    if (parent.pendingOutcome !== undefined) {
      return yield* FanOutInvalid.make({ message: `parent Run ${parent.runId} has a pending outcome` })
    }
    if (parent.status === "cancelling") {
      return yield* FanOutInvalid.make({ message: `parent Run ${parent.runId} is cancelling` })
    }
    if (isTerminal(parent.status)) {
      return yield* RunTerminal.make({ runId: parent.runId, status: parent.status })
    }
    const depth = parent.depth + 1
    if (depth > parent.treePolicy.maxDepth) {
      return yield* ChildDepthExceeded.make({
        parentRunId: parent.runId,
        rootRunId: parent.rootRunId,
        parentDepth: parent.depth,
        depth,
        requested: depth,
        current: parent.depth,
        limit: parent.treePolicy.maxDepth,
      })
    }
    if (parent.treePolicy.maxSubagents === 0) {
      return yield* ChildLimitExceeded.make({
        parentRunId: parent.runId,
        rootRunId: parent.rootRunId,
        parentDepth: parent.depth,
        depth,
        requested: members.length,
        current: 0,
        limit: parent.treePolicy.maxSubagents,
      })
    }
    const concurrency = Math.min(input.concurrency ?? members.length, members.length, parent.treePolicy.maxSubagents)
    const readyCount = Math.min(
      concurrency,
      Math.max(0, parent.treePolicy.maxSubagents - activeChildCount(state, parent)),
    )

    let next = state
    const memberResults: Array<FanOutMemberResult> = []
    for (const member of members) {
      const ready = member.ordinal < readyCount
      const readiness = ready ? ("ready" as const) : ("queued" as const)
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
        status: "queued",
        executableRef: member.executableRef,
        executableManifest: parent.executableManifest,
        address,
        message,
        rootRunId: parent.rootRunId,
        depth,
        treePolicy: parent.treePolicy,
        parentRunId: parent.runId,
        childReadiness: readiness,
        invocationId: `${input.fanOutId}:${member.key}`,
        respondedWaitIds: new Set(),
        lastSequence: -1,
        attempt: 0,
        attemptFence: 0,
        cancellationRequested: false,
        children: [],
        events: [],
        subscribers: new Map(),
        steering: [],
        registrations: yield* narrow(
          { ref: member.executableRef, manifest: parent.executableManifest },
          parent.registrations,
        ).pipe(Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) }))),
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
        makeChildLinked(member.childRunId, `${input.fanOutId}:${member.key}`, member.selection, member.prompt, depth, {
          readiness,
          key: member.key,
          ...(member.label === undefined ? {} : { label: member.label }),
          ...(member.origin === undefined ? {} : { origin: member.origin }),
        }),
      )
      next = linked
      const [, accepted] = yield* appendLifecycle(next, member.childRunId, makeAccepted(address, message.id), "queued")
      next = accepted
      memberResults.push({
        ordinal: member.ordinal,
        key: member.key,
        selection: member.selection,
        ...(member.label === undefined ? {} : { label: member.label }),
        prompt: member.prompt,
        ...(member.origin === undefined ? {} : { origin: member.origin }),
        childRunId: member.childRunId,
        depth,
        readiness,
        status: ready ? "running" : "pending",
      })
    }
    const fanOut: StoredFanOut = {
      fanOutId: input.fanOutId,
      parentRunId: input.parentRunId,
      idempotencyKey: input.idempotencyKey,
      digest,
      status: "running",
      join: input.join,
      remainder: input.remainder,
      concurrency,
      members: memberResults,
    }
    const fanOuts = new Map(next.fanOuts)
    fanOuts.set(input.fanOutId, fanOut)
    next = { ...next, fanOuts }
    const [, admitted] = yield* appendLifecycle(
      next,
      parent.runId,
      makeFanOutAdmitted({
        fanOutId: input.fanOutId,
        memberCount: input.members.length,
        concurrency,
        join: input.join,
        remainder: input.remainder,
      }),
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
  }),
)

export const reconcileFanOut: {
  (
    child: StoredRun,
    event: RunEvent,
    settlePending: (state: MemoryState, parent: StoredRun) => Effect.Effect<MemoryState, RuntimeUnavailable>,
  ): (state: MemoryState) => Effect.Effect<MemoryState, RuntimeUnavailable, never>
  (
    state: MemoryState,
    child: StoredRun,
    event: RunEvent,
    settlePending: (state: MemoryState, parent: StoredRun) => Effect.Effect<MemoryState, RuntimeUnavailable>,
  ): Effect.Effect<MemoryState, RuntimeUnavailable, never>
} = Function.dual(
  4,
  (
    state: MemoryState,
    child: StoredRun,
    event: RunEvent,
    settlePending: (state: MemoryState, parent: StoredRun) => Effect.Effect<MemoryState, RuntimeUnavailable>,
  ) =>
    Effect.gen(function* () {
      const current = [...state.fanOuts.values()].find((fanOut) =>
        fanOut.members.some((member) => member.childRunId === child.runId),
      )
      if (current === undefined) {
        return child.parentRunId === undefined ? state : yield* promoteChildCapacity(state, child.parentRunId)
      }
      const memberIndex = current.members.findIndex((member) => member.childRunId === child.runId)
      if (memberIndex < 0) return state
      if (["succeeded", "failed", "cancelled", "abandoned"].includes(current.members[memberIndex]!.status)) {
        return yield* promoteChildCapacity(state, current.parentRunId)
      }
      let members = [...current.members]
      members[memberIndex] = settleFanOutMember(members[memberIndex]!, event)
      const settledFanOuts = new Map(state.fanOuts)
      settledFanOuts.set(current.fanOutId, { ...current, members })
      let next: MemoryState = { ...state, fanOuts: settledFanOuts }
      if (current.status !== "running") {
        return yield* promoteChildCapacity(next, current.parentRunId)
      }
      const succeeded = members.filter((member) => member.status === "succeeded").length
      const failed = members.filter((member) => member.status === "failed").length
      const cancelled = members.filter((member) => member.status === "cancelled").length
      const unsettled = members.filter((member) => member.status === "pending" || member.status === "running").length
      const cancellingParent = next.runs.get(current.parentRunId)
      if (cancellingParent?.cancellationRequested === true) {
        const fanOuts = new Map(next.fanOuts)
        fanOuts.set(current.fanOutId, {
          ...current,
          status: unsettled === 0 ? "cancelled" : "running",
          members,
        })
        return { ...next, fanOuts }
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
          const settledChild = next.runs.get(run.runId)
          if (parent !== undefined && settledChild !== undefined) {
            next = yield* admitChildSettlement(next, { parent, child: settledChild, event: cancelledEvent })
          }
          if (parent !== undefined && settledChild !== undefined && !isTerminal(parent.status)) {
            const runs = new Map(next.runs)
            runs.set(run.runId, { ...settledChild, childReadiness: "settled" })
            const [, readinessChanged] = yield* appendLifecycle(
              { ...next, runs },
              parent.runId,
              makeChildReadinessChanged(run.runId, "settled"),
            )
            const [, settled] = yield* appendLifecycle(
              readinessChanged,
              parent.runId,
              makeChildSettled(run.runId, cancelledEvent.eventId),
            )
            next = settled
          }
          members[index] = {
            ...member,
            readiness: "settled",
            status: "cancelled",
            terminalEventId: cancelledEvent.eventId,
            reason: "fan-out remainder",
          }
        }
      }
      const fanOuts = new Map(next.fanOuts)
      fanOuts.set(current.fanOutId, { ...current, status: joined ?? "running", members })
      next = { ...next, fanOuts }
      next = yield* promoteChildCapacity(next, current.parentRunId)
      members = [...next.fanOuts.get(current.fanOutId)!.members]
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
        const pendingParent = next.runs.get(current.parentRunId)
        const hasOtherRunningFanOut = [...next.fanOuts.values()].some(
          (fanOut) => fanOut.parentRunId === current.parentRunId && fanOut.status === "running",
        )
        if (
          pendingParent?.pendingOutcome !== undefined &&
          !pendingParent.cancellationRequested &&
          !hasOtherRunningFanOut
        ) {
          next = yield* settlePending(next, pendingParent)
        }
        let resumeParent = next.runs.get(current.parentRunId)
        if (
          resumeParent !== undefined &&
          !isTerminal(resumeParent.status) &&
          resumeParent.activeWaitId !== undefined &&
          groupIdFromSuspension(resumeParent.suspension) === current.fanOutId
        ) {
          const group = next.fanOuts.get(current.fanOutId)!
          const resolution = {
            _tag: "Signal" as const,
            name: resumeParent.activeWaitId,
            payload: resultFromInspection(group),
          }
          const closedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
          const runs = new Map(next.runs)
          const { ownerId: _, ...releasedParent } = resumeParent
          runs.set(resumeParent.runId, {
            ...releasedParent,
            wait: { ...resumeParent.wait!, status: "signaled", resolution, closedAt },
          })
          const [, resumed] = yield* appendLifecycle(
            { ...next, runs },
            resumeParent.runId,
            makeResumed(resumeParent.activeWaitId, resolution),
            "running",
          )
          next = resumed
          resumeParent = next.runs.get(current.parentRunId)
        }
        const operationEntry = [...next.programOperations.entries()].find(
          ([, operation]) => operation.fanOutId === current.fanOutId && operation.status === "waiting",
        )
        if (
          operationEntry !== undefined &&
          resumeParent !== undefined &&
          !isTerminal(resumeParent.status) &&
          resumeParent.activeWaitId === operationEntry[1].waitId
        ) {
          const [operationKey, operation] = operationEntry
          const resolution = { _tag: "Signal" as const, name: operation.waitId! }
          const closedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
          const runs = new Map(next.runs)
          const { ownerId: _, ...releasedParent } = resumeParent
          runs.set(resumeParent.runId, {
            ...releasedParent,
            wait: { ...resumeParent.wait!, status: "signaled", resolution, closedAt },
          })
          const programOperations = new Map(next.programOperations)
          programOperations.set(operationKey, { ...operation, status: "running" })
          const [, resumed] = yield* appendLifecycle(
            { ...next, runs, programOperations },
            resumeParent.runId,
            makeResumed(operation.waitId!, resolution),
            "running",
          )
          next = resumed
        }
      }
      return next
    }),
)
