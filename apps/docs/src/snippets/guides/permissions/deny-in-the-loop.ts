import { Console, Effect, Layer, Schema, Stream } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, Permissions, Response, Tool, Toolkit } from "@batonfx/core"

const dropTableTool = Tool.make("drop_table", {
  description: "Drop a database table",
  parameters: Schema.Struct({ table: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(dropTableTool)
const agent = Agent.make({ name: "db-assistant", toolkit })

const permissionsLayer = Permissions.fromRuleset({
  rules: [{ pattern: "drop_*", level: "deny", reason: "Schema changes require a migration" }],
  fallback: "allow",
})

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () =>
      Stream.make(
        Response.makePart("tool-call", {
          id: "drop-1",
          name: "drop_table",
          params: { table: "users" },
          providerExecuted: false,
        }),
      ),
  }),
)

const program = Effect.gen(function* () {
  const result = yield* Agent.generate(agent, { prompt: "Drop the users table." })
  yield* Console.log(result.text)
}).pipe(
  Effect.catchTag("@batonfx/core/FrameworkFailure", (failure) =>
    Console.log(`${failure.tool} ${failure.stage}: ${failure.message}`),
  ),
  Effect.provide(
    Layer.mergeAll(
      modelLayer,
      toolkit.toLayer({ drop_table: () => Effect.die("denied calls never reach the handler") }),
      Approvals.autoApprove,
      ModelMiddleware.layerIdentity,
      permissionsLayer,
    ),
  ),
)

await Effect.runPromise(program)
