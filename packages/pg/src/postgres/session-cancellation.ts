import { Effect } from "effect"
import type { PgClient } from "@effect/sql-pg"
import type { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import type { RunNotFound, RuntimeUnavailable } from "tenetkit/runtime/driver/errors"
import { activeSessionRuns, sessionRoots, sessionRuns } from "tenetkit/runtime/driver/sql/session-lifecycle"

export const cancelSessionRuns = (input: {
  readonly lockRun: (runId: string) => Effect.Effect<void, SqlError, SqlClient.SqlClient>
  readonly cancelRun: (
    runId: string,
    reason?: string,
  ) => Effect.Effect<void, RunNotFound | RuntimeUnavailable | SqlError, SqlClient.SqlClient | PgClient.PgClient>
  readonly sessionId: string
  readonly reason?: string
}) =>
  Effect.gen(function* () {
    const roots = yield* sessionRoots(input.sessionId)
    const runs = yield* sessionRuns(input.sessionId)
    const active = yield* activeSessionRuns(input.sessionId)
    for (const runId of runs) yield* input.lockRun(runId)
    for (const runId of roots) {
      yield* input
        .cancelRun(runId, input.reason)
        .pipe(Effect.catchTag("tenetkit/runtime/RunNotFound", () => Effect.void))
    }
    return active
  })
