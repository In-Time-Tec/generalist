import { Console, Effect } from "effect"
import * as Ai from "effect/unstable/ai"
import { Session } from "@batonfx/core"

const message = (entry: Ai.Prompt.Message): Session.AppendInput => ({ _tag: "Message", message: entry })

const user = (text: string): Ai.Prompt.Message =>
  Ai.Prompt.makeMessage("user", { content: [Ai.Prompt.makePart("text", { text })] })

const assistant = (text: string): Ai.Prompt.Message =>
  Ai.Prompt.makeMessage("assistant", { content: [Ai.Prompt.makePart("text", { text })] })

const program = Effect.gen(function* () {
  const store = yield* Session.SessionStore
  yield* store.append(message(Ai.Prompt.makeMessage("system", { content: "You are a travel planner." })))
  yield* store.append(message(user("Plan a trip to Boise.")))
  yield* store.append(message(assistant("Three days in Boise, starting downtown.")))
  const kept = yield* store.append(message(user("Add a rafting day.")))

  const before = Session.buildContext(yield* store.path())
  yield* Console.log(`before: ${before.content.map((entry) => entry.role).join(" ")}`)

  yield* store.append({
    _tag: "Compaction",
    summary: "Planned a three-day Boise trip.",
    firstKeptEntryId: kept.id,
  })

  const path = yield* store.path()
  const after = Session.buildContext(path)
  yield* Console.log(`after: ${after.content.map((entry) => entry.role).join(" ")}`)
  yield* Console.log(`log entries: ${path.length}`)
}).pipe(Effect.provide(Session.memoryLayer))

await Effect.runPromise(program)
