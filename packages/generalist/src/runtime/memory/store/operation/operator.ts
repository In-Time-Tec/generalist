import { Effect, Function, Schema } from "effect"
import { digest } from "../../../../core/durable/pin.js"
import { IllegalOperatorAction, RunNotFound, RuntimeUnavailable } from "../../../errors.js"
import {
  explain,
  type Action,
  ActionRecord,
  type Journal,
  type ResolveUnknownInput,
  type RetryInput,
  type WakeInput,
} from "../../../execution/recovery/operator.js"
import { canBlindRetry, type OperationRecord } from "../../../sql/operations.js"
import { operationKeyMapKey, operationMapKey, runWaits, type MemoryState, type StoredRun } from "../../state.js"
import { revokeRunSession } from "../execution.js"
import { signal } from "../control/wait.js"
import { resolveOperation } from "./resolution.js"
import { resolveProgramOperation } from "../program.js"

const requireRun = (state: MemoryState, runId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

const journalUnsafe = (state: MemoryState, run: StoredRun): Journal => {
  const operations: Array<Journal["operations"][number]> = []
  const actions: Array<Journal["actions"][number]> = []
  for (const [key, operation] of state.operations) {
    if (!key.startsWith(`${run.runId}\0`)) continue
    if (operation.kind === "operator") {
      const decoded = Schema.decodeUnknownOption(ActionRecord)(operation.input)
      if (decoded._tag === "Some") actions.push({ operationId: operation.operationId, ...decoded.value })
      continue
    }
    operations.push({
      operationId: operation.operationId,
      status: operation.status,
      replay: canBlindRetry(operation.replayPolicy) ? "safe" : "never",
      attempt: operation.attempt,
    })
  }
  for (const operation of state.programOperations.values()) {
    if (operation.runId !== run.runId) continue
    operations.push({
      operationId: operation.operation,
      status: operation.status,
      replay: operation.replay === "idempotent" ? "safe" : "never",
      attempt: run.attempt,
    })
  }
  const failed = run.events.findLast((event) => event._tag === "RunFailed")
  const result: Journal = {
    runId: run.runId,
    status: run.status,
    lastSequence: run.lastSequence,
    waits: runWaits(state, run.runId),
    operations,
    actions,
  }
  if (run.suspension !== undefined) Object.assign(result, { suspension: run.suspension })
  if (failed?._tag === "RunFailed") Object.assign(result, { failure: failed.error })
  return result
}

export const journal: {
  (runId: string): (state: MemoryState) => Effect.Effect<Journal, RunNotFound | RuntimeUnavailable>
  (state: MemoryState, runId: string): Effect.Effect<Journal, RunNotFound | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, runId: string) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, runId)
    return journalUnsafe(state, run)
  }),
)

export const appendAction: {
  (runId: string, operator: string, action: Action): (state: MemoryState) => Effect.Effect<MemoryState, RunNotFound>
  (state: MemoryState, runId: string, operator: string, action: Action): Effect.Effect<MemoryState, RunNotFound>
} = Function.dual(
  4,
  (state: MemoryState, runId: string, operator: string, action: Action): Effect.Effect<MemoryState, RunNotFound> => {
    const run = state.runs.get(runId)
    if (run === undefined) return Effect.fail(RunNotFound.make({ runId }))
    const operationId = `op_${state.nextOperationCounter}`
    const input: ActionRecord = { operator, action }
    const record: OperationRecord = {
      runId,
      operationId,
      operationKey: `operator:${operationId}`,
      kind: "operator",
      status: "succeeded",
      inputDigest: digest({ operator, action: action._tag }),
      input,
      result: { decision: explain(journalUnsafe(state, run)).decision },
      replayPolicy: "pure",
      attempt: run.attempt,
    }
    const operations = new Map(state.operations)
    operations.set(operationMapKey(runId, operationId), record)
    operations.set(operationKeyMapKey(runId, record.operationKey), record)
    return Effect.succeed({ ...state, nextOperationCounter: state.nextOperationCounter + 1, operations })
  },
)

const illegal = (state: MemoryState, run: StoredRun, action: string) =>
  IllegalOperatorAction.make({ runId: run.runId, decision: explain(journalUnsafe(state, run)).decision, action })

