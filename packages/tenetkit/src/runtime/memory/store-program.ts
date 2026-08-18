import { Effect, Function } from "effect"
import { ProgramCapabilities } from "tenetkit"
import {
  FanOutConflict,
  FanOutInvalid,
  OperationResolutionConflict,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
} from "../errors.js"
import { StaleClaim } from "../sql/errors.js"
import type {
  CompleteProgramInput,
  ProgramOperationRecord,
  ReserveProgramOperationInput,
  SettleProgramOperationInput,
  ProgramStoreFailure,
  ProgramOperationOutcome,
  AdmitProgramAgentsInput,
  SuspendProgramOperationInput,
  CommitProgramLogInput,
} from "../program-store.js"
import type { CompletionOutcome } from "../run-store.js"
import { complete, suspend } from "./store-control.js"
import type { MemoryState } from "./state.js"
import { admitFanOut } from "./store-fan-out.js"
import { appendLifecycle } from "./append.js"
import type { LifecycleEvent, RunEventBase } from "../run-event.js"
import type { ResolveOperationInput } from "../operation-resolution.js"
import { digest as resolutionDigest } from "../operation-resolution.js"

const key = (runId: string, operation: string) => `${runId}\0${operation}`

const sameJson = (left: unknown, right: unknown) =>
  (JSON.stringify(left) ?? "null") === (JSON.stringify(right) ?? "null")

/**
 * A settle whose outcome equals the recorded terminal outcome is an idempotent replay.
 * Any other settle of a terminal operation is a stale commit and must not report success.
 */
const idempotentReplay = (existing: ProgramOperationRecord, outcome: ProgramOperationOutcome): boolean =>
  existing.status === "succeeded"
    ? outcome._tag === "Succeeded" && sameJson(outcome.value, existing.result)
    : existing.status === "failed"
      ? outcome._tag === "Failed" && sameJson(outcome.error, existing.error)
      : outcome._tag === "Unknown"

const requireRun = (state: MemoryState, runId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

export const reserveProgramOperation: {
  (
    input: ReserveProgramOperationInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<
    readonly [ProgramOperationRecord, MemoryState],
    RunNotFound | RunTerminal | RuntimeUnavailable | ProgramStoreFailure
  >
  (
    state: MemoryState,
    input: ReserveProgramOperationInput,
  ): Effect.Effect<
    readonly [ProgramOperationRecord, MemoryState],
    RunNotFound | RunTerminal | RuntimeUnavailable | ProgramStoreFailure
  >
} = Function.dual(2, (state: MemoryState, input: ReserveProgramOperationInput) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled")
      return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    const existing = state.programOperations.get(key(input.runId, input.operation))
    if (existing !== undefined) {
      if (
        existing.kind !== input.kind ||
        existing.capability !== input.capability ||
        existing.inputDigest !== input.inputDigest ||
        existing.replay !== input.replay
      ) {
        return yield* ProgramCapabilities.ProgramReplayDivergence.make({
          operation: input.operation,
          expected: existing.inputDigest,
          actual: input.inputDigest,
        })
      }
      if (existing.status === "unknown")
        return yield* ProgramCapabilities.ProgramOperationUnknown.make({ operation: input.operation })
      return [existing, state] as const
    }
    const current = state.programStates.get(input.runId) ?? {
      runId: input.runId,
      programPin: input.programPin,
      budget: input.budget,
      deadlineMillis: input.nowMillis + input.budget.wallClockMillis,
      toolCalls: 0,
      agentRuns: 0,
      tokens: 0,
      logBytes: 0,
      activeSlots: 0,
    }
    if (current.programPin !== input.programPin)
      return yield* ProgramCapabilities.ProgramReplayDivergence.make({
        operation: input.operation,
        expected: current.programPin,
        actual: input.programPin,
      })
    if (input.nowMillis > current.deadlineMillis)
      return yield* ProgramCapabilities.ProgramBudgetExhausted.make({
        dimension: "wallClockMillis",
        limit: input.budget.wallClockMillis,
      })
    const dimensions = [
      ["toolCalls", input.reservation.toolCalls ?? 0, input.budget.toolCalls],
      ["agentRuns", input.reservation.agentRuns ?? 0, input.budget.agentRuns],
      ["logBytes", input.reservation.logBytes ?? 0, input.budget.logBytes],
      ["activeSlots", input.reservation.activeSlots ?? 0, input.budget.concurrency],
    ] as const
    for (const [field, amount, limit] of dimensions) {
      if (current[field] + amount > limit)
        return yield* ProgramCapabilities.ProgramBudgetExhausted.make({
          dimension: field === "activeSlots" ? "concurrency" : field,
          limit,
        })
    }
    const nextState = {
      ...current,
      toolCalls: current.toolCalls + (input.reservation.toolCalls ?? 0),
      agentRuns: current.agentRuns + (input.reservation.agentRuns ?? 0),
      logBytes: current.logBytes + (input.reservation.logBytes ?? 0),
      activeSlots: current.activeSlots + (input.reservation.activeSlots ?? 0),
    }
    const record: ProgramOperationRecord = {
      runId: input.runId,
      operation: input.operation,
      kind: input.kind,
      capability: input.capability,
      inputDigest: input.inputDigest,
      input: input.input,
      replay: input.replay,
      status: "reserved",
      childRunIds: [],
    }
    const programStates = new Map(state.programStates)
    programStates.set(input.runId, nextState)
    const programOperations = new Map(state.programOperations)
    programOperations.set(key(input.runId, input.operation), record)
    return [record, { ...state, programStates, programOperations }] as const
  }),
)

