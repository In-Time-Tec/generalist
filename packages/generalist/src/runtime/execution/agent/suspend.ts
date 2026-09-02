import { DateTime, Effect, Schema } from "effect"
import { AgentSuspended } from "../../../core/agent/event.js"
import { Suspended as NestedOperationSuspended } from "../../../core/tools/nested-operation.js"
import type { ExecutionSuspension } from "../state.js"
import type { Service as CodeMode } from "../../code-mode.js"
import type { Service as Operations } from "../../operation/nested-operations.js"
import type { ExecutionClaim, Service as RunStore } from "../../run/store.js"
import { approvalReason, type WaitReason } from "../../run/wait.js"

/** Persist one aggregate Agent suspension after every admitted authored call reached a safe checkpoint. */
export const suspend = (input: {
  readonly runId: string
  readonly claim: ExecutionClaim
  readonly store: RunStore
  readonly nested: Operations
  readonly codeMode?: CodeMode
  readonly suspension: ExecutionSuspension
}) =>
  Effect.gen(function* () {
    const openedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const latest = yield* input.store.loadExecution(input.runId)
    const durableState = Object.assign(
      {},
      latest.checkpoint === undefined ? undefined : { checkpoint: latest.checkpoint },
      latest.continuation === undefined ? undefined : { continuation: latest.continuation },
    )
    let waits: ReadonlyArray<{ readonly waitId: string; readonly reason: WaitReason }>
    if (Schema.is(NestedOperationSuspended)(input.suspension)) {
      const wait = yield* input.nested.waitFor({ token: input.suspension.token })
      waits = [
        wait ?? {
          waitId: input.suspension.token,
          reason: approvalReason({
            approvalId: input.suspension.token,
            operation: `${input.suspension.operationKey}#${input.suspension.ordinal}`,
            capability: input.suspension.capability,
            input: undefined,
          }),
        },
      ]
    } else {
      const authoredWaits = Schema.is(AgentSuspended)(input.suspension) ? input.suspension.waits : []
      waits = yield* Effect.forEach(authoredWaits, (wait) =>
        input.nested.waitFor(wait).pipe(
          Effect.map((nestedWait) => {
            if (nestedWait !== undefined) return nestedWait
            if (wait.awaitEvent !== undefined) {
              return { waitId: wait.waitId, reason: { _tag: "AwaitEvent" as const, ...wait.awaitEvent } }
            }
            if (wait.reason === "approval") {
              return {
                waitId: wait.waitId,
                reason: approvalReason({
                  approvalId: wait.token,
                  operation: wait.call.id,
                  capability: wait.call.name,
                  input: wait.call.params,
                }),
              }
            }
            return { waitId: wait.waitId, reason: { _tag: "ToolWait" as const } }
          }),
        ),
      )
    }
    const openedWaits = waits.map((wait) => ({ ...wait, status: "open" as const, openedAt }))
    if (
      input.codeMode !== undefined &&
      Schema.is(AgentSuspended)(input.suspension) &&
      input.suspension.waits.some((wait) => wait.call.name === "code_mode")
    ) {
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
