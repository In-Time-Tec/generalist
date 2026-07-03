import { describe, expect, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { Chat, Connection } from "../src/index"

describe("Connection", () => {
  it.effect("testLayer provides AgentConnection frames and send", () =>
    Effect.gen(function* () {
      const incoming = Connection.ConnectionOpened()
      const frames = yield* Connection.AgentConnection.use((connection) =>
        connection.frames({ sessionId: "s", afterSeq: 1 }).pipe(Stream.runCollect),
      )
      yield* Connection.AgentConnection.use((connection) => connection.send({ _tag: "Cancel", sessionId: "s" }))

      expect(frames).toEqual([incoming])
    }).pipe(
      Effect.provide(
        Connection.testLayer({
          frames: () => Stream.fromIterable([Connection.ConnectionOpened()]),
          send: () => Effect.void,
        }),
      ),
    ),
  )

  it("keeps the chat subscription alive across afterSeq-only changes", () => {
    const subscription = Chat.subscriptions.agentFrames

    expect(subscription.keepAliveEquivalence?.({ sessionId: "s", afterSeq: 1 }, { sessionId: "s", afterSeq: 2 })).toBe(
      true,
    )
    expect(
      subscription.keepAliveEquivalence?.({ sessionId: "s-1", afterSeq: 2 }, { sessionId: "s-2", afterSeq: 2 }),
    ).toBe(false)
  })
})
