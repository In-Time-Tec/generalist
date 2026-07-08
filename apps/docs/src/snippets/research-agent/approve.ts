import { Client } from "@batonfx/transport"
import { Console, Effect, Stream } from "effect"
import { Socket } from "effect/unstable/socket"

const sessionId = "research-1"
const token = "approve-search-1"

const program = Effect.scoped(
  Effect.gen(function* () {
    const client = yield* Client.AgentClient
    const connection = yield* client.connect({ url: "ws://localhost:4000/ws", sessionId })
    yield* connection.status.pipe(
      Stream.takeUntil((status) => status._tag === "Open"),
      Stream.runDrain,
    )
    yield* connection.send({ _tag: "ResolveApproval", sessionId, token, decision: { _tag: "Approved" } })
    yield* connection.frames.pipe(
      Stream.dropUntil((frame) => frame._tag === "Ended"),
      Stream.takeUntil((frame) => frame._tag === "Ended"),
      Stream.runForEach((frame) =>
        frame._tag === "Event" ? Console.log(`Event ${frame.event._tag}`) : Console.log(frame._tag),
      ),
    )
  }),
).pipe(Effect.provide(Client.layerWebSocket), Effect.provide(Socket.layerWebSocketConstructorGlobal))

await Effect.runPromise(program)
