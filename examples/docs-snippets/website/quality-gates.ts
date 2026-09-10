import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Schema } from "effect"
import { Agent, Gate, Policy } from "generalist"
import { layer, object, text } from "generalist/testing/model"

const Report = Schema.Struct({ file: Schema.String, tests: Schema.Array(Schema.String) })
const coder = Agent.make({
  name: "coding-agent",
  output: Report,
  policy: Policy.recurs(4),
  gates: [
    Gate.predicate({
      name: "has-regression-case",
      check: (report: typeof Report.Type) => report.tests.includes("average([]) === 0"),
    }),
  ],
  onGateFailure: "fail",
})

BunRuntime.runMain(
  Agent.run(coder, "Propose the fix and its regression cases.").pipe(
    Effect.provide(
      layer([
        text("The empty-input behavior needs a regression case."),
        object({ output: { file: "src/average.ts", tests: ["average([]) === 0"] } }),
      ]),
    ),
    Effect.flatMap((report) => Console.log(`Accepted report for ${report.file}`)),
  ),
)
