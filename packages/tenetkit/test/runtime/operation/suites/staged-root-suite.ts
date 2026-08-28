import { ExecutableResolver, Runtime } from "../../../../src/runtime/index.js"
import { assistant, assistantRef } from "../../execution/fixtures.js"
import { closedTestAgent } from "../../run/identity.js"
import { stagedRootSuite } from "./staged-root.js"

stagedRootSuite({
  name: "memory",
  storeLayer: Runtime.layerMemory({
    addresses: [],
    resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
  }),
})
