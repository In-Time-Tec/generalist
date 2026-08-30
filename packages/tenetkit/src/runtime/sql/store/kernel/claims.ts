import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { failureMessage } from "../../../errors-internal.js"
import { AgentExecutionFailure, RunTerminal, RuntimeUnavailable } from "../../../errors.js"
import { ExecutionResult } from "../../../execution/state.js"
import { isTerminal } from "../../../run.js"
import { StaleClaim } from "../../errors.js"
import { RunClaims, type ClaimedRun, type Service as RunClaimsService } from "../../run/claims.js"
import { revokeSessionWriteClaim } from "../../session/claim.js"
import { cancel, complete, fail } from "../control.js"
import { releaseExecution, requireExecutionClaim } from "../execution.js"
import { appendEvent, loadRun } from "../statements.js"
import type { SqlClaimMechanics, SqlStoreLocks, SqlStoreRun } from "../driver/protocol.js"
import type { EventHub } from "../../subscribers.js"

/** Adapt dialect claim mechanics to Runtime's lifecycle-aware claim service. */
export const sqlClaims = (input: {
  readonly mechanics: SqlClaimMechanics
  readonly run: SqlStoreRun
  readonly transactionHub: EventHub
  readonly locks: SqlStoreLocks
}): RunClaimsService => {
  const claim = (
    runId: string,
    workerId: string,
    attemptFence: number,
    session: import("../../../run/store.js").SessionWriteClaim,
  ) => ({ runId, ownerId: workerId, attemptFence, session })

  return RunClaims.of({
    changes: input.mechanics.changes,
    claimReadyRuns: (options) =>
      input.run(
        Effect.gen(function* () {
          const claimed = yield* input.mechanics.claimReadyRuns(options)
          const result: Array<ClaimedRun> = []
          for (const item of claimed) {
            let run = item.run
            if (item.startedAttempt) {
              yield* appendEvent(
                input.transactionHub,
                run,
                { _tag: "RunAttemptStarted", attempt: run.attempt },
                "running",
              )
              run = (yield* loadRun(run.runId)) ?? run
            }
            result.push({ ...item, run })
          }
          return result
        }),
      ),
    refreshLease: (options) =>
      input.run(
        input.locks.run(options.runId).pipe(
          Effect.andThen(
            requireExecutionClaim(claim(options.runId, options.workerId, options.attemptFence, options.session)),
          ),
          Effect.andThen(input.mechanics.refreshLease(options)),
          Effect.catchTag(
            ["tenetkit/runtime/RunNotFound", "tenetkit/runtime/StaleClaim", "tenetkit/runtime/StaleSessionClaim"],
            () => Effect.succeed(false),
          ),
        ),
      ),
    releaseClaim: (options) =>
      input.run(
        input.locks
          .run(options.runId)
          .pipe(
            Effect.andThen(
              releaseExecution(claim(options.runId, options.workerId, options.attemptFence, options.session)),
            ),
            Effect.andThen(input.transactionHub.touchRun(options.runId)),
          ),
      ),
    commitWithClaim: (options) =>
      input.run(
        Effect.gen(function* () {
          yield* input.locks.hierarchy(options.runId)
          const executionClaim = claim(options.runId, options.workerId, options.attemptFence, options.session)
          yield* requireExecutionClaim(executionClaim)
          const loaded = yield* loadRun(options.runId)
          if (
            loaded === undefined ||
            loaded.ownerWorkerId !== options.workerId ||
            loaded.attemptFence !== options.attemptFence
          ) {
            return yield* StaleClaim.make({
              runId: options.runId,
              workerId: options.workerId,
              attemptFence: options.attemptFence,
            })
          }
          yield* input.transactionHub.touchRun(options.runId)
          if (options.transition === "cancel") {
            yield* cancel(input.transactionHub, {
              runId: options.runId,
              ...(options.reason === undefined ? undefined : { reason: options.reason }),
            })
            const revoked = yield* revokeSessionWriteClaim(options.session)
            if (!revoked) {
              return yield* RuntimeUnavailable.make({
                message: `Run ${options.runId} Session write binding was not revoked`,
              })
            }
            const sql = yield* SqlClient.SqlClient
            yield* sql.onDialectOrElse({
              pg: () =>
                sql`UPDATE tenetkit_runs SET owner_worker_id = NULL, lease_expires_at = NULL WHERE run_id = ${options.runId}`,
              mysql: () =>
                sql`UPDATE tenetkit_runs SET owner_worker_id = NULL, lease_expires_at = NULL WHERE run_id = ${options.runId}`,
              orElse: () => sql`UPDATE tenetkit_runs SET owner_worker_id = NULL WHERE run_id = ${options.runId}`,
            })
            return
          }
          if (isTerminal(loaded.status)) {
            return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
          }
          if (options.transition === "complete") {
            const result = yield* Schema.decodeUnknownEffect(ExecutionResult)(options.result).pipe(
              Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
            )
            yield* complete(input.transactionHub, { ...executionClaim, result })
            return
          }
          yield* fail(input.transactionHub, {
            ...executionClaim,
            error: AgentExecutionFailure.make({
              message: failureMessage(options.error?.message ?? "failed"),
            }),
          })
        }),
      ),
  })
}
