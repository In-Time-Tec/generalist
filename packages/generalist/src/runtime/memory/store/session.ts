import { Effect, Function } from "effect"
import { isTerminal } from "../../run.js"
import type { MemoryState } from "../state.js"
import { cancel } from "./control.js"

interface SessionCancelInput {
  runId: string
  reason?: string
}

export const cancelSession: {
  (input: {
    readonly sessionId: string
    readonly reason?: string
  }): (state: MemoryState) => Effect.Effect<readonly [ReadonlyArray<string>, MemoryState]>
  (
    state: MemoryState,
    input: { readonly sessionId: string; readonly reason?: string },
  ): Effect.Effect<readonly [ReadonlyArray<string>, MemoryState]>
} = Function.dual(2, (state: MemoryState, input: { readonly sessionId: string; readonly reason?: string }) =>
  Effect.gen(function* () {
    const roots = [...state.runs.values()].filter(
      (run) => run.rootRunId === run.runId && run.message.sessionId === input.sessionId,
    )
    let next = state
    const runIds = new Set<string>()
    for (const root of roots) {
      for (const run of next.runs.values()) {
        if (run.rootRunId === root.runId && !isTerminal(run.status)) runIds.add(run.runId)
      }
      const cancelInput: SessionCancelInput = { runId: root.runId }
      if (input.reason !== undefined) cancelInput.reason = input.reason
      next = yield* cancel(next, cancelInput).pipe(
        Effect.catchTag("generalist/runtime/RunNotFound", () => Effect.succeed(next)),
      )
    }
    return [Array.from(runIds), next] as const
  }),
)
