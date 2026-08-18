import { childRunsRunGroupSuite } from "../../tenetkit/test/runtime/child-runs-run-group-suite.js"
import { claimReadyWorker } from "../../tenetkit/test/runtime/queued-run-activation.js"
import { mysqlAvailable, mysqlDatabase, mysqlLayer } from "./helpers.js"

const database = mysqlDatabase("child-runs-run-group")
childRunsRunGroupSuite({
  name: "mysql",
  storeLayer: database.provision(mysqlLayer(database.url)),
  activate: claimReadyWorker("child-runs-run-group"),
  skip: !mysqlAvailable,
})
