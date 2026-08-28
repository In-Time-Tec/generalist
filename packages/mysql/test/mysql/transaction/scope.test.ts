import { childAdmissionSuite } from "../../../../tenetkit/test/runtime/child/suites/admission.js"
import { nestedOperationsSuite } from "../../../../tenetkit/test/runtime/operation/suites/nested.js"
import { claimReadyWorker } from "../../../../tenetkit/test/runtime/run/queued-activation.js"
import { strandedDeliverySuite } from "../../../../tenetkit/test/runtime/messaging/suites/delivery/stranded.js"
import { mysqlAvailable, mysqlDatabase, mysqlLayer } from "../runtime/environment.js"

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
