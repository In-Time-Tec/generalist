import { DateTime, Effect } from "effect"
import { groupIdFromSuspension, resultFromInspection } from "../../../child/group.js"
import { isTerminal } from "../../../run.js"
import { appendLifecycle, resumedEvent } from "../../append.js"
import type { RuntimeUnavailable } from "../../../errors.js"
import type { MemoryState, StoredFanOut, StoredRun } from "../../state.js"
import type { RemainderAction } from "./remainder.js"

interface MemberCounts {
  readonly succeeded: number
  readonly failed: number
  readonly cancelled: number
  readonly abandoned: number
}

export interface CompletionInput {
  readonly state: MemoryState
  readonly fanOut: StoredFanOut
  readonly joined: "succeeded" | "failed"
  readonly remainder: ReadonlyArray<RemainderAction>
  readonly settlePending: (state: MemoryState, parent: StoredRun) => Effect.Effect<MemoryState, RuntimeUnavailable>
}

const memberCounts = (fanOut: StoredFanOut): MemberCounts => ({
  succeeded: fanOut.members.filter((member) => member.status === "succeeded").length,
  failed: fanOut.members.filter((member) => member.status === "failed").length,
  cancelled: fanOut.members.filter((member) => member.status === "cancelled").length,
  abandoned: fanOut.members.filter((member) => member.status === "abandoned").length,
})

const joinedEvent = (input: CompletionInput) => ({
  _tag: "FanOutJoined" as const,
  fanOutId: input.fanOut.fanOutId,
  status: input.joined,
  ...memberCounts(input.fanOut),
  remainder: input.remainder,
})

const emitJoined = (input: CompletionInput): Effect.Effect<MemoryState, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const parent = input.state.runs.get(input.fanOut.parentRunId)
    if (parent === undefined || isTerminal(parent.status)) return input.state
    const [, emitted] = yield* appendLifecycle(input.state, parent.runId, joinedEvent(input))
    return emitted
  })

const settlePendingParent = (input: CompletionInput): Effect.Effect<MemoryState, RuntimeUnavailable> => {
  const parent = input.state.runs.get(input.fanOut.parentRunId)
  const hasRunningFanOut = [...input.state.fanOuts.values()].some(
    (fanOut) => fanOut.parentRunId === input.fanOut.parentRunId && fanOut.status === "running",
  )
  return parent?.pendingOutcome !== undefined && !parent.cancellationRequested && !hasRunningFanOut
    ? input.settlePending(input.state, parent)
    : Effect.succeed(input.state)
}

const resumeGroupWait = (input: CompletionInput): Effect.Effect<MemoryState, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const parent = input.state.runs.get(input.fanOut.parentRunId)
    if (
      parent === undefined ||
      isTerminal(parent.status) ||
      parent.activeWaitId === undefined ||
      parent.wait === undefined ||
      groupIdFromSuspension(parent.suspension) !== input.fanOut.fanOutId
    ) {
      return input.state
    }
    const group = input.state.fanOuts.get(input.fanOut.fanOutId)
    if (group === undefined) return input.state
    const resolution = {
      _tag: "Signal" as const,
      name: parent.activeWaitId,
      payload: resultFromInspection(group),
    }
    const closedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const runs = new Map(input.state.runs)
    const { ownerId: _, ...releasedParent } = parent
    runs.set(parent.runId, { ...releasedParent, wait: { ...parent.wait, status: "signaled", resolution, closedAt } })
    const [, resumed] = yield* appendLifecycle(
      { ...input.state, runs },
      parent.runId,
      resumedEvent(parent.activeWaitId, resolution),
      "running",
    )
    return resumed
  })

const resumeProgramOperation = (input: CompletionInput): Effect.Effect<MemoryState, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const parent = input.state.runs.get(input.fanOut.parentRunId)
    const operationEntry = [...input.state.programOperations.entries()].find(
      ([, operation]) => operation.fanOutId === input.fanOut.fanOutId && operation.status === "waiting",
    )
    if (
      operationEntry === undefined ||
      parent === undefined ||
      isTerminal(parent.status) ||
      parent.activeWaitId !== operationEntry[1].waitId ||
      parent.wait === undefined
    ) {
      return input.state
    }
    const [operationKey, operation] = operationEntry
    const operationWaitId = operation.waitId
    if (operationWaitId === undefined) return input.state
    const resolution = { _tag: "Signal" as const, name: operationWaitId }
    const closedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const runs = new Map(input.state.runs)
    const { ownerId: _, ...releasedParent } = parent
    runs.set(parent.runId, { ...releasedParent, wait: { ...parent.wait, status: "signaled", resolution, closedAt } })
    const programOperations = new Map(input.state.programOperations)
    programOperations.set(operationKey, { ...operation, status: "running" })
    const [, resumed] = yield* appendLifecycle(
      { ...input.state, runs, programOperations },
      parent.runId,
      resumedEvent(operationWaitId, resolution),
      "running",
    )
    return resumed
  })

export const completeJoin = (input: CompletionInput): Effect.Effect<MemoryState, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const emitted = yield* emitJoined(input)
    const settled = yield* settlePendingParent({ ...input, state: emitted })
    const resumed = yield* resumeGroupWait({ ...input, state: settled })
    return yield* resumeProgramOperation({ ...input, state: resumed })
  })
