import { expect, layer } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { Chat, Connection } from "../../../src/foldkit/index.js"

const send: Connection.Connection["Service"]["send"] = (command) =>
  command._tag === "Cancel"
    ? Effect.void
    : Effect.fail(Connection.SendFailed.make({ reason: `${command._tag} requires a host adapter` }))

layer(
  Connection.layerTest({
    session: ({ sessionId }) => Effect.succeed({ sessionId, frames: Stream.empty, send }),
    send,
  }),
)("Connection", (it) => {
  it.effect("keeps unsupported commands explicit at the host adapter boundary", () =>
    Effect.gen(function* () {
      const connection = yield* Connection.Connection
      const failure = yield* connection
        .send({ _tag: "SendMessage", sessionId: "run-1", prompt: "hello" })
        .pipe(Effect.flip)
      expect(failure._tag).toBe("tenetkit/foldkit/SendFailed")
      yield* connection.send({ _tag: "Cancel", sessionId: "run-1" })
      expect(Chat.initialModel("run-1").lastSeq).toBe(-1)
    }),
  )
})
