import { messagingAuthorizationSuite } from "../../../tenetkit/test/runtime/messaging/suites/authorization.js"
import { messagingDeliveryIdempotenceSuite } from "../../../tenetkit/test/runtime/messaging/suites/delivery/idempotence.js"
import { messagingDurabilitySuite } from "../../../tenetkit/test/runtime/messaging/suites/delivery/durability.js"
import { messagingMailboxSuite } from "../../../tenetkit/test/runtime/messaging/suites/mailbox.js"
import { messagingPolicySuite } from "../../../tenetkit/test/runtime/messaging/suites/policy.js"
import { messagingSendOperationSuite } from "../../../tenetkit/test/runtime/messaging/suites/send-operation.js"
import { claimReadyWorker } from "../../../tenetkit/test/runtime/run/queued-activation.js"
import { assistantAddress } from "../../../tenetkit/test/runtime/execution/fixtures.js"
import { driverConformance, type ClaimExecution } from "tenetkit/test/runtime-driver"
import { Effect } from "effect"
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

driverConformance({
  name: "MySQL",
  address: assistantAddress,
  layer: conformanceLayer,
  skip,
  capabilities: { runtime: { claim: conformanceClaim } },
})
