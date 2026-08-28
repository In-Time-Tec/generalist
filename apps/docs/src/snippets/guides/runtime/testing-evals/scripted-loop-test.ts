import { Console, Effect, Equal, Layer, Schema } from "effect"
import { Agent, Tool, Toolkit } from "tenetkit"
import { TestModel } from "tenetkit/test"

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

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
  const result = yield* Effect.scoped(
    Effect.flatMap(
      Layer.build(
        fixture.layer.pipe(
          Layer.provideMerge(
            toolkit.toLayer({
              lookup_order: (params) =>
                Effect.sync(() => {
                  executedCalls.push(params)
                  return "shipped yesterday"
                }),
            }),
          ),
        ),
      ),
      (services) => Agent.generate(agent, { prompt: "Where is order 42?" }).pipe(Effect.provideContext(services)),
    ),
  )
  if (result.text !== "Order 42 shipped yesterday.") {
    return yield* Effect.die(`unexpected answer: ${result.text}`)
  }
  if (!Equal.equals(executedCalls, [{ orderId: "42" }])) {
    return yield* Effect.die(`unexpected tool params: ${encodeJson(executedCalls)}`)
  }
  if (!encodeJson(yield* fixture.prompts).includes("shipped yesterday")) {
    return yield* Effect.die("tool result was not re-fed to the model")
  }
  yield* Console.log("scripted loop test passed")
})

await Effect.runPromise(program)
