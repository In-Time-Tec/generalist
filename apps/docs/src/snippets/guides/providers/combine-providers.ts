import { Config, Console, Effect, Layer } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "@batonfx/core"
import { Anthropic, OpenRouter } from "@batonfx/providers"

const agent = Agent.make({ name: "router" })

const registryLayer = ModelRegistry.combine([
  Anthropic.withAnthropicFetch({ model: "claude-sonnet-4-5", apiKey: Config.redacted("ANTHROPIC_API_KEY") }),
  OpenRouter.withOpenRouterFetch({ model: "openai/gpt-4o-mini", apiKey: Config.redacted("OPENROUTER_API_KEY") }),
])

const runWith = (selection: ModelRegistry.ModelSelection) =>
  ModelRegistry.operate(selection, Agent.generate(agent, { prompt: "Summarize the incident." }))

const program = runWith({ provider: "anthropic", model: "claude-sonnet-4-5" }).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
  Effect.provide(
    Layer.mergeAll(
      registryLayer,
      ToolExecutor.testLayer({ execute: () => Effect.die("this agent has no tools") }),
      Approvals.autoApprove,
      ModelMiddleware.layerIdentity,
    ),
  ),
)

await Effect.runPromise(program)
