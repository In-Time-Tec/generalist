import { Effect } from "effect"
import type { PgClient } from "@effect/sql-pg"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../errors.js"
import { isTerminal } from "../../run.js"
import { StaleClaim } from "../errors.js"
import type { RunRow } from "../rows.js"
import { decodeRun } from "../store-helpers.js"
import type { EventHub } from "../subscribers.js"
import { claimReadyRuns, refreshLease, releaseClaim } from "./claims.js"
import { RunClaims, type Interface as ClaimsInterface } from "../run-claims.js"
import { afterTerminal, appendEvent, loadEventsAfter, loadRun, settleParent } from "./pg-helpers.js"

type SqlR = SqlClient.SqlClient | PgClient.PgClient
type RunFn = <A, E>(
  effect: Effect.Effect<A, E, SqlR>,
) => Effect.Effect<A, Exclude<E, { readonly _tag: "SqlError" }> | RuntimeUnavailable>

export const makePostgresClaims = (input: {
  readonly sql: SqlClient.SqlClient
  readonly hub: EventHub
  readonly run: RunFn
  readonly cancelRun: (
    runId: string,
    reason: string | undefined,
  ) => Effect.Effect<void, RunNotFound | RunTerminal | SqlError, SqlR>
}): ClaimsInterface => {
  const { sql, hub, run, cancelRun } = input
  return RunClaims.of({
    claimReadyRuns: (claimInput) =>
      run(
        Effect.gen(function* () {
          const claimed = yield* claimReadyRuns({
            workerId: claimInput.workerId,
            limit: claimInput.limit,
            lease: claimInput.lease ?? "30 seconds",
          })
          for (const item of claimed) {
            const fresh = (yield* loadRun(item.run.runId))!
            const events = yield* loadEventsAfter(item.run.runId, -1)
            const hasAttempt = events.some(
              (event) => event._tag === "RunAttemptStarted" && event.attempt === fresh.attempt,
            )
            if (!hasAttempt && fresh.attempt > 0) {
              yield* appendEvent(hub, fresh, { _tag: "RunAttemptStarted", attempt: fresh.attempt }, "running")
            }
          }
          return claimed
        }),
      ),
    refreshLease: (leaseInput) =>
      run(
        refreshLease({
          runId: leaseInput.runId,
          workerId: leaseInput.workerId,
          attemptFence: leaseInput.attemptFence,
          lease: leaseInput.lease ?? "30 seconds",
        }),
      ),
    releaseClaim: (releaseInput) =>
      run(
        releaseClaim({
          runId: releaseInput.runId,
          workerId: releaseInput.workerId,
          attemptFence: releaseInput.attemptFence,
        }),
      ),
    commitWithClaim: (commitInput) =>
      run(
        Effect.gen(function* () {
          const rows = yield* sql<RunRow>`
            SELECT * FROM baton_runs
            WHERE run_id = ${commitInput.runId}
              AND owner_worker_id = ${commitInput.workerId}
              AND attempt_fence = ${commitInput.attemptFence}
            FOR UPDATE
          `
          const row = rows[0]
          if (row === undefined) {
            return yield* StaleClaim.make({
              runId: commitInput.runId,
              workerId: commitInput.workerId,
              attemptFence: commitInput.attemptFence,
            })
          }
          const loaded = decodeRun(row)
          if (commitInput.transition === "cancel") {
            yield* cancelRun(commitInput.runId, commitInput.reason)
            return
          }
          if (isTerminal(loaded.status)) {
            return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
          }
          if (commitInput.transition === "complete") {
            const event = yield* appendEvent(
              hub,
              loaded,
              { _tag: "RunCompleted", result: commitInput.result as never },
              "succeeded",
            )
            const settled = (yield* loadRun(loaded.runId))!
            yield* settleParent(hub, settled, event.eventId)
            yield* afterTerminal(hub, settled)
            return
          }
          const event = yield* appendEvent(
            hub,
            loaded,
            { _tag: "RunFailed", error: commitInput.error ?? { message: "failed" } },
            "failed",
          )
          const settled = (yield* loadRun(loaded.runId))!
          yield* settleParent(hub, settled, event.eventId)
          yield* afterTerminal(hub, settled)
        }),
      ),
  })
}
