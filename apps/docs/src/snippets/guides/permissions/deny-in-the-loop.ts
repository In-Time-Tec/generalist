import { Console, Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "@batonfx/core"

const dropTableTool = Ai.Tool.make("drop_table", {
  description: "Drop a database table",
  parameters: Schema.Struct({ table: Schema.String }),
  success: Schema.String,
})

const agent = Agent.make({ name: "db-assistant", toolkit: Ai.Toolkit.make(dropTableTool) })

const permissionsLayer = Permissions.fromRuleset({
  rules: [{ pattern: "drop_*", level: "deny", reason: "Schema changes require a migration" }],
  fallback: "allow",
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
            id: "drop-1",
            name: "drop_table",
            params: { table: "users" },
            providerExecuted: false,
          }),
        )
      }
      const sawDenial = JSON.stringify(options.prompt.content).includes("Schema changes require a migration")
      return Stream.make(
        Ai.Response.makePart("text-delta", {
          id: "assistant",
          delta: sawDenial ? "I cannot drop tables; write a migration instead." : "Dropped the table.",
        }),
      )
    },
  }),
)

const program = Effect.gen(function* () {
  const result = yield* Agent.generate(agent, { prompt: "Drop the users table." })
  yield* Console.log(result.text)
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      modelLayer,
      ToolExecutor.testLayer({ execute: () => Effect.die("denied calls never reach the executor") }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
      permissionsLayer,
    ),
  ),
)

await Effect.runPromise(program)
