import { childRunsRunGroupSuite } from "../../../../../tenetkit/test/runtime/child/suites/run-group.js"
import { claimReadyWorker } from "../../../../../tenetkit/test/runtime/run/queued-activation.js"
import { postgresAvailable, postgresDatabase, postgresLayer } from "../../database.js"

const database = postgresDatabase("child-runs-run-group")
childRunsRunGroupSuite({
  name: "PostgreSQL",
  storeLayer: database.provision(postgresLayer(database.url)),
  activate: claimReadyWorker("child-runs-run-group"),
  skip: !postgresAvailable,
})
