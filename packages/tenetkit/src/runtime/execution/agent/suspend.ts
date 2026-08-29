import { DateTime, Effect } from "effect"
import type { AgentEvent } from "../../../core/agent/public/event.js"
import type { Interface as CodeMode } from "../../code-mode.js"
import type { Interface as NestedOperations } from "../../operation/nested-operations.js"
import type { ExecutionClaim, Interface as RunStore } from "../../run/store.js"
import { approvalReason } from "../../run/wait.js"

/** Persist one aggregate Agent suspension after every admitted authored call reached a safe checkpoint. */
export const suspend = (input: {
  readonly runId: string
  readonly claim: ExecutionClaim
  readonly store: RunStore
  readonly nested: NestedOperations
  readonly codeMode?: CodeMode
  readonly suspension: AgentEvent.AgentSuspended
}) =>
  Effect.gen(function* () {
    const openedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const latest = yield* input.store.loadExecution(input.runId)
    const durableState = Object.assign(
      {},
      latest.checkpoint === undefined ? undefined : { checkpoint: latest.checkpoint },
      latest.continuation === undefined ? undefined : { continuation: latest.continuation },
    )
    const waits = yield* Effect.forEach(input.suspension.waits, (wait) =>
      input.nested.waitFor(wait).pipe(
        Effect.map(
          (nestedWait) =>
            nestedWait ?? {
              waitId: wait.waitId,
              reason:
                wait.reason === "approval"
                  ? approvalReason({
                      approvalId: wait.token,
                      operation: wait.call.id,
                      capability: wait.call.name,
                      input: wait.call.params,
                    })
                  : { _tag: "ToolWait" as const },
            },
        ),
      ),
    )
    const openedWaits = waits.map((wait) => ({ ...wait, status: "open" as const, openedAt }))
    if (input.codeMode !== undefined && input.suspension.waits.some((wait) => wait.call.name === "code_mode")) {
      return yield* input.codeMode.admitSuspension({
        suspension: input.suspension,
        openedAt,
        waits: openedWaits,
        ...durableState,
      })
    }
    yield* input.store.suspend({
      ...input.claim,
      suspension: input.suspension,
      ...durableState,
      waits: openedWaits,
    })
  })
