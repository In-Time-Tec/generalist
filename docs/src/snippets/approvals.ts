import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Layer, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Permissions } from "generalist"
import { layer, toolCall } from "generalist/testing/model"

const applyPatch = Tool.make("apply_patch", {
  description: "Apply the proposed source change after approval.",
  parameters: Schema.Struct({ path: Schema.Literals(["src/average.ts"]), content: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})
const toolkit = Toolkit.make(applyPatch)
const coder = Agent.make({ name: "coding-agent", toolkit })

const services = Layer.mergeAll(
  layer([
    toolCall("apply_patch", {
      path: "src/average.ts",
      content:
        "export const average = (values: number[]) => values.length === 0 ? 0 : values.reduce((sum, n) => sum + n, 0) / values.length",
    }),
  ]),
  toolkit.toLayer({
    apply_patch: () => Effect.die("The denied handler must not execute."),
  }),
  Permissions.layerAllowAll,
  Approvals.layerDenyAll,
)

BunRuntime.runMain(
  Agent.run(coder, "Apply the fix for average([]).").pipe(
    Effect.provide(services),
    Effect.andThen(Effect.die("Expected the patch to be denied.")),
    Effect.catchTag("generalist/core/PermissionDenied", () => Console.log("Patch denied; no file was changed.")),
  ),
)
