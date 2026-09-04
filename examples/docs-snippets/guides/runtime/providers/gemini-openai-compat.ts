import { Config, Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, Permissions, ToolExecutor } from "generalist"
import { layerGoogleAIStudio } from "generalist/providers/openai-compatible"
import { FetchHttpClient } from "effect/unstable/http"

const agent = Agent.make({ name: "gemini-agent" })

const providerLayer = layerGoogleAIStudio({
  model: "gemini-2.0-flash",
  apiKey: Config.redacted("GOOGLE_AI_STUDIO_API_KEY"),
})

const program = ModelRegistry.withModel(
  { provider: "google", model: "gemini-2.0-flash" },
  Agent.run(agent, "Summarize the Effect Layer type in one sentence."),
).pipe(Effect.flatMap((result) => Console.log(result)))

const runtimeLayer = Layer.mergeAll(
  providerLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
).pipe(Layer.provideMerge(FetchHttpClient.layer))

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
