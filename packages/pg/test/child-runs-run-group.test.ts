import { childRunsRunGroupSuite } from "../../tenetkit/test/runtime/child-runs-run-group-suite.js"
import { claimReadyWorker } from "../../tenetkit/test/runtime/queued-run-activation.js"
import { postgresAvailable, postgresDatabase, postgresLayer } from "./helpers.js"

const database = postgresDatabase("child-runs-run-group")
childRunsRunGroupSuite({
  name: "postgres",
  storeLayer: database.provision(postgresLayer(database.url)),
  activate: claimReadyWorker("child-runs-run-group"),
  skip: !postgresAvailable,
})
