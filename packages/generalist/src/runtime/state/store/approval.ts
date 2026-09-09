import type { PreparedObservation } from "../observation.js"
import { Effect, Equal, Function } from "effect"
import type { RespondInput as RespondApprovalInput } from "../../operation/approval.js"
import { ApprovalMismatch, ApprovalStale, RunNotFound, RuntimeUnavailable } from "../../errors.js"
import { isTerminal } from "../../run.js"
import type { RunWait } from "../../run/wait.js"
import { openRunWaits, waitMapKey, type RuntimeState, type StoredRun } from "../projection.js"
import { respond } from "./control.js"

const staleApproval = (state: RuntimeState, run: StoredRun, input: RespondApprovalInput) =>
  Effect.gen(function* () {
    if (!run.cancellationRequested && !isTerminal(run.status)) {
      const expected = openRunWaits(state, run.runId).find((wait) => wait.reason._tag === "Approval")
      if (expected?.reason._tag === "Approval") {
        return yield* ApprovalMismatch.make({
          runId: run.runId,
          approvalId: input.approvalId,
          mismatch: "approval-id",
          expectedApprovalId: expected.reason.request.approvalId,
        })
      }
    }
    return yield* ApprovalStale.make({ runId: run.runId, approvalId: input.approvalId })
  })

const isIdenticalRetry = (input: RespondApprovalInput, active: RunWait) =>
  active.status !== "open" &&
  active.resolution !== undefined &&
  Equal.equals(active.resolution, input.decision) &&
  active.resolutionCommandId === input.commandId

export const respondApproval: {
  (
    input: RespondApprovalInput,
  ): (
    state: RuntimeState,
  ) => Effect.Effect<
    RuntimeState,
    RunNotFound | ApprovalStale | ApprovalMismatch | RuntimeUnavailable,
    PreparedObservation
  >
  (
    state: RuntimeState,
    input: RespondApprovalInput,
  ): Effect.Effect<
    RuntimeState,
    RunNotFound | ApprovalStale | ApprovalMismatch | RuntimeUnavailable,
    PreparedObservation
  >
} = Function.dual(2, (state: RuntimeState, input: RespondApprovalInput) =>
  Effect.gen(function* () {
    if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    const run = state.runs.get(input.runId)
    if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
    const active = state.waits.get(waitMapKey(run.runId, input.approvalId))
    if (active !== undefined && isIdenticalRetry(input, active)) {
      return state
    }
    if (active !== undefined && active.status !== "open") {
      return yield* ApprovalMismatch.make({ runId: run.runId, approvalId: input.approvalId, mismatch: "decision" })
    }
    if (active === undefined || run.cancellationRequested || isTerminal(run.status)) {
      return yield* staleApproval(state, run, input)
    }
    if (active.reason._tag !== "Approval") {
      return yield* ApprovalMismatch.make({
        runId: run.runId,
        approvalId: input.approvalId,
        mismatch: "wait-kind",
      })
    }
    if (active.reason.request.approvalId !== input.approvalId || active.waitId !== input.approvalId) {
      return yield* ApprovalMismatch.make({
        runId: run.runId,
        approvalId: input.approvalId,
        mismatch: "approval-id",
        expectedApprovalId: active.reason.request.approvalId,
      })
    }
    const response = {
      runId: run.runId,
      waitId: active.waitId,
      resolution: input.decision,
      commandId: input.commandId,
    }
    return yield* respond(state, response).pipe(
      Effect.mapError((error) =>
        error._tag === "generalist/runtime/RuntimeUnavailable" || error._tag === "generalist/runtime/RunNotFound"
          ? error
          : ApprovalStale.make({ runId: run.runId, approvalId: input.approvalId }),
      ),
    )
  }),
)
