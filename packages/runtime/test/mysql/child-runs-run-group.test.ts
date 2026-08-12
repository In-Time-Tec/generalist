import { childRunsRunGroupSuite } from "../child-runs-run-group-suite.js"
import { claimReadyWorker } from "../queued-run-activation.js"
import { mysqlAvailable, mysqlDatabase, mysqlLayer } from "./helpers.js"

const database = mysqlDatabase("child-runs-run-group")
childRunsRunGroupSuite({
  name: "mysql",
  storeLayer: database.provision(mysqlLayer(database.url)),
  activate: claimReadyWorker("child-runs-run-group"),
  skip: !mysqlAvailable,
})
