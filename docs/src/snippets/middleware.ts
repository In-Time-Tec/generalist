import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Layer } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Agent, ModelMiddleware } from "generalist"
import { layer, text } from "generalist/testing/model"

const coder = Agent.make({ name: "coding-agent" })
const services = Layer.mergeAll(
  ModelMiddleware.layer([
    {
      transformPrompt: (prompt) =>
        Effect.succeed(
          Prompt.concat(prompt, Prompt.make("The current branch is fix-average. Do not edit unrelated files.")),
        ),
    },
  ]),
  layer([text("I will keep the change scoped to average and its tests.")]),
)

BunRuntime.runMain(Agent.run(coder, "Fix average([]).").pipe(Effect.provide(services), Effect.flatMap(Console.log)))
