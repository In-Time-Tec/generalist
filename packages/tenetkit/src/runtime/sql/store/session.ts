import { Effect, Function } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import type { RuntimeUnavailable } from "../../errors.js"
import type { EventHub } from "../subscribers.js"
import { cancel } from "./control.js"
import { activeSessionRuns, sessionRoots } from "../session/lifecycle.js"
import type { CancelInput } from "../../service.js"

type MutableCancelInput = { -readonly [Key in keyof CancelInput]: CancelInput[Key] }

type Result = Effect.Effect<ReadonlyArray<string>, RuntimeUnavailable | SqlError, SqlClient.SqlClient>

export const cancelSession: {
  (input: { readonly sessionId: string; readonly reason?: string }): (hub: EventHub) => Result
  (hub: EventHub, input: { readonly sessionId: string; readonly reason?: string }): Result
} = Function.dual(2, (hub: EventHub, input: { readonly sessionId: string; readonly reason?: string }) =>
  Effect.gen(function* () {
    yield* SqlClient.SqlClient
    const roots = yield* sessionRoots(input.sessionId)
    const active = yield* activeSessionRuns(input.sessionId)
    for (const runId of roots) {
      const cancelInput: MutableCancelInput = { runId }
      if (input.reason !== undefined) cancelInput.reason = input.reason
      yield* cancel(hub, cancelInput).pipe(Effect.catchTag("tenetkit/runtime/RunNotFound", () => Effect.void))
    }
    return active
  }),
)
