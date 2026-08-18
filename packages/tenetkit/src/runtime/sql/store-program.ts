import { Effect, Function, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { ProgramCapabilities } from "tenetkit"
import {
  ChildSelectionMissing,
  FanOutConflict,
  FanOutInvalid,
  OperationResolutionConflict,
  RuntimeUnavailable,
} from "../errors.js"
import {
  ProgramOperationRecord,
  ProgramRunState,
  type ReserveProgramOperationInput,
  type SettleProgramOperationInput,
  type ProgramStoreFailure,
  type ProgramOperationOutcome,
  type AdmitProgramAgentsInput,
  type SuspendProgramOperationInput,
  type CommitProgramLogInput,
} from "../program-store.js"
import { StaleClaim } from "./errors.js"
import { StringArray, decodeJson, decodeJsonValue, encodeJsonValue } from "./codecs.js"
import { admitFanOut } from "./store-fan-out.js"
import { appendEvent, loadRun } from "./store-helpers.js"
import type { EventHub } from "./subscribers.js"
import { OperationResolution, type ResolveOperationInput, digest as resolutionDigest } from "../operation-resolution.js"
import type { WorkerMutationError } from "../run-store.js"

interface StateRow {
  readonly run_id: string
  readonly program_pin: string
  readonly budget_json: string
  readonly deadline_millis: number | string
  readonly tool_calls: number | string
  readonly agent_runs: number | string
  readonly tokens: number | string
  readonly log_bytes: number | string
  readonly active_slots: number | string
}

interface OperationRow {
  readonly run_id: string
  readonly operation_name: string
  readonly kind: string
  readonly capability: string
  readonly input_digest: string
  readonly input_json: string
  readonly replay_policy: string
  readonly status: string
  readonly result_json: string | null
  readonly error_json: string | null
  readonly wait_id: string | null
  readonly fan_out_id: string | null
  readonly child_run_ids_json: string
  readonly resolution_idempotency_key: string | null
  readonly resolution_json: string | null
}

const decodeState = (row: StateRow) =>
  Schema.decodeUnknownEffect(ProgramRunState)({
    runId: row.run_id,
    programPin: row.program_pin,
    budget: decodeJsonValue(row.budget_json),
    deadlineMillis: Number(row.deadline_millis),
    toolCalls: Number(row.tool_calls),
    agentRuns: Number(row.agent_runs),
    tokens: Number(row.tokens),
    logBytes: Number(row.log_bytes),
    activeSlots: Number(row.active_slots),
  }).pipe(Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) })))

const decodeOperation = (row: OperationRow) =>
  Schema.decodeUnknownEffect(ProgramOperationRecord)({
    runId: row.run_id,
    operation: row.operation_name,
    kind: row.kind,
    capability: row.capability,
    inputDigest: row.input_digest,
    input: decodeJsonValue(row.input_json),
    replay: row.replay_policy,
    status: row.status,
    ...(row.result_json === null ? {} : { result: decodeJsonValue(row.result_json) }),
    ...(row.error_json === null ? {} : { error: decodeJsonValue(row.error_json) }),
    ...(row.wait_id === null ? {} : { waitId: row.wait_id }),
    ...(row.fan_out_id === null ? {} : { fanOutId: row.fan_out_id }),
    childRunIds: decodeJson(StringArray, row.child_run_ids_json),
    ...(row.resolution_idempotency_key === null ? {} : { resolutionIdempotencyKey: row.resolution_idempotency_key }),
    ...(row.resolution_json === null ? {} : { resolution: decodeJsonValue(row.resolution_json) }),
  }).pipe(Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) })))

const operationRows = (runId: string, operation: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql<OperationRow>`
      SELECT * FROM baton_program_operations WHERE run_id = ${runId} AND operation_name = ${operation}
    `
  })

const sameJson = (left: unknown, right: unknown) =>
  Schema.encodeSync(Schema.UnknownFromJsonString)(left) === Schema.encodeSync(Schema.UnknownFromJsonString)(right)

