import { Effect, Function, Option, Schema } from "effect"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../../errors.js"
import type { OperationCompletionOutcome, RecordOperationInput } from "../../../run/store.js"
import type { OperationRecord, OperationStatus } from "../../../sql/operations.js"
import { appendAgentEvent, appendLifecycle, rejectIfTerminal } from "../../append.js"
import { operationKeyMapKey, operationMapKey, type MemoryState } from "../../state.js"
import { checkpointRef } from "../../../executable/manifest.js"
import {
  sameModelResponseEvent,
  validateModelResponseCommit,
  type CommitModelResponseInput,
} from "../../../execution/model-response/commit.js"
import {
  sameInterruptedModelOutcome,
  sameInterruptedModelResponse,
  validateInterruptedModelResponse,
  type CommitInterruptedModelResponseInput,
} from "../../../execution/model-response/interrupted.js"
import {
  appendCompletedSessionEntry,
  appendHandoffSessionEntry,
  appendInterruptedSessionEntry,
  verifyCompletedSessionEntry,
  verifyHandoffSessionEntry,
  verifyInterruptedSessionEntry,
} from "../../session-store.js"
import {
  handoffSessionEntry,
  isHandoffCommit,
  sameHandoffCheckpoint,
  sameHandoffCommit,
} from "../../../session/handoff.js"

const getRun = (state: MemoryState, runId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

const operationUnknownEvent = (operationId: string) => ({ _tag: "OperationUnknown" as const, operationId })

const sameEntries = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length && left.every((entryId, index) => entryId === right[index])

type StoredRun = MemoryState["runs"] extends ReadonlyMap<string, infer Run> ? Run : never

const steeringProblem = (run: StoredRun, entryIds: ReadonlyArray<string>): string | undefined => {
  const selected = run.steering
    .filter((entry) => entry.consumedOperationId === undefined && entry.discardedReason === undefined)
    .slice(0, entryIds.length)
    .map((entry) => entry.entryId)
  if (selected.length !== entryIds.length || selected.some((entryId, index) => entryId !== entryIds[index])) {
    return "steering entries are not in pending order"
  }
  for (const entryId of entryIds) {
    const entry = run.steering.find((candidate) => candidate.entryId === entryId)
    if (entry === undefined || entry.consumedOperationId !== undefined || entry.discardedReason !== undefined) {
      return `steering entry ${entryId} is not pending`
    }
  }
  return undefined
}

const completionSteeringProblem = (run: StoredRun, operationId: string, entryIds: ReadonlyArray<string>) => {
  const wrong = entryIds.find(
    (entryId) => run.steering.find((candidate) => candidate.entryId === entryId)?.consumedOperationId !== operationId,
  )
  return wrong === undefined ? undefined : `steering entry ${wrong} does not belong to operation`
}

const isCompletedOperation = (status: OperationStatus): boolean =>
  status === "cancelling" ||
  status === "cancelled" ||
  status === "succeeded" ||
  status === "failed" ||
  status === "unknown"

const verifyCompletedHandoffRetry = (
  state: MemoryState,
  run: StoredRun,
  current: OperationRecord,
  input: Parameters<typeof completeOperation>[1],
) =>
  Effect.gen(function* () {
    if (current.kind !== "handoff" || current.status !== "succeeded" || !isHandoffCommit(current.result)) return
    if (
      input.outcome._tag !== "Succeeded" ||
      !sameHandoffCommit(current.result, input.outcome.value) ||
      !sameHandoffCheckpoint(run.checkpoint, input.checkpoint)
    ) {
      return yield* RuntimeUnavailable.make({ message: "handoff operation has a divergent completion retry" })
    }
    const entry = handoffSessionEntry({
      sessionId: run.message.sessionId,
      operationKey: current.operationKey,
      value: input.outcome.value,
    })
    if (Schema.is(RuntimeUnavailable)(entry)) return yield* entry
    yield* verifyHandoffSessionEntry({ state, entry }).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    )
  })

const completedRecord = (current: OperationRecord, outcome: OperationCompletionOutcome): OperationRecord => {
  switch (outcome._tag) {
    case "Succeeded":
      return { ...current, status: "succeeded", result: outcome.value }
    case "Failed":
      return { ...current, status: "failed", error: outcome.error }
    case "Unknown":
      return { ...current, status: "unknown" }
  }
}

