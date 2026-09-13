import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect } from "effect"
import { Agent } from "generalist"
import { layer, text } from "generalist/testing/model"

const coder = Agent.make({
  name: "coding-agent",
  instructions: "Explain the bug and propose the smallest correct change.",
})

BunRuntime.runMain(
  Effect.gen(function* () {
    const answer = yield* Agent.run(coder, "Why does average([]) return NaN?").pipe(
      Effect.provide(layer([text("Return 0 before dividing when values.length is 0.")])),
    )
    yield* Console.log(answer)
  }),
)
