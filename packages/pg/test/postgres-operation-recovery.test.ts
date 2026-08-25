import { layerPostgres } from "@tenetkit/pg"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RunClaims } from "tenetkit/runtime"
import { provideScoped } from "../../tenetkit/test/runtime/scoped-provide.js"
import { operationRecoverySuite } from "../../tenetkit/test/runtime/operation-recovery-suite.js"
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
      const claimed = (yield* claims.claimReadyRuns({ workerId: ownerId, limit: 10, lease: "10 seconds" })).find(
        (item) => item.run.runId === runId,
      )
      if (claimed === undefined) return yield* Effect.die(`claim missing for ${runId}`)
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
