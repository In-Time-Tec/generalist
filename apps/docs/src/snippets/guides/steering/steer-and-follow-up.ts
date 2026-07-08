import { Console, Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, Approvals, ModelMiddleware, Steering, ToolExecutor } from "@batonfx/core"

const statusTool = Ai.Tool.make("check_status", {
  description: "Check the deploy status of a service",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
})

const agent = Agent.make({
  name: "release-agent",
  instructions: "Report deploy status using tools.",
  toolkit: Ai.Toolkit.make(statusTool),
})

let calls = 0

const modelLayer = Layer.effect(
  Ai.LanguageModel.LanguageModel,
  Ai.LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      calls += 1
      if (calls === 1) {
        return Stream.make(
          Ai.Response.makePart("tool-call", {
            id: "status-1",
            name: "check_status",
            params: { service: "api" },
            providerExecuted: false,
          }),
        )
      }
      const promptText = JSON.stringify(options.prompt.content)
      const delta = promptText.includes("worker service")
        ? "Follow-up: the worker deploy is healthy too."
        : "The api deploy is healthy, in one sentence as steered. "
      return Stream.make(Ai.Response.makePart("text-delta", { id: "assistant", delta }))
    },
  }),
)

const layers = Layer.mergeAll(
  modelLayer,
  ToolExecutor.testLayer({
    execute: () => Effect.succeed({ _tag: "Success", result: "api is healthy", encodedResult: "api is healthy" }),
  }),
  Approvals.autoApprove,
  ModelMiddleware.identityLayer,
  Steering.layer(),
)

const program = Effect.gen(function* () {
  const steering = yield* Steering.Steering
  yield* steering.steer({ prompt: "Keep the answer to one sentence." })
  yield* steering.followUp({ prompt: "Also check the worker service." })
  const result = yield* Agent.generate(agent, { prompt: "Is the api deploy healthy?" })
  yield* Console.log(`turns: ${result.turns}`)
  yield* Console.log(result.text)
}).pipe(Effect.provide(layers))

await Effect.runPromise(program)
