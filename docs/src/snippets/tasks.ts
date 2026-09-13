import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Layer } from "effect"
import { Agent, Approvals, Permissions, Tasks } from "generalist"
import { layer, text, toolCall } from "generalist/testing/model"

const coder = Agent.make({ name: "coding-agent" })
const services = Layer.mergeAll(
  Tasks.layer(),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  layer([
    toolCall("tasks_write", {
      items: [
        { id: "read", title: "Read src/average.ts", status: "done" },
        { id: "fix", title: "Add the empty-input guard", status: "doing" },
        { id: "test", title: "Run the regression test", status: "todo" },
      ],
    }),
    text("The plan is recorded. The fix is in progress."),
  ]),
)

BunRuntime.runMain(
  Agent.run(coder, "Record the plan for fixing average([]).").pipe(
    Effect.provide(services),
    Effect.flatMap(Console.log),
  ),
)
