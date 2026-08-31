import "../store/suites/worker-wakeup-suite.js"
import { childAdmissionBoundsSuite } from "../../../../generalist/test/runtime/child/suites/admission-bounds.js"
import { claimReadyWorker } from "../../../../generalist/test/runtime/run/queued-activation.js"
import { postgresAvailable, postgresDatabase, postgresLayer } from "../database.js"

const database = postgresDatabase("child-admission-bounds")
childAdmissionBoundsSuite({
  name: "PostgreSQL",
  storeLayer: database.provision(postgresLayer(database.url)),
  activate: claimReadyWorker("child-admission-bounds"),
  skip: !postgresAvailable,
})
