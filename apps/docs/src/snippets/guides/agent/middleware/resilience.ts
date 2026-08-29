import { Config, Console, Effect, Layer, ManagedRuntime, Schedule } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ModelResilience, ToolExecutor } from "tenetkit"
import { layer as openRouterLayer } from "tenetkit/ai/openrouter"
import { FetchHttpClient } from "effect/unstable/http"

const agent = Agent.make({ name: "assistant" })

const resilienceLayer = ModelResilience.layer({
  classify: ModelResilience.defaultClassify,
  retrySchedule: Schedule.recurs(3),
  invalidToolCallCorrectionLimit: 2,
  streamIdleTimeout: "2 minutes",
})

const program = ModelRegistry.operate(
  { provider: "openrouter", model: "openai/gpt-4o-mini" },
  Agent.generate(agent, { prompt: "Summarize today's alerts." }),
).pipe(Effect.flatMap((result) => Console.log(result.text)))

const runtimeLayer = Layer.mergeAll(
  openRouterLayer({
    model: "openai/gpt-4o-mini",
    apiKey: Config.redacted("OPENROUTER_API_KEY"),
  }),
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  resilienceLayer,
).pipe(Layer.provideMerge(FetchHttpClient.layer))

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
