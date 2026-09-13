import "./websocket-suite.js"
import { expect, layer } from "@effect/vitest"
import { Effect, Fiber, Option, Stream } from "effect"
import { Chat, Connection } from "../../../../src/unstable/foldkit/index.js"
import { StatusEpochRegistry } from "../../../../src/unstable/foldkit/chat/connection-internal.js"

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
      expect(failure._tag).toBe("generalist/foldkit/SendFailed")
      yield* connection.send({ _tag: "Cancel", sessionId: "run-1", commandId: "cancel-run-1" })
      expect(Chat.initialModel("run-1").lastSeq).toBeNull()
    }),
  )

  it.effect("bounds actual socket epoch mappings across skipped and repeated reconnect attempts", () =>
    Effect.gen(function* () {
      const epochs = new StatusEpochRegistry()
      for (let socketEpoch = 0; socketEpoch < 128; socketEpoch += 1) {
        yield* epochs.bind(socketEpoch, 1_000 + socketEpoch)
        expect(yield* epochs.get(socketEpoch)).toEqual(Option.some(1_000 + socketEpoch))
      }
      expect(epochs.retained).toBe(8)

      const skippedAttempt = yield* epochs.get(130).pipe(Effect.forkChild)
      yield* epochs.bind(130, 1_128)
      expect(yield* Fiber.join(skippedAttempt)).toEqual(Option.some(1_128))
      expect(epochs.retained).toBeLessThanOrEqual(8)
    }),
  )

  it.effect("ignores a buffered status whose skipped socket attempts retired its epoch", () =>
    Effect.gen(function* () {
      const epochs = new StatusEpochRegistry()
      yield* epochs.bind(0, 0)
      yield* epochs.bind(10, 1)

      expect(Option.isNone(yield* epochs.get(0).pipe(Effect.timeout("100 millis")))).toBe(true)
      const retained = epochs.retained
      yield* epochs.bind(0, 2)
      expect(epochs.retained).toBe(retained)
    }),
  )

  it.effect("resolves a pending status lookup when pruning retires its epoch", () =>
    Effect.gen(function* () {
      const epochs = new StatusEpochRegistry()
      const waiter = yield* epochs.get(1).pipe(Effect.forkChild)

      yield* epochs.bind(10, 1)

      expect(Option.isNone(yield* Fiber.join(waiter).pipe(Effect.timeout("100 millis")))).toBe(true)
    }),
  )
})
