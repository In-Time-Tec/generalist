import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, Permissions } from "generalist"
import { TestModel } from "generalist/testing"
import { docsToolLayer } from "./executor"
import { toolkit } from "./search-tool"

const agent = Agent.make({
  name: "docs-assistant",
  instructions: "Answer using the documentation search tool.",
  toolkit,
})

const modelLayer = TestModel.layer([
  TestModel.toolCall("search_docs", { query: "toolkits" }, { id: "search-1" }),
  TestModel.text("See: How to define tools and toolkits."),
])

const program = Effect.gen(function* () {
  const result = yield* Agent.run(agent, "Where are toolkits documented?")
  yield* Console.log(result)
})

const runtime = ManagedRuntime.make(
  Layer.mergeAll(modelLayer, docsToolLayer, Permissions.layerAllowAll, Approvals.layerAutoApprove),
)
await runtime.runPromise(program)
