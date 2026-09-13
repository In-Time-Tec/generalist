import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect } from "effect"
import { Agent } from "generalist"
import { layer, text } from "generalist/testing/model"

const coder = Agent.make({
  name: "coding-agent",
  instructions: "Explain the bug. Propose a minimal fix and a regression test. Do not claim to have edited files.",
})

const model = layer([text("Return 0 before dividing when values.length is 0.")])

BunRuntime.runMain(
  Effect.gen(function* () {
    const answer = yield* Agent.run(
      coder,
      "Why does values.reduce((sum, n) => sum + n, 0) / values.length return NaN for an empty array?",
    ).pipe(Effect.provide(model))
    yield* Console.log(answer)
  }),
)
