import { Config, Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "tenetkit"
import { Anthropic, OpenRouter } from "tenetkit/ai"
import { FetchHttpClient } from "effect/unstable/http"

const agent = Agent.make({ name: "router" })

const registryLayer = ModelRegistry.layerMerged([
  Anthropic.layer({ model: "claude-sonnet-4-5", apiKey: Config.redacted("ANTHROPIC_API_KEY") }),
  OpenRouter.layer({ model: "openai/gpt-4o-mini", apiKey: Config.redacted("OPENROUTER_API_KEY") }),
])

const runWith = (selection: ModelRegistry.ModelSelection) =>
  ModelRegistry.withModel(selection, Agent.generate(agent, { prompt: "Summarize the incident." }))

const program = runWith({ provider: "anthropic", model: "claude-sonnet-4-5" }).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
)

const runtimeLayer = Layer.mergeAll(
  registryLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
).pipe(Layer.provideMerge(FetchHttpClient.layer))

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