/**
 * A settle whose outcome equals the recorded terminal outcome is an idempotent replay.
 * Any other settle of a terminal operation is a stale commit and must not report success.
 */
const idempotentReplay = (prior: ProgramOperationRecord, outcome: ProgramOperationOutcome): boolean =>
  prior.status === "succeeded"
    ? outcome._tag === "Succeeded" && sameJson(outcome.value, prior.result)
    : prior.status === "failed"
      ? outcome._tag === "Failed" && sameJson(outcome.error, prior.error)
      : outcome._tag === "Unknown"

export const loadProgramState = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<StateRow>`SELECT * FROM baton_program_runs WHERE run_id = ${runId}`
    return rows[0] === undefined ? undefined : yield* decodeState(rows[0])
  })

export const getProgramOperation = (input: { readonly runId: string; readonly operation: string }) =>
  Effect.gen(function* () {
    const rows = yield* operationRows(input.runId, input.operation)
    return rows[0] === undefined ? undefined : yield* decodeOperation(rows[0])
  })

export const reserveProgramOperation = (
  input: ReserveProgramOperationInput,
): Effect.Effect<ProgramOperationRecord, ProgramStoreFailure | RuntimeUnavailable | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const priorRows = yield* operationRows(input.runId, input.operation)
    if (priorRows[0] !== undefined) {
      const prior = yield* decodeOperation(priorRows[0])
      if (
        prior.kind !== input.kind ||
        prior.capability !== input.capability ||
        prior.inputDigest !== input.inputDigest ||
        prior.replay !== input.replay
      ) {
        return yield* ProgramCapabilities.ProgramReplayDivergence.make({
          operation: input.operation,
          expected: prior.inputDigest,
          actual: input.inputDigest,
        })
      }
      if (prior.status === "unknown")
        return yield* ProgramCapabilities.ProgramOperationUnknown.make({ operation: input.operation })
      return prior
    }
    let state = yield* loadProgramState(input.runId)
    if (state === undefined) {
      yield* sql`
        INSERT INTO baton_program_runs (
          run_id, program_pin, budget_json, deadline_millis, tool_calls, agent_runs, tokens, log_bytes, active_slots
        ) VALUES (
          ${input.runId}, ${input.programPin}, ${encodeJsonValue(input.budget)},
          ${input.nowMillis + input.budget.wallClockMillis}, 0, 0, 0, 0, 0
        )
      `
      state = (yield* loadProgramState(input.runId))!
    }
    if (state.programPin !== input.programPin)
      return yield* ProgramCapabilities.ProgramReplayDivergence.make({
        operation: input.operation,
        expected: state.programPin,
        actual: input.programPin,
      })
    if (input.nowMillis > state.deadlineMillis)
      return yield* ProgramCapabilities.ProgramBudgetExhausted.make({
        dimension: "wallClockMillis",
        limit: state.budget.wallClockMillis,
      })
    const reservations = [
      ["toolCalls", input.reservation.toolCalls ?? 0, state.budget.toolCalls],
      ["agentRuns", input.reservation.agentRuns ?? 0, state.budget.agentRuns],
      ["logBytes", input.reservation.logBytes ?? 0, state.budget.logBytes],
      ["activeSlots", input.reservation.activeSlots ?? 0, state.budget.concurrency],
    ] as const
    for (const [field, amount, limit] of reservations) {
      if (state[field] + amount > limit)
        return yield* ProgramCapabilities.ProgramBudgetExhausted.make({
          dimension: field === "activeSlots" ? "concurrency" : field,
          limit,
        })
    }
    yield* sql`
      UPDATE baton_program_runs SET
        tool_calls = tool_calls + ${input.reservation.toolCalls ?? 0},
        agent_runs = agent_runs + ${input.reservation.agentRuns ?? 0},
        log_bytes = log_bytes + ${input.reservation.logBytes ?? 0},
        active_slots = active_slots + ${input.reservation.activeSlots ?? 0}
      WHERE run_id = ${input.runId}
    `
    yield* sql`
      INSERT INTO baton_program_operations (
        run_id, operation_name, kind, capability, input_digest, input_json, replay_policy,
        status, result_json, error_json, wait_id, fan_out_id, child_run_ids_json
      ) VALUES (
        ${input.runId}, ${input.operation}, ${input.kind}, ${input.capability}, ${input.inputDigest},
        ${encodeJsonValue(input.input)}, ${input.replay}, 'reserved', NULL, NULL, NULL, NULL, '[]'
      )
    `
    return yield* decodeOperation((yield* operationRows(input.runId, input.operation))[0]!)
  })

