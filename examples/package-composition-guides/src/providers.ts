import { Console, Effect, ManagedRuntime } from "effect"
import { Agent, ModelRegistry } from "tenetkit"
import { layer as deterministicLayer } from "tenetkit/ai/deterministic"

const agent = Agent.make({ name: "local-assistant" })
const selection = { provider: "deterministic", model: "local" }

const program = ModelRegistry.withModel(
  selection,
  Agent.generate(agent, { prompt: "Give me the deterministic response." }),
).pipe(Effect.flatMap((result) => Console.log(result.text)))

const runtime = ManagedRuntime.make(deterministicLayer(selection))
await runtime.runPromise(program)
