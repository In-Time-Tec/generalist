import { Console, Effect, ManagedRuntime } from "effect"
import { Agent, ModelRegistry } from "@batonfx/core"
import { Deterministic } from "@batonfx/providers"

const agent = Agent.make({ name: "local-assistant" })
const selection = { provider: "deterministic", model: "local" }

const program = ModelRegistry.operate(
  selection,
  Agent.generate(agent, { prompt: "Give me the deterministic response." }),
).pipe(Effect.flatMap((result) => Console.log(result.text)))

const runtime = ManagedRuntime.make(Deterministic.layer(selection))
await runtime.runPromise(program)
