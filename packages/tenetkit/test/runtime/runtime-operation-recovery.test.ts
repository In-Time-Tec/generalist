import { Runtime } from "../../src/runtime/index.js"
import { operationRecoverySuite } from "./operation-recovery-suite.js"
import { toolCancellationSuite } from "./tool-cancellation-suite.js"

operationRecoverySuite({
  name: "memory",
  makeLayer: Runtime.layerMemory,
})

toolCancellationSuite({
  name: "memory",
  makeLayer: Runtime.layerMemory,
})
