import { expect, layer } from "@effect/vitest"
import { Effect, Fiber, Layer, Queue, Schema, Stream } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { HttpServerRequest } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Agent, Approvals, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { Server } from "generalist/server"
import { handle } from "../../src/server/websocket.js"

interface FakeSocket {
  readonly socket: Socket.Socket
  readonly inbound: Queue.Queue<string | Uint8Array | Socket.CloseEvent>
  readonly outbound: Queue.Queue<string | Uint8Array | Socket.CloseEvent>
}

const makeFakeSocket = (): Effect.Effect<FakeSocket> =>
  Effect.gen(function* () {
    const inbound = yield* Queue.unbounded<string | Uint8Array | Socket.CloseEvent>()
    const outbound = yield* Queue.unbounded<string | Uint8Array | Socket.CloseEvent>()
    return {
      inbound,
      outbound,
      socket: Socket.make({
        runRaw: (dispatch) =>
          Effect.gen(function* () {
            while (true) {
              const message = yield* Queue.take(inbound)
              if (Socket.isCloseEvent(message)) return
              const handled = dispatch(message)
              if (Effect.isEffect(handled)) yield* handled
            }
          }),
        writer: Effect.succeed((chunk) => Queue.offer(outbound, chunk).pipe(Effect.asVoid)),
      }),
    }
  })

const request = (socket: Socket.Socket): HttpServerRequest.HttpServerRequest => {
  const value = HttpServerRequest.fromWeb(new Request("http://generalist.test/sessions/session-1/ws"))
  Object.defineProperty(value, "upgrade", { value: Effect.succeed(socket) })
  return value
}

const runtime = Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
  Layer.provide(ExecutableResolver.layerStatic([])),
)
const model = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => Stream.die("cancelled Run must not execute"),
  }),
)

layer(Layer.mergeAll(runtime, model, Permissions.layerAllowAll, Approvals.layerAutoApprove))(
  "WebSocket server handler",
  (it) => {
    it.effect("streams the route Session and cancels only an explicitly named member Run", () =>
      Effect.gen(function* () {
        const agent = Agent.make({ name: "websocket-test" })
        const host = yield* Generalist.create({ agents: [agent] })
        const session = yield* host.sessions.create({ id: "session-1" })
        const run = yield* host.runs.start(session.id, agent, "wait")
        const fake = yield* makeFakeSocket()
        const fiber = yield* handle<readonly [typeof agent]>({
          host,
          sessionId: session.id,
          request: request(fake.socket),
        }).pipe(Effect.forkChild)

        const output = yield* Queue.take(fake.outbound)
        if (Socket.isCloseEvent(output) || output instanceof Uint8Array) return yield* Effect.die("expected HostEvent")
        expect(yield* Server.eventCodec.decode(output)).toMatchObject({ _tag: "RunStarted", runId: run.id })

        const command = yield* Schema.encodeEffect(Schema.fromJsonString(Server.ClientCommand))({
          _tag: "Cancel",
          runId: run.id,
          reason: "user stopped",
        })
        yield* Queue.offer(fake.inbound, command)
        yield* Effect.yieldNow
        expect(yield* host.runs.inspect(run.id)).toMatchObject({ status: "cancelled" })

        yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
        yield* Fiber.join(fiber)
      }),
    )
  },
)
