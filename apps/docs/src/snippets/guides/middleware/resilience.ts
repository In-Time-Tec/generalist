import { Config, Console, Effect, Layer, Schedule } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ModelResilience, ToolExecutor } from "@batonfx/core"
import { OpenRouter } from "@batonfx/providers"

const agent = Agent.make({ name: "assistant" })

const resilienceLayer = ModelResilience.layer({
  classify: ModelResilience.defaultClassify,
  retrySchedule: Schedule.recurs(3),
})

const program = ModelRegistry.provide(
  { provider: "openrouter", model: "openai/gpt-4o-mini" },
  Agent.generate(agent, { prompt: "Summarize today's alerts." }),
).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
  Effect.provide(
    Layer.mergeAll(
      OpenRouter.withOpenRouter({ model: "openai/gpt-4o-mini", apiKey: Config.redacted("OPENROUTER_API_KEY") }),
      ToolExecutor.testLayer({ execute: () => Effect.die("this agent has no tools") }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
      resilienceLayer,
    ),
  ),
)

await Effect.runPromise(program)
