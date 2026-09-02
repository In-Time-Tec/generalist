import { Effect, Layer, Schema } from "effect"
import { Agent, Approvals, Permissions } from "generalist"
import { Tool, Toolkit } from "effect/unstable/ai"
import { TestModel } from "generalist/testing"
import { make } from "generalist/unstable/cloudflare/workers"

const lookup = Tool.make("lookup", {
  description: "Look up one provider fact",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(lookup)
const planSchema = Schema.Struct({
  objective: Schema.String,
  facts: Schema.Array(Schema.String),
})
const planner = Agent.make({
  name: "planner",
  instructions: "Use lookup, then return the structured plan.",
  output: planSchema,
  toolkit,
  budget: {
    modelCalls: 3,
    toolCalls: 1,
    totalTokens: 256,
    deadline: "2099-01-01T00:00:00.000Z",
  },
})

const runPlanner = Effect.fn("CloudflareWorker.runPlanner")(function* () {
  const fixture = yield* TestModel.make([
    TestModel.toolCall("lookup", { query: "Boise provider" }, { id: "lookup-1" }),
    TestModel.text("I found one provider."),
    TestModel.object({ output: { objective: "Arrange service", facts: ["Provider serves Boise"] } }),
  ])
  const layer = Layer.mergeAll(
    fixture.layer,
    toolkit.toLayer({ lookup: ({ query }) => Effect.succeed(`${query}: available`) }),
    Permissions.layerRuleset({ rules: [{ pattern: "lookup", level: "allow" }], fallback: "deny" }),
    Approvals.layerDenyAll,
  )
  const services = yield* Layer.build(layer)
  return yield* Agent.run(planner, "Find a provider and propose a plan.").pipe(Effect.provideContext(services))
})

export default make<Readonly<Record<string, string>>, never>(() =>
  runPlanner().pipe(
    Effect.map((result) => Response.json(result)),
    Effect.orDie,
  ),
)
