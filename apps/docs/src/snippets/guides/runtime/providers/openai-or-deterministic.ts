import { Config, Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "tenetkit"
import { Deterministic } from "tenetkit/ai"
import { FetchHttpClient } from "effect/unstable/http"

const agent = Agent.make({ name: "release-notes" })

const modelLayer = Deterministic.layerOpenAI({
  model: "gpt-4o-mini",
  fallbackModel: "gpt-4o-mini",
  apiKey: Config.redacted("OPENAI_API_KEY"),
})

const selection: ModelRegistry.ModelSelection = { provider: "deterministic", model: "gpt-4o-mini" }

const program = ModelRegistry.withModel(selection, Agent.generate(agent, { prompt: "Draft the release note." })).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
)

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
).pipe(Layer.provideMerge(FetchHttpClient.layer))

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
