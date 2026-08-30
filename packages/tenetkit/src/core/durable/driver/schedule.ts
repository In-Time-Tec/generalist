import { DateTime, Effect, Ref, Schema, Semaphore } from "effect"
import { updateCall, type ToolBatchCheckpoint } from "../../agent/tools/checkpoint.js"
import { chargeScheduled, withPending } from "../loop-driver.js"
import { LoopDriverState, type PendingOperation } from "../loop-driver-state.js"
import { OperationTurn } from "../operation-turn.js"
import { assertNotExpired, Exhausted } from "../run-budget.js"
import { DriverError, DriverStateInvalid, type DurableAgentDriver } from "../service.js"
import type { DriverCheckpoint, DriverOperation, OperationOutcome } from "./contract.js"
import { fromInput as operationFrom, type OperationSpec } from "./operation.js"

type AnyOperationSpec = OperationSpec<unknown, unknown, unknown, unknown, unknown, unknown>

interface ScheduleJournal {
  readonly onScheduled: (
    operation: DriverOperation,
    checkpoint: DriverCheckpoint,
  ) => Effect.Effect<OperationOutcome | void, DriverError>
}

interface SchedulerInput {
  readonly checkpointRef: Ref.Ref<DriverCheckpoint>
  readonly driver: DurableAgentDriver
  readonly journal: ScheduleJournal
  readonly semaphore: Semaphore.Semaphore
}

export interface ScheduledOperation {
  readonly operation: DriverOperation
  readonly replay: OperationOutcome | void
  readonly batchTool: boolean
  readonly nested?: boolean
}

const invalid = (message: string) => DriverStateInvalid.make({ message })

const matches = (pending: DriverOperation, requested: DriverOperation): boolean =>
  pending.key === requested.key &&
  pending.kind === requested.kind &&
  pending.inputDigest === requested.inputDigest &&
  pending.replayPolicy === requested.replayPolicy

const scheduleBatchTool = (
  input: SchedulerInput,
  before: DriverCheckpoint,
  state: LoopDriverState,
  batch: ToolBatchCheckpoint,
  callIndex: number,
  spec: AnyOperationSpec,
  requested: DriverOperation,
): Effect.Effect<ScheduledOperation, DriverError | DriverStateInvalid | Exhausted> =>
  Effect.gen(function* () {
    let scheduled = before
    const entry = batch.calls[callIndex]!
    const operationTurn = yield* OperationTurn.resolve(before.turn, spec.turn)
    if (entry.state._tag === "Ready" && entry.state.stage === "execution") {
      const nowIso = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
      yield* assertNotExpired(before.budget, nowIso)
      scheduled = yield* chargeScheduled(before, spec.kind)
      const toolBatch = updateCall(batch, {
        callIndex,
        state: {
          _tag: "Scheduled",
          inputDigest: requested.inputDigest,
          replayPolicy: requested.replayPolicy,
        },
      })
      scheduled = { ...scheduled, turn: operationTurn, state: { ...state, toolBatch } }
      yield* Ref.set(input.checkpointRef, scheduled)
    } else if (
      entry.state._tag !== "Scheduled" ||
      entry.state.inputDigest !== requested.inputDigest ||
      entry.state.replayPolicy !== requested.replayPolicy
    ) {
      return yield* invalid(`Tool operation ${requested.key} does not match its scheduled batch call`)
    }
    const replay = yield* input.journal.onScheduled(requested, scheduled)
    return { operation: requested, replay, batchTool: true }
  })

const schedulePending = (
  input: SchedulerInput,
  before: DriverCheckpoint,
  pendingInput: PendingOperation,
  spec: AnyOperationSpec,
  requested: DriverOperation,
): Effect.Effect<ScheduledOperation, DriverError | DriverStateInvalid> =>
  Effect.gen(function* () {
    const pending = operationFrom(pendingInput)
    if (!matches(pending, requested)) {
      if (pending.kind === requested.kind) {
        return yield* invalid(`Pending operation ${pending.key} does not match requested operation ${requested.key}`)
      }
      const replay = yield* input.journal.onScheduled(requested, before)
      return { operation: requested, replay, batchTool: false, nested: true }
    }
    const decision = yield* input.driver.decide(before)
    if (decision._tag !== "Execute") {
      return yield* invalid(`Expected Execute decision for ${spec.key}, received ${decision._tag}`)
    }
    const replay = yield* input.journal.onScheduled(decision.operation, before)
    return { operation: decision.operation, replay, batchTool: false, nested: false }
  })

const scheduleNew = (
  input: SchedulerInput,
  before: DriverCheckpoint,
  spec: AnyOperationSpec,
): Effect.Effect<ScheduledOperation, DriverError | DriverStateInvalid | Exhausted> =>
  Effect.gen(function* () {
    const nowIso = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    yield* assertNotExpired(before.budget, nowIso)
    const charged = yield* chargeScheduled(before, spec.kind)
    const operationTurn = yield* OperationTurn.resolve(charged.turn, spec.turn)
    const { turn: _turn, success: _success, failure: _failure, applyCheckpoint: _applyCheckpoint, ...pending } = spec
    const scheduled = withPending(charged, pending, operationTurn)
    yield* Ref.set(input.checkpointRef, scheduled)
    const decision = yield* input.driver.decide(scheduled)
    if (decision._tag !== "Execute") {
      return yield* invalid(`Expected Execute decision for ${spec.key}, received ${decision._tag}`)
    }
    if (decision.operation.key !== spec.key || decision.operation.kind !== spec.kind) {
      return yield* invalid(`Driver operation mismatch for ${spec.key}`)
    }
    const replay = yield* input.journal.onScheduled(decision.operation, scheduled)
    return { operation: decision.operation, replay, batchTool: false, nested: false }
  })

export const scheduleOperations = (input: SchedulerInput) => (spec: AnyOperationSpec) =>
  input.semaphore.withPermit(
    Effect.gen(function* () {
      const before = yield* Ref.get(input.checkpointRef)
      const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(before.state).pipe(
        Effect.mapError((error) => invalid(String(error))),
      )
      if (state.postCommitFailure !== undefined) return yield* state.postCommitFailure
      const requested = operationFrom(spec)
      if (spec.kind === "tool" && state.toolBatch !== undefined) {
        const callIndex = state.toolBatch.calls.findIndex((entry) => entry.operationKey === requested.key)
        if (callIndex < 0) {
          return yield* invalid(`Tool operation ${requested.key} is not part of the active batch`)
        }
        return yield* scheduleBatchTool(input, before, state, state.toolBatch, callIndex, spec, requested)
      }
      if (state.pending !== undefined) return yield* schedulePending(input, before, state.pending, spec, requested)
      return yield* scheduleNew(input, before, spec)
    }),
  )
