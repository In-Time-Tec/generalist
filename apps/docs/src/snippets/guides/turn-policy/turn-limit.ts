import { Console, Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, AgentEvent, Approvals, ModelMiddleware, ToolExecutor, TurnPolicy } from "@batonfx/core"

const lookupTool = Ai.Tool.make("lookup", {
  description: "Look up one fact",
  parameters: Schema.Struct({ topic: Schema.String }),
  success: Schema.String,
})

const agent = Agent.make({
  name: "looper",
  toolkit: Ai.Toolkit.make(lookupTool),
  policy: TurnPolicy.recurs(1),
})

let calls = 0

const modelLayer = Layer.effect(
  Ai.LanguageModel.LanguageModel,
  Ai.LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      return Stream.make(
        Ai.Response.makePart("tool-call", {
          id: `lookup-${calls}`,
          name: "lookup",
          params: { topic: `fact-${calls}` },
          providerExecuted: false,
        }),
      )
    },
  }),
)

const program = Effect.gen(function* () {
  const failure = yield* Agent.generate(agent, { prompt: "Keep looking things up." }).pipe(Effect.flip)
  if (!(failure instanceof AgentEvent.TurnLimitExceeded)) {
    return yield* Effect.die("expected the policy to stop the run")
  }
  const pending = failure.pending.map((call) => call.tool_name).join(", ")
  yield* Console.log(`stopped before turn ${failure.turn} with pending results from: ${pending}`)
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      modelLayer,
      ToolExecutor.testLayer({
        execute: (request) =>
          Effect.succeed({
            _tag: "Success",
            result: `found ${request.call.id}`,
            encodedResult: `found ${request.call.id}`,
          }),
      }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
    ),
  ),
)

await Effect.runPromise(program)