export const resolveProgramOperation: {
  (
    input: ResolveOperationInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<MemoryState, OperationResolutionConflict | RunNotFound | RuntimeUnavailable, never>
  (
    state: MemoryState,
    input: ResolveOperationInput,
  ): Effect.Effect<MemoryState, OperationResolutionConflict | RunNotFound | RuntimeUnavailable, never>
} = Function.dual(2, (state: MemoryState, input: ResolveOperationInput) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    const mapKey = key(input.runId, input.operationId)
    const current = state.programOperations.get(mapKey)
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
      )
        return state
      return yield* conflict()
    }
    if (run.status !== "needs-resolution" || current.status !== "unknown") return yield* conflict()
    const resolved = { resolutionIdempotencyKey: input.idempotencyKey, resolution: input.resolution }
    const record: ProgramOperationRecord =
      input.resolution._tag === "Succeeded"
        ? { ...current, ...resolved, status: "succeeded", result: input.resolution.value }
        : input.resolution._tag === "Failed"
          ? { ...current, ...resolved, status: "failed", error: input.resolution.error }
          : { ...current, ...resolved, status: "reserved" }
    const programOperations = new Map(state.programOperations)
    programOperations.set(mapKey, record)
    const runs = new Map(state.runs)
    const { ownerId: _, ...withoutOwner } = run
    runs.set(run.runId, { ...withoutOwner, status: run.cancellationRequested ? "cancelling" : "running" })
    return { ...state, programOperations, runs }
  }),
)

