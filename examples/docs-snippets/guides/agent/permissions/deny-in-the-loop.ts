import { Console, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions } from "generalist"
import { Tool, Toolkit } from "effect/unstable/ai"
import { TestModel } from "generalist/testing"

const dropTableTool = Tool.make("drop_table", {
  description: "Drop a database table",
  parameters: Schema.Struct({ table: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(dropTableTool)
const agent = Agent.make({ name: "db-assistant", toolkit })

const permissionsLayer = Permissions.layerRuleset({
  rules: [{ pattern: "drop_*", level: "deny", reason: "Schema changes require a migration" }],
  fallback: "allow",
})

const modelLayer = TestModel.layer([TestModel.toolCall("drop_table", { table: "users" }, { id: "drop-1" })])

const program = Effect.gen(function* () {
  const result = yield* Agent.run(agent, "Drop the users table.")
  yield* Console.log(result)
}).pipe(
  Effect.catchTag("generalist/core/PermissionDenied", (failure) =>
    Console.log(`drop_table authorization: ${failure.message}`),
  ),
)

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ drop_table: () => Effect.die("denied calls never reach the handler") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  permissionsLayer,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
