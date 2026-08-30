import {
  driverConformance,
  modelResponseFaultConformance,
  sqlTransactionFaultConformance,
  type ClaimExecution,
  type ModelResponseFaultBoundary,
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

const faultTarget = (boundary: ModelResponseFaultBoundary) => {
  switch (boundary) {
    case "after-claim-validation":
      return { timing: "BEFORE", operation: "INSERT", table: "tenetkit_session_entries" }
    case "after-session-entry":
      return { timing: "BEFORE", operation: "UPDATE", table: "tenetkit_sessions" }
    case "after-session-leaf":
      return { timing: "BEFORE", operation: "UPDATE", table: "tenetkit_run_operations" }
    case "after-operation":
    case "after-tree-index":
      return { timing: "BEFORE", operation: "UPDATE", table: "tenetkit_runs" }
    case "after-checkpoint":
      return { timing: "BEFORE", operation: "INSERT", table: "tenetkit_run_events" }
    case "after-event":
      return { timing: "BEFORE", operation: "UPDATE", table: "tenetkit_tree_roots" }
    case "after-tree-position":
      return { timing: "BEFORE", operation: "INSERT", table: "tenetkit_tree_event_index" }
    case "before-commit":
      return { timing: "AFTER", operation: "UPDATE", table: "tenetkit_runs" }
  }
}

const quote = (value: string): string => value.replaceAll("'", "''")
const faultCondition = (boundary: ModelResponseFaultBoundary, runId: string, sessionId: string): string => {
  switch (boundary) {
    case "after-claim-validation":
      return `NEW.session_id = '${quote(sessionId)}' AND NEW.tag = 'ModelResponse'`
    case "after-session-entry":
      return `NEW.session_id = '${quote(sessionId)}' AND NEW.leaf_id IS DISTINCT FROM OLD.leaf_id`
    case "after-session-leaf":
      return `NEW.run_id = '${quote(runId)}' AND NEW.status = 'succeeded'`
    case "after-operation":
      return `NEW.run_id = '${quote(runId)}' AND NEW.driver_checkpoint_json IS DISTINCT FROM OLD.driver_checkpoint_json`
    case "after-checkpoint":
      return `NEW.run_id = '${quote(runId)}' AND NEW.event_json LIKE '%ModelResponseCommitted%'`
    case "after-event":
      return `NEW.root_run_id = '${quote(runId)}'`
    case "after-tree-position":
      return `NEW.run_id = '${quote(runId)}'`
    case "after-tree-index":
    case "before-commit":
      return `NEW.run_id = '${quote(runId)}' AND NEW.last_sequence > OLD.last_sequence`
  }
}

const installModelFault = (input: {
  readonly boundary: ModelResponseFaultBoundary
  readonly runId: string
  readonly sessionId: string
}) =>
  withClient(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const target = faultTarget(input.boundary)
      yield* sql.unsafe(`
        CREATE OR REPLACE FUNCTION tenetkit_model_response_fault() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION '${input.boundary}';
        END;
        $$ LANGUAGE plpgsql
      `)
      yield* sql.unsafe(`
        CREATE TRIGGER tenetkit_model_response_fault
        ${target.timing} ${target.operation} ON ${target.table}
        FOR EACH ROW WHEN (${faultCondition(input.boundary, input.runId, input.sessionId)})
        EXECUTE FUNCTION tenetkit_model_response_fault()
      `)
    }),
  ).pipe(Effect.orDie)

const removeModelFault = (boundary: ModelResponseFaultBoundary) =>
  withClient(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql.unsafe(`DROP TRIGGER IF EXISTS tenetkit_model_response_fault ON ${faultTarget(boundary).table}`)
      yield* sql.unsafe(`DROP FUNCTION IF EXISTS tenetkit_model_response_fault()`)
    }),
  ).pipe(Effect.orDie)

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

modelResponseFaultConformance({
  name: "PostgreSQL",
  address: assistantAddress,
  layer,
  skip: !postgresAvailable,
  claim: ({ claims, runId, workerId }) => {
    if (claims === undefined) return Effect.die("PostgreSQL fault conformance requires RunClaims")
    return Effect.gen(function* () {
      const batch = yield* claims.claimReadyRuns({ workerId, limit: 1, lease: "10 seconds" })
      const claimed = batch.find((candidate) => candidate.run.runId === runId)
      if (claimed === undefined) return yield* Effect.die(`PostgreSQL did not claim fault Run ${runId}`)
      return { runId, ownerId: claimed.workerId, attemptFence: claimed.attemptFence, session: claimed.session }
    }).pipe(Effect.orDie)
  },
  install: installModelFault,
  remove: removeModelFault,
})

const transactionFaultDatabase = postgresDatabase("transaction-fault-conformance")
sqlTransactionFaultConformance({
  name: "PostgreSQL",
  layer: transactionFaultDatabase.provisionEmpty(transactionFaultDatabase.client),
  skip: !postgresAvailable,
})
