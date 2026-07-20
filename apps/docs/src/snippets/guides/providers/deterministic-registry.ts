import { Console, Effect, Layer } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "@batonfx/core"
import { Deterministic } from "@batonfx/providers"

const agent = Agent.make({ name: "keyless-agent" })

const program = ModelRegistry.operate(
  { provider: "deterministic", model: "local" },
  Agent.generate(agent, { prompt: "Say the deterministic answer." }),
).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
  Effect.provide(
    Layer.mergeAll(
      Deterministic.withDeterministic({ model: "local" }),
      ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool call") }),
      Approvals.autoApprove,
      ModelMiddleware.layerIdentity,
    ),
  ),
)

await Effect.runPromise(program)