type ProgramOperation = ProgramOperationRecord
type SettleEffect = Effect.Effect<ProgramOperation, RuntimeUnavailable | SqlError | StaleClaim, SqlClient.SqlClient>
type SuspendProgramEffect = Effect.Effect<
  ProgramOperation,
  ProgramStoreFailure | WorkerMutationError,
  SqlClient.SqlClient
>
type AdmitAgentsEffect = Effect.Effect<
  ProgramOperation,
  | ChildSelectionMissing
  | FanOutConflict
  | FanOutInvalid
  | ProgramStoreFailure
  | WorkerMutationError
  | import("../errors.js").ChildDepthExceeded
  | import("../errors.js").ChildLimitExceeded,
  SqlClient.SqlClient
>
type CommitLogEffect = Effect.Effect<
  ProgramOperation,
  RuntimeUnavailable | SqlError | StaleClaim | ProgramStoreFailure,
  SqlClient.SqlClient
>
type ResolveProgramEffect = Effect.Effect<
  undefined,
  OperationResolutionConflict | RuntimeUnavailable | SqlError,
  SqlClient.SqlClient
>
type CancelProgramEffect = Effect.Effect<void, SqlError, SqlClient.SqlClient>

export const settleProgramOperation: {
  (input: SettleProgramOperationInput): (hub: EventHub) => SettleEffect
  (hub: EventHub, input: SettleProgramOperationInput): SettleEffect
} = Function.dual(2, (hub: EventHub, input: SettleProgramOperationInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const row = (yield* operationRows(input.runId, input.operation))[0]
    if (row === undefined)
      return yield* RuntimeUnavailable.make({ message: `Program operation ${input.operation} is missing` })
    const prior = yield* decodeOperation(row)
    if (["succeeded", "failed", "unknown"].includes(prior.status)) {
      if (idempotentReplay(prior, input.outcome)) return prior
      return yield* StaleClaim.make({ runId: input.runId, workerId: input.ownerId, attemptFence: input.attemptFence })
    }
    const state = yield* loadProgramState(input.runId)
    if (state === undefined) return yield* RuntimeUnavailable.make({ message: "Program state is missing" })
    const tokens = input.outcome._tag === "Succeeded" ? (input.outcome.tokens ?? 0) : 0
    const outcome =
      state.tokens + tokens > state.budget.tokens
        ? {
            _tag: "Failed" as const,
            error: ProgramCapabilities.ProgramBudgetExhausted.make({ dimension: "tokens", limit: state.budget.tokens }),
          }
        : input.outcome
    yield* sql`
      UPDATE baton_program_operations SET
        status = ${outcome._tag === "Succeeded" ? "succeeded" : outcome._tag === "Failed" ? "failed" : "unknown"},
        result_json = ${outcome._tag === "Succeeded" ? encodeJsonValue(outcome.value) : null},
        error_json = ${outcome._tag === "Failed" ? encodeJsonValue(outcome.error) : null}
      WHERE run_id = ${input.runId} AND operation_name = ${input.operation}
        AND status IN ('reserved', 'running', 'waiting')
    `
    yield* sql`
      UPDATE baton_program_runs SET tokens = tokens + ${tokens},
        active_slots = CASE WHEN active_slots >= ${input.releaseSlots} THEN active_slots - ${input.releaseSlots} ELSE 0 END
      WHERE run_id = ${input.runId}
    `
    const record = yield* decodeOperation((yield* operationRows(input.runId, input.operation))[0]!)
    if (outcome._tag !== "Unknown") return record
    const run = yield* loadRun(input.runId)
    if (run === undefined) return yield* RuntimeUnavailable.make({ message: `Run ${input.runId} is missing` })
    yield* appendEvent(
      hub,
      run,
      { _tag: "OperationUnknown", operationId: input.operation },
      run.cancellationRequested ? "cancelling" : "needs-resolution",
    )
    return record
  }),
)

