import { ExecutableResolver, Runtime } from "../../src/runtime/index.js"
import { assistant, assistantRef } from "./helpers.js"
import { closedTestAgent } from "./identity.js"
import { stagedRootSuite } from "./staged-root-suite.js"

stagedRootSuite({
  name: "memory",
  storeLayer: Runtime.layerMemory({
    addresses: [],
    resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
  }),
})