export const retry: {
  (input: RetryInput): (state: MemoryState) => Effect.Effect<MemoryState, RunNotFound | IllegalOperatorAction>
  (state: MemoryState, input: RetryInput): Effect.Effect<MemoryState, RunNotFound | IllegalOperatorAction>
} = Function.dual(2, (state: MemoryState, input: RetryInput) => {
  const run = state.runs.get(input.runId)
  if (run === undefined) return Effect.fail(RunNotFound.make({ runId: input.runId }))
  const decision = explain(journalUnsafe(state, run)).decision
  if (decision._tag !== "RetryOperation" || decision.operationId !== input.operationId) {
    return Effect.fail(illegal(state, run, "retry"))
  }
  const operations = new Map(state.operations)
  const runtimeOperation = operations.get(operationMapKey(input.runId, input.operationId))
  if (
    runtimeOperation !== undefined &&
    runtimeOperation.status === "running" &&
    canBlindRetry(runtimeOperation.replayPolicy)
  ) {
    const retried: OperationRecord = { ...runtimeOperation, status: "requested" }
    operations.set(operationMapKey(input.runId, input.operationId), retried)
    operations.set(operationKeyMapKey(input.runId, retried.operationKey), retried)
  } else {
    const programOperations = new Map(state.programOperations)
    const key = `${input.runId}\0${input.operationId}`
    const program = programOperations.get(key)
    if (program?.status !== "running" || program.replay !== "idempotent") {
      return Effect.fail(illegal(state, run, "retry"))
    }
    programOperations.set(key, { ...program, status: "reserved" })
    const runs = new Map(state.runs)
    const { ownerId: _, ...released } = run
    runs.set(run.runId, { ...released, status: "running" })
    return appendAction(
      { ...revokeRunSession(state, run.runId), operations, programOperations, runs },
      input.runId,
      input.operator,
      { _tag: "Retry", operationId: input.operationId },
    )
  }
  const runs = new Map(state.runs)
  const { ownerId: _, ...released } = run
  runs.set(run.runId, { ...released, status: "running" })
  return appendAction({ ...revokeRunSession(state, run.runId), operations, runs }, input.runId, input.operator, {
    _tag: "Retry",
    operationId: input.operationId,
  })
})

export const wake: {
  (input: WakeInput): (state: MemoryState) => Effect.Effect<MemoryState, RunNotFound | IllegalOperatorAction>
  (state: MemoryState, input: WakeInput): Effect.Effect<MemoryState, RunNotFound | IllegalOperatorAction>
} = Function.dual(2, (state: MemoryState, input: WakeInput) =>
  Effect.gen(function* () {
    const run = state.runs.get(input.runId)
    if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
    const decision = explain(journalUnsafe(state, run)).decision
    const waits = runWaits(state, input.runId).filter((wait) => wait.status === "open")
    if (
      run.status !== "waiting" ||
      run.suspension === undefined ||
      decision._tag !== "Resume" ||
      waits.some((wait) => wait.reason._tag !== "External")
    ) {
      return yield* illegal(state, run, "wake")
    }
    let next = state
    for (const wait of waits) next = yield* signal(next, { runId: input.runId, name: wait.waitId })
    if (waits.length === 0) {
      const runs = new Map(next.runs)
      const { ownerId: _, ...released } = run
      runs.set(run.runId, { ...released, status: "running" })
      next = { ...revokeRunSession(next, run.runId), runs }
    }
    return yield* appendAction(next, input.runId, input.operator, { _tag: "Wake" })
  }),
)

export const resolveUnknown: {
  (
    input: ResolveUnknownInput,
  ): (state: MemoryState) => Effect.Effect<MemoryState, RunNotFound | IllegalOperatorAction | RuntimeUnavailable>
  (
    state: MemoryState,
    input: ResolveUnknownInput,
  ): Effect.Effect<MemoryState, RunNotFound | IllegalOperatorAction | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: ResolveUnknownInput) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    const explanation = explain(journalUnsafe(state, run))
    const legal = explanation.obligations.some(
      (decision) => decision._tag === "Unknown" && decision.operationId === input.operationId,
    )
    if (!legal) return yield* illegal(state, run, "resolveUnknown")
    const resolutionInput = {
      runId: input.runId,
      operationId: input.operationId,
      idempotencyKey: `operator:${input.operator}:resolve:${input.operationId}`,
      resolution: input.resolution,
    }
    const resolved = yield* (
      state.programOperations.has(`${input.runId}\0${input.operationId}`)
        ? resolveProgramOperation(state, resolutionInput)
        : resolveOperation(state, resolutionInput)
    ).pipe(
      Effect.catchTag("generalist/runtime/OperationResolutionConflict", () =>
        Effect.fail(illegal(state, run, "resolveUnknown")),
      ),
    )
    return yield* appendAction(resolved, input.runId, input.operator, {
      _tag: "ResolveUnknown",
      operationId: input.operationId,
      resolution: input.resolution,
    })
  }),
)