export const resolveProgramOperation: {
  (input: ResolveOperationInput, claimableStatus: "running" | "queued", clearLease?: boolean): ResolveProgramEffect
  (claimableStatus: "running" | "queued", clearLease?: boolean): (input: ResolveOperationInput) => ResolveProgramEffect
} = (
  inputOrClaimable: ResolveOperationInput | string,
  maybeClaimable?: "running" | "queued" | boolean,
  maybeClearLease?: boolean,
): any => {
  if (typeof inputOrClaimable === "string") {
    const claimableStatus = inputOrClaimable as "running" | "queued"
    const clearLease = maybeClaimable as boolean
    return (input: ResolveOperationInput) => resolveProgramOperation(input, claimableStatus, clearLease)
  }
  const input = inputOrClaimable
  const claimableStatus = maybeClaimable
  const clearLease = maybeClearLease ?? false
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(input.runId)
    const row = (yield* operationRows(input.runId, input.operationId))[0]
    const conflict = () =>
      OperationResolutionConflict.make({
        runId: input.runId,
        operationId: input.operationId,
        idempotencyKey: input.idempotencyKey,
      })
    if (run === undefined || row === undefined) return yield* conflict()
    if (row.resolution_idempotency_key !== null) {
      const prior = row.resolution_json === null ? undefined : decodeJson(OperationResolution, row.resolution_json)
      if (
        row.resolution_idempotency_key === input.idempotencyKey &&
        prior !== undefined &&
        resolutionDigest(prior) === resolutionDigest(input.resolution)
      )
        return
      return yield* conflict()
    }
    if (run.status !== "needs-resolution" || row.status !== "unknown") return yield* conflict()
    const resolutionJson = encodeJsonValue(input.resolution)
    const status =
      input.resolution._tag === "Succeeded" ? "succeeded" : input.resolution._tag === "Failed" ? "failed" : "reserved"
    yield* sql`
      UPDATE baton_program_operations SET status = ${status},
        result_json = ${input.resolution._tag === "Succeeded" ? encodeJsonValue(input.resolution.value) : null},
        error_json = ${input.resolution._tag === "Failed" ? encodeJsonValue(input.resolution.error) : null},
        resolution_idempotency_key = ${input.idempotencyKey}, resolution_json = ${resolutionJson}
      WHERE run_id = ${input.runId} AND operation_name = ${input.operationId} AND status = 'unknown'
    `
    if (clearLease) {
      yield* sql`
        UPDATE baton_runs SET status = CASE WHEN cancellation_requested THEN 'cancelling' ELSE ${claimableStatus} END, owner_worker_id = NULL, lease_expires_at = NULL
        WHERE run_id = ${input.runId} AND status = 'needs-resolution'
      `
    } else {
      yield* sql`
        UPDATE baton_runs SET status = CASE WHEN cancellation_requested THEN 'cancelling' ELSE ${claimableStatus} END, owner_worker_id = NULL
        WHERE run_id = ${input.runId} AND status = 'needs-resolution'
      `
    }
  })
}

