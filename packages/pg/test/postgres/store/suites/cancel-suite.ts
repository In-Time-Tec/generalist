import { layer } from "@generalist/pg"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RunClaims } from "generalist/runtime/sql-driver"
import { provideScoped } from "../../../../../generalist/test/runtime/execution/scoped-provide.js"
import { cancellationConvergenceSuite } from "../../../../../generalist/test/runtime/operation/suites/cancellation-convergence-suite.js"
import { operationRecoverySuite } from "../../../../../generalist/test/runtime/operation/suites/recovery.js"
import { toolCancellationSuite } from "../../../../../generalist/test/runtime/operation/suites/tool-cancellation.js"
import { postgresAvailable, postgresDatabase, postgresLayer, postgresTestMaxConnections } from "../../database.js"

const database = postgresDatabase("operation-recovery")
const cancellationDatabase = postgresDatabase("cancellation-convergence")

operationRecoverySuite({
  name: "PostgreSQL",
  skip: !postgresAvailable,
  makeLayer: (options) =>
    database.provision(
      layer({
        ...options,
        url: database.url,
        source: "postgres-test",
        maxConnections: postgresTestMaxConnections,
      }),
    ),
  claim: (runId, ownerId) =>
    Effect.gen(function* () {
      const claims = yield* RunClaims
      const batch = yield* claims.claimReadyRuns({ workerId: ownerId, limit: 10, lease: "10 seconds" })
      const claimed = batch.find((item) => item.run.runId === runId)
      yield* Effect.forEach(
        batch.filter((item) => item !== claimed),
        (item) =>
          claims.releaseClaim({
            runId: item.run.runId,
            workerId: item.workerId,
            attemptFence: item.attemptFence,
            session: item.session,
          }),
        { discard: true },
      )
      if (claimed === undefined) return yield* Effect.die(`claim missing for ${runId} (${ownerId})`)
      return { runId, ownerId, attemptFence: claimed.attemptFence, session: claimed.session }
    }),
  expireClaim: (runId) =>
    provideScoped(
      database.client,
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql`UPDATE generalist_runs SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE run_id = ${runId}`,
      ),
    ).pipe(Effect.scoped, Effect.asVoid),
})

toolCancellationSuite({
  name: "postgres",
  skip: !postgresAvailable,
  makeLayer: (options) =>
    database.provision(
      layer({
        ...options,
        url: database.url,
        source: "postgres-test",
        maxConnections: postgresTestMaxConnections,
      }),
    ),
  claim: (runId, ownerId) =>
    Effect.gen(function* () {
      const claims = yield* RunClaims
      const batch = yield* claims.claimReadyRuns({ workerId: ownerId, limit: 10, lease: "10 seconds" })
      const claimed = batch.find((item) => item.run.runId === runId)
      yield* Effect.forEach(
        batch.filter((item) => item !== claimed),
        (item) =>
          claims.releaseClaim({
            runId: item.run.runId,
            workerId: item.workerId,
            attemptFence: item.attemptFence,
            session: item.session,
          }),
        { discard: true },
      )
      if (claimed === undefined) return yield* Effect.die(`claim missing for ${runId} (${ownerId})`)
      return { runId, ownerId, attemptFence: claimed.attemptFence, session: claimed.session }
    }),
  expireClaim: (runId) =>
    provideScoped(
      database.client,
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql`UPDATE generalist_runs SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE run_id = ${runId}`,
      ),
    ).pipe(Effect.scoped, Effect.asVoid),
})

cancellationConvergenceSuite({
  name: "postgres",
  skip: !postgresAvailable,
  storeLayer: cancellationDatabase.provision(postgresLayer(cancellationDatabase.url)),
  claim: (runId, ownerId) =>
    Effect.gen(function* () {
      const claims = yield* RunClaims
      const batch = yield* claims.claimReadyRuns({ workerId: ownerId, limit: 10, lease: "10 seconds" })
      const claimed = batch.find((item) => item.run.runId === runId)
      yield* Effect.forEach(
        batch.filter((item) => item !== claimed),
        (item) =>
          claims.releaseClaim({
            runId: item.run.runId,
            workerId: item.workerId,
            attemptFence: item.attemptFence,
            session: item.session,
          }),
        { discard: true },
      )
      if (claimed === undefined) return yield* Effect.die(`claim missing for ${runId} (${ownerId})`)
      return { runId, ownerId, attemptFence: claimed.attemptFence, session: claimed.session }
    }),
})
