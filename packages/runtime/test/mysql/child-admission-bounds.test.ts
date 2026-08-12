import { childAdmissionBoundsSuite } from "../child-admission-bounds-suite.js"
import { claimReadyWorker } from "../queued-run-activation.js"
import { mysqlAvailable, mysqlDatabase, mysqlLayer } from "./helpers.js"

const database = mysqlDatabase("child-admission-bounds")
childAdmissionBoundsSuite({
  name: "mysql",
  storeLayer: database.provision(mysqlLayer(database.url)),
  activate: claimReadyWorker("child-admission-bounds"),
  skip: !mysqlAvailable,
})
