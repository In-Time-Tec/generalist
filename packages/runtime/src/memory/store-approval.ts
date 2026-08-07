import { Effect, Equal, Function } from "effect"
import type { RespondInput as RespondApprovalInput } from "../approval.js"
import { ApprovalMismatch, ApprovalStale, RunNotFound, RuntimeUnavailable } from "../errors.js"
import { isTerminal } from "../run.js"
import type { MemoryState } from "./state.js"
import { respond } from "./store-control.js"

export const respondApproval: {
  (
    input: RespondApprovalInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<MemoryState, RunNotFound | ApprovalStale | ApprovalMismatch | RuntimeUnavailable>
  (
    state: MemoryState,
    input: RespondApprovalInput,
  ): Effect.Effect<MemoryState, RunNotFound | ApprovalStale | ApprovalMismatch | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: RespondApprovalInput) =>
  Effect.gen(function* () {
    if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    const run = state.runs.get(input.runId)
    if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
    const requested = run.events.findLast(
      (event) =>
        event._tag === "RunWaiting" &&
        event.wait.reason._tag === "Approval" &&
        event.wait.reason.request.approvalId === input.approvalId,
    )
    if (requested?._tag === "RunWaiting") {
      const responded = run.events.find(
        (event) =>
          event.sequence > requested.sequence && event._tag === "RunResumed" && event.waitId === requested.wait.waitId,
      )
      if (responded?._tag === "RunResumed") {
        if (Equal.equals(responded.resolution, input.decision)) return state
        return yield* ApprovalMismatch.make({
          runId: run.runId,
          approvalId: input.approvalId,
          mismatch: "decision",
        })
      }
    }
    const active = run.activeWaitId === undefined ? undefined : run.wait
    if (active === undefined || active.status !== "open" || run.cancellationRequested || isTerminal(run.status)) {
      return yield* ApprovalStale.make({ runId: run.runId, approvalId: input.approvalId })
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
    return yield* respond(state, {
      runId: run.runId,
      waitId: active.waitId,
      resolution: input.decision,
    }).pipe(
      Effect.mapError((error) =>
        error._tag === "@batonfx/runtime/RuntimeUnavailable" || error._tag === "@batonfx/runtime/RunNotFound"
          ? error
          : ApprovalStale.make({ runId: run.runId, approvalId: input.approvalId }),
      ),
    )
  }),
)
