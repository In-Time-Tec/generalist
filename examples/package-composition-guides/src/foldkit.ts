import { Console, Effect, Stream } from "effect"
import { Connection } from "@batonfx/foldkit"

const connectionLayer = Connection.layerTest({
  frames: () => Stream.make(Connection.ConnectionOpened()),
  send: () => Effect.void,
})

const program = Connection.AgentConnection.use((connection) =>
  Effect.scoped(
    Effect.gen(function* () {
      const session = yield* connection.session({ sessionId: "guide-session" })
      const frames = yield* Stream.runCollect(session.frames)
      yield* Console.log(`received ${frames.length} connection event`)
    }),
  ),
).pipe(Effect.provide(connectionLayer))

await Effect.runPromise(program)
