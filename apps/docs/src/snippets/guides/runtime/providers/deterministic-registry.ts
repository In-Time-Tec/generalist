import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "tenetkit"
import { Deterministic } from "tenetkit/ai"

const agent = Agent.make({ name: "keyless-agent" })

const program = ModelRegistry.withModel(
  { provider: "deterministic", model: "local" },
  Agent.generate(agent, { prompt: "Say the deterministic answer." }),
).pipe(Effect.flatMap((result) => Console.log(result.text)))

const runtimeLayer = Layer.mergeAll(
  Deterministic.layer({ model: "local" }),
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