export const startProgramOperation = (input: { readonly runId: string; readonly operation: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE baton_program_operations SET status = 'running'
      WHERE run_id = ${input.runId} AND operation_name = ${input.operation} AND status = 'reserved'
    `
    const row = (yield* operationRows(input.runId, input.operation))[0]
    if (row === undefined)
      return yield* RuntimeUnavailable.make({ message: `Program operation ${input.operation} is missing` })
    return yield* decodeOperation(row)
  })

export const reconcileProgramCancellation: {
  (runId: string, reason?: string): CancelProgramEffect
  (reason?: string): (runId: string) => CancelProgramEffect
} = (...args: [string?, string?]): any => {
  const [runIdOrReason, reason] = args
  if (args.length < 2) return (runId: string) => reconcileProgramCancellation(runId, runIdOrReason)
  const runId = runIdOrReason as string
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const failure = ProgramCapabilities.ProgramCancelled.make({ reason: reason ?? "Program Run cancelled" })
    yield* sql`
      UPDATE baton_program_operations SET status = 'failed', error_json = ${encodeJsonValue(failure)}
      WHERE run_id = ${runId} AND status IN ('reserved', 'running', 'waiting')
    `
    yield* sql`UPDATE baton_program_runs SET active_slots = 0 WHERE run_id = ${runId}`
  })
}

type SuspendParent = (
  hub: EventHub,
  input: Parameters<import("../run-store.js").Interface["suspend"]>[0],
) => Effect.Effect<void, WorkerMutationError, SqlClient.SqlClient>

export const suspendProgramOperation: {
  (input: SuspendProgramOperationInput, suspendParent: SuspendParent): (hub: EventHub) => SuspendProgramEffect
  (hub: EventHub, input: SuspendProgramOperationInput, suspendParent: SuspendParent): SuspendProgramEffect
} = Function.dual(3, (hub: EventHub, input: SuspendProgramOperationInput, suspendParent: SuspendParent) =>
  Effect.gen(function* () {
    const reserved = yield* reserveProgramOperation(input)
    if (reserved.status === "waiting") return reserved
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE baton_program_operations SET status = 'waiting', wait_id = ${input.wait.waitId}
      WHERE run_id = ${input.runId} AND operation_name = ${input.operation} AND status = 'reserved'
    `
    yield* suspendParent(hub, input)
    return yield* decodeOperation((yield* operationRows(input.runId, input.operation))[0]!)
  }),
)

export const admitProgramAgents: {
  (input: AdmitProgramAgentsInput, suspendParent: SuspendParent): (hub: EventHub) => AdmitAgentsEffect
  (hub: EventHub, input: AdmitProgramAgentsInput, suspendParent: SuspendParent): AdmitAgentsEffect
} = Function.dual(3, (hub: EventHub, input: AdmitProgramAgentsInput, suspendParent: SuspendParent) =>
  Effect.gen(function* () {
    const reserved = yield* reserveProgramOperation(input)
    if (reserved.childRunIds.length > 0) return reserved
    const receipt = yield* admitFanOut(hub, input.fanOut)
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE baton_program_operations SET status = 'waiting', wait_id = ${input.wait.waitId},
        fan_out_id = ${receipt.fanOutId}, child_run_ids_json = ${encodeJsonValue(receipt.childRunIds)}
      WHERE run_id = ${input.runId} AND operation_name = ${input.operation} AND status = 'reserved'
    `
    yield* suspendParent(hub, { ...input, checkpoint: { _tag: "Program", version: "1" } })
    return yield* decodeOperation((yield* operationRows(input.runId, input.operation))[0]!)
  }),
)

export const commitProgramLog: {
  (input: CommitProgramLogInput): (hub: EventHub) => CommitLogEffect
  (hub: EventHub, input: CommitProgramLogInput): CommitLogEffect
} = Function.dual(2, (hub: EventHub, input: CommitProgramLogInput) =>
  Effect.gen(function* () {
    const prior = yield* reserveProgramOperation(input)
    if (prior.status === "succeeded") return prior
    const run = yield* loadRun(input.runId)
    if (run === undefined) return yield* RuntimeUnavailable.make({ message: `Run ${input.runId} is missing` })
    yield* appendEvent(hub, run, {
      _tag: "ProgramLog",
      operation: input.operation,
      level: input.level,
      message: input.message,
      ...(input.data === undefined ? {} : { data: input.data }),
    })
    return yield* settleProgramOperation(hub, {
      ...input,
      outcome: { _tag: "Succeeded", value: undefined },
      releaseSlots: 0,
    })
  }),
)
