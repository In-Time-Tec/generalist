import { Console, Effect, ManagedRuntime } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Memory } from "@batonfx/core"
import { WorkingMemory } from "@batonfx/memory"

const key: Memory.Key = { agent: "assistant", subject: "user-42" }
const text = (value: string) => Prompt.makePart("text", { text: value })
const message = (role: "user" | "assistant", value: string) => Prompt.makeMessage(role, { content: [text(value)] })

const program = Memory.Memory.use((memory) =>
  Effect.gen(function* () {
    yield* memory.remember({
      key,
      turn: 0,
      terminal: true,
      transcript: Prompt.fromMessages([message("user", "My name is Ada."), message("assistant", "Hello Ada.")]),
    })
    const recalled = yield* memory.recall({
      key,
      turn: 0,
      prompt: Prompt.fromMessages([message("user", "What do you remember?")]),
    })
    yield* Console.log(`recalled ${recalled.length} messages`)
  }),
)

const runtime = ManagedRuntime.make(WorkingMemory.layer({ maxMessages: 4 }))
await runtime.runPromise(program)
