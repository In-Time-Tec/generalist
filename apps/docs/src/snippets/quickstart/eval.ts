import { Console, Effect, ManagedRuntime } from "effect"
import { Agent, ModelRegistry } from "generalist"
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

const runtime = ManagedRuntime.make(deterministicLayer({ model: "local" }))
await runtime.runPromise(program)
