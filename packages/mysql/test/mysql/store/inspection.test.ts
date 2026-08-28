import { childRunsRunGroupSuite } from "../../../../tenetkit/test/runtime/child/suites/run-group.js"
import { claimReadyWorker } from "../../../../tenetkit/test/runtime/run/queued-activation.js"
import { mysqlAvailable, mysqlDatabase, mysqlLayer } from "../runtime/environment.js"

const database = mysqlDatabase("child-runs-run-group")
childRunsRunGroupSuite({
  name: "mysql",
  storeLayer: database.provision(mysqlLayer(database.url)),
  activate: claimReadyWorker("child-runs-run-group"),
  skip: !mysqlAvailable,
})
