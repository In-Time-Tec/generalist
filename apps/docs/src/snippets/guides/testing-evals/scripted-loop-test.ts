import { Console, Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, Approvals, ModelMiddleware, ToolExecutor } from "@batonfx/core"

const lookupTool = Ai.Tool.make("lookup_order", {
  description: "Look up an order by id",
  parameters: Schema.Struct({ orderId: Schema.String }),
  success: Schema.String,
})

const agent = Agent.make({
  name: "support-agent",
  instructions: "Answer using the order data returned by tools.",
  toolkit: Ai.Toolkit.make(lookupTool),
})

let calls = 0

const modelLayer = Layer.effect(
  Ai.LanguageModel.LanguageModel,
  Ai.LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      return calls === 1
        ? Stream.make(
            Ai.Response.makePart("tool-call", {
              id: "lookup-1",
              name: "lookup_order",
              params: { orderId: "42" },
              providerExecuted: false,
            }),
          )
        : Stream.make(Ai.Response.makePart("text-delta", { id: "assistant", delta: "Order 42 shipped yesterday." }))
    },
  }),
)

const executedCalls: Array<unknown> = []

const layers = Layer.mergeAll(
  modelLayer,
  ToolExecutor.testLayer({
    execute: (request) =>
      Effect.sync(() => {
        executedCalls.push(request.call.params)
        return { _tag: "Success", result: "shipped yesterday", encodedResult: "shipped yesterday" }
      }),
  }),
  Approvals.autoApprove,
  ModelMiddleware.identityLayer,
)

const program = Effect.gen(function* () {
  const result = yield* Agent.generate(agent, { prompt: "Where is order 42?" })
  if (result.text !== "Order 42 shipped yesterday.") {
    return yield* Effect.die(`unexpected answer: ${result.text}`)
  }
  if (JSON.stringify(executedCalls) !== JSON.stringify([{ orderId: "42" }])) {
    return yield* Effect.die(`unexpected tool params: ${JSON.stringify(executedCalls)}`)
  }
  yield* Console.log("scripted loop test passed")
}).pipe(Effect.provide(layers))

await Effect.runPromise(program)
