import type { CommitModelResponseInput } from "../model-response-commit.js"
import type { CommitInterruptedModelResponseInput } from "../model-response-interrupted.js"
import { Effect, Function, Schema } from "effect"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../errors.js"
import { isTerminal } from "../run.js"
import type { OperationCompletionOutcome, RecordOperationInput } from "../run-store.js"
import { canBlindRetry, type OperationRecord, type OperationStatus } from "../sql/operations.js"
import { makeUnknown, appendAgentEvent, appendLifecycle, rejectIfTerminal } from "./append.js"
import { Option } from "effect"
import { operationKeyMapKey, operationMapKey, type MemoryState } from "./state.js"
import { checkpointRef } from "../executable-manifest.js"
import { completedSessionEntry, sameModelResponseEvent, validateModelResponseCommit } from "../model-response-commit.js"
import {
  sameInterruptedModelOutcome,
  sameInterruptedModelResponse,
  validateInterruptedModelResponse,
} from "../model-response-interrupted.js"
import {
  appendCompletedSessionEntry,
  appendHandoffSessionEntry,
  appendInterruptedSessionEntry,
  verifyCompletedSessionEntry,
  verifyHandoffSessionEntry,
  verifyInterruptedSessionEntry,
} from "./session-store.js"
import { handoffSessionEntry, isHandoffCommit, sameHandoffCheckpoint, sameHandoffCommit } from "../handoff-session.js"

