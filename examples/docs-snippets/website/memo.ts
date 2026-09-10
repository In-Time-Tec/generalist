import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Layer, Ref, Schema, pipe } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Memo, Permissions } from "generalist"
import { layer, text, toolCall } from "generalist/testing/model"

const analyze = pipe(
  Tool.make("analyze_file", {
    description: "Analyze the source at a fixed revision.",
    parameters: Schema.Struct({ path: Schema.Literals(["src/average.ts"]) }),
    success: Schema.String,
  }),
  Memo.pure({ ttl: "5 minutes", dependsOn: ["repository-revision"] }),
)
const toolkit = Toolkit.make(analyze)
const coder = Agent.make({ name: "coding-agent", toolkit })

const program = Effect.gen(function* () {
  const calls = yield* Ref.make(0)
  const services = Layer.mergeAll(
    Memo.layerMemory(),
    Memo.layerDependencies({
      tenant: "tutorial",
      capabilityScope: "read-average",
      versions: { "repository-revision": "fixture-v1" },
    }),
    toolkit.toLayer({
      analyze_file: () => Ref.update(calls, (count) => count + 1).pipe(Effect.as("Empty input divides by zero.")),
    }),
    Permissions.layerAllowAll,
    Approvals.layerAutoApprove,
    layer([
      toolCall("analyze_file", { path: "src/average.ts" }),
      toolCall("analyze_file", { path: "src/average.ts" }),
      text("The unchanged analysis was reused."),
    ]),
  )
  yield* Agent.run(coder, "Check the source twice at the same revision.").pipe(Effect.provide(services))
  yield* Console.log(`Analysis handler calls: ${yield* Ref.get(calls)}`)
})

BunRuntime.runMain(program)
