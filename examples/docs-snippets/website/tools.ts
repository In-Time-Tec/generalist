import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Layer, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Permissions } from "generalist"
import { layer, text, toolCall } from "generalist/testing/model"

const readFile = Tool.make("read_file", {
  description: "Read the coding exercise's source file.",
  parameters: Schema.Struct({ path: Schema.Literals(["src/average.ts"]) }),
  success: Schema.String,
})
const toolkit = Toolkit.make(readFile)
const coder = Agent.make({
  name: "coding-agent",
  instructions: "Read the source before proposing a fix.",
  toolkit,
})

const services = Layer.mergeAll(
  layer([toolCall("read_file", { path: "src/average.ts" }), text("Return 0 before dividing when values.length is 0.")]),
  toolkit.toLayer({
    read_file: () =>
      Effect.succeed(
        "export const average = (values: number[]) => values.reduce((sum, n) => sum + n, 0) / values.length",
      ),
  }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

BunRuntime.runMain(
  Effect.gen(function* () {
    const answer = yield* Agent.run(coder, "Find the bug in average([]).").pipe(Effect.provide(services))
    yield* Console.log(answer)
  }),
)
