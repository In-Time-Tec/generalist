import { Config, Console, Effect, Layer, ManagedRuntime } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { layerConfig as openAiClient, layerModel as openAiModel } from "generalist/ai/openai"

const agent = Agent.make({
  name: "assistant",
  instructions: "Answer in one sentence.",
})

// The provider client is one layer; each model is a thin layer over it.
const openAi = openAiClient({ apiKey: Config.redacted("OPENAI_API_KEY") }).pipe(Layer.provide(FetchHttpClient.layer))
const sol = openAiModel({ model: "gpt-5.6-sol" }).pipe(Layer.provide(openAi))

// Provide the model layer to exactly the run that should use it.
const program = Agent.generate(agent, { prompt: "Name one Effect data type." }).pipe(
  Effect.provide(sol),
  Effect.flatMap((result) => Console.log(result.text)),
)

const runtimeLayer = Layer.mergeAll(
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
