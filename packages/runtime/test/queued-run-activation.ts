import { Effect } from "effect"
import { RunClaims, Runtime } from "../src/index.js"

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
      if ((yield* runtime.inspect(runId)).status !== "queued") return
      yield* claims.claimReadyRuns({ workerId, limit: 16, lease: "60 seconds" })
    }).pipe(Effect.orDie)
