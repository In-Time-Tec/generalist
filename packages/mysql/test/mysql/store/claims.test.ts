import { childAdmissionBoundsSuite } from "../../../../tenetkit/test/runtime/child/suites/admission-bounds.js"
import { claimReadyWorker } from "../../../../tenetkit/test/runtime/run/queued-activation.js"
import { mysqlAvailable, mysqlDatabase, mysqlLayer } from "../runtime/environment.js"

const database = mysqlDatabase("child-admission-bounds")
childAdmissionBoundsSuite({
  name: "mysql",
  storeLayer: database.provision(mysqlLayer(database.url)),
  activate: claimReadyWorker("child-admission-bounds"),
  skip: !mysqlAvailable,
})