export const settleProgramOperation: {
  (
    input: SettleProgramOperationInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<
    readonly [ProgramOperationRecord, MemoryState],
    RunNotFound | RuntimeUnavailable | StaleClaim,
    never
  >
  (
    state: MemoryState,
    input: SettleProgramOperationInput,
  ): Effect.Effect<readonly [ProgramOperationRecord, MemoryState], RunNotFound | RuntimeUnavailable | StaleClaim, never>
} = Function.dual(2, (state: MemoryState, input: SettleProgramOperationInput) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    const mapKey = key(input.runId, input.operation)
    const existing = state.programOperations.get(mapKey)
    if (existing === undefined)
      return yield* RuntimeUnavailable.make({ message: `Program operation ${input.operation} is missing` })
    if (["succeeded", "failed", "unknown"].includes(existing.status)) {
      if (idempotentReplay(existing, input.outcome)) return [existing, state] as const
      return yield* StaleClaim.make({ runId: input.runId, workerId: input.ownerId, attemptFence: input.attemptFence })
    }
    const current = state.programStates.get(input.runId)
    if (current === undefined) return yield* RuntimeUnavailable.make({ message: "Program state is missing" })
    const tokens = input.outcome._tag === "Succeeded" ? (input.outcome.tokens ?? 0) : 0
    const tokenFailure =
      current.tokens + tokens > current.budget.tokens
        ? ProgramCapabilities.ProgramBudgetExhausted.make({ dimension: "tokens", limit: current.budget.tokens })
        : undefined
    const outcome = tokenFailure === undefined ? input.outcome : { _tag: "Failed" as const, error: tokenFailure }
    const record: ProgramOperationRecord = {
      ...existing,
      status: outcome._tag === "Succeeded" ? "succeeded" : outcome._tag === "Failed" ? "failed" : "unknown",
      ...(outcome._tag === "Succeeded" ? { result: outcome.value } : {}),
      ...(outcome._tag === "Failed" ? { error: outcome.error } : {}),
    }
    const programStates = new Map(state.programStates)
    programStates.set(input.runId, {
      ...current,
      tokens: current.tokens + tokens,
      activeSlots: Math.max(0, current.activeSlots - input.releaseSlots),
    })
    const programOperations = new Map(state.programOperations)
    programOperations.set(mapKey, record)
    const next = { ...state, programStates, programOperations }
    if (outcome._tag !== "Unknown") return [record, next] as const
    const [, unresolved] = yield* appendLifecycle(
      next,
      input.runId,
      { _tag: "OperationUnknown", operationId: input.operation },
      run.cancellationRequested ? "cancelling" : "needs-resolution",
    )
    return [record, unresolved] as const
  }),
)

