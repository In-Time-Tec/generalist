import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { failureMessage } from "../../../errors-internal.js"
import { AgentExecutionFailure, RunTerminal, RuntimeUnavailable } from "../../../errors.js"
import { ExecutionResult } from "../../../execution/state.js"
import { isTerminal } from "../../../run.js"
import { StaleClaim } from "../../errors.js"
import { RunClaims, type ClaimedRun } from "../../run/claims.js"
import { revokeSessionWriteClaim } from "../../session/claim.js"
import { cancel, complete, fail } from "../control.js"
import { releaseExecution, requireExecutionClaim } from "../execution.js"
import { appendEvent, loadRun } from "../statements.js"
import type { SqlClaimMechanics, SqlStoreLocks, SqlStoreRun } from "../driver/protocol.js"
import { SqlObservability } from "./observability.js"
import type { EventHub } from "../../subscribers.js"
import type { StoreBackend } from "../../../run/store.js"

/** Adapt dialect claim mechanics to Runtime's lifecycle-aware claim service. */
export const sqlClaims = (input: {
  readonly backend: Exclude<StoreBackend, "memory">
  readonly mechanics: SqlClaimMechanics
  readonly run: SqlStoreRun
  readonly transactionHub: EventHub
  readonly locks: SqlStoreLocks
}): RunClaims["Service"] => {
  const claim = (
    runId: string,
    workerId: string,
    attemptFence: number,
    session: import("../../../run/store.js").SessionWriteClaim,
  ) => ({ runId, ownerId: workerId, attemptFence, session })
  const observed = <A, E>(
    transition: string,
    effect: Effect.Effect<A, E | import("effect/unstable/sql/SqlError").SqlError, SqlClient.SqlClient>,
    runId?: string,
  ) =>
    SqlObservability.observeTransition(
      input.backend,
      transition,
      runId === undefined ? {} : { runId },
      input.run(effect),
    )

  return RunClaims.of({
    changes: input.mechanics.changes,
    claimReadyRuns: (options) =>
      observed(
        "claimReadyRuns",
        Effect.gen(function* () {
          const claimed = yield* SqlObservability.observeLock(
            input.backend,
            "ready-claim",
            input.mechanics.claimReadyRuns(options),
          )
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
          yield* SqlObservability.recordReadyClaimBatch(
            input.backend,
            result.length,
            claimed.filter((item) => !item.startedAttempt).length,
          )
          return result
        }),
      ),
    refreshLease: (options) =>
      observed(
        "refreshLease",
        input.locks.run(options.runId).pipe(
          Effect.andThen(
            requireExecutionClaim(claim(options.runId, options.workerId, options.attemptFence, options.session)),
          ),
          Effect.andThen(input.mechanics.refreshLease(options)),
          Effect.catchTag(
            ["generalist/runtime/RunNotFound", "generalist/runtime/StaleClaim", "generalist/runtime/StaleSessionClaim"],
            () => Effect.succeed(false),
          ),
        ),
        options.runId,
      ),
    releaseClaim: (options) =>
      observed(
        "releaseClaim",
        input.locks
          .run(options.runId)
          .pipe(
            Effect.andThen(
              releaseExecution(claim(options.runId, options.workerId, options.attemptFence, options.session)),
            ),
            Effect.andThen(input.transactionHub.touchRun(options.runId)),
          ),
        options.runId,
      ),
    commitWithClaim: (options) =>
      observed(
        "commitWithClaim",
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
                sql`UPDATE generalist_runs SET owner_worker_id = NULL, lease_expires_at = NULL WHERE run_id = ${options.runId}`,
              mysql: () =>
                sql`UPDATE generalist_runs SET owner_worker_id = NULL, lease_expires_at = NULL WHERE run_id = ${options.runId}`,
              orElse: () => sql`UPDATE generalist_runs SET owner_worker_id = NULL WHERE run_id = ${options.runId}`,
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
        options.runId,
      ),
  })
}
