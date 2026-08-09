import { childAdmissionSuite } from "../child-admission-suite.js"
import { nestedOperationsSuite } from "../nested-operations-suite.js"
import { claimReadyWorker } from "../queued-run-activation.js"
import { strandedDeliverySuite } from "../stranded-delivery-suite.js"
import { mysqlAvailable, mysqlDatabase, mysqlLayer } from "./helpers.js"

/**
 * Memory and SQLite answer these contracts from in-process traversal and a single-writer file.
 * MySQL answers them from SQL predicates, transactions, and row locks under its own bound-parameter
 * and column-width rules, so the durability contracts need their own proof against a real server.
 *
 * The memory and SQLite Runtimes bundle a LocalScheduler that promotes a queued Run itself. The SQL
 * Runtimes expect an external worker, so each suite claims ready work before it acts on a Run.
 */
const database = mysqlDatabase("runtime-parity")
const storeLayer = database.provision(mysqlLayer(database.url))
const skip = !mysqlAvailable

nestedOperationsSuite({ name: "mysql", storeLayer, activate: claimReadyWorker("parity-nested"), skip })
childAdmissionSuite({ name: "mysql", storeLayer, activate: claimReadyWorker("parity-children"), skip })
strandedDeliverySuite({ name: "mysql", storeLayer, activate: claimReadyWorker("parity-stranded"), skip })