export const admitProgramAgents: {
  (
    input: AdmitProgramAgentsInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<
    readonly [ProgramOperationRecord, MemoryState],
    | import("../errors.js").ChildSelectionMissing
    | FanOutConflict
    | FanOutInvalid
    | RunNotFound
    | RunTerminal
    | RuntimeUnavailable
    | ProgramStoreFailure,
    never
  >
  (
    state: MemoryState,
    input: AdmitProgramAgentsInput,
  ): Effect.Effect<
    readonly [ProgramOperationRecord, MemoryState],
    | import("../errors.js").ChildSelectionMissing
    | FanOutConflict
    | FanOutInvalid
    | RunNotFound
    | RunTerminal
    | RuntimeUnavailable
    | ProgramStoreFailure,
    never
  >
} = Function.dual(2, (state: MemoryState, input: AdmitProgramAgentsInput) =>
  Effect.gen(function* () {
    const [reserved, reservedState] = yield* reserveProgramOperation(state, input)
    if (reserved.childRunIds.length > 0) return [reserved, reservedState] as const
    const [receipt, admittedState] = yield* admitFanOut(reservedState, input.fanOut)
    const record: ProgramOperationRecord = {
      ...reserved,
      status: "waiting",
      waitId: input.wait.waitId,
      fanOutId: receipt.fanOutId,
      childRunIds: [...receipt.childRunIds],
    }
    const programOperations = new Map(admittedState.programOperations)
    programOperations.set(key(input.runId, input.operation), record)
    const waitingState = yield* suspend(
      { ...admittedState, programOperations },
      { ...input, suspension: input.suspension, wait: input.wait, checkpoint: { _tag: "Program", version: "1" } },
    )
    return [record, waitingState] as const
  }),
)

export const suspendProgramOperation: {
  (
    input: SuspendProgramOperationInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<
    readonly [ProgramOperationRecord, MemoryState],
    RunNotFound | RunTerminal | RuntimeUnavailable | ProgramStoreFailure,
    never
  >
  (
    state: MemoryState,
    input: SuspendProgramOperationInput,
  ): Effect.Effect<
    readonly [ProgramOperationRecord, MemoryState],
    RunNotFound | RunTerminal | RuntimeUnavailable | ProgramStoreFailure,
    never
  >
} = Function.dual(2, (state: MemoryState, input: SuspendProgramOperationInput) =>
  Effect.gen(function* () {
    const [reserved, reservedState] = yield* reserveProgramOperation(state, input)
    if (reserved.status === "waiting") return [reserved, reservedState] as const
    const record: ProgramOperationRecord = { ...reserved, status: "waiting", waitId: input.wait.waitId }
    const programOperations = new Map(reservedState.programOperations)
    programOperations.set(key(input.runId, input.operation), record)
    const waiting = yield* suspend(
      { ...reservedState, programOperations },
      {
        ...input,
        suspension: input.suspension,
        wait: input.wait,
        ...(input.checkpoint === undefined ? {} : { checkpoint: input.checkpoint }),
      },
    )
    return [record, waiting] as const
  }),
)

export const commitProgramLog: {
  (
    input: CommitProgramLogInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<
    readonly [ProgramOperationRecord, MemoryState],
    RunNotFound | RuntimeUnavailable | StaleClaim | ProgramStoreFailure,
    never
  >
  (
    state: MemoryState,
    input: CommitProgramLogInput,
  ): Effect.Effect<
    readonly [ProgramOperationRecord, MemoryState],
    RunNotFound | RuntimeUnavailable | StaleClaim | ProgramStoreFailure,
    never
  >
} = Function.dual(2, (state: MemoryState, input: CommitProgramLogInput) =>
  Effect.gen(function* () {
    const [existing, reserved] = yield* reserveProgramOperation(state, input)
    if (existing.status === "succeeded") return [existing, state] as const
    const [, logged] = yield* appendLifecycle(reserved, input.runId, {
      _tag: "ProgramLog",
      operation: input.operation,
      level: input.level,
      message: input.message,
      ...(input.data === undefined ? {} : { data: input.data }),
    } satisfies Omit<Extract<LifecycleEvent, { readonly _tag: "ProgramLog" }>, keyof RunEventBase>)
    return yield* settleProgramOperation(logged, {
      ...input,
      outcome: { _tag: "Succeeded", value: undefined },
      releaseSlots: 0,
    })
  }),
)

export const startProgramOperation: {
  (input: {
    readonly runId: string
    readonly operation: string
  }): (
    state: MemoryState,
  ) => Effect.Effect<readonly [ProgramOperationRecord, MemoryState], RunNotFound | RuntimeUnavailable, never>
  (
    state: MemoryState,
    input: { readonly runId: string; readonly operation: string },
  ): Effect.Effect<readonly [ProgramOperationRecord, MemoryState], RunNotFound | RuntimeUnavailable, never>
} = Function.dual(2, (state: MemoryState, input: { readonly runId: string; readonly operation: string }) =>
  Effect.gen(function* () {
    yield* requireRun(state, input.runId)
    const mapKey = key(input.runId, input.operation)
    const existing = state.programOperations.get(mapKey)
    if (existing === undefined)
      return yield* RuntimeUnavailable.make({ message: `Program operation ${input.operation} is missing` })
    if (existing.status !== "reserved") return [existing, state] as const
    const record: ProgramOperationRecord = { ...existing, status: "running" }
    const programOperations = new Map(state.programOperations)
    programOperations.set(mapKey, record)
    return [record, { ...state, programOperations }] as const
  }),
)

export const completeProgram: {
  (
    input: CompleteProgramInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<
    readonly [CompletionOutcome, MemoryState],
    RunNotFound | RunTerminal | RuntimeUnavailable | InstanceType<typeof ProgramCapabilities.ProgramBudgetExhausted>
  >
  (
    state: MemoryState,
    input: CompleteProgramInput,
  ): Effect.Effect<
    readonly [CompletionOutcome, MemoryState],
    RunNotFound | RunTerminal | RuntimeUnavailable | InstanceType<typeof ProgramCapabilities.ProgramBudgetExhausted>
  >
} = Function.dual(2, (state: MemoryState, input: CompleteProgramInput) =>
  Effect.gen(function* () {
    if (input.outputBytes > input.outputLimit)
      return yield* ProgramCapabilities.ProgramBudgetExhausted.make({
        dimension: "outputBytes",
        limit: input.outputLimit,
      })
    const next = yield* complete(state, { runId: input.runId, result: { _tag: "Program", value: input.output } })
    return [{ _tag: "Completed" } satisfies CompletionOutcome, next] as const
  }),
)
