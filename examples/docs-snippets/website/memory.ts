import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Layer } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Agent, Memory } from "generalist"
import { WorkingMemory } from "generalist/memory"
import { layer, text } from "generalist/testing/model"

const coder = Agent.make({ name: "coding-agent" })
const key = { agent: coder.name, subject: "tutorial-repository" }
const services = Layer.mergeAll(
  WorkingMemory.layer({ maxMessages: 4 }),
  layer([text("The regression case is average([]) === 0.")]),
)

const program = Effect.gen(function* () {
  yield* Agent.run(coder, "Remember the empty-input regression case.", { memory: { key } })
  const memory = yield* Memory.Memory
  const recalled = yield* memory.recall({ key, turn: 0, prompt: Prompt.make("Which regression should I test?") })
  const containsRegression = recalled.some((item) =>
    item.content.some((part) => part.type === "text" && part.text.includes("average([]) === 0")),
  )
  if (!containsRegression) return yield* Effect.die("The memory service did not retain the regression case.")
  yield* Console.log("Working memory retained average([]) === 0.")
})

BunRuntime.runMain(program.pipe(Effect.provide(services)))
