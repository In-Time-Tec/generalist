import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Schema } from "effect"
import { Agent } from "generalist"
import { layer, object, text } from "generalist/testing/model"

const coder = Agent.make({
  name: "coding-agent",
  instructions: "Return a reviewable change proposal.",
  output: Schema.Struct({
    file: Schema.String,
    change: Schema.String,
    tests: Schema.Array(Schema.String),
  }),
})

BunRuntime.runMain(
  Effect.gen(function* () {
    const result = yield* Agent.run(coder, "Propose a fix for average([]).").pipe(
      Effect.provide(
        layer([
          text("An empty array needs a defined result."),
          object({
            output: {
              file: "src/average.ts",
              change: "Return 0 for empty input.",
              tests: ["average([]) === 0", "average([2, 4]) === 3"],
            },
          }),
        ]),
      ),
    )
    yield* Console.log(`${result.file}: ${result.change}`)
  }),
)
