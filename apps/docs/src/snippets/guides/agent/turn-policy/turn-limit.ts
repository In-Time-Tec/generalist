import { Console, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent, AgentEvent, Approvals, ModelMiddleware, Permissions, Policy } from "generalist"
import { Tool, Toolkit } from "effect/unstable/ai"
import { TestModel } from "generalist/testing"

const lookupTool = Tool.make("lookup", {
  description: "Look up one fact",
  parameters: Schema.Struct({ topic: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(lookupTool)

const agent = Agent.make({
  name: "looper",
  toolkit,
  policy: Policy.recurs(1),
})

const modelLayer = TestModel.layer([
  TestModel.toolCall("lookup", { topic: "fact-1" }, { id: "lookup-1" }),
  TestModel.toolCall("lookup", { topic: "fact-2" }, { id: "lookup-2" }),
])

const program = Effect.gen(function* () {
  const failure = yield* Agent.run(agent, "Keep looking things up.").pipe(Effect.flip)
  if (!Schema.is(AgentEvent.TurnLimitExceeded)(failure)) {
    return yield* Effect.die("expected the policy to stop the run")
  }
  const pending = failure.pending.map((call) => call.tool_name).join(", ")
  yield* Console.log(`stopped before turn ${failure.turn} with pending results from: ${pending}`)
})

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ lookup: ({ topic }) => Effect.succeed(`found ${topic}`) }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
