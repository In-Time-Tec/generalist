import { Console, Effect, Schema } from "effect"
import { Agent, Tool, Toolkit } from "@batonfx/core"
import { TestModel } from "@batonfx/test"

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

const executedCalls: Array<unknown> = []

const program = Effect.gen(function* () {
  const fixture = yield* TestModel.make([
    TestModel.toolCall("lookup_order", { orderId: "42" }, { id: "lookup-1" }),
    TestModel.text("Order 42 shipped yesterday."),
  ])
  const result = yield* Agent.generate(agent, { prompt: "Where is order 42?" }).pipe(
    Effect.provide(fixture.layer),
    Effect.provide(
      toolkit.toLayer({
        lookup_order: (params) =>
          Effect.sync(() => {
            executedCalls.push(params)
            return "shipped yesterday"
          }),
      }),
    ),
  )
  if (result.text !== "Order 42 shipped yesterday.") {
    return yield* Effect.die(`unexpected answer: ${result.text}`)
  }
  if (JSON.stringify(executedCalls) !== JSON.stringify([{ orderId: "42" }])) {
    return yield* Effect.die(`unexpected tool params: ${JSON.stringify(executedCalls)}`)
  }
  if (!JSON.stringify(yield* fixture.prompts).includes("shipped yesterday")) {
    return yield* Effect.die("tool result was not re-fed to the model")
  }
  yield* Console.log("scripted loop test passed")
})

await Effect.runPromise(program)
