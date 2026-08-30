import { Effect } from "effect"
import { type CapabilityFailure, ProgramCapabilityDenied } from "../../core/program/capabilities.js"
import type { Invocation } from "../../core/program/handlers.js"
import type { ExecutionRecord } from "../run/store.js"
import { approvedFor, deniedFor } from "./approval.js"

const authorize = (
  claimed: ExecutionRecord,
  invocation: Pick<Invocation, "authorize">,
  operation: string,
  capability: string,
): Effect.Effect<void, CapabilityFailure> => {
  const denied = deniedFor(claimed, operation)
  if (denied !== undefined) {
    return Effect.fail(ProgramCapabilityDenied.make({ capability, operation, reason: denied }))
  }
  if (approvedFor(claimed, operation)) return Effect.void
  return invocation.authorize(operation).pipe(
    Effect.flatMap((allowed) =>
      allowed
        ? Effect.void
        : Effect.fail(
            ProgramCapabilityDenied.make({
              capability,
              operation,
              reason: "host authorization denied the operation",
            }),
          ),
    ),
  )
}

export const Authorization = { authorize }
