import { Console, Effect, ManagedRuntime, Stream } from "effect"
import { Connection } from "generalist/unstable/foldkit"

const incomingFrames = Stream.make(
  Connection.SessionSnapshot({
    epoch: 0,
    snapshot: {
      version: 1,
      session: { id: "guide-session", createdAt: "2026-09-02T00:00:00.000Z", queue: [] },
      cursor: -1,
      runs: [],
      conversation: { leafId: null, entries: [] },
    },
  }),
  Connection.ConnectionOpened({ sessionId: "guide-session", epoch: 0 }),
)
const send = () => Effect.void

const connectionLayer = Connection.layerTest({
  session: ({ sessionId }) => Effect.succeed({ sessionId, frames: incomingFrames, send }),
  send,
})

const program = Connection.Connection.use((connection) =>
  Effect.scoped(
    Effect.gen(function* () {
      const session = yield* connection.session({ sessionId: "guide-session" })
      const frames = yield* Stream.runCollect(session.frames)
      yield* Console.log(`received ${frames.length} connection events`)
    }),
  ),
)

const runtime = ManagedRuntime.make(connectionLayer)
await runtime.runPromise(program)
