import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Exit } from "effect"
import { Agent } from "generalist"
import { layerModel } from "generalist/providers/deterministic"

const reviewer = Agent.make({ name: "reviewer", instructions: "Find correctness risks in the proposed change." })
const testWriter = Agent.make({ name: "test-writer", instructions: "Propose regression tests for the change." })

BunRuntime.runMain(
  Effect.gen(function* () {
    const results = yield* Agent.fanOut(
      [
        Agent.child(reviewer, "Review: return 0 when average receives an empty array."),
        Agent.child(testWriter, "Test average([]) and average([2, 4])."),
      ] as const,
      { concurrency: 2, onFailure: "collect" },
    )
    for (const result of results) {
      yield* Console.log(Exit.isSuccess(result) ? result.value : "The specialist failed.")
    }
  }).pipe(Effect.provide(layerModel({ response: "The specialist completed its scripted review." }))),
)