const getRun = (state: MemoryState, runId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
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
      if (consumed.length !== retried.length || consumed.some((entryId, index) => entryId !== retried[index])) {
        return yield* RuntimeUnavailable.make({ message: "steering consumption does not match operation" })
      }
      return [byKey, state] as const
    }
    const steeringEntryIds = input.steeringEntryIds ?? []
    const selected = run.steering
      .filter((entry) => entry.consumedOperationId === undefined && entry.discardedReason === undefined)
      .slice(0, steeringEntryIds.length)
      .map((entry) => entry.entryId)
    if (
      selected.length !== steeringEntryIds.length ||
      selected.some((entryId, index) => entryId !== steeringEntryIds[index])
    ) {
      return yield* RuntimeUnavailable.make({ message: "steering entries are not in pending order" })
    }
    for (const entryId of steeringEntryIds) {
      const entry = run.steering.find((candidate) => candidate.entryId === entryId)
      if (entry === undefined || entry.consumedOperationId !== undefined || entry.discardedReason !== undefined) {
        return yield* RuntimeUnavailable.make({ message: `steering entry ${entryId} is not pending` })
      }
    }
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
    const updatedRun = {
      ...run,
      executableRef,
      ...(input.checkpoint === undefined ? {} : { checkpoint: input.checkpoint }),
      ...(input.continuation === undefined || input.continuation === null ? {} : { continuation: input.continuation }),
      steering: run.steering.map((entry) =>
        steeringEntryIds.includes(entry.entryId) ? { ...entry, consumedOperationId: operationId } : entry,
      ),
    }
    if (input.continuation === null) {
      const { continuation: _, ...withoutContinuation } = updatedRun
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
    readonly checkpoint?: import("../execution-state.js").ExecutionCheckpoint
    readonly transcript?: import("effect/unstable/ai").Prompt.Prompt
    readonly continuation?: import("../steering.js").ExecutionContinuation | null
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
      readonly checkpoint?: import("../execution-state.js").ExecutionCheckpoint
      readonly transcript?: import("effect/unstable/ai").Prompt.Prompt
      readonly continuation?: import("../steering.js").ExecutionContinuation | null
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
      readonly checkpoint?: import("../execution-state.js").ExecutionCheckpoint
      readonly transcript?: import("effect/unstable/ai").Prompt.Prompt
      readonly continuation?: import("../steering.js").ExecutionContinuation | null
      readonly steeringEntryIds?: ReadonlyArray<string>
    },
  ) =>
    Effect.gen(function* () {
      const run = yield* getRun(state, input.runId)
      const current = state.operations.get(operationMapKey(input.runId, input.operationId))
      if (current === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
      if (current.status === "succeeded" || current.status === "failed" || current.status === "unknown") {
        if (current.kind === "handoff" && current.status === "succeeded" && isHandoffCommit(current.result)) {
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
        }
        return [current, state] as const
      }
      for (const entryId of input.steeringEntryIds ?? []) {
        const entry = run.steering.find((candidate) => candidate.entryId === entryId)
        if (entry?.consumedOperationId !== input.operationId) {
          return yield* RuntimeUnavailable.make({ message: `steering entry ${entryId} does not belong to operation` })
        }
      }
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
      const record: OperationRecord =
        input.outcome._tag === "Succeeded"
          ? { ...current, status: "succeeded", result: input.outcome.value }
          : input.outcome._tag === "Failed"
            ? { ...current, status: "failed", error: input.outcome.error }
            : { ...current, status: "unknown" }
      const operations = new Map(state.operations)
      operations.set(operationMapKey(input.runId, input.operationId), record)
      operations.set(operationKeyMapKey(input.runId, record.operationKey), record)
      const updatedRun = {
        ...run,
        executableRef,
        ...(input.checkpoint === undefined ? {} : { checkpoint: input.checkpoint }),
        ...(input.continuation === undefined || input.continuation === null
          ? {}
          : { continuation: input.continuation }),
      }
      const runs = new Map(state.runs)
      if (input.continuation === null) {
        const { continuation: _, ...withoutContinuation } = updatedRun
        runs.set(run.runId, withoutContinuation)
      } else {
        runs.set(run.runId, updatedRun)
      }
      const next = { ...withSession, operations, runs }
      if (input.outcome._tag !== "Unknown") return [record, next] as const
      const [, unknown] = yield* appendLifecycle(
        next,
        run.runId,
        makeUnknown(input.operationId),
        run.cancellationRequested ? "cancelling" : "needs-resolution",
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
    const validated = validateModelResponseCommit({ record: current, input })
    if (Schema.is(RuntimeUnavailable)(validated)) return yield* validated
    const sessionEntry = completedSessionEntry({
      runId: input.runId,
      sessionId: run.message.sessionId,
      operation: validated,
      event: input.event,
    })
    if (Schema.is(RuntimeUnavailable)(sessionEntry)) return yield* sessionEntry
    if (current.status === "succeeded") {
      const priorInput = { ...input, outcome: { _tag: "Succeeded" as const, value: current.result } }
      const priorValidation = validateModelResponseCommit({ record: current, input: priorInput })
      if (Schema.is(RuntimeUnavailable)(priorValidation)) return yield* priorValidation
      const prior = run.events.find(
        (event) => event._tag === "ModelResponseCommitted" && event.operationKey === input.event.operationKey,
      )
      if (
        prior === undefined ||
        prior._tag !== "ModelResponseCommitted" ||
        !sameModelResponseEvent({ left: prior, right: input.event })
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
    const [record, completed] = yield* completeOperation(withSession, input)
    const [, appended] = yield* appendAgentEvent(completed, input.runId, input.event)
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
    const sessionEntry = validateInterruptedModelResponse({
      runId: input.runId,
      sessionId: run.message.sessionId,
      record: current,
      outcome: input.outcome,
      event: input.event,
    })
    if (Schema.is(RuntimeUnavailable)(sessionEntry)) return yield* sessionEntry
    if (current.status === "failed") {
      if (!sameInterruptedModelOutcome({ left: { _tag: "Failed", error: current.error }, right: input.outcome })) {
        return yield* RuntimeUnavailable.make({
          message: `model operation ${input.operationId} has a divergent interrupted outcome retry`,
        })
      }
      const prior = run.events.find(
        (event) => event._tag === "ModelResponseInterrupted" && event.operationKey === input.event.operationKey,
      )
      if (
        prior === undefined ||
        prior._tag !== "ModelResponseInterrupted" ||
        !sameInterruptedModelResponse({ left: prior, right: input.event })
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
    const [, appended] = yield* appendAgentEvent({ ...withSession, operations }, input.runId, input.event)
    return [record, appended] as const
  }),
)

export const expireRunningOperation: {
  (input: {
    readonly runId: string
    readonly operationId: string
  }): (
    state: MemoryState,
  ) => Effect.Effect<
    readonly [
      { readonly record: OperationRecord; readonly outcome: "retried" | "unknown" | OperationStatus },
      MemoryState,
    ],
    RunNotFound | RuntimeUnavailable
  >
  (
    state: MemoryState,
    input: { readonly runId: string; readonly operationId: string },
  ): Effect.Effect<
    readonly [
      { readonly record: OperationRecord; readonly outcome: "retried" | "unknown" | OperationStatus },
      MemoryState,
    ],
    RunNotFound | RuntimeUnavailable
  >
} = Function.dual(2, (state: MemoryState, input: { readonly runId: string; readonly operationId: string }) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const current = state.operations.get(operationMapKey(input.runId, input.operationId))
    if (current === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    if (current.status !== "running") {
      return [{ record: current, outcome: current.status }, state] as const
    }
    if (canBlindRetry(current.replayPolicy)) {
      const record: OperationRecord = { ...current, status: "requested" }
      const operations = new Map(state.operations)
      operations.set(operationMapKey(input.runId, input.operationId), record)
      operations.set(operationKeyMapKey(input.runId, record.operationKey), record)
      return [
        { record, outcome: "retried" as const },
        { ...state, operations },
      ] as const
    }
    const record: OperationRecord = { ...current, status: "unknown" }
    const operations = new Map(state.operations)
    operations.set(operationMapKey(input.runId, input.operationId), record)
    operations.set(operationKeyMapKey(input.runId, record.operationKey), record)
    if (!isTerminal(run.status)) {
      const [, next] = yield* appendLifecycle(
        { ...state, operations },
        run.runId,
        makeUnknown(input.operationId),
        run.cancellationRequested ? "cancelling" : "needs-resolution",
      )
      return [{ record, outcome: "unknown" as const }, next] as const
    }
    return [
      { record, outcome: "unknown" as const },
      { ...state, operations },
    ] as const
  }),
)

export const getOperation: {
  (input: {
    readonly runId: string
    readonly operationId: string
  }): (state: MemoryState) => Effect.Effect<OperationRecord, RunNotFound | RuntimeUnavailable>
  (
    state: MemoryState,
    input: { readonly runId: string; readonly operationId: string },
  ): Effect.Effect<OperationRecord, RunNotFound | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: { readonly runId: string; readonly operationId: string }) =>
  Effect.gen(function* () {
    yield* getRun(state, input.runId)
    const current = state.operations.get(operationMapKey(input.runId, input.operationId))
    if (current === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    return current
  }),
)

export const getOperationByKey: {
  (input: {
    readonly runId: string
    readonly operationKey: string
  }): (state: MemoryState) => Effect.Effect<OperationRecord | undefined, RunNotFound | RuntimeUnavailable, never>
  (
    state: MemoryState,
    input: { readonly runId: string; readonly operationKey: string },
  ): Effect.Effect<OperationRecord | undefined, RunNotFound | RuntimeUnavailable, never>
} = Function.dual(2, (state: MemoryState, input: { readonly runId: string; readonly operationKey: string }) =>
  Effect.gen(function* () {
    yield* getRun(state, input.runId)
    return state.operations.get(operationKeyMapKey(input.runId, input.operationKey))
  }),
)
