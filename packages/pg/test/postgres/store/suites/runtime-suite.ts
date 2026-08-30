import { childAdmissionSuite } from "../../../../../tenetkit/test/runtime/child/suites/admission.js"
import { nestedOperationsSuite } from "../../../../../tenetkit/test/runtime/operation/suites/nested.js"
import { claimReadyWorker } from "../../../../../tenetkit/test/runtime/run/queued-activation.js"
import { strandedDeliverySuite } from "../../../../../tenetkit/test/runtime/messaging/suites/delivery/stranded.js"
import { postgresAvailable, postgresDatabase, postgresLayer } from "../../database.js"

/**
 * Memory and SQLite answer these contracts from in-process traversal and a single-writer file.
 * PostgreSQL answers them from SQL predicates, transactions, and row locks, so the durability
 * contracts need their own proof against a real server rather than parity by assertion.
 *
 * The memory and SQLite Runtimes bundle a LocalScheduler that promotes a queued Run itself. The SQL
 * Runtimes expect an external worker, so each suite claims ready work before it acts on a Run.
 */
const database = postgresDatabase("runtime-parity")
const storeLayer = database.provision(postgresLayer(database.url))
const skip = !postgresAvailable

nestedOperationsSuite({ name: "PostgreSQL", storeLayer, activate: claimReadyWorker("parity-nested"), skip })
childAdmissionSuite({ name: "postgres", storeLayer, activate: claimReadyWorker("parity-children"), skip })
strandedDeliverySuite({ name: "postgres", storeLayer, activate: claimReadyWorker("parity-stranded"), skip })
