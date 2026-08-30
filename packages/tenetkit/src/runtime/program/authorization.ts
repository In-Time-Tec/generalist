import { Effect } from "effect"
import { ProgramCapabilities, type ProgramHandlers } from "../../core/index.js"
import type { ExecutionRecord } from "../run/store.js"
import { approvedFor, deniedFor } from "./approval.js"

const authorize = (
  claimed: ExecutionRecord,
  invocation: Pick<ProgramHandlers.Invocation, "authorize">,
  operation: string,
  capability: string,
): Effect.Effect<void, ProgramCapabilities.CapabilityFailure> => {
  const denied = deniedFor(claimed, operation)
  if (denied !== undefined) {
    return Effect.fail(ProgramCapabilities.ProgramCapabilityDenied.make({ capability, operation, reason: denied }))
  }
  if (approvedFor(claimed, operation)) return Effect.void
  return invocation.authorize(operation).pipe(
    Effect.flatMap((allowed) =>
      allowed
        ? Effect.void
        : Effect.fail(
            ProgramCapabilities.ProgramCapabilityDenied.make({
              capability,
              operation,
              reason: "host authorization denied the operation",
            }),
          ),
    ),
  )
}

export const Authorization = { authorize }
