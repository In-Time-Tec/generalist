import { Config, Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, Permissions, ToolExecutor } from "generalist"
import { layer as openRouterLayer } from "generalist/providers/openrouter"
import { FetchHttpClient } from "effect/unstable/http"

const agent = Agent.make({
  name: "assistant",
  instructions: "Answer in one sentence.",
})

const registryLayer = openRouterLayer({
  model: "openai/gpt-4o-mini",
  apiKey: Config.redacted("OPENROUTER_API_KEY"),
})

const program = ModelRegistry.withModel(
  { provider: "openrouter", model: "openai/gpt-4o-mini" },
  Agent.run(agent, "Name one Effect data type."),
).pipe(Effect.flatMap((result) => Console.log(result)))

const runtimeLayer = Layer.mergeAll(
  registryLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
).pipe(Layer.provideMerge(FetchHttpClient.layer))

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
