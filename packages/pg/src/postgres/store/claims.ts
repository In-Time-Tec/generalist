import { Cause, Duration, Effect, Queue, Redacted, Schema, Stream } from "effect"
import type { PgClient } from "@effect/sql-pg"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { Client, escapeIdentifier, type Notification } from "pg"
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
import { claimReadyRuns, refreshLease } from "../runs/claims.js"
import { RunClaims, type Service as ClaimsService } from "tenetkit/runtime/driver/sql/run/claims"
import { afterTerminal, appendEvent, completeRun, loadEventsAfter, loadRun, settleParent } from "./runtime.js"
import { lockRunHierarchy } from "../runs/locks.js"
import type { WithoutSqlError } from "tenetkit/runtime/driver/sql/effect"
import { ExecutionResult } from "tenetkit/runtime/driver/execution/state"
import { NOTIFY_CHANNEL } from "../schema.js"
import { notifyRun } from "../events/transaction-events.js"
import { releaseExecution, requireExecutionClaim } from "tenetkit/runtime/driver/sql/store/execution"
import { revokeSessionWriteClaim } from "tenetkit/runtime/driver/sql/session/claim"

type SqlR = SqlClient.SqlClient | PgClient.PgClient
export type RunFn = <A, E>(
  effect: Effect.Effect<A, E | SqlError, SqlR>,
) => Effect.Effect<A, WithoutSqlError<E | SqlError> | RuntimeUnavailable>

const wakeupChanges = (config: PgClient.PgClientConfig, source: string) =>
  Stream.callback<void, RuntimeUnavailable>(
    (queue) => {
      const client = new Client({
        connectionString: config.url === undefined ? undefined : Redacted.value(config.url),
        user: config.username,
        host: config.host,
        database: config.database,
        password: config.password === undefined ? undefined : Redacted.value(config.password),
        ssl: config.ssl,
        port: config.port,
        ...(config.stream === undefined ? undefined : { stream: config.stream }),
        connectionTimeoutMillis:
          config.connectTimeout === undefined ? undefined : Duration.toMillis(config.connectTimeout),
        application_name: `tenetkit-runtime-worker:${source}`.slice(0, 63),
        types: config.types,
      })
      const failure = (cause: unknown) =>
        RuntimeUnavailable.make({ message: `PostgreSQL RunClaims wakeup listener failed: ${String(cause)}` })
      const onNotification = (notification: Notification) => {
        if (notification.channel === NOTIFY_CHANNEL) Queue.offerUnsafe(queue, undefined)
      }
      const onFailure = (cause: unknown) => Queue.failCauseUnsafe(queue, Cause.fail(failure(cause)))
      const onEnd = () => onFailure("PostgreSQL listener connection ended")
      const close = Effect.tryPromise(() => client.end()).pipe(Effect.ignore)
      const acquire = Effect.acquireRelease(
        Effect.sync(() => {
          client.on("notification", onNotification)
          client.on("error", onFailure)
          client.on("end", onEnd)
        }),
        () =>
          Effect.sync(() => {
            client.off("notification", onNotification)
            client.off("error", onFailure)
            client.off("end", onEnd)
          }).pipe(Effect.andThen(close)),
      )
      const connect = Effect.tryPromise({
        try: () => client.connect(),
        catch: failure,
      }).pipe(
        Effect.andThen(
          Effect.tryPromise({
            try: () => client.query(`LISTEN ${escapeIdentifier(NOTIFY_CHANNEL)}`),
            catch: failure,
          }),
        ),
        Effect.andThen(
          Effect.sync(() => {
            Queue.offerUnsafe(queue, undefined)
          }),
        ),
      )
      return acquire.pipe(Effect.andThen(connect))
    },
    { bufferSize: 1, strategy: "sliding" },
  )

export const postgresClaims = (input: {
  readonly pg: PgClient.PgClient
  readonly source: string
  readonly hub: EventHub
  readonly run: RunFn
  readonly cancelRun: (
    runId: string,
    reason: string | undefined,
  ) => Effect.Effect<void, RunNotFound | RunTerminal | RuntimeUnavailable | SqlError, SqlR>
}): ClaimsService => {
  const { hub, run, cancelRun } = input
  return RunClaims.of({
    changes: wakeupChanges(input.pg.config, input.source),
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
        requireExecutionClaim({
          runId: leaseInput.runId,
          ownerId: leaseInput.workerId,
          attemptFence: leaseInput.attemptFence,
          session: leaseInput.session,
        }).pipe(
          Effect.flatMap(() =>
            refreshLease({
              runId: leaseInput.runId,
              workerId: leaseInput.workerId,
              attemptFence: leaseInput.attemptFence,
              cancellationRequested: leaseInput.cancellationRequested,
              lease: leaseInput.lease ?? "30 seconds",
            }),
          ),
          Effect.catchTag(
            ["tenetkit/runtime/RunNotFound", "tenetkit/runtime/StaleClaim", "tenetkit/runtime/StaleSessionClaim"],
            () => Effect.succeed(false),
          ),
        ),
      ),
    releaseClaim: (releaseInput) =>
      run(
        Effect.gen(function* () {
          yield* releaseExecution({
            runId: releaseInput.runId,
            ownerId: releaseInput.workerId,
            attemptFence: releaseInput.attemptFence,
            session: releaseInput.session,
          })
          yield* notifyRun(releaseInput.runId)
        }),
      ),
    commitWithClaim: (commitInput) =>
      run(
        Effect.gen(function* () {
          yield* lockRunHierarchy(commitInput.runId)
          yield* requireExecutionClaim({
            runId: commitInput.runId,
            ownerId: commitInput.workerId,
            attemptFence: commitInput.attemptFence,
            session: commitInput.session,
          })
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
            if (!(yield* revokeSessionWriteClaim(commitInput.session))) {
              return yield* RuntimeUnavailable.make({
                message: `Run ${commitInput.runId} Session write binding was not revoked`,
              })
            }
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
            if (!(yield* revokeSessionWriteClaim(commitInput.session))) {
              return yield* RuntimeUnavailable.make({
                message: `Run ${commitInput.runId} Session write binding was not revoked`,
              })
            }
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
          if (!(yield* revokeSessionWriteClaim(commitInput.session))) {
            return yield* RuntimeUnavailable.make({
              message: `Run ${commitInput.runId} Session write binding was not revoked`,
            })
          }
        }),
      ),
  })
}
