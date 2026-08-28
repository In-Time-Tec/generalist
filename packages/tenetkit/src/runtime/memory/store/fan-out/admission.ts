import { Effect, Function } from "effect"
import { make as makeAddress } from "../../../address.js"
import {
  FanOutConflict,
  FanOutInvalid,
  ChildSelectionMissing,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  ChildDepthExceeded,
  ChildLimitExceeded,
} from "../../../errors.js"
import {
  digestFanOut,
  validateAdmission,
  type AdmitFanOutInput,
  type FanOutMemberResult,
  type FanOutReceipt,
  type StoredFanOutMember,
} from "../../../child/fan-out.js"
import { make as makeMessage } from "../../../messaging/message.js"
import { isTerminal } from "../../../run.js"
import type { MemoryState, StoredFanOut, StoredRun } from "../../state.js"

import { appendLifecycle, acceptedEvent, childLinkedEvent } from "../../append.js"
import { resolveChild } from "../../../executable/manifest.js"
import { narrow } from "../../../executable/registration.js"
import { activeChildCount } from "../child/capacity.js"
const fanOutAdmittedEvent = (input: {
  readonly fanOutId: string
  readonly memberCount: number
  readonly concurrency: number
  readonly join: StoredFanOut["join"]
  readonly remainder: StoredFanOut["remainder"]
}) => ({ _tag: "FanOutAdmitted" as const, ...input })

type AdmissionFailure =
  | FanOutConflict
  | FanOutInvalid
  | ChildSelectionMissing
  | RunNotFound
  | RunTerminal
  | RuntimeUnavailable
  | ChildDepthExceeded
  | ChildLimitExceeded

interface AdmissionPlan {
  readonly depth: number
  readonly concurrency: number
  readonly readyCount: number
}

const linkedDetailsFor = (member: StoredFanOutMember, readiness: FanOutMemberResult["readiness"]) => {
  const base = { readiness, key: member.key }
  if (member.label !== undefined && member.origin !== undefined)
    return { ...base, label: member.label, origin: member.origin }
  if (member.label !== undefined) return { ...base, label: member.label }
  if (member.origin !== undefined) return { ...base, origin: member.origin }
  return base
}

const memberResultFor = (
  member: StoredFanOutMember,
  depth: number,
  readiness: FanOutMemberResult["readiness"],
  status: FanOutMemberResult["status"],
): FanOutMemberResult => {
  const base = {
    ordinal: member.ordinal,
    key: member.key,
    selection: member.selection,
    prompt: member.prompt,
    childRunId: member.childRunId,
    depth,
    readiness,
    status,
  }
  if (member.label !== undefined && member.origin !== undefined)
    return { ...base, label: member.label, origin: member.origin }
  if (member.label !== undefined) return { ...base, label: member.label }
  if (member.origin !== undefined) return { ...base, origin: member.origin }
  return base
}

const resolveMembers = (
  parent: StoredRun,
  input: AdmitFanOutInput,
): Effect.Effect<ReadonlyArray<StoredFanOutMember>, ChildSelectionMissing> =>
  Effect.gen(function* () {
    const members: Array<StoredFanOutMember> = []
    for (const member of input.members) {
      const executableRef = resolveChild(parent.executableRef, parent.executableManifest, member.selection)
      if (executableRef === undefined) {
        return yield* ChildSelectionMissing.make({ parentRunId: parent.runId, selection: member.selection })
      }
      members.push({ ...member, executableRef })
    }
    return members
  })

const validateParent = (
  state: MemoryState,
  parent: StoredRun,
  members: ReadonlyArray<StoredFanOutMember>,
  requestedConcurrency: number | undefined,
): Effect.Effect<Pick<AdmissionPlan, "depth" | "concurrency" | "readyCount">, AdmissionFailure> =>
  Effect.gen(function* () {
    if (parent.pendingOutcome !== undefined)
      return yield* FanOutInvalid.make({ message: `parent Run ${parent.runId} has a pending outcome` })
    if (parent.status === "cancelling")
      return yield* FanOutInvalid.make({ message: `parent Run ${parent.runId} is cancelling` })
    if (isTerminal(parent.status)) return yield* RunTerminal.make({ runId: parent.runId, status: parent.status })
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
    const concurrency = Math.min(requestedConcurrency ?? members.length, members.length, parent.treePolicy.maxSubagents)
    const readyCount = Math.min(
      concurrency,
      Math.max(0, parent.treePolicy.maxSubagents - activeChildCount(state, parent)),
    )
    return { depth, concurrency, readyCount }
  })

const addMember = (
  state: MemoryState,
  parent: StoredRun,
  member: StoredFanOutMember,
  input: AdmitFanOutInput,
  depth: number,
  readyCount: number,
): Effect.Effect<readonly [FanOutMemberResult, MemoryState], RuntimeUnavailable> =>
  Effect.gen(function* () {
    const ready = member.ordinal < readyCount
    const readiness: FanOutMemberResult["readiness"] = ready ? "ready" : "queued"
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
    const runs = new Map(state.runs)
    const currentParent = runs.get(parent.runId)
    if (currentParent === undefined)
      return yield* RuntimeUnavailable.make({ message: `parent Run ${parent.runId} missing` })
    runs.set(member.childRunId, child)
    runs.set(parent.runId, { ...currentParent, children: [...currentParent.children, member.childRunId] })
    const linkedDetails = linkedDetailsFor(member, readiness)
    const [, linked] = yield* appendLifecycle(
      { ...state, runs },
      parent.runId,
      childLinkedEvent(
        member.childRunId,
        `${input.fanOutId}:${member.key}`,
        member.selection,
        member.prompt,
        depth,
        linkedDetails,
      ),
    )
    const [, accepted] = yield* appendLifecycle(linked, member.childRunId, acceptedEvent(address, message.id), "queued")
    const result = memberResultFor(member, depth, readiness, ready ? "running" : "pending")
    return [result, accepted]
  })
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
    const members = yield* resolveMembers(parent, input)
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
      ]
    }
    const { concurrency, depth, readyCount } = yield* validateParent(state, parent, members, input.concurrency)
    let next: MemoryState = state
    const memberResults: Array<FanOutMemberResult> = []
    for (const member of members) {
      const [memberResult, memberState] = yield* addMember(next, parent, member, input, depth, readyCount)
      memberResults.push(memberResult)
      next = memberState
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
      fanOutAdmittedEvent({
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
    ]
  }),
)
