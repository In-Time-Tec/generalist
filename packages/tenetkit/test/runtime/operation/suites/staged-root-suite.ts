import { ExecutableResolver, Runtime } from "../../../../src/runtime/index.js"
import { Layer } from "effect"
import { assistant, assistantRef } from "../../execution/fixtures.js"
import { closedTestAgent } from "../../run/identity.js"
import { stagedRootSuite } from "./staged-root.js"

stagedRootSuite({
  name: "memory",
  storeLayer: Runtime.layerMemory({
    addresses: [],
  }).pipe(
    Layer.provide(
      ExecutableResolver.layerStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]).pipe(
        Layer.orDie,
      ),
    ),
  ),
})
