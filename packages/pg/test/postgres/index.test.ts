import {
  driverConformance,
  type ClaimExecution,
  type MultiWorkerClaimCapability,
  type SqlTransactionCapability,
} from "tenetkit/test/runtime-driver"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { assistantAddress } from "../../../tenetkit/test/runtime/execution/fixtures.js"
import { postgresAvailable, postgresDatabase, postgresLayer } from "./database.js"

const database = postgresDatabase("runtime-driver-conformance")
const layer = postgresLayer(database.url)

const withClient = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.scoped(Effect.flatMap(Layer.build(database.client), (context) => effect.pipe(Effect.provideContext(context))))

const claim: ClaimExecution = (services, { runId, workerId }) => {
  const claims = services.claims
  if (claims === undefined) return Effect.die("PostgreSQL conformance layer does not provide RunClaims")
  return Effect.gen(function* () {
    const [claimed] = yield* claims.claimReadyRuns({ workerId, limit: 1, lease: "10 seconds" })
    if (claimed === undefined || claimed.run.runId !== runId) {
      return yield* Effect.die(`PostgreSQL did not claim conformance Run ${runId}`)
    }
    return { runId, ownerId: claimed.workerId, attemptFence: claimed.attemptFence, session: claimed.session }
  }).pipe(Effect.orDie)
}

const installRollback = withClient(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql.unsafe(`
      CREATE OR REPLACE FUNCTION tenetkit_conformance_rollback() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM tenetkit_run_events
          WHERE event_id = NEW.event_id AND event_json LIKE '%"_tag":"RunCompleted"%'
        ) THEN
          RAISE EXCEPTION 'forced conformance rollback';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `)
    yield* sql.unsafe(`
      CREATE CONSTRAINT TRIGGER tenetkit_conformance_rollback
      AFTER INSERT ON tenetkit_tree_event_index
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION tenetkit_conformance_rollback()
    `)
  }),
)

const removeRollback = withClient(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql.unsafe(`DROP TRIGGER IF EXISTS tenetkit_conformance_rollback ON tenetkit_tree_event_index`)
    yield* sql.unsafe(`DROP FUNCTION IF EXISTS tenetkit_conformance_rollback()`)
  }),
)

const forceRollback: SqlTransactionCapability["forceRollback"] = (effect) =>
  Effect.acquireUseRelease(
    installRollback.pipe(Effect.orDie),
    () => effect,
    () => removeRollback.pipe(Effect.orDie),
  )

const expire: MultiWorkerClaimCapability["expire"] = (stale) =>
  withClient(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`
        UPDATE tenetkit_runs
        SET lease_expires_at = NOW() - INTERVAL '1 second'
        WHERE run_id = ${stale.runId}
          AND owner_worker_id = ${stale.workerId}
          AND attempt_fence = ${stale.attemptFence}
      `
    }),
  ).pipe(Effect.orDie)

driverConformance({
  name: "PostgreSQL",
  address: assistantAddress,
  layer,
  setup: database.ready.pipe(Effect.orDie),
  skip: !postgresAvailable,
  capabilities: {
    admission: true,
    runtime: { claim },
    runTree: { claim },
    sqlTransactions: { claim, forceRollback },
    multiWorkerClaims: { layer, expire },
    notificationRecovery: { claim },
  },
})
