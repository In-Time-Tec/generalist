import { layerMysql } from "@tenetkit/mysql"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RunClaims } from "tenetkit/runtime"
import { operationRecoverySuite } from "../../../../tenetkit/test/runtime/operation/suites/recovery.js"
import { toolCancellationSuite } from "../../../../tenetkit/test/runtime/operation/suites/tool-cancellation.js"
import { provideScoped } from "../../../../tenetkit/test/runtime/execution/scoped-provide.js"
import { mysqlAvailable, mysqlDatabase } from "../runtime/environment.js"

const database = mysqlDatabase("operation-recovery")

operationRecoverySuite({
  name: "mysql",
  skip: !mysqlAvailable,
  makeLayer: (options) =>
    database.provision(
      layerMysql({
        ...options,
        url: database.url,
        source: "mysql-test",
        maxConnections: 4,
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
        (sql) => sql`UPDATE tenetkit_runs SET lease_expires_at = '2000-01-01 00:00:00.000' WHERE run_id = ${runId}`,
      ),
    ).pipe(Effect.scoped, Effect.asVoid, Effect.orDie),
})

toolCancellationSuite({
  name: "mysql",
  skip: !mysqlAvailable,
  makeLayer: (options) =>
    database.provision(
      layerMysql({
        ...options,
        url: database.url,
        source: "mysql-test",
        maxConnections: 4,
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
        (sql) => sql`UPDATE tenetkit_runs SET lease_expires_at = '2000-01-01 00:00:00.000' WHERE run_id = ${runId}`,
      ),
    ).pipe(Effect.scoped, Effect.asVoid, Effect.orDie),
})
