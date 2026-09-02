import { Console, Effect, ManagedRuntime } from "effect"
import { Agent, ModelRegistry } from "generalist"
import { layer as deterministicLayer } from "generalist/ai/deterministic"

const agent = Agent.make({ name: "local-assistant" })
const selection = { provider: "deterministic", model: "local" }

const program = ModelRegistry.withModel(selection, Agent.run(agent, "Give me the deterministic response.")).pipe(
  Effect.flatMap((result) => Console.log(result)),
)

const runtime = ManagedRuntime.make(deterministicLayer(selection))
await runtime.runPromise(program)
