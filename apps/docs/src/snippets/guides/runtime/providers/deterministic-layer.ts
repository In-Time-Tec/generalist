import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { layerModel as deterministicModel } from "generalist/providers/deterministic"

const agent = Agent.make({ name: "keyless-agent" })

// No credentials, no client: the deterministic model layer answers "deterministic response".
const program = Agent.run(agent, "Say the deterministic answer.").pipe(
  Effect.provide(deterministicModel()),
  Effect.flatMap((result) => Console.log(result)),
)

const runtimeLayer = Layer.mergeAll(
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
