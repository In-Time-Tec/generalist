import { Effect, Schema } from "effect"
import type { PgClient } from "@effect/sql-pg"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import {
  AgentExecutionFailure,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  failureMessage,
} from "tenetkit/runtime/driver/errors"
import { isTerminal } from "tenetkit/runtime/driver/run"
import { StaleClaim } from "tenetkit/runtime/driver/sql/errors"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { claimReadyRuns, refreshLease, releaseClaim } from "../runs/claims.js"
import { RunClaims, type Interface as ClaimsInterface } from "tenetkit/runtime/driver/sql/run/claims"
import { afterTerminal, appendEvent, completeRun, loadEventsAfter, loadRun, settleParent } from "./runtime.js"
import { lockRunHierarchy } from "../runs/locks.js"
import type { WithoutSqlError } from "tenetkit/runtime/driver/sql/effect"
import { ExecutionResult } from "tenetkit/runtime/driver/execution/state"

type SqlR = SqlClient.SqlClient | PgClient.PgClient
export type RunFn = <A, E>(
  effect: Effect.Effect<A, E | SqlError, SqlR>,
) => Effect.Effect<A, WithoutSqlError<E | SqlError> | RuntimeUnavailable>

export const postgresClaims = (input: {
  readonly sql: SqlClient.SqlClient
  readonly hub: EventHub
  readonly run: RunFn
  readonly cancelRun: (
    runId: string,
    reason: string | undefined,
  ) => Effect.Effect<void, RunNotFound | RunTerminal | RuntimeUnavailable | SqlError, SqlR>
}): ClaimsInterface => {
  const { hub, run, cancelRun } = input
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
          cancellationRequested: leaseInput.cancellationRequested,
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
          yield* lockRunHierarchy(commitInput.runId)
          const loaded = yield* loadRun(commitInput.runId)
          if (
            loaded === undefined ||
            loaded.ownerWorkerId !== commitInput.workerId ||
            loaded.attemptFence !== commitInput.attemptFence
          ) {
            return yield* StaleClaim.make({
              runId: commitInput.runId,
              workerId: commitInput.workerId,
              attemptFence: commitInput.attemptFence,
            })
          }
          if (commitInput.transition === "cancel") {
            yield* cancelRun(commitInput.runId, commitInput.reason)
            return
          }
          if (isTerminal(loaded.status)) {
            return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
          }
          if (commitInput.transition === "complete") {
            const result = yield* Schema.decodeUnknownEffect(ExecutionResult)(commitInput.result).pipe(
              Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) })),
            )
            yield* completeRun(hub, loaded, result)
            return
          }
          const event = yield* appendEvent(
            hub,
            loaded,
            {
              _tag: "RunFailed",
              error: AgentExecutionFailure.make({ message: failureMessage(commitInput.error?.message ?? "failed") }),
            },
            "failed",
          )
          const settled = (yield* loadRun(loaded.runId))!
          yield* settleParent(hub, settled, event.eventId)
          yield* afterTerminal(hub, settled)
        }),
      ),
  })
}
