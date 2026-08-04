import { Effect } from "effect"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../errors.js"
import { isTerminal } from "../run.js"
import type { RecordOperationInput } from "../run-store.js"
import { canBlindRetry, type OperationRecord, type OperationStatus } from "../sql/operations.js"
import { makeUnknown, appendAgentEvent, appendLifecycle, rejectIfTerminal } from "./append.js"
import { Option } from "effect"
import { operationKeyMapKey, operationMapKey, type MemoryState } from "./state.js"

const getRun = (state: MemoryState, runId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

export const recordOperation = (
  state: MemoryState,
  input: RecordOperationInput,
): Effect.Effect<readonly [OperationRecord, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable> =>
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
  })

export const startOperation = (
  state: MemoryState,
  input: { readonly runId: string; readonly operationId: string },
): Effect.Effect<readonly [OperationRecord, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable> =>
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
  })

export const succeedOperation = (
  state: MemoryState,
  input: { readonly runId: string; readonly operationId: string; readonly result: unknown },
): Effect.Effect<readonly [OperationRecord, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable> =>
  Effect.gen(function* () {
    yield* getRun(state, input.runId)
    const current = state.operations.get(operationMapKey(input.runId, input.operationId))
    if (current === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    if (current.status === "succeeded" || current.status === "failed" || current.status === "unknown") {
      return [current, state] as const
    }
    const record: OperationRecord = { ...current, status: "succeeded", result: input.result }
    const operations = new Map(state.operations)
    operations.set(operationMapKey(input.runId, input.operationId), record)
    operations.set(operationKeyMapKey(input.runId, record.operationKey), record)
    return [record, { ...state, operations }] as const
  })

export const failOperation = (
  state: MemoryState,
  input: { readonly runId: string; readonly operationId: string; readonly error: unknown },
): Effect.Effect<readonly [OperationRecord, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable> =>
  Effect.gen(function* () {
    yield* getRun(state, input.runId)
    const current = state.operations.get(operationMapKey(input.runId, input.operationId))
    if (current === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    if (current.status === "succeeded" || current.status === "failed" || current.status === "unknown") {
      return [current, state] as const
    }
    const record: OperationRecord = { ...current, status: "failed", error: input.error }
    const operations = new Map(state.operations)
    operations.set(operationMapKey(input.runId, input.operationId), record)
    operations.set(operationKeyMapKey(input.runId, record.operationKey), record)
    return [record, { ...state, operations }] as const
  })

export const expireRunningOperation = (
  state: MemoryState,
  input: { readonly runId: string; readonly operationId: string },
): Effect.Effect<
  readonly [
    { readonly record: OperationRecord; readonly outcome: "retried" | "unknown" | OperationStatus },
    MemoryState,
  ],
  RunNotFound | RuntimeUnavailable
> =>
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
  })

export const getOperation = (
  state: MemoryState,
  input: { readonly runId: string; readonly operationId: string },
): Effect.Effect<OperationRecord, RunNotFound | RuntimeUnavailable> =>
  Effect.gen(function* () {
    yield* getRun(state, input.runId)
    const current = state.operations.get(operationMapKey(input.runId, input.operationId))
    if (current === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    return current
  })

export const getOperationByKey = (
  state: MemoryState,
  input: { readonly runId: string; readonly operationKey: string },
) =>
  Effect.gen(function* () {
    yield* getRun(state, input.runId)
    return state.operations.get(operationKeyMapKey(input.runId, input.operationKey))
  })
