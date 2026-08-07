import { Config, Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "@batonfx/core"
import { Anthropic, OpenRouter } from "@batonfx/providers"
import { FetchHttpClient } from "effect/unstable/http"

const agent = Agent.make({ name: "router" })

const registryLayer = ModelRegistry.layerCombined([
  Anthropic.layer({ model: "claude-sonnet-4-5", apiKey: Config.redacted("ANTHROPIC_API_KEY") }),
  OpenRouter.layer({ model: "openai/gpt-4o-mini", apiKey: Config.redacted("OPENROUTER_API_KEY") }),
])

const runWith = (selection: ModelRegistry.ModelSelection) =>
  ModelRegistry.operate(selection, Agent.generate(agent, { prompt: "Summarize the incident." }))

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