export const recordOperation: {
  (
    input: RecordOperationInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<readonly [OperationRecord, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable>
  (
    state: MemoryState,
    input: RecordOperationInput,
  ): Effect.Effect<readonly [OperationRecord, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: RecordOperationInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    const byKey = state.operations.get(operationKeyMapKey(input.runId, input.operationKey))
    if (byKey !== undefined) {
      const consumed = run.steering
        .filter((entry) => entry.consumedOperationId === byKey.operationId)
        .map((entry) => entry.entryId)
      const retried = input.steeringEntryIds ?? []
      if (!sameEntries(consumed, retried)) {
        return yield* RuntimeUnavailable.make({ message: "steering consumption does not match operation" })
      }
      return [byKey, state] as const
    }
    if (run.cancellationRequested) {
      return yield* RuntimeUnavailable.make({ message: `run ${run.runId} is cancelling` })
    }
    const steeringEntryIds = input.steeringEntryIds ?? []
    const problem = steeringProblem(run, steeringEntryIds)
    if (problem !== undefined) return yield* RuntimeUnavailable.make({ message: problem })
    const operationId = `op_${state.nextOperationCounter}`
    const executableRef = yield* Effect.try({
      try: () => checkpointRef(run.executableRef, run.executableManifest, input.checkpoint),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    const record: OperationRecord = {
      runId: input.runId,
      operationId,
      operationKey: input.operationKey,
      kind: input.kind,
      status: "requested",
      inputDigest: input.inputDigest,
      input: input.input,
      replayPolicy: input.replayPolicy,
      attempt: input.attempt,
    }
    const operations = new Map(state.operations)
    operations.set(operationMapKey(input.runId, operationId), record)
    operations.set(operationKeyMapKey(input.runId, input.operationKey), record)
    const runs = new Map(state.runs)
    const { checkpoint: _, ...withoutCheckpoint } = run
    const updatedRun: {
      checkpoint?: typeof input.checkpoint
      continuation?: Exclude<typeof input.continuation, null>
      steering: typeof run.steering
    } & typeof withoutCheckpoint = {
      ...withoutCheckpoint,
      executableRef,
      steering: run.steering.map((entry) =>
        steeringEntryIds.includes(entry.entryId) ? { ...entry, consumedOperationId: operationId } : entry,
      ),
    }
    if (input.checkpoint !== undefined) updatedRun.checkpoint = input.checkpoint
    if (input.continuation !== undefined && input.continuation !== null) updatedRun.continuation = input.continuation
    if (input.continuation === null) {
      const { continuation: _continuation, ...withoutContinuation } = updatedRun
      runs.set(run.runId, withoutContinuation)
    } else {
      runs.set(run.runId, updatedRun)
    }
    let next: MemoryState = { ...state, nextOperationCounter: state.nextOperationCounter + 1, operations, runs }
    if (steeringEntryIds.length > 0) {
      const [, consumed] = yield* appendLifecycle(next, input.runId, {
        _tag: "SteeringConsumed",
        entryIds: steeringEntryIds,
        operationId,
      })
      next = consumed
    }
    for (const event of input.steeringEvents ?? []) {
      const [, appended] = yield* appendAgentEvent(next, input.runId, event)
      next = appended
    }
    return [record, next] as const
  }),
)

export const startOperation: {
  (input: {
    readonly runId: string
    readonly operationId: string
  }): (
    state: MemoryState,
  ) => Effect.Effect<readonly [OperationRecord, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable>
  (
    state: MemoryState,
    input: { readonly runId: string; readonly operationId: string },
  ): Effect.Effect<readonly [OperationRecord, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: { readonly runId: string; readonly operationId: string }) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    if (run.cancellationRequested) {
      return yield* RuntimeUnavailable.make({ message: `run ${run.runId} is cancelling` })
    }
    const current = state.operations.get(operationMapKey(input.runId, input.operationId))
    if (current === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    if (current.status !== "requested") return [current, state] as const
    const record: OperationRecord = { ...current, status: "running" }
    const operations = new Map(state.operations)
    operations.set(operationMapKey(input.runId, input.operationId), record)
    operations.set(operationKeyMapKey(input.runId, record.operationKey), record)
    return [record, { ...state, operations }] as const
  }),
)

export const completeOperation: {
  (input: {
    readonly runId: string
    readonly ownerId: string
    readonly attemptFence: number
    readonly operationId: string
    readonly outcome: OperationCompletionOutcome
    readonly checkpoint?: import("../../../execution/state.js").ExecutionCheckpoint
    readonly continuation?: import("../../../run/steering.js").ExecutionContinuation | null
    readonly steeringEntryIds?: ReadonlyArray<string>
  }): (
    state: MemoryState,
  ) => Effect.Effect<readonly [OperationRecord, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable>
  (
    state: MemoryState,
    input: {
      readonly runId: string
      readonly ownerId: string
      readonly attemptFence: number
      readonly operationId: string
      readonly outcome: OperationCompletionOutcome
      readonly checkpoint?: import("../../../execution/state.js").ExecutionCheckpoint
      readonly continuation?: import("../../../run/steering.js").ExecutionContinuation | null
      readonly steeringEntryIds?: ReadonlyArray<string>
    },
  ): Effect.Effect<readonly [OperationRecord, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable>
} = Function.dual(
  2,
  (
    state: MemoryState,
    input: {
      readonly runId: string
      readonly ownerId: string
      readonly attemptFence: number
      readonly operationId: string
      readonly outcome: OperationCompletionOutcome
      readonly checkpoint?: import("../../../execution/state.js").ExecutionCheckpoint
      readonly continuation?: import("../../../run/steering.js").ExecutionContinuation | null
      readonly steeringEntryIds?: ReadonlyArray<string>
    },
  ) =>
    Effect.gen(function* () {
      const run = yield* getRun(state, input.runId)
      const current = state.operations.get(operationMapKey(input.runId, input.operationId))
      if (current === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
      if (isCompletedOperation(current.status)) {
        yield* verifyCompletedHandoffRetry(state, run, current, input)
        return [current, state] as const
      }
      const steeringFailure = completionSteeringProblem(run, input.operationId, input.steeringEntryIds ?? [])
      if (steeringFailure !== undefined) return yield* RuntimeUnavailable.make({ message: steeringFailure })
      const executableRef = yield* Effect.try({
        try: () => checkpointRef(run.executableRef, run.executableManifest, input.checkpoint),
        catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
      })
      let withSession = state
      if (current.kind === "handoff" && input.outcome._tag === "Succeeded" && isHandoffCommit(input.outcome.value)) {
        const entry = handoffSessionEntry({
          sessionId: run.message.sessionId,
          operationKey: current.operationKey,
          value: input.outcome.value,
        })
        if (Schema.is(RuntimeUnavailable)(entry)) return yield* entry
        withSession = yield* appendHandoffSessionEntry({ state, entry }).pipe(
          Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
        )
      }
      const record = completedRecord(current, input.outcome)
      const operations = new Map(state.operations)
      operations.set(operationMapKey(input.runId, input.operationId), record)
      operations.set(operationKeyMapKey(input.runId, record.operationKey), record)
      const { checkpoint: _, ...withoutCheckpoint } = run
      const updatedRun: {
        checkpoint?: typeof input.checkpoint
        continuation?: Exclude<typeof input.continuation, null>
      } & typeof withoutCheckpoint = {
        ...withoutCheckpoint,
        executableRef,
      }
      if (input.checkpoint !== undefined) updatedRun.checkpoint = input.checkpoint
      if (input.continuation !== undefined && input.continuation !== null) updatedRun.continuation = input.continuation
      const runs = new Map(state.runs)
      if (input.continuation === null) {
        const { continuation: _continuation, ...withoutContinuation } = updatedRun
        runs.set(run.runId, withoutContinuation)
      } else {
        runs.set(run.runId, updatedRun)
      }
      const next = { ...withSession, operations, runs }
      if (input.outcome._tag !== "Unknown") return [record, next] as const
      const [, unknown] = yield* appendLifecycle(
        next,
        run.runId,
        operationUnknownEvent(input.operationId),
        "needs-resolution",
      )
      return [record, unknown] as const
    }),
)

export const commitModelResponse: {
  (
    input: CommitModelResponseInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<readonly [OperationRecord, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable>
  (
    state: MemoryState,
    input: CommitModelResponseInput,
  ): Effect.Effect<readonly [OperationRecord, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: CommitModelResponseInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const current = state.operations.get(operationMapKey(input.runId, input.operationId))
    if (current === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    const validated = validateModelResponseCommit({ record: current, input, sessionId: run.message.sessionId })
    if (Schema.is(RuntimeUnavailable)(validated)) return yield* validated
    const sessionEntry = validated.entry
    if (current.status === "succeeded") {
      const priorInput = { ...input, outcome: { _tag: "Succeeded" as const, value: current.result } }
      const priorValidation = validateModelResponseCommit({
        record: current,
        input: priorInput,
        sessionId: run.message.sessionId,
      })
      if (Schema.is(RuntimeUnavailable)(priorValidation)) return yield* priorValidation
      const prior = run.events.filter(
        (event) => event._tag === "ModelResponseCommitted" && event.operationKey === input.event.operationKey,
      )
      if (
        prior.length !== 1 ||
        prior[0]?._tag !== "ModelResponseCommitted" ||
        !sameModelResponseEvent({ left: prior[0], right: validated.event })
      )
        return yield* RuntimeUnavailable.make({
          message: `model operation ${input.operationId} has a divergent outbox retry`,
        })
      yield* verifyCompletedSessionEntry({ state, entry: sessionEntry }).pipe(
        Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
      )
      return [current, state] as const
    }
    if (current.status === "failed" || current.status === "unknown")
      return yield* RuntimeUnavailable.make({
        message: `model operation ${input.operationId} already completed as ${current.status}`,
      })
    const withSession = yield* appendCompletedSessionEntry({ state, entry: sessionEntry }).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    )
    const [record, completed] = yield* completeOperation(withSession, {
      ...input,
      outcome: { _tag: "Succeeded", value: validated.reference },
    })
    const [, appended] = yield* appendAgentEvent(completed, input.runId, validated.event)
    return [record, appended] as const
  }),
)

export const commitInterruptedModelResponse: {
  (
    input: CommitInterruptedModelResponseInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<readonly [OperationRecord, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable>
  (
    state: MemoryState,
    input: CommitInterruptedModelResponseInput,
  ): Effect.Effect<readonly [OperationRecord, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: CommitInterruptedModelResponseInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const current = state.operations.get(operationMapKey(input.runId, input.operationId))
    if (current === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    const validated = validateInterruptedModelResponse({
      runId: input.runId,
      sessionId: run.message.sessionId,
      record: current,
      outcome: input.outcome,
      event: input.event,
    })
    if (Schema.is(RuntimeUnavailable)(validated)) return yield* validated
    const sessionEntry = validated.entry
    if (current.status === "failed") {
      if (!sameInterruptedModelOutcome({ left: { _tag: "Failed", error: current.error }, right: input.outcome })) {
        return yield* RuntimeUnavailable.make({
          message: `model operation ${input.operationId} has a divergent interrupted outcome retry`,
        })
      }
      const prior = run.events.filter(
        (event) => event._tag === "ModelResponseInterrupted" && event.operationKey === input.event.operationKey,
      )
      if (
        prior.length !== 1 ||
        prior[0]?._tag !== "ModelResponseInterrupted" ||
        !sameInterruptedModelResponse({ left: prior[0], right: validated.event })
      ) {
        return yield* RuntimeUnavailable.make({
          message: `model operation ${input.operationId} has a divergent interrupted outbox retry`,
        })
      }
      yield* verifyInterruptedSessionEntry({ state, entry: sessionEntry }).pipe(
        Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
      )
      return [current, state] as const
    }
    if (current.status !== "running") {
      return yield* RuntimeUnavailable.make({
        message: `model operation ${input.operationId} cannot commit an interruption from ${current.status}`,
      })
    }
    const withSession = yield* appendInterruptedSessionEntry({ state, entry: sessionEntry }).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    )
    const record: OperationRecord = { ...current, status: "failed", error: input.outcome.error }
    const operations = new Map(withSession.operations)
    operations.set(operationMapKey(input.runId, input.operationId), record)
    operations.set(operationKeyMapKey(input.runId, record.operationKey), record)
    const [, appended] = yield* appendAgentEvent({ ...withSession, operations }, input.runId, validated.event)
    return [record, appended] as const
  }),
)
