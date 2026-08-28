import { Runtime } from "../../../../../src/runtime/index.js"
import { operationRecoverySuite } from "../../../operation/suites/recovery.js"
import { toolCancellationSuite } from "../../../operation/suites/tool-cancellation.js"

operationRecoverySuite({
  name: "memory",
  makeLayer: Runtime.layerMemory,
})

toolCancellationSuite({
  name: "memory",
  makeLayer: Runtime.layerMemory,
})
