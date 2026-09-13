import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Layer } from "effect"
import { Agent } from "generalist"
import { fromText, layer as instructions } from "generalist/instructions"
import { layer, text } from "generalist/testing/model"

const coder = Agent.make({ name: "coding-agent" })
const services = Layer.mergeAll(
  instructions([
    fromText("repository", "Use Effect services. Keep changes scoped to the requested bug."),
    fromText("verification", "Add a regression test. Never say tests passed unless you ran them."),
  ]),
  layer([text("Plan: add the empty-input guard, then run the average tests.")]),
)

BunRuntime.runMain(
  Agent.run(coder, "Plan the fix for average([]).").pipe(Effect.provide(services), Effect.flatMap(Console.log)),
)
