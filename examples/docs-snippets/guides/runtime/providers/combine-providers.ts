import { Config, Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, Permissions, ToolExecutor } from "generalist"
import { layer as anthropicLayer } from "generalist/providers/anthropic"
import { layer as openRouterLayer } from "generalist/providers/openrouter"
import { FetchHttpClient } from "effect/unstable/http"

const agent = Agent.make({ name: "router" })

const registryLayer = ModelRegistry.layerMerged([
  anthropicLayer({ model: "claude-sonnet-4-5", apiKey: Config.redacted("ANTHROPIC_API_KEY") }),
  openRouterLayer({ model: "openai/gpt-4o-mini", apiKey: Config.redacted("OPENROUTER_API_KEY") }),
])

const runWith = (selection: ModelRegistry.ModelSelection) =>
  ModelRegistry.withModel(selection, Agent.run(agent, "Summarize the incident."))

const program = runWith({ provider: "anthropic", model: "claude-sonnet-4-5" }).pipe(
  Effect.flatMap((result) => Console.log(result)),
)

const runtimeLayer = Layer.mergeAll(
  registryLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
).pipe(Layer.provideMerge(FetchHttpClient.layer))

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
