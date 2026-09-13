import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Layer } from "effect"
import { Agent, Session } from "generalist"
import { layer, text } from "generalist/testing/model"

const coder = Agent.make({ name: "coding-agent" })
const services = Layer.mergeAll(
  Session.layerMemory,
  layer([text("I will return 0 for empty input."), text("I will add a regression test for average([]).")]),
)

BunRuntime.runMain(
  Effect.gen(function* () {
    yield* Agent.run(coder, "Fix average([]) by returning 0.", { sessionId: "fix-average" })
    const answer = yield* Agent.run(coder, "Add a test for that change.", { sessionId: "fix-average" })
    yield* Console.log(answer)
  }).pipe(Effect.provide(services)),
)
