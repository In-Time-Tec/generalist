import { layerPostgres } from "@tenetkit/pg"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RunClaims } from "tenetkit/runtime"
import { provideScoped } from "../../tenetkit/test/runtime/scoped-provide.js"
import { operationRecoverySuite } from "../../tenetkit/test/runtime/operation-recovery-suite.js"
import { toolCancellationSuite } from "../../tenetkit/test/runtime/tool-cancellation-suite.js"
import { postgresAvailable, postgresDatabase, postgresTestMaxConnections } from "./helpers.js"

const database = postgresDatabase("operation-recovery")

operationRecoverySuite({
  name: "postgres",
  skip: !postgresAvailable,
  makeLayer: (options) =>
    database.provision(
      layerPostgres({
        ...options,
        url: database.url,
        source: "postgres-test",
        maxConnections: postgresTestMaxConnections,
      }),
    ),
  claim: (runId, ownerId) =>
    Effect.gen(function* () {
      const claims = yield* RunClaims.RunClaims
      const batch = yield* claims.claimReadyRuns({ workerId: ownerId, limit: 10, lease: "10 seconds" })
      const claimed = batch.find((item) => item.run.runId === runId)
      yield* Effect.forEach(
        batch.filter((item) => item !== claimed),
        (item) =>
          claims.releaseClaim({
            runId: item.run.runId,
            workerId: item.workerId,
            attemptFence: item.attemptFence,
          }),
        { discard: true },
      )
      if (claimed === undefined) return yield* Effect.die(`claim missing for ${runId} (${ownerId})`)
      return { runId, ownerId, attemptFence: claimed.attemptFence }
    }),
  expireClaim: (runId) =>
    provideScoped(
      database.client,
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql`UPDATE tenetkit_runs SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE run_id = ${runId}`,
      ),
    ).pipe(Effect.scoped, Effect.asVoid),
})

toolCancellationSuite({
  name: "postgres",
  skip: !postgresAvailable,
  makeLayer: (options) =>
    database.provision(
      layerPostgres({
        ...options,
        url: database.url,
        source: "postgres-test",
        maxConnections: postgresTestMaxConnections,
      }),
    ),
  claim: (runId, ownerId) =>
    Effect.gen(function* () {
      const claims = yield* RunClaims.RunClaims
      const batch = yield* claims.claimReadyRuns({ workerId: ownerId, limit: 10, lease: "10 seconds" })
      const claimed = batch.find((item) => item.run.runId === runId)
      yield* Effect.forEach(
        batch.filter((item) => item !== claimed),
        (item) =>
          claims.releaseClaim({
            runId: item.run.runId,
            workerId: item.workerId,
            attemptFence: item.attemptFence,
          }),
        { discard: true },
      )
      if (claimed === undefined) return yield* Effect.die(`claim missing for ${runId} (${ownerId})`)
      return { runId, ownerId, attemptFence: claimed.attemptFence }
    }),
  expireClaim: (runId) =>
    provideScoped(
      database.client,
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql`UPDATE tenetkit_runs SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE run_id = ${runId}`,
      ),
    ).pipe(Effect.scoped, Effect.asVoid),
})
