import { Runtime } from "../../src/runtime/index.js"
import { operationRecoverySuite } from "./operation-recovery-suite.js"

operationRecoverySuite({
  name: "memory",
  makeLayer: Runtime.layerMemory,
})
