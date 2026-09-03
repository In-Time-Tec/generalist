import { BunCrypto } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { Effect, Fiber, Layer, Queue, Schema } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Approvals, BlobStore, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { Server } from "generalist/server"
import { TestModel } from "generalist/testing"
import { Artifact, Yjs, layer as artifactLayer } from "generalist/unstable/artifact"
import { handle } from "../../src/server/artifact-websocket.js"

const makeSocket = Effect.gen(function* () {
  const inbound = yield* Queue.unbounded<string | Uint8Array | Socket.CloseEvent>()
  const outbound = yield* Queue.unbounded<string | Uint8Array | Socket.CloseEvent>()
  const socket = Socket.make({
    runRaw: (dispatch) =>
      Effect.gen(function* () {
        while (true) {
          const message = yield* Queue.take(inbound)
          if (Socket.isCloseEvent(message)) return
          const result = dispatch(message)
          if (Effect.isEffect(result)) yield* result
        }
      }),
    writer: Effect.succeed((chunk) => Queue.offer(outbound, chunk).pipe(Effect.asVoid)),
  })
  return { inbound, outbound, socket }
})

const request = (socket: Socket.Socket): HttpServerRequest.HttpServerRequest => {
  const value = HttpServerRequest.fromWeb(new Request("http://generalist.test/artifacts/shared.md/ws"))
  Object.defineProperty(value, "upgrade", { value: Effect.succeed(socket) })
  return value
}

const services = Layer.mergeAll(
  Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
    Layer.provide(ExecutableResolver.layerStatic([])),
  ),
  BlobStore.layerMemory().pipe(Layer.provide(BunCrypto.layer)),
  artifactLayer,
  TestModel.layer([]),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

layer(services)("Artifact WebSocket", (it) => {
  it.effect("accepts human operations and streams the attributed update", () =>
    Effect.gen(function* () {
      const document = yield* Artifact.open("shared.md", { crdt: Yjs.layer(), initial: "draft" })
      const host = yield* Generalist.create({ agents: [] })
      const updates = yield* host.artifacts.subscribe(document.name)
      const fake = yield* makeSocket
      const server = yield* handle<readonly []>({
        host,
        name: document.name,
        request: request(fake.socket),
        updates,
      }).pipe(Effect.forkChild)

      const initial = yield* Queue.take(fake.outbound)
      if (Socket.isCloseEvent(initial) || initial instanceof Uint8Array) return yield* Effect.die("expected snapshot")
      expect(yield* Schema.decodeEffect(Schema.fromJsonString(Server.ArtifactServerEvent))(initial)).toMatchObject({
        _tag: "Snapshot",
        document: { artifact: document.name, version: 0, content: "draft" },
      })

      const command = yield* Schema.encodeEffect(Schema.fromJsonString(Server.ArtifactClientCommand))({
        _tag: "Edit",
        base: 0,
        operation: { _tag: "Insert", at: 5, text: " together" },
        attribution: { _tag: "Human", actor: "browser-user" },
      })
      yield* Queue.offer(fake.inbound, command)
      const encoded = yield* Queue.take(fake.outbound)
      if (Socket.isCloseEvent(encoded) || encoded instanceof Uint8Array) return yield* Effect.die("expected update")
      expect(yield* Schema.decodeEffect(Schema.fromJsonString(Server.ArtifactServerEvent))(encoded)).toMatchObject({
        _tag: "Update",
        update: { base: 0, result: 1, attribution: { _tag: "Human", actor: "browser-user" } },
        document: { version: 1, content: "draft together" },
      })

      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(server)
    }),
  )
})
