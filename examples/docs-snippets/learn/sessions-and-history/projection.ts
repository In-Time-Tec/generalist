import { Console, Effect } from "effect"
import { Session } from "generalist"
import { Prompt } from "effect/unstable/ai"

const message = (entry: Prompt.Message): Session.AppendInput => ({ _tag: "Message", message: entry })

const user = (text: string): Prompt.Message =>
  Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

const assistant = (text: string): Prompt.Message =>
  Prompt.makeMessage("assistant", { content: [Prompt.makePart("text", { text })] })

const program = Effect.scoped(
  Effect.gen(function* () {
    const store = yield* Session.acquire("travel-planner")
    yield* store.append(message(Prompt.makeMessage("system", { content: "You are a travel planner." })), {
      commandId: "travel-planner:system:1",
    })
    yield* store.append(message(user("Plan a trip to Boise.")), { commandId: "travel-planner:question:1" })
    yield* store.append(message(assistant("Three days in Boise, starting downtown.")), {
      commandId: "travel-planner:answer:1",
    })
    const kept = yield* store.append(message(user("Add a rafting day.")), { commandId: "travel-planner:question:2" })
    const checkpointId = yield* store.reserveEntryId("travel-planner:compact:1")

    const before = Session.buildContext(yield* store.path())
    yield* Console.log(`before: ${before.content.map((entry) => entry.role).join(" ")}`)

    yield* store.appendCheckpoint({
      id: checkpointId,
      parentId: kept.id,
      projectedHistory: Prompt.fromMessages([user("Planned a three-day Boise trip. Add a rafting day.")]),
      telemetry: [],
      summary: "Planned a three-day Boise trip.",
    })

    const path = yield* store.path()
    const after = Session.buildContext(path)
    yield* Console.log(`after: ${after.content.map((entry) => entry.role).join(" ")}`)
    yield* Console.log(`log entries: ${path.length}`)
  }),
)

await Effect.runPromise(program.pipe(Effect.provide(Session.layerMemory)))
