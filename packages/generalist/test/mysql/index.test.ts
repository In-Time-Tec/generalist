import { messagingAuthorizationSuite } from "../../../generalist/test/runtime/messaging/suites/authorization.js"
import { messagingDeliveryIdempotenceSuite } from "../../../generalist/test/runtime/messaging/suites/delivery/idempotence.js"
import { messagingDurabilitySuite } from "../../../generalist/test/runtime/messaging/suites/delivery/durability.js"
import { messagingMailboxSuite } from "../../../generalist/test/runtime/messaging/suites/mailbox.js"
import { messagingPolicySuite } from "../../../generalist/test/runtime/messaging/suites/policy.js"
import { messagingSendOperationSuite } from "../../../generalist/test/runtime/messaging/suites/send-operation.js"
import { claimReadyWorker } from "../../../generalist/test/runtime/run/queued-activation.js"
import { assistantAddress } from "../../../generalist/test/runtime/execution/fixtures.js"
import {
  modelResponseFaultConformance,
  sqlTransactionFaultConformance,
  type ClaimExecution,
  type ModelResponseFaultBoundary,
} from "generalist/testing/runtime-driver"
import { Testing } from "generalist/testing"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { mysqlAvailable, mysqlDatabase, mysqlMessagingLayer, mysqlLayer } from "./runtime/environment.js"

/**
 * Addressed messaging on a real MySQL server.
 *
 * Mailbox bounds, admission identity, ordering, authorization, and delivery are SQL predicates over
 * real column widths and row locks here, not in-process traversal, so each contract is proven
 * against the server rather than assumed from the memory backend.
 *
 * The memory and SQLite Runtimes bundle a LocalScheduler that promotes a queued Run itself. The SQL
 * Runtimes expect an external worker, so every suite claims ready work before it acts on a Run.
 */
const database = mysqlDatabase("messaging-parity")
const activate = claimReadyWorker("messaging-parity")
const skip = !mysqlAvailable
const backend = {
  name: "mysql",
  layer: mysqlMessagingLayer(database),
  activate,
  skip,
} as const

messagingMailboxSuite(backend)
messagingAuthorizationSuite(backend)
messagingPolicySuite(backend)
messagingDeliveryIdempotenceSuite(backend)
messagingSendOperationSuite(backend)
messagingDurabilitySuite({
  name: "mysql",
  storeLayer: database.provision(mysqlLayer(database.url)),
  activate,
  skip,
})

const conformanceDatabase = mysqlDatabase("runtime-driver-conformance")
const conformanceLayer = conformanceDatabase.provision(mysqlLayer(conformanceDatabase.url))
const conformanceClaim: ClaimExecution = (services, { runId, workerId }) => {
  const claims = services.claims
  if (claims === undefined) return Effect.die("MySQL conformance layer does not provide RunClaims")
  return Effect.gen(function* () {
    const claimed = yield* claims.claimReadyRuns({ workerId, limit: 16, lease: "10 seconds" })
    const run = claimed.find((candidate) => candidate.run.runId === runId)
    if (run === undefined) return yield* Effect.die(`MySQL did not claim conformance Run ${runId}`)
    return { runId, ownerId: run.workerId, attemptFence: run.attemptFence, session: run.session }
  }).pipe(Effect.orDie)
}

const withConformanceClient = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.scoped(
    Effect.flatMap(Layer.build(conformanceDatabase.client), (context) => effect.pipe(Effect.provideContext(context))),
  )

const faultTarget = (boundary: ModelResponseFaultBoundary) => {
  switch (boundary) {
    case "after-claim-validation":
      return { timing: "BEFORE", operation: "INSERT", table: "generalist_session_entries" }
    case "after-session-entry":
      return { timing: "BEFORE", operation: "UPDATE", table: "generalist_sessions" }
    case "after-session-leaf":
      return { timing: "BEFORE", operation: "UPDATE", table: "generalist_run_operations" }
    case "after-operation":
    case "after-tree-index":
      return { timing: "BEFORE", operation: "UPDATE", table: "generalist_runs" }
    case "after-checkpoint":
      return { timing: "BEFORE", operation: "INSERT", table: "generalist_run_events" }
    case "after-event":
      return { timing: "BEFORE", operation: "UPDATE", table: "generalist_tree_roots" }
    case "after-tree-position":
      return { timing: "BEFORE", operation: "INSERT", table: "generalist_tree_event_index" }
    case "before-commit":
      return { timing: "AFTER", operation: "UPDATE", table: "generalist_runs" }
  }
}

const installModelFault = (input: { readonly boundary: ModelResponseFaultBoundary }) =>
  withConformanceClient(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const target = faultTarget(input.boundary)
      const signal = `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${input.boundary}'`
      const body =
        input.boundary === "after-tree-index" || input.boundary === "before-commit"
          ? `BEGIN IF NEW.last_sequence > OLD.last_sequence THEN ${signal}; END IF; END`
          : signal
      yield* sql.unsafe(`
        CREATE TRIGGER generalist_model_response_fault
        ${target.timing} ${target.operation} ON ${target.table}
        FOR EACH ROW ${body}
      `).unprepared
    }),
  ).pipe(Effect.orDie)

const removeModelFault = () =>
  withConformanceClient(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql.unsafe("DROP TRIGGER IF EXISTS generalist_model_response_fault").unprepared
    }),
  ).pipe(Effect.orDie)

Testing.runtimeDriver({
  name: "MySQL",
  address: assistantAddress,
  layer: conformanceLayer,
  skip,
  capabilities: {
    runtime: { claim: conformanceClaim },
    "host-sessions": { claim: conformanceClaim },
    "start-by-agent": { claim: conformanceClaim },
    "idempotent-start": { claim: conformanceClaim },
    "unknown-agent-on-recovery": { claim: conformanceClaim },
    "operator-explain": true,
    "operator-retry": { claim: conformanceClaim },
    "operator-resolve-unknown": { claim: conformanceClaim },
    "operator-scan": { claim: conformanceClaim },
  },
})

modelResponseFaultConformance({
  name: "MySQL",
  address: assistantAddress,
  layer: conformanceLayer,
  skip,
  claim: ({ claims, runId, workerId }) => {
    if (claims === undefined) return Effect.die("MySQL fault conformance requires RunClaims")
    return Effect.gen(function* () {
      const batch = yield* claims.claimReadyRuns({ workerId, limit: 16, lease: "10 seconds" })
      const claimed = batch.find((candidate) => candidate.run.runId === runId)
      if (claimed === undefined) return yield* Effect.die(`MySQL did not claim fault Run ${runId}`)
      return { runId, ownerId: claimed.workerId, attemptFence: claimed.attemptFence, session: claimed.session }
    }).pipe(Effect.orDie)
  },
  install: installModelFault,
  remove: removeModelFault,
})

const transactionFaultDatabase = mysqlDatabase("transaction-fault-conformance")
sqlTransactionFaultConformance({
  name: "MySQL",
  layer: transactionFaultDatabase.provisionEmpty(transactionFaultDatabase.client),
  skip,
})
