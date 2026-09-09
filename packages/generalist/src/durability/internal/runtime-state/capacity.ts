import { Effect } from "effect"
import { DurabilityFailure } from "../../errors.js"
import { commands as admissions } from "../runtime-command-admission.js"
import { commands as operations } from "../runtime-command-operation.js"
import { defaultMaxStateBytes, defaultMaxCommitBytes } from "../journal.js"
import { isTerminal } from "../../../runtime/run.js"
import { operationKeyMapKey, runWaits, type RuntimeState, type StoredRun } from "../../../runtime/state/projection.js"
import { limits } from "../../../runtime/execution/tool/limits.js"
import { maximumEventBytes } from "../../../runtime/execution/payload/index.js"

const admissionCommands = new Set<string>([
  admissions.admitSend.tag,
  admissions.admitStart.tag,
  admissions.admitSpawn.tag,
  admissions.admitProgramChild.tag,
  admissions.admitProgramChildAndSuspend.tag,
  admissions.admitSteering.tag,
  admissions.admitRollback.tag,
  admissions.admitFanOut.tag,
  admissions.fork.tag,
  admissions.submitSessionInput.tag,
  admissions.updateSessionInput.tag,
  admissions.createHostSession.tag,
  operations.recordOperation.tag,
  operations.startOperation.tag,
  operations.reserveProgramOperation.tag,
  operations.startProgramOperation.tag,
  operations.admitProgramAgents.tag,
  operations.emitAgentEvent.tag,
])

const controlCommitCount = 6
const progressOverheadBytes = 16 * 1024
const outcomeOverheadBytes = 256 * 1024

/**
 * Conservative bytes retained for one nonterminal Tool Run. This covers the
 * bounded outcome, every bounded progress event, and six control/receipt
 * transitions including cancellation and fresh-host recovery. The reservation
 * is released only after the Run reaches a terminal status.
 */
export const toolObligationBytes = (maxCommitBytes: number): number =>
  controlCommitCount * Math.min(maxCommitBytes, maximumEventBytes) +
  limits.progressEvents * (limits.progressBytes + progressOverheadBytes) +
  limits.outputBytes +
  outcomeOverheadBytes

const remainingToolObligationBytes = (run: StoredRun, state: RuntimeState, maxCommitBytes: number): number => {
  const operation = state.operations.get(operationKeyMapKey(run.runId, `tool:${run.runId}:${run.executableRef.active}`))
  const progressCount = run.events.filter(
    (event) =>
      event._tag === "ToolProgress" &&
      (run.attempt === 0 ? event.attemptId === undefined : event.attemptId === `${run.runId}:attempt:${run.attempt}`),
  ).length
  const remainingProgress = Math.max(0, limits.progressEvents - progressCount)
  let remainingControls = controlCommitCount
  if (run.cancellationRequested) remainingControls += 1
  if (runWaits(state, run.runId).some((wait) => wait.status === "open")) remainingControls += 1
  if (operation !== undefined) {
    remainingControls -= 1
    if (operation.status !== "requested") remainingControls -= 1
    if (
      run.events.some(
        (event) =>
          event._tag === "ToolExecutionStarted" &&
          (run.attempt === 0 || event.attemptId === `${run.runId}:attempt:${run.attempt}`),
      )
    )
      remainingControls -= 1
    if (["succeeded", "failed", "cancelled"].includes(operation.status)) remainingControls -= 1
  }
  return (
    Math.max(0, remainingControls) * Math.min(maxCommitBytes, maximumEventBytes) +
    remainingProgress * (limits.progressBytes + progressOverheadBytes) +
    (["succeeded", "failed", "cancelled"].includes(operation?.status ?? "")
      ? 0
      : limits.outputBytes + outcomeOverheadBytes)
  )
}

export const make = (options: {
  readonly maxStateBytes?: number
  readonly admissionReserveBytes?: number
  readonly maxCommitBytes?: number
}) =>
  Effect.gen(function* () {
    const maxStateBytes = options.maxStateBytes ?? defaultMaxStateBytes
    const reserve = options.admissionReserveBytes ?? Math.floor(maxStateBytes / 4)
    if (!Number.isSafeInteger(reserve) || reserve <= 0 || reserve >= maxStateBytes) {
      return yield* DurabilityFailure.make({
        reason: "configuration",
        message: "admissionReserveBytes must be a positive safe integer below maxStateBytes",
      })
    }
    const commitBytes = Math.max(options.maxCommitBytes ?? defaultMaxCommitBytes, limits.outputBytes)
    return (command: string, state: RuntimeState) => {
      let activeTools = 0
      let reserved = 0
      for (const run of state.runs.values()) {
        if (isTerminal(run.status)) continue
        const executable = run.executableManifest.entries.find((entry) => entry.pin === run.executableRef.active)
        if (executable?._tag === "Tool") {
          activeTools++
          reserved += remainingToolObligationBytes(run, state, commitBytes)
        }
      }
      return (activeTools > 0 || admissionCommands.has(command) ? reserve : 0) + reserved
    }
  })
