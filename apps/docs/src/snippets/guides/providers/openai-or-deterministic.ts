import { Config, Console, Effect, Layer } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "@batonfx/core"
import { Deterministic } from "@batonfx/providers"

const agent = Agent.make({ name: "release-notes" })

const modelLayer = Deterministic.withOpenAiOrDeterministicFetch({
  model: "gpt-4o-mini",
  fallbackModel: "gpt-4o-mini",
  apiKey: Config.redacted("OPENAI_API_KEY"),
})

const selection: ModelRegistry.ModelSelection = { provider: "deterministic", model: "gpt-4o-mini" }

const program = ModelRegistry.provide(selection, Agent.generate(agent, { prompt: "Draft the release note." })).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
  Effect.provide(
    Layer.mergeAll(
      modelLayer,
      ToolExecutor.testLayer({ execute: () => Effect.die("this agent has no tools") }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
    ),
  ),
)

await Effect.runPromise(program)
