import { describe, expect, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { Chat, Connection } from "../src/index.js"

describe("Connection", () => {
  it.effect("keeps unsupported commands explicit at the host adapter boundary", () => {
    const layer = Connection.layerTest({
      frames: () => Stream.empty,
      send: (command) =>
        command._tag === "Cancel"
          ? Effect.void
          : Effect.fail(Connection.SendFailed.make({ reason: `${command._tag} requires a host adapter` })),
    })
    return Effect.gen(function* () {
      const connection = yield* Connection.AgentConnection
      const failure = yield* connection
        .send({ _tag: "SendMessage", sessionId: "run-1", prompt: "hello" })
        .pipe(Effect.flip)
      expect(failure._tag).toBe("@batonfx/foldkit/SendFailed")
      yield* connection.send({ _tag: "Cancel", sessionId: "run-1" })
      expect(Chat.initialModel("run-1").lastSeq).toBe(-1)
    }).pipe(Effect.provide(layer))
  })
})
