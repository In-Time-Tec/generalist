import { Effect } from "effect"
import type { Decision } from "../runtime/operation/approval.js"
import { IllegalOperatorAction } from "../runtime/errors.js"
import type { InspectError, RespondApprovalError, Runtime } from "../runtime/service.js"

/** Resolve one approval only while its exact token remains an open Run obligation. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal Host composition seam, not a public combinator.
export const resolveApproval = (
  runtime: Runtime["Service"],
  runId: string,
  token: string,
  decision: Decision,
  operator: string,
): Effect.Effect<void, InspectError | RespondApprovalError | IllegalOperatorAction> =>
  Effect.gen(function* () {
    const explanation = yield* runtime.operator.explain(runId)
    const legal = explanation.obligations.some(
      (obligation) => obligation._tag === "AwaitApproval" && obligation.token === token,
    )
    if (!legal) {
      return yield* IllegalOperatorAction.make({ runId, decision: explanation.decision, action: "resolveApproval" })
    }
    yield* runtime.respondApproval({ runId, approvalId: token, decision, operator })
  })
