import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "tenetkit"
import { layer as deterministicLayer } from "tenetkit/ai/deterministic"

const agent = Agent.make({ name: "keyless-agent" })

const program = ModelRegistry.withModel(
  { provider: "deterministic", model: "local" },
  Agent.generate(agent, { prompt: "Say the deterministic answer." }),
).pipe(Effect.flatMap((result) => Console.log(result.text)))

const runtimeLayer = Layer.mergeAll(
  deterministicLayer({ model: "local" }),
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
