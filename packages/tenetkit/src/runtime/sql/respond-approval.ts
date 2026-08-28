import { Effect, Equal } from "effect"
import type { RespondInput } from "../operation/approval.js"
import { ApprovalMismatch, ApprovalStale, RunNotFound } from "../errors.js"
import { isTerminal } from "../run.js"
import { loadRun, loadRunWait } from "./store/statements.js"

export type ApprovalResponse = { readonly _tag: "Duplicate" } | { readonly _tag: "Respond"; readonly waitId: string }

/** Validate one approval identity and decision inside the store's control transaction. */
export const approvalResponse = (input: RespondInput) =>
  Effect.gen(function* () {
    const run = yield* loadRun(input.runId)
    if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
    const requested = yield* loadRunWait(run.runId, input.approvalId)
    if (requested?.resolution !== undefined) {
      if (requested.reason._tag === "Approval" && Equal.equals(requested.resolution, input.decision)) {
        return { _tag: "Duplicate" } as const
      }
      return yield* ApprovalMismatch.make({
        runId: run.runId,
        approvalId: input.approvalId,
        mismatch: "decision",
      })
    }
    if (isTerminal(run.status) || run.cancellationRequested || run.activeWaitId === undefined) {
      return yield* ApprovalStale.make({ runId: run.runId, approvalId: input.approvalId })
    }
    const active = yield* loadRunWait(run.runId, run.activeWaitId)
    if (active === undefined || active.status !== "open") {
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
    return { _tag: "Respond", waitId: active.waitId } as const
  })
