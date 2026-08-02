import { Equal, Effect, Option, Ref } from "effect"
import { Approvals, Agent } from "@batonfx/core"
import type { ClientApproval } from "../transport/wire.js"

export const makeResumeApprovals = (input: {
  readonly agentName: string
  readonly approvals: Option.Option<Approvals.Interface>
  readonly resume: Agent.Resume | undefined
  readonly decision: ClientApproval | undefined
  readonly sessionId: string
}): Effect.Effect<Option.Option<Approvals.Interface>> => {
  const { agentName, approvals, resume, decision, sessionId } = input
  if (resume === undefined || decision === undefined) return Effect.succeed(approvals)
  const fallback = Option.getOrElse(approvals, () =>
    Approvals.Approvals.of({ resolve: () => Effect.succeed({ _tag: "Approved" }) }),
  )
  return Ref.make(false).pipe(
    Effect.map((consumed) =>
      Option.some(
        Approvals.Approvals.of({
          resolve: (pending) => {
            if (
              pending.turn !== 0 ||
              pending.agentName !== agentName ||
              pending.sessionId !== sessionId ||
              pending.call.id !== resume.suspension.tool_call_id ||
              pending.call.name !== resume.suspension.tool_name ||
              !Equal.equals(pending.call.params, resume.suspension.tool_params)
            )
              return fallback.resolve(pending)
            return Ref.modify(consumed, (used) => [!used, true]).pipe(
              Effect.flatMap((useOverride) =>
                useOverride
                  ? Effect.succeed(
                      decision._tag === "Approved"
                        ? { _tag: "Approved" }
                        : { _tag: "Denied", ...(decision.reason === undefined ? {} : { reason: decision.reason }) },
                    )
                  : fallback.resolve(pending),
              ),
            )
          },
        }),
      ),
    ),
  )
}
