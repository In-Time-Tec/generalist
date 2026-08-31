import { Console, Effect } from "effect"
import { Agent } from "generalist"
import { layerModel as deterministicModel } from "generalist/ai/deterministic"

const agent = Agent.make({ name: "eval-agent" })

const program = Effect.gen(function* () {
  const result = yield* Agent.generate(agent, { prompt: "Say the deterministic answer." }).pipe(
    Effect.provide(deterministicModel()),
  )
  if (result.text !== "deterministic response") {
    return yield* Effect.die(`Unexpected eval output: ${result.text}`)
  }
  yield* Console.log("eval passed")
})

await Effect.runPromise(program)
