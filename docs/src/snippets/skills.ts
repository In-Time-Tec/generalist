import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Layer, Ref } from "effect"
import { Agent, Approvals, Permissions, SkillCatalog } from "generalist"
import { layer, text, toolCall } from "generalist/testing/model"

const program = Effect.gen(function* () {
  const activations = yield* Ref.make(0)
  const review: SkillCatalog.Skill = {
    name: "review",
    description: "Review the average function's boundary cases.",
    instructions: Ref.update(activations, (count) => count + 1).pipe(
      Effect.as("Check empty and nonempty input. A final sentence is not test evidence."),
    ),
    tools: [],
  }
  const services = Layer.mergeAll(
    SkillCatalog.layerSkills([review]),
    Permissions.layerAllowAll,
    Approvals.layerAutoApprove,
    layer([
      toolCall("activate_skill", { name: "review" }),
      text("I will check empty input and preserve the nonempty behavior."),
    ]),
  )
  yield* Agent.run(Agent.make({ name: "coding-agent" }), "Review the average fix.").pipe(Effect.provide(services))
  yield* Console.log(`Review instructions loaded: ${yield* Ref.get(activations)}`)
})

BunRuntime.runMain(program)
