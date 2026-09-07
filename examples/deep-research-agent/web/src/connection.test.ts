import { expect, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpClient } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Connection } from "generalist/unstable/foldkit"
import { layer as connectionLayer } from "./connection"

const resources = connectionLayer({ baseUrl: "https://research.test/api" }).pipe(
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
  Layer.provide(
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.die("A command without the current Session owner must not issue HTTP requests")),
    ),
  ),
)

layer(resources)("Research Host adapter ownership", (it) => {
  it.effect("rejects unowned, cross-Session, replaced, and closed command owners before dispatch", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Connection.Connection
        const command: Parameters<Connection.Service["send"]>[0] = {
          _tag: "SendMessage",
          sessionId: "session-1",
          prompt: "research",
        }
        expect(yield* connection.send(command).pipe(Effect.flip)).toMatchObject({
          reason: "No connection owns this Session",
        })
        const replaced = yield* connection.session({ sessionId: "session-1" })
        const closed = yield* Effect.scoped(
          Effect.gen(function* () {
            const current = yield* connection.session({ sessionId: "session-1" })
            expect(yield* replaced.send(command).pipe(Effect.flip)).toMatchObject({
              reason: "The Session connection has been replaced",
            })
            expect(yield* current.send({ ...command, sessionId: "session-2" }).pipe(Effect.flip)).toMatchObject({
              reason: "The Session connection has been replaced",
            })
            return current
          }),
        )
        expect(yield* closed.send(command).pipe(Effect.flip)).toMatchObject({
          reason: "The Session connection has been replaced",
        })
        expect(yield* connection.send(command).pipe(Effect.flip)).toMatchObject({
          reason: "No connection owns this Session",
        })
      }),
    ),
  )
})
