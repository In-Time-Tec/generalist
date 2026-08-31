import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, Permissions, ToolExecutor } from "generalist"
import { layer as deterministicLayer } from "generalist/ai/deterministic"

const agent = Agent.make({ name: "eval-agent" })

const program = Effect.gen(function* () {
  const result = yield* ModelRegistry.withModel(
    { provider: "deterministic", model: "local" },
    Agent.generate(agent, { prompt: "Say the deterministic answer." }),
  )
  if (result.text !== "deterministic response") {
    return yield* Effect.die(`Unexpected eval output: ${result.text}`)
  }
  yield* Console.log("eval passed")
})

const runtimeLayer = Layer.mergeAll(
  deterministicLayer({ model: "local" }),
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
