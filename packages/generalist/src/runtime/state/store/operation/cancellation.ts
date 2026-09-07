import type { PreparedObservation } from "../../observation.js"
import { Effect, Function, Option, Schema } from "effect"
import type { CancellationOutcome } from "../../../../core/tools/tool-executor.js"
import { decodeCancellableOperation } from "../../../../core/tools/tool-executor-cancellation.js"
import { RunNotFound, RuntimeUnavailable } from "../../../errors.js"
import type { OperationRecord } from "../../../operation/record.js"
import { operationKeyMapKey, operationMapKey, type RuntimeState } from "../../projection.js"

const getRun = (state: RuntimeState, runId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

type CancellationInput = { readonly runId: string }
type AcknowledgeInput = CancellationInput & {
  readonly operationId: string
  readonly outcome: CancellationOutcome
}
type CancellationRecords = Effect.Effect<ReadonlyArray<OperationRecord>, RunNotFound | RuntimeUnavailable>
type Acknowledgement = Effect.Effect<
  readonly [OperationRecord, RuntimeState],
  RunNotFound | RuntimeUnavailable,
  PreparedObservation
>

const CancellationEnvelope = Schema.Struct({ cancellation: Schema.Unknown })

export const operationCancellations: {
  (input: CancellationInput): (state: RuntimeState) => CancellationRecords
  (state: RuntimeState, input: CancellationInput): CancellationRecords
} = Function.dual(2, (state: RuntimeState, input: CancellationInput) =>
  Effect.gen(function* () {
    yield* getRun(state, input.runId)
    return [...state.operations.entries()].flatMap(([key, operation]) =>
      key === operationMapKey(input.runId, operation.operationId) && operation.status === "cancelling"
        ? [operation]
        : [],
    )
  }),
)

export const markOperationCancellations: {
  (runId: string): (state: RuntimeState) => RuntimeState
  (state: RuntimeState, runId: string): RuntimeState
} = Function.dual(2, (state: RuntimeState, runId: string): RuntimeState => {
  const operations = new Map(state.operations)
  let changed = false
  for (const operation of state.operations.values()) {
    if (
      operation.runId !== runId ||
      operation.kind !== "tool" ||
      !["requested", "running", "unknown"].includes(operation.status)
    ) {
      continue
    }
    const envelope = Schema.decodeUnknownOption(CancellationEnvelope)(operation.input)
    const cancellation = Option.isSome(envelope) ? decodeCancellableOperation(envelope.value.cancellation) : undefined
    if (cancellation === undefined) continue
    const cancelling: OperationRecord = { ...operation, status: "cancelling" }
    operations.set(operationMapKey(runId, operation.operationId), cancelling)
    operations.set(operationKeyMapKey(runId, operation.operationKey), cancelling)
    changed = true
  }
  if (!changed) return state
  const run = state.runs.get(runId)
  if (run?.cancellationRequested !== true || run.status !== "needs-resolution") return { ...state, operations }
  const runs = new Map(state.runs)
  runs.set(runId, { ...run, status: "cancelling" })
  return { ...state, operations, runs }
})

export const hasPendingOperationCancellation: {
  (runId: string): (state: RuntimeState) => boolean
  (state: RuntimeState, runId: string): boolean
} = Function.dual(2, (state: RuntimeState, runId: string): boolean =>
  [...state.operations.values()].some((operation) => operation.runId === runId && operation.status === "cancelling"),
)

export const acknowledgeOperationCancellation: {
  (input: AcknowledgeInput): (state: RuntimeState) => Acknowledgement
  (state: RuntimeState, input: AcknowledgeInput): Acknowledgement
} = Function.dual(2, (state: RuntimeState, input: AcknowledgeInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    if (!run.cancellationRequested) {
      return yield* RuntimeUnavailable.make({ message: `run ${input.runId} has not requested cancellation` })
    }
    const current = state.operations.get(operationMapKey(input.runId, input.operationId))
    if (current === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    if (["cancelled", "succeeded", "failed"].includes(current.status)) return [current, state] as const
    if (current.status !== "cancelling") {
      return yield* RuntimeUnavailable.make({ message: `operation ${input.operationId} is not cancelling` })
    }
    const record: OperationRecord =
      input.outcome._tag === "Cancelled"
        ? { ...current, status: "cancelled" }
        : { ...current, status: "succeeded", result: input.outcome.outcome }
    const operations = new Map(state.operations)
    operations.set(operationMapKey(input.runId, input.operationId), record)
    operations.set(operationKeyMapKey(input.runId, record.operationKey), record)
    return [record, { ...state, operations }] as const
  }),
)
