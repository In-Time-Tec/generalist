import { Effect, Function, Schema } from "effect"
import {
  ProgramBudgetExhausted,
  ProgramOperationUnknown,
  ProgramReplayDivergence,
} from "../../../core/program/capabilities.js"
import {
  FanOutConflict,
  FanOutInvalid,
  OperationResolutionConflict,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
} from "../../errors.js"
import { StaleClaim } from "../../sql/errors.js"
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
} from "../../program/store.js"
import type { CompletionOutcome } from "../../run/store.js"
import { complete, suspend } from "./control.js"
import type { MemoryState } from "../state.js"
import { revokeRunSession, revokeSession } from "./execution.js"

const isTerminalStatus = (status: import("../../run.js").RunStatus): status is "succeeded" | "failed" | "cancelled" =>
  status === "succeeded" || status === "failed" || status === "cancelled"
import { admitFanOut } from "./fan-out/service.js"
import { appendLifecycle } from "../append.js"
import type { LifecycleEvent, RunEventBase } from "../../run/event.js"
import { digest as resolutionDigest, type ResolveOperationInput } from "../../operation/resolution.js"

const key = (runId: string, operation: string) => `${runId}\0${operation}`

const PersistedValue = Schema.Unknown
type PersistedValue = typeof PersistedValue.Type

const sameJson = (left: PersistedValue, right: PersistedValue) =>
  (JSON.stringify(left) ?? "null") === (JSON.stringify(right) ?? "null")

/**
 * A settle whose outcome equals the recorded terminal outcome is an idempotent replay.
 * Any other settle of a terminal operation is a stale commit and must not report success.
 */
const idempotentReplay = (existing: ProgramOperationRecord, outcome: ProgramOperationOutcome): boolean => {
  const result = Schema.decodeUnknownSync(PersistedValue)(existing.result)
  const error = Schema.decodeUnknownSync(PersistedValue)(existing.error)
  if (existing.status === "succeeded") return outcome._tag === "Succeeded" && sameJson(outcome.value, result)
  if (existing.status === "failed") return outcome._tag === "Failed" && sameJson(outcome.error, error)
  return outcome._tag === "Unknown"
}

const requireRun = (state: MemoryState, runId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

const incompatibleReservation = (existing: ProgramOperationRecord, input: ReserveProgramOperationInput) =>
  existing.kind !== input.kind ||
  existing.capability !== input.capability ||
  existing.inputDigest !== input.inputDigest ||
  existing.replay !== input.replay

const exhaustedDimension = (
  current: MemoryState["programStates"] extends ReadonlyMap<string, infer State> ? State : never,
  input: ReserveProgramOperationInput,
) => {
  const dimensions = [
    ["toolCalls", input.reservation.toolCalls ?? 0, input.budget.toolCalls],
    ["agentRuns", input.reservation.agentRuns ?? 0, input.budget.agentRuns],
    ["logBytes", input.reservation.logBytes ?? 0, input.budget.logBytes],
    ["activeSlots", input.reservation.activeSlots ?? 0, input.budget.concurrency],
  ] as const
  return dimensions.find(([field, amount, limit]) => current[field] + amount > limit)
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
    if (isTerminalStatus(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    const existing = state.programOperations.get(key(input.runId, input.operation))
    if (existing !== undefined) {
      if (incompatibleReservation(existing, input)) {
        return yield* ProgramReplayDivergence.make({
          operation: input.operation,
          expected: existing.inputDigest,
          actual: input.inputDigest,
        })
      }
      if (existing.status === "unknown") return yield* ProgramOperationUnknown.make({ operation: input.operation })
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
      return yield* ProgramReplayDivergence.make({
        operation: input.operation,
        expected: current.programPin,
        actual: input.programPin,
      })
    if (input.nowMillis > current.deadlineMillis)
      return yield* ProgramBudgetExhausted.make({
        dimension: "wallClockMillis",
        limit: input.budget.wallClockMillis,
      })
    const exhausted = exhaustedDimension(current, input)
    if (exhausted !== undefined) {
      const [field, , limit] = exhausted
      return yield* ProgramBudgetExhausted.make({
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
    let record: ProgramOperationRecord
    if (input.resolution._tag === "Succeeded") {
      record = { ...current, ...resolved, status: "succeeded", result: input.resolution.value }
    } else if (input.resolution._tag === "Failed") {
      record = { ...current, ...resolved, status: "failed", error: input.resolution.error }
    } else record = { ...current, ...resolved, status: "reserved" }
    const programOperations = new Map(state.programOperations)
    programOperations.set(mapKey, record)
    const runs = new Map(state.runs)
    const { ownerId: _, ...withoutOwner } = run
    const hasUnknown =
      [...programOperations.values()].some(
        (operation) => operation.runId === input.runId && operation.status === "unknown",
      ) ||
      [...state.operations.values()].some(
        (operation) => operation.runId === input.runId && operation.status === "unknown",
      )
    let status: "needs-resolution" | "cancelling" | "running" = "running"
    if (hasUnknown) status = "needs-resolution"
    else if (run.cancellationRequested) status = "cancelling"
    runs.set(run.runId, {
      ...withoutOwner,
      status,
    })
    return { ...revokeRunSession(state, run.runId), programOperations, runs }
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
    yield* requireRun(state, input.runId)
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
        ? ProgramBudgetExhausted.make({ dimension: "tokens", limit: current.budget.tokens })
        : undefined
    const outcome = tokenFailure === undefined ? input.outcome : { _tag: "Failed" as const, error: tokenFailure }
    let record: ProgramOperationRecord = {
      ...existing,
      status: "unknown",
    }
    if (outcome._tag === "Succeeded") {
      record = { ...record, status: "succeeded", result: outcome.value }
    } else if (outcome._tag === "Failed") {
      record = { ...record, status: "failed", error: outcome.error }
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
      "needs-resolution",
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
    | import("../../errors.js").ChildSelectionMissing
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
    | import("../../errors.js").ChildSelectionMissing
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
      { ...input, suspension: input.suspension, waits: [input.wait], checkpoint: { _tag: "Program", version: "1" } },
    )
    return [record, revokeSession(waitingState, input)] as const
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
        waits: [input.wait],
      },
    )
    return [record, revokeSession(waiting, input)] as const
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
    let logEvent: Omit<Extract<LifecycleEvent, { readonly _tag: "ProgramLog" }>, keyof RunEventBase> = {
      _tag: "ProgramLog",
      operation: input.operation,
      level: input.level,
      message: input.message,
    }
    if (input.data !== undefined) logEvent = { ...logEvent, data: input.data }
    const [, logged] = yield* appendLifecycle(reserved, input.runId, logEvent)
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
    RunNotFound | RunTerminal | RuntimeUnavailable | InstanceType<typeof ProgramBudgetExhausted>
  >
  (
    state: MemoryState,
    input: CompleteProgramInput,
  ): Effect.Effect<
    readonly [CompletionOutcome, MemoryState],
    RunNotFound | RunTerminal | RuntimeUnavailable | InstanceType<typeof ProgramBudgetExhausted>
  >
} = Function.dual(2, (state: MemoryState, input: CompleteProgramInput) =>
  Effect.gen(function* () {
    if (input.outputBytes > input.outputLimit)
      return yield* ProgramBudgetExhausted.make({
        dimension: "outputBytes",
        limit: input.outputLimit,
      })
    const next = yield* complete(state, { runId: input.runId, result: { _tag: "Program", value: input.output } })
    return [{ _tag: "Completed" } satisfies CompletionOutcome, revokeSession(next, input)] as const
  }),
)
