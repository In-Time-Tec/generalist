import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Layer } from "effect"
import { Agent, Hooks } from "generalist"
import { layer, text } from "generalist/testing/model"

const coder = Agent.make({ name: "coding-agent" })
const services = Layer.mergeAll(
  Hooks.layer([
    Hooks.onRunStart({
      key: "coding-repository-context",
      version: "1",
      replayPolicy: "pure",
      hook: () => Effect.succeed(Hooks.AddContext("Work only on src/average.ts and its regression tests.")),
    }),
  ]),
  layer([text("The coding run has its repository context.")]),
)

BunRuntime.runMain(Agent.run(coder, "Fix average([]).").pipe(Effect.provide(services), Effect.flatMap(Console.log)))
