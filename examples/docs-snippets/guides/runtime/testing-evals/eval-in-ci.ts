import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, Permissions, ToolExecutor } from "generalist"
import { layer as deterministicLayer } from "generalist/providers/deterministic"

const agent = Agent.make({ name: "eval-agent" })

const program = Effect.gen(function* () {
  const result = yield* ModelRegistry.withModel(
    { provider: "deterministic", model: "local" },
    Agent.run(agent, "Say the deterministic answer."),
  )
  if (result !== "deterministic response") {
    return yield* Effect.die(`Unexpected eval output: ${result}`)
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
