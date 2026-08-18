import { messagingAuthorizationSuite } from "../../tenetkit/test/runtime/messaging-authorization-suite.js"
import { messagingDeliveryIdempotenceSuite } from "../../tenetkit/test/runtime/messaging-delivery-idempotence-suite.js"
import { messagingDurabilitySuite } from "../../tenetkit/test/runtime/messaging-durability-suite.js"
import { messagingMailboxSuite } from "../../tenetkit/test/runtime/messaging-mailbox-suite.js"
import { messagingPolicySuite } from "../../tenetkit/test/runtime/messaging-policy-suite.js"
import { messagingSendOperationSuite } from "../../tenetkit/test/runtime/messaging-send-operation-suite.js"
import { claimReadyWorker } from "../../tenetkit/test/runtime/queued-run-activation.js"
import { mysqlAvailable, mysqlDatabase, mysqlMessagingLayer, mysqlLayer } from "./helpers.js"

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
