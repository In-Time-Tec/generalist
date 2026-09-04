import { Console, Effect, Exit, ManagedRuntime } from "effect"
import { Agent, ModelRegistry } from "generalist"
import { layer as deterministicLayer } from "generalist/providers/deterministic"

const planner = Agent.make({ name: "planner" })
const reviewer = Agent.make({ name: "reviewer" })
const model = { provider: "deterministic", model: "multi-agent" }

const program = ModelRegistry.withModel(
  model,
  Agent.fanOut([Agent.child(planner, "Plan the work"), Agent.child(reviewer, "Review the work")] as const, {
    concurrency: 2,
    onFailure: "collect",
  }),
).pipe(
  Effect.flatMap((results) =>
    Console.log(results.map((result) => (Exit.isSuccess(result) ? result.value : "child failed")).join("\n")),
  ),
)

const runtime = ManagedRuntime.make(deterministicLayer({ ...model, response: "deterministic child result" }))
await runtime.runPromise(program)
