import { Config, Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, Permissions, ToolExecutor } from "generalist"
import { layerOrDeterministic } from "generalist/ai/openai"
import { FetchHttpClient } from "effect/unstable/http"

const agent = Agent.make({ name: "release-notes" })

const modelLayer = layerOrDeterministic({
  model: "gpt-4o-mini",
  fallbackModel: "gpt-4o-mini",
  apiKey: Config.redacted("OPENAI_API_KEY"),
})

const selection: ModelRegistry.ModelSelection = { provider: "deterministic", model: "gpt-4o-mini" }

const program = ModelRegistry.withModel(selection, Agent.run(agent, "Draft the release note.")).pipe(
  Effect.flatMap((result) => Console.log(result)),
)

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
).pipe(Layer.provideMerge(FetchHttpClient.layer))

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
