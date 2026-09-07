import { Effect, Function, Schema } from "effect"
import { ProgramBudget } from "../../../../core/durable/manifest/program-manifest.js"
import { Invalid as BudgetInvalid } from "../../../../core/durable/run-budget.js"
import { RuntimeUnavailable } from "../../../errors.js"
import type { ProgramCheckpoint, ExecutionCheckpoint } from "../../../execution/state.js"
import type { ProgramOperationRecord, ProgramRunState } from "../../../program/store.js"
import { occurredAtMillis } from "../../observation.js"
import type { RuntimeState, StoredRun } from "../../projection.js"

const isRetainedOperation = (
  operation: ProgramOperationRecord,
  sourceRunId: string,
  atSequence: number,
  boundary: number,
): operation is ProgramOperationRecord & { readonly completedSequence: number } => {
  if (
    operation.runId !== sourceRunId ||
    operation.completedSequence === undefined ||
    operation.completedSequence > atSequence ||
    operation.completedSequence <= boundary
  )
    return false
  return operation.status === "succeeded" || operation.status === "failed" || operation.status === "unknown"
}

const isProgramCheckpoint = (checkpoint: ExecutionCheckpoint | undefined): checkpoint is ProgramCheckpoint =>
  checkpoint !== undefined && "_tag" in checkpoint

/** Replays only the selected branch's completed names; new calls use a fresh durable namespace. */
const branchCheckpointEffect = (state: RuntimeState, source: StoredRun, atSequence: number, namespace: string) =>
  Effect.gen(function* () {
    const selected = source.checkpoints.get(atSequence)
    const program = source.executableManifest.entries.find((entry) => entry.pin === source.executableRef.active)
    if (!isProgramCheckpoint(selected) && program?._tag !== "Program" && !state.programStates.has(source.runId))
      return undefined
    const replay: Record<string, string> = isProgramCheckpoint(selected) ? { ...selected.branch?.replay } : {}
    const boundary =
      source.events.findLast(
        (event) =>
          event.sequence <= atSequence &&
          (event._tag === "RunRewound" || (event._tag === "RunForked" && event.role !== "source")),
      )?.sequence ?? -1
    const latest = new Map<string, number>()
    let replayCount = Object.keys(replay).length
    for (const operation of state.programOperations.values()) {
      if (!isRetainedOperation(operation, source.runId, atSequence, boundary)) continue
      if ((latest.get(operation.authoredOperation) ?? -1) > operation.completedSequence) continue
      if (!Object.hasOwn(replay, operation.authoredOperation) && ++replayCount > 4096)
        return yield* RuntimeUnavailable.make({ message: "Program branch replay exceeds the 4096-operation bound" })
      replay[operation.authoredOperation] = operation.operation
      latest.set(operation.authoredOperation, operation.completedSequence)
    }
    return { _tag: "Program", version: "1", branch: { namespace, replay } } satisfies ProgramCheckpoint
  })

type BranchCheckpointEffect = ReturnType<typeof branchCheckpointEffect>
export const programBranchCheckpoint: {
  (source: StoredRun, atSequence: number, namespace: string): (state: RuntimeState) => BranchCheckpointEffect
  (state: RuntimeState, source: StoredRun, atSequence: number, namespace: string): BranchCheckpointEffect
} = Function.dual(4, branchCheckpointEffect)

/** Additive grants are nonrefundable reservations; all descendants retain one concurrency pool and deadline. */
const forkProgramEffect = (
  state: RuntimeState,
  source: StoredRun,
  targetRunId: string,
  checkpoint: ProgramCheckpoint | undefined,
  requested: ProgramBudget | undefined,
) =>
  Effect.gen(function* () {
    if (checkpoint === undefined) {
      if (requested !== undefined)
        return yield* BudgetInvalid.make({ message: "Program allocation requires a Program source" })
      return { programStates: state.programStates, programOperations: state.programOperations }
    }
    if (requested === undefined)
      return yield* BudgetInvalid.make({ message: "Program fork requires an explicit Program budget allocation" })
    const budget = yield* Schema.decodeEffect(ProgramBudget, { onExcessProperty: "error" })(requested).pipe(
      Effect.mapError((error) => BudgetInvalid.make({ message: error.message })),
    )
    const now = yield* occurredAtMillis
    const entry = source.executableManifest.entries.find((candidate) => candidate.pin === source.executableRef.active)
    let current = state.programStates.get(source.runId)
    if (current === undefined) {
      if (entry?._tag !== "Program")
        return yield* RuntimeUnavailable.make({ message: "Program source allocation is missing" })
      current = {
        runId: source.runId,
        programPin: entry.pin,
        budget: entry.manifest.budget,
        deadlineMillis: now + entry.manifest.budget.wallClockMillis,
        toolCalls: 0,
        agentRuns: 0,
        tokens: 0,
        logBytes: 0,
        activeSlots: 0,
      } satisfies ProgramRunState
    }
    for (const dimension of ["toolCalls", "agentRuns", "tokens", "logBytes"] as const) {
      if (current[dimension] + budget[dimension] > current.budget[dimension])
        return yield* BudgetInvalid.make({ message: `Program fork exceeds current ${dimension} allocation` })
    }
    if (
      budget.concurrency > current.budget.concurrency ||
      budget.outputBytes > current.budget.outputBytes ||
      budget.wallClockMillis > Math.max(0, current.deadlineMillis - now)
    )
      return yield* BudgetInvalid.make({
        message: "Program fork cannot widen concurrency, output bounds, or the source deadline",
      })
    const programStates = new Map(state.programStates)
    programStates.set(source.runId, {
      ...current,
      toolCalls: current.toolCalls + budget.toolCalls,
      agentRuns: current.agentRuns + budget.agentRuns,
      tokens: current.tokens + budget.tokens,
      logBytes: current.logBytes + budget.logBytes,
    })
    programStates.set(targetRunId, {
      runId: targetRunId,
      programPin: current.programPin,
      budget,
      deadlineMillis: Math.min(current.deadlineMillis, now + budget.wallClockMillis),
      concurrencyRoot: current.concurrencyRoot ?? source.runId,
      toolCalls: 0,
      agentRuns: 0,
      tokens: 0,
      logBytes: 0,
      activeSlots: 0,
    })
    const programOperations = new Map(state.programOperations)
    for (const operationId of Object.values(checkpoint.branch!.replay)) {
      const operation = state.programOperations.get(`${source.runId}\0${operationId}`)
      if (operation === undefined)
        return yield* RuntimeUnavailable.make({ message: `Program replay operation ${operationId} is missing` })
      const copied: ProgramOperationRecord = { ...operation, runId: targetRunId }
      programOperations.set(`${targetRunId}\0${operationId}`, copied)
    }
    return { programStates, programOperations }
  })

type ForkProgramEffect = ReturnType<typeof forkProgramEffect>
export const forkProgram: {
  (
    source: StoredRun,
    targetRunId: string,
    checkpoint: ProgramCheckpoint | undefined,
    requested: ProgramBudget | undefined,
  ): (state: RuntimeState) => ForkProgramEffect
  (
    state: RuntimeState,
    source: StoredRun,
    targetRunId: string,
    checkpoint: ProgramCheckpoint | undefined,
    requested: ProgramBudget | undefined,
  ): ForkProgramEffect
} = Function.dual(5, forkProgramEffect)
