import { childAdmissionBoundsSuite } from "../child-admission-bounds-suite.js"
import { claimReadyWorker } from "../queued-run-activation.js"
import { postgresAvailable, postgresDatabase, postgresLayer } from "./helpers.js"

const database = postgresDatabase("child-admission-bounds")
childAdmissionBoundsSuite({
  name: "postgres",
  storeLayer: database.provision(postgresLayer(database.url)),
  activate: claimReadyWorker("child-admission-bounds"),
  skip: !postgresAvailable,
})
