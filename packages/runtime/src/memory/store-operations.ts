import { Effect, Function, Schema } from "effect"
import { OperationResolutionConflict, RunNotFound, RunTerminal, RuntimeUnavailable } from "../errors.js"
import { isTerminal } from "../run.js"
import type { CommitModelResponseInput, OperationCompletionOutcome, RecordOperationInput } from "../run-store.js"
import { canBlindRetry, type OperationRecord, type OperationStatus } from "../sql/operations.js"
import { makeUnknown, appendAgentEvent, appendLifecycle, rejectIfTerminal } from "./append.js"
import { Option } from "effect"
import { operationKeyMapKey, operationMapKey, type MemoryState } from "./state.js"
import { checkpointRef } from "../executable-manifest.js"
import { digest as resolutionDigest, type ResolveOperationInput } from "../operation-resolution.js"
import { sameModelResponseEvent, validateModelResponseCommit } from "../model-response-commit.js"

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
      for (const entryId of input.steeringEntryIds ?? []) {
        const entry = run.steering.find((candidate) => candidate.entryId === entryId)
        if (entry?.consumedOperationId !== byKey.operationId) {
          return yield* RuntimeUnavailable.make({ message: `steering entry ${entryId} does not belong to operation` })
        }
      }
      return [byKey, state] as const
    }
    for (const entryId of input.steeringEntryIds ?? []) {
      const entry = run.steering.find((candidate) => candidate.entryId === entryId)
      if (entry === undefined || entry.consumedOperationId !== undefined) {
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
      ...(input.transcript === undefined ? {} : { transcript: input.transcript }),
      ...(input.continuation === undefined || input.continuation === null ? {} : { continuation: input.continuation }),
      steering: run.steering.map((entry) =>
        (input.steeringEntryIds ?? []).includes(entry.entryId)
          ? {
              entryId: entry.entryId,
              runId: entry.runId,
              sequence: entry.sequence,
              idempotencyKey: entry.idempotencyKey,
              digest: entry.digest,
              prompt: entry.prompt,
              consumedOperationId: operationId,
            }
          : entry,
      ),
    }
    if (input.continuation === null) {
      const { continuation: _, ...withoutContinuation } = updatedRun
      runs.set(run.runId, withoutContinuation)
    } else {
      runs.set(run.runId, updatedRun)
    }
    let next: MemoryState = { ...state, nextOperationCounter: state.nextOperationCounter + 1, operations, runs }
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
      yield* getRun(state, input.runId)
      const current = state.operations.get(operationMapKey(input.runId, input.operationId))
      if (current === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
      if (current.status === "succeeded" || current.status === "failed" || current.status === "unknown") {
        return [current, state] as const
      }
      const run = yield* getRun(state, input.runId)
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
        ...(input.transcript === undefined ? {} : { transcript: input.transcript }),
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
      const next = { ...state, operations, runs }
      if (input.outcome._tag !== "Unknown") return [record, next] as const
      const [, unknown] = yield* appendLifecycle(next, run.runId, makeUnknown(input.operationId), "needs-resolution")
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
      return [current, state] as const
    }
    if (current.status === "failed" || current.status === "unknown")
      return yield* RuntimeUnavailable.make({
        message: `model operation ${input.operationId} already completed as ${current.status}`,
      })
    const [record, completed] = yield* completeOperation(state, input)
    const [, appended] = yield* appendAgentEvent(completed, input.runId, input.event)
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
        "needs-resolution",
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

export const resolveOperation: {
  (
    input: ResolveOperationInput,
  ): (state: MemoryState) => Effect.Effect<MemoryState, RunNotFound | OperationResolutionConflict | RuntimeUnavailable>
  (
    state: MemoryState,
    input: ResolveOperationInput,
  ): Effect.Effect<MemoryState, RunNotFound | OperationResolutionConflict | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: ResolveOperationInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const current = state.operations.get(operationMapKey(input.runId, input.operationId))
    const conflict = () =>
      OperationResolutionConflict.make({
        runId: input.runId,
        operationId: input.operationId,
        idempotencyKey: input.idempotencyKey,
      })
    if (current === undefined) return yield* conflict()
    if (current.resolutionIdempotencyKey !== undefined) {
      if (
        current.resolutionIdempotencyKey === input.idempotencyKey &&
        current.resolution !== undefined &&
        resolutionDigest(current.resolution) === resolutionDigest(input.resolution)
      ) {
        return state
      }
      return yield* conflict()
    }
    if (run.status !== "needs-resolution" || current.status !== "unknown") return yield* conflict()
    const resolved = { resolutionIdempotencyKey: input.idempotencyKey, resolution: input.resolution }
    const record: OperationRecord =
      input.resolution._tag === "Succeeded"
        ? { ...current, ...resolved, status: "succeeded", result: input.resolution.value }
        : input.resolution._tag === "Failed"
          ? { ...current, ...resolved, status: "failed", error: input.resolution.error }
          : { ...current, ...resolved, status: "requested" }
    const operations = new Map(state.operations)
    operations.set(operationMapKey(input.runId, input.operationId), record)
    operations.set(operationKeyMapKey(input.runId, record.operationKey), record)
    const runs = new Map(state.runs)
    const { ownerId: _, ...withoutOwner } = run
    runs.set(run.runId, { ...withoutOwner, status: "running" })
    return { ...state, operations, runs }
  }),
)
