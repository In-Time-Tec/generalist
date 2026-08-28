import { messagingAuthorizationSuite } from "../../../../tenetkit/test/runtime/messaging/suites/authorization.js"
import { messagingDeliveryIdempotenceSuite } from "../../../../tenetkit/test/runtime/messaging/suites/delivery/idempotence.js"
import { messagingDurabilitySuite } from "../../../../tenetkit/test/runtime/messaging/suites/delivery/durability.js"
import { messagingMailboxSuite } from "../../../../tenetkit/test/runtime/messaging/suites/mailbox.js"
import { messagingPolicySuite } from "../../../../tenetkit/test/runtime/messaging/suites/policy.js"
import { messagingSendOperationSuite } from "../../../../tenetkit/test/runtime/messaging/suites/send-operation.js"
import { claimReadyWorker } from "../../../../tenetkit/test/runtime/run/queued-activation.js"
import { postgresAvailable, postgresDatabase, postgresMessagingLayer, postgresLayer } from "../database.js"

/**
 * Addressed messaging on a real PostgreSQL server.
 *
 * Mailbox bounds, admission identity, ordering, authorization, and delivery are SQL predicates over
 * real column widths and row locks here, not in-process traversal, so each contract is proven
 * against the server rather than assumed from the memory backend.
 *
 * The memory and SQLite Runtimes bundle a LocalScheduler that promotes a queued Run itself. The SQL
 * Runtimes expect an external worker, so every suite claims ready work before it acts on a Run.
 */
const database = postgresDatabase("messaging-parity")
const activate = claimReadyWorker("messaging-parity")
const skip = !postgresAvailable
const backend = {
  name: "PostgreSQL",
  layer: postgresMessagingLayer(database),
  activate,
  skip,
} as const

messagingMailboxSuite(backend)
messagingAuthorizationSuite(backend)
messagingPolicySuite(backend)
messagingDeliveryIdempotenceSuite(backend)
messagingSendOperationSuite(backend)
messagingDurabilitySuite({
  name: "postgres",
  storeLayer: database.provision(postgresLayer(database.url)),
  activate,
  skip,
})
