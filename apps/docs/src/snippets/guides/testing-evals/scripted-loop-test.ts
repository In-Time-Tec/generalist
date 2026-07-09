import { Console, Effect, Layer, Schema, Stream } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, Response, Tool, Toolkit } from "@batonfx/core"

const lookupTool = Tool.make("lookup_order", {
  description: "Look up an order by id",
  parameters: Schema.Struct({ orderId: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(lookupTool)

const agent = Agent.make({
  name: "support-agent",
  instructions: "Answer using the order data returned by tools.",
  toolkit,
})

let calls = 0

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      return calls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "lookup-1",
              name: "lookup_order",
              params: { orderId: "42" },
              providerExecuted: false,
            }),
          )
        : Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "Order 42 shipped yesterday." }))
    },
  }),
)

const executedCalls: Array<unknown> = []

const layers = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({
    lookup_order: (params) =>
      Effect.sync(() => {
        executedCalls.push(params)
        return "shipped yesterday"
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
