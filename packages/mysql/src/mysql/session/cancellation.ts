import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { activeSessionRuns, sessionRoots, sessionRuns } from "tenetkit/runtime/driver/sql/session/lifecycle"
import { cancel } from "tenetkit/runtime/driver/sql/store/control"

export const cancelSessionRuns = (input: {
  readonly hub: EventHub
  readonly sessionId: string
  readonly reason?: string
  readonly lockRun: (runId: string) => Effect.Effect<unknown, SqlError, SqlClient.SqlClient>
  readonly lockParent: (runId: string) => Effect.Effect<unknown, SqlError, SqlClient.SqlClient>
  readonly clearClaim: (runId: string) => Effect.Effect<unknown, SqlError, SqlClient.SqlClient>
}) =>
  Effect.gen(function* () {
    const roots = yield* sessionRoots(input.sessionId)
    const runs = yield* sessionRuns(input.sessionId)
    const active = yield* activeSessionRuns(input.sessionId)
    for (const runId of runs) {
      yield* input.lockRun(runId)
      yield* input.lockParent(runId)
    }
    for (const runId of roots) {
      yield* cancel(input.hub, {
        runId,
        ...(input.reason === undefined ? undefined : { reason: input.reason }),
      }).pipe(Effect.catchTag("tenetkit/runtime/RunNotFound", () => Effect.void))
    }
    for (const runId of active) yield* input.clearClaim(runId)
    return active
  })
