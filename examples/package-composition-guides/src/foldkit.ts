import { Console, Effect, ManagedRuntime, Stream } from "effect"
import { Connection } from "tenetkit/foldkit"

const frames = Stream.make(Connection.ConnectionOpened())
const send = () => Effect.void

const connectionLayer = Connection.layerTest({
  session: ({ sessionId }) => Effect.succeed({ sessionId, frames, send }),
  send,
})

const program = Connection.Connection.use((connection) =>
  Effect.scoped(
    Effect.gen(function* () {
      const session = yield* connection.session({ sessionId: "guide-session" })
      const frames = yield* Stream.runCollect(session.frames)
      yield* Console.log(`received ${frames.length} connection event`)
    }),
  ),
)

const runtime = ManagedRuntime.make(connectionLayer)
await runtime.runPromise(program)
