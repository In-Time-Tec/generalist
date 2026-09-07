import { Effect, Schema } from "effect"
import { ProgramBudget } from "../../../../core/durable/manifest/program-manifest.js"
import { Invalid as BudgetInvalid } from "../../../../core/durable/run-budget.js"
import { RuntimeUnavailable } from "../../../errors.js"
import type { ProgramCheckpoint } from "../../../execution/state.js"
import type { ProgramOperationRecord, ProgramRunState } from "../../../program/store.js"
import { occurredAtMillis } from "../../observation.js"
import type { RuntimeState, StoredRun } from "../../state.js"

/** Replays only the selected branch's completed names; new calls use a fresh durable namespace. */
export const programBranchCheckpoint = (state: RuntimeState, source: StoredRun, atSequence: number, namespace: string) =>
  Effect.gen(function* () {
    const selected = source.checkpoints.get(atSequence)
    const program = source.executableManifest.entries.find((entry) => entry.pin === source.executableRef.active)
    if (!(selected !== undefined && "_tag" in selected) && program?._tag !== "Program" && !state.programStates.has(source.runId)) return undefined
    const replay: Record<string, string> = selected !== undefined && "_tag" in selected
      ? { ...selected.branch?.replay }
      : {}
    const boundary = source.events.findLast((event) => event.sequence <= atSequence && (
      event._tag === "RunRewound" || (event._tag === "RunForked" && event.role !== "source")
    ))?.sequence ?? -1
    const latest = new Map<string, number>()
    let replayCount = Object.keys(replay).length
    for (const operation of state.programOperations.values()) {
      if (operation.runId !== source.runId || operation.completedSequence === undefined ||
        operation.completedSequence > atSequence || operation.completedSequence <= boundary) continue
      if (operation.status !== "succeeded" && operation.status !== "failed" && operation.status !== "unknown") continue
      if ((latest.get(operation.authoredOperation) ?? -1) > operation.completedSequence) continue
      if (!Object.hasOwn(replay, operation.authoredOperation) && ++replayCount > 4096)
        return yield* RuntimeUnavailable.make({ message: "Program branch replay exceeds the 4096-operation bound" })
      replay[operation.authoredOperation] = operation.operation
      latest.set(operation.authoredOperation, operation.completedSequence)
    }
    return { _tag: "Program", version: "1", branch: { namespace, replay } } satisfies ProgramCheckpoint
  })

/** Additive grants are nonrefundable reservations; all descendants retain one concurrency pool and deadline. */
export const forkProgram = (
  state: RuntimeState,
  source: StoredRun,
  targetRunId: string,
  checkpoint: ProgramCheckpoint | undefined,
  requested: ProgramBudget | undefined,
) => Effect.gen(function* () {
  if (checkpoint === undefined) {
    if (requested !== undefined) return yield* BudgetInvalid.make({ message: "Program allocation requires a Program source" })
    return { programStates: state.programStates, programOperations: state.programOperations }
  }
  if (requested === undefined) return yield* BudgetInvalid.make({ message: "Program fork requires an explicit Program budget allocation" })
  const budget = yield* Schema.decodeUnknownEffect(ProgramBudget, { onExcessProperty: "error" })(requested).pipe(
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
      toolCalls: 0, agentRuns: 0, tokens: 0, logBytes: 0, activeSlots: 0,
    } satisfies ProgramRunState
  }
  for (const dimension of ["toolCalls", "agentRuns", "tokens", "logBytes"] as const) {
    if (current[dimension] + budget[dimension] > current.budget[dimension])
      return yield* BudgetInvalid.make({ message: `Program fork exceeds current ${dimension} allocation` })
  }
  if (budget.concurrency > current.budget.concurrency || budget.outputBytes > current.budget.outputBytes ||
    budget.wallClockMillis > Math.max(0, current.deadlineMillis - now))
    return yield* BudgetInvalid.make({ message: "Program fork cannot widen concurrency, output bounds, or the source deadline" })
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
    toolCalls: 0, agentRuns: 0, tokens: 0, logBytes: 0, activeSlots: 0,
  })
  const programOperations = new Map(state.programOperations)
  for (const operationId of Object.values(checkpoint.branch!.replay)) {
    const operation = state.programOperations.get(`${source.runId}\0${operationId}`)
    if (operation === undefined) return yield* RuntimeUnavailable.make({ message: `Program replay operation ${operationId} is missing` })
    const copied: ProgramOperationRecord = { ...operation, runId: targetRunId }
    programOperations.set(`${targetRunId}\0${operationId}`, copied)
  }
  return { programStates, programOperations }
})
