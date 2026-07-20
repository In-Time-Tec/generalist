import { Config, Console, Effect, Layer } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "@batonfx/core"
import { OpenRouter } from "@batonfx/providers"
import { FetchHttpClient } from "effect/unstable/http"

const agent = Agent.make({
  name: "assistant",
  instructions: "Answer in one sentence.",
})

const registryLayer = OpenRouter.layer({
  model: "openai/gpt-4o-mini",
  apiKey: Config.redacted("OPENROUTER_API_KEY"),
})

const program = ModelRegistry.operate(
  { provider: "openrouter", model: "openai/gpt-4o-mini" },
  Agent.generate(agent, { prompt: "Name one Effect data type." }),
).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
  Effect.provide(
    Layer.mergeAll(
      registryLayer,
      ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
      Approvals.layerAutoApprove,
      ModelMiddleware.layerIdentity,
    ),
  ),
)

await Effect.runPromise(program.pipe(Effect.provide(FetchHttpClient.layer)))
