import { Console, Effect } from "effect"
import { Agent } from "@batonfx/core"
import { TestModel } from "@batonfx/test"

const modelLayer = TestModel.layer([TestModel.text("A deterministic answer.")])
const agent = Agent.make({ name: "tested-agent" })

const program = Agent.generate(agent, { prompt: "Answer deterministically." }).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
  Effect.provide(modelLayer),
)

await Effect.runPromise(program)
