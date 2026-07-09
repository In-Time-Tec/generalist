import { Console, Effect } from "effect"
import { Steering } from "@batonfx/core"

const program = Effect.gen(function* () {
  const steering = yield* Steering.Steering
  yield* steering.steer({ prompt: "First correction." })
  yield* steering.steer({ prompt: "Second correction." })
  const firstDrain = yield* steering.takeSteering()
  const secondDrain = yield* steering.takeSteering()
  yield* Console.log(`first drain: ${firstDrain.length}, second drain: ${secondDrain.length}`)
}).pipe(Effect.provide(Steering.layer({ steering: { mode: "one-at-a-time" }, followUp: { mode: "all" } })))

await Effect.runPromise(program)
