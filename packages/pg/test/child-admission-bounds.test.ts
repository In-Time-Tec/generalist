import { childAdmissionBoundsSuite } from "../../tenetkit/test/runtime/child-admission-bounds-suite.js"
import { claimReadyWorker } from "../../tenetkit/test/runtime/queued-run-activation.js"
import { postgresAvailable, postgresDatabase, postgresLayer } from "./helpers.js"

const database = postgresDatabase("child-admission-bounds")
childAdmissionBoundsSuite({
  name: "postgres",
  storeLayer: database.provision(postgresLayer(database.url)),
  activate: claimReadyWorker("child-admission-bounds"),
  skip: !postgresAvailable,
})
