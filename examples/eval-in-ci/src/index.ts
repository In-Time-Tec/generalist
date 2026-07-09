import { Console, Effect, Layer } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "@batonfx/core"
import { Deterministic } from "@batonfx/providers"

const agent = Agent.make("eval-agent")

const program = Effect.gen(function* () {
  const result = yield* ModelRegistry.provide(
    { provider: "deterministic", model: "local" },
    Agent.generate(agent, { prompt: "Say the deterministic answer." }),
  )
  if (result.text !== "deterministic response") {
    return yield* Effect.die(`Unexpected eval output: ${result.text}`)
  }
  yield* Console.log("eval passed")
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      Deterministic.withDeterministic({ model: "local" }),
      ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool call") }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
    ),
  ),
)

await Effect.runPromise(program)
