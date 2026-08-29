import { Effect, Equal } from "effect"
import type { RespondInput } from "../operation/approval.js"
import { ApprovalMismatch, ApprovalStale, RunNotFound } from "../errors.js"
import { isTerminal } from "../run.js"
import { loadRun, loadRunWait, loadRunWaitsByStatus } from "./store/statements.js"
import type { DecodedRun } from "./codec/rows.js"

export type ApprovalResponse = { readonly _tag: "Duplicate" } | { readonly _tag: "Respond"; readonly waitId: string }

const staleApproval = (run: DecodedRun, input: RespondInput, requestedMissing: boolean) =>
  Effect.gen(function* () {
    if (!isTerminal(run.status) && !run.cancellationRequested && requestedMissing) {
      const expected = (yield* loadRunWaitsByStatus(run.runId, "open")).find((wait) => wait.reason._tag === "Approval")
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
    if (isTerminal(run.status) || run.cancellationRequested || requested?.status !== "open") {
      return yield* staleApproval(run, input, requested === undefined)
    }
    const active = requested
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
