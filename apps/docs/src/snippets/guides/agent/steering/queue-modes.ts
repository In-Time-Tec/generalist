import { Console, Effect, Schema } from "effect"
import { Agent, Steering } from "tenetkit"

const agent = Agent.make({ name: "bounded-inbox" })

const program = Effect.scoped(
  Effect.gen(function* () {
    const run = yield* Agent.makeRun(agent, {
      prompt: "start",
      steering: { steering: { capacity: 1 } },
    })
    const first = yield* run.steer({ prompt: "First correction." })
    const rejected = yield* run.steer({ prompt: "Second correction." }).pipe(Effect.flip)
    const outcome = Schema.is(Steering.InboxFull)(rejected) ? `${rejected.dimension} full` : "closed"

    yield* Console.log(`first sequence: ${first.sequence}, second: ${outcome}`)
  }),
)

await Effect.runPromise(program)
