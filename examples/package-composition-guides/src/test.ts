import { Console, Effect, ManagedRuntime } from "effect"
import { Agent } from "generalist"
import { TestModel } from "generalist/testing"

const modelLayer = TestModel.layer([TestModel.text("A deterministic answer.")])
const agent = Agent.make({ name: "tested-agent" })

const program = Agent.run(agent, "Answer deterministically.").pipe(Effect.flatMap((result) => Console.log(result)))

const runtime = ManagedRuntime.make(modelLayer)
await runtime.runPromise(program)
