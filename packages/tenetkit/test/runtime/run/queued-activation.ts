import { Effect } from "effect"
import { RunClaims, Runtime } from "../../../src/runtime/index.js"

/**
 * Brings a freshly admitted Run to `running` on the SQL backends.
 *
 * The memory and SQLite Runtimes bundle a LocalScheduler that promotes a queued Run itself, so a
 * store-level claim succeeds immediately there. PostgreSQL and MySQL expect an external worker to
 * claim ready work, so those suites perform that claim explicitly instead of inheriting a scheduler.
 */
export const claimReadyWorker =
  (workerId: string) =>
  (runId: string): Effect.Effect<void, never, Runtime.Runtime | RunClaims.RunClaims> =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const claims = yield* RunClaims.RunClaims
      while ((yield* runtime.inspect(runId)).status === "queued") {
        const claimed = yield* claims.claimReadyRuns({ workerId, limit: 16, lease: "60 seconds" })
        if (claimed.length === 0) return yield* Effect.die(`Run ${runId} could not be activated`)
      }
    }).pipe(Effect.orDie)
