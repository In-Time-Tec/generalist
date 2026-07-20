import { Config, Console, Effect, Layer } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "@batonfx/core"
import { Presets } from "@batonfx/providers"

const agent = Agent.make({ name: "gemini-agent" })

const providerLayer = Presets.withGoogleAiStudioFetch({
  model: "gemini-2.0-flash",
  apiKey: Config.redacted("GOOGLE_AI_STUDIO_API_KEY"),
})

const program = ModelRegistry.operate(
  { provider: "google", model: "gemini-2.0-flash" },
  Agent.generate(agent, { prompt: "Summarize the Effect Layer type in one sentence." }),
).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
  Effect.provide(
    Layer.mergeAll(
      providerLayer,
      ToolExecutor.testLayer({ execute: () => Effect.die("this agent has no tools") }),
      Approvals.autoApprove,
      ModelMiddleware.layerIdentity,
    ),
  ),
)

await Effect.runPromise(program)
