import { describe, expect, layer } from "@effect/vitest"
import { Effect, Exit, Fiber, Layer, Schedule, Schema, Scope, Stream } from "effect"
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Server } from "generalist/server"
import { hostEvent } from "./fixtures.js"

class FakeWebSocket extends EventTarget implements WebSocket {
  readonly CONNECTING = WebSocket.CONNECTING
  readonly OPEN = WebSocket.OPEN
  readonly CLOSING = WebSocket.CLOSING
  readonly CLOSED = WebSocket.CLOSED
  readonly extensions = ""
  readonly protocol = ""
  readonly sent: Array<string | Uint8Array> = []
  readyState: 0 | 1 | 2 | 3 = WebSocket.CONNECTING
  binaryType: BinaryType = "blob"
  bufferedAmount = 0
  onclose: WebSocket["onclose"] = null
  onerror: WebSocket["onerror"] = null
  onmessage: WebSocket["onmessage"] = null
  onopen: WebSocket["onopen"] = null

  constructor(readonly url: string) {
    super()
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.sent.push(Schema.decodeUnknownSync(Schema.Union([Schema.String, Schema.Uint8Array]))(data))
  }

  close(code = 1000, reason?: string): void {
    this.readyState = WebSocket.CLOSED
    const init: CloseEventInit = { code }
    if (reason !== undefined) init.reason = reason
    this.dispatchEvent(new CloseEvent("close", init))
  }

  open(): void {
    this.readyState = WebSocket.OPEN
    this.dispatchEvent(new Event("open"))
  }

  message(data: string): void {
    this.dispatchEvent(new MessageEvent("message", { data }))
  }
}

const socketAt = (sockets: ReadonlyArray<FakeWebSocket>, index: number): Effect.Effect<FakeWebSocket> =>
  Effect.suspend(() => {
    const socket = sockets[index]
    return socket === undefined
      ? Effect.yieldNow.pipe(Effect.andThen(socketAt(sockets, index)))
      : Effect.succeed(socket)
  })

const sentText = (value: string | Uint8Array | undefined): string => Schema.decodeUnknownSync(Schema.String)(value)

const previewDelivery = (attemptFence: number, sequence: number, delta: string) =>
  Server.PreviewDelivery.make({
    _tag: "PreviewDelivery",
    sessionId: "session-1",
    runId: "run-1",
    authorityAttemptFence: attemptFence,
    event: {
      _tag: "ModelPreview",
      runId: "run-1",
      attemptFence,
      turn: 0,
      modelCallId: `model-call:${attemptFence}`,
      modelAttemptId: `model-attempt:${attemptFence}`,
      attempt: 0,
      generation: 1,
      sequence,
      changes: [{ channel: "text", offset: 0, delta }],
    },
  })

describe("Server client WebSocket", () => {
  const sockets: Array<FakeWebSocket> = []
  const resources = Layer.merge(
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({
              version: 1,
              session: { id: "session-1", createdAt: "2026-09-02T00:00:00.000Z", queue: [] },
              cursor: -1,
              runs: [],
              conversation: { leafId: null, entries: [] },
            }),
          ),
        ),
      ),
    ),
    Layer.succeed(Socket.WebSocketConstructor, (url) => {
      const socket = new FakeWebSocket(url)
      sockets.push(socket)
      return socket
    }),
  )

  layer(resources, { excludeTestServices: true })("connection", (test) => {
    for (const { baseUrl, httpPrefix, socketPrefix } of [
      { baseUrl: "http://generalist.test", httpPrefix: "http://generalist.test", socketPrefix: "ws://generalist.test" },
      {
        baseUrl: "https://generalist.test/",
        httpPrefix: "https://generalist.test",
        socketPrefix: "wss://generalist.test",
      },
      {
        baseUrl: "http://generalist.test/api",
        httpPrefix: "http://generalist.test/api",
        socketPrefix: "ws://generalist.test/api",
      },
      {
        baseUrl: new URL("https://generalist.test/api/"),
        httpPrefix: "https://generalist.test/api",
        socketPrefix: "wss://generalist.test/api",
      },
      {
        baseUrl: "https://generalist.test/tenant%20one/api",
        httpPrefix: "https://generalist.test/tenant%20one/api",
        socketPrefix: "wss://generalist.test/tenant%20one/api",
      },
    ]) {
      test.effect(`preserves the base path, encoded Session, auth, and cursor for ${baseUrl}`, () =>
        Effect.scoped(
          Effect.gen(function* () {
            sockets.length = 0
            const sessionId = "session /?#%"
            const requests: Array<HttpClientRequest.HttpClientRequest> = []
            const http = HttpClient.make((request) => {
              requests.push(request)
              return Effect.succeed(
                HttpClientResponse.fromWeb(
                  request,
                  Response.json({
                    version: 1,
                    session: { id: sessionId, createdAt: "2026-09-02T00:00:00.000Z", queue: [] },
                    cursor: 23,
                    runs: [],
                    conversation: { leafId: null, entries: [] },
                  }),
                ),
              )
            }).pipe(HttpClient.mapRequest(HttpClientRequest.bearerToken("url-test-token")))
            const client = yield* Server.client({ baseUrl }).pipe(Effect.provideService(HttpClient.HttpClient, http))
            yield* client.events.connect({ sessionId, reconnect: Schedule.recurs(0) })
            const socket = yield* socketAt(sockets, 0)
            expect(requests).toHaveLength(1)
            expect(requests[0]?.url).toBe(`${httpPrefix}/sessions/session%20%2F%3F%23%25/snapshot`)
            expect(requests[0]?.headers.authorization).toBe("Bearer url-test-token")
            expect(socket.url).toBe(`${socketPrefix}/sessions/session%20%2F%3F%23%25/ws?cursor=23`)
            socket.open()
            yield* Effect.yieldNow
          }),
        ),
      )
    }

    test.effect("reconnects from the replacement snapshot cursor and sends explicit cancellation", () =>
      Effect.scoped(
        Effect.gen(function* () {
          sockets.length = 0
          const client = yield* Server.client({ baseUrl: "https://generalist.test" })
          const connection = yield* client.events.connect({
            sessionId: "session-1",
            eventCapacity: 1,
            reconnect: Schedule.recurs(1),
          })
          const first = yield* socketAt(sockets, 0)
          expect(first.url).toBe("wss://generalist.test/sessions/session-1/ws?cursor=-1")
          first.open()

          const received = yield* connection.events.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
          first.message(yield* Server.eventCodec.encode(hostEvent(7)))
          expect(Array.from(yield* Fiber.join(received))).toEqual([hostEvent(7)])
          first.close(4000, "lagged:7")

          const second = yield* socketAt(sockets, 1)
          expect(second.url).toBe("wss://generalist.test/sessions/session-1/ws?cursor=-1")
          second.open()
          yield* Effect.yieldNow
          yield* connection.cancel("run-1", "cancel:run-1", "user")
          expect(
            yield* Schema.decodeEffect(Schema.fromJsonString(Server.ClientCommand))(sentText(second.sent[0])),
          ).toEqual({
            _tag: "Cancel",
            runId: "run-1",
            commandId: "cancel:run-1",
            reason: "user",
          })
        }),
      ),
    )

    test.effect("rejects an invalid event capacity before opening a socket", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const socketCount = sockets.length
          const client = yield* Server.client({ baseUrl: "https://generalist.test" })
          const failure = yield* client.events.connect({ sessionId: "invalid", eventCapacity: 0 }).pipe(Effect.flip)
          expect(Schema.is(Server.InvalidConnectOptions)(failure)).toBe(true)
          expect(sockets).toHaveLength(socketCount)
        }),
      ),
    )

    test.effect(
      "deduplicates and rejects regressions without inventing gaps across filtered cursors or accepting old epochs",
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            sockets.length = 0
            const client = yield* Server.client({ baseUrl: "https://generalist.test" })
            const connection = yield* client.events.connect({
              sessionId: "session-1",
              eventCapacity: 8,
              reconnect: Schedule.recurs(1),
            })
            expect(connection.snapshot).toMatchObject({
              version: 1,
              session: { id: "session-1" },
              cursor: -1,
              runs: [],
            })
            const first = yield* socketAt(sockets, 0)
            first.open()
            const received = yield* connection.events.pipe(Stream.take(2), Stream.runCollect, Effect.forkChild)
            for (const cursor of [7, 7, 3, 12]) first.message(yield* Server.eventCodec.encode(hostEvent(cursor)))
            expect(yield* Fiber.join(received)).toEqual([hostEvent(7), hostEvent(12)])
            first.close(1011, "connection-lost")
            const second = yield* socketAt(sockets, 1)
            expect(second.url).toBe("wss://generalist.test/sessions/session-1/ws?cursor=-1")
            second.open()
            const resumed = yield* connection.events.pipe(Stream.take(2), Stream.runCollect, Effect.forkChild)
            first.message(yield* Server.eventCodec.encode(hostEvent(99)))
            second.message(yield* Server.eventCodec.encode(hostEvent(19)))
            expect(yield* Fiber.join(resumed)).toEqual([
              {
                _tag: "ConnectionSnapshot",
                epoch: 1,
                snapshot: connection.snapshot,
              },
              hostEvent(19),
            ])
            const statuses = yield* connection.status.pipe(
              Stream.takeUntil((status) => status._tag === "Connected" && status.epoch === 1),
              Stream.runCollect,
            )
            expect(statuses).toContainEqual({ _tag: "Connected", epoch: 1 })
          }),
        ),
    )

    test.effect("keeps preview delivery outside the committed cursor across reconnect", () =>
      Effect.scoped(
        Effect.gen(function* () {
          sockets.length = 0
          const client = yield* Server.client({ baseUrl: "https://generalist.test" })
          const connection = yield* client.events.connect({
            sessionId: "session-1",
            eventCapacity: 8,
            reconnect: Schedule.recurs(1),
          })
          expect(connection.snapshot.cursor).toBe(-1)
          const first = yield* socketAt(sockets, 0)
          first.open()
          const firstPreview = previewDelivery(3, 0, "first")
          const received = yield* connection.events.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
          first.message(yield* Server.eventCodec.encode(firstPreview))
          expect(yield* Fiber.join(received)).toEqual([firstPreview])
          first.close(1011, "connection-lost")

          const second = yield* socketAt(sockets, 1)
          expect(second.url).toBe("wss://generalist.test/sessions/session-1/ws?cursor=-1")
          second.open()
          const currentPreview = previewDelivery(4, 0, "current")
          const resumed = yield* connection.events.pipe(Stream.take(2), Stream.runCollect, Effect.forkChild)
          first.message(yield* Server.eventCodec.encode(previewDelivery(3, 1, "obsolete")))
          second.message(yield* Server.eventCodec.encode(currentPreview))
          expect(yield* Fiber.join(resumed)).toEqual([
            { _tag: "ConnectionSnapshot", epoch: 1, snapshot: connection.snapshot },
            currentPreview,
          ])
        }),
      ),
    )

    test.effect("carries the actual socket epoch across a failed replacement snapshot and current preview", () =>
      Effect.scoped(
        Effect.gen(function* () {
          sockets.length = 0
          let snapshotLoads = 0
          const http = HttpClient.make((request) => {
            snapshotLoads += 1
            if (snapshotLoads === 2) {
              return Effect.fail(
                new HttpClientError.HttpClientError({
                  reason: new HttpClientError.TransportError({
                    request,
                    description: "replacement snapshot unavailable",
                  }),
                }),
              )
            }
            return Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                Response.json({
                  version: 1,
                  session: { id: "session-1", createdAt: "2026-09-02T00:00:00.000Z", queue: [] },
                  cursor: -1,
                  runs: [],
                  conversation: { leafId: null, entries: [] },
                }),
              ),
            )
          })
          const client = yield* Server.client({ baseUrl: "https://generalist.test" }).pipe(
            Effect.provideService(HttpClient.HttpClient, http),
          )
          const connection = yield* client.events.connect({
            sessionId: "session-1",
            eventCapacity: 8,
            reconnect: Schedule.recurs(2),
          })
          const first = yield* socketAt(sockets, 0)
          first.open()
          first.close(1011, "connection-lost")

          const second = yield* socketAt(sockets, 1)
          second.open()
          const currentPreview = previewDelivery(5, 0, "after failed snapshot")
          const resumed = yield* connection.events.pipe(Stream.take(2), Stream.runCollect, Effect.forkChild)
          second.message(yield* Server.eventCodec.encode(currentPreview))
          expect(yield* Fiber.join(resumed)).toEqual([
            { _tag: "ConnectionSnapshot", epoch: 2, snapshot: connection.snapshot },
            currentPreview,
          ])
          expect(snapshotLoads).toBe(3)
        }),
      ),
    )

    for (const [code, kind] of [
      [4001, "cursor-expired"],
      [4000, "lagged"],
    ] as const) {
      test.effect(`surfaces ${kind} explicitly for snapshot resynchronization`, () =>
        Effect.scoped(
          Effect.gen(function* () {
            sockets.length = 0
            const client = yield* Server.client({ baseUrl: "https://generalist.test" })
            const connection = yield* client.events.connect({ sessionId: "session-1" })
            const first = yield* socketAt(sockets, 0)
            first.open()
            yield* Effect.yieldNow
            first.close(code, kind)
            expect(yield* connection.exhausted.pipe(Effect.flip)).toMatchObject({ lastError: { kind } })
            expect(sockets).toHaveLength(1)
          }),
        ),
      )
    }

    test.effect("disposes its socket and ignores late frames when its connection scope closes", () =>
      Effect.gen(function* () {
        sockets.length = 0
        yield* Effect.scoped(
          Effect.gen(function* () {
            const client = yield* Server.client({ baseUrl: "https://generalist.test" })
            yield* client.events.connect({ sessionId: "session-1" })
            const first = yield* socketAt(sockets, 0)
            first.open()
            yield* Effect.yieldNow
          }),
        )
        const closed = yield* socketAt(sockets, 0)
        expect(closed.readyState).toBe(WebSocket.CLOSED)
        closed.message(yield* Server.eventCodec.encode(hostEvent(100)))
        yield* Effect.yieldNow
        expect(sockets).toHaveLength(1)
      }),
    )

    test.effect("switching Session views closes only the old subscription without sending shutdown commands", () =>
      Effect.gen(function* () {
        sockets.length = 0
        const requested: Array<string> = []
        const http = HttpClient.make((request) => {
          requested.push(request.url)
          const match = /\/sessions\/([^/]+)\/snapshot$/.exec(request.url)
          const sessionId = decodeURIComponent(match?.[1] ?? "missing")
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({
                version: 1,
                session: { id: sessionId, createdAt: "2026-09-02T00:00:00.000Z", queue: [] },
                cursor: -1,
                runs: [],
                conversation: { leafId: null, entries: [] },
              }),
            ),
          )
        })
        const client = yield* Server.client({ baseUrl: "https://generalist.test" }).pipe(
          Effect.provideService(HttpClient.HttpClient, http),
        )
        const firstScope = yield* Scope.make()
        yield* client.events
          .connect({ sessionId: "session-one", reconnect: Schedule.recurs(0) })
          .pipe(Effect.provideService(Scope.Scope, firstScope))
        const first = yield* socketAt(sockets, 0)
        first.open()
        yield* Scope.close(firstScope, Exit.void)
        expect(first.readyState).toBe(WebSocket.CLOSED)
        expect(first.sent).toEqual([])

        const processScope = yield* Scope.make()
        yield* client.events
          .connect({ sessionId: "session-two", reconnect: Schedule.recurs(0) })
          .pipe(Effect.provideService(Scope.Scope, processScope))
        const second = yield* socketAt(sockets, 1)
        second.open()
        expect(second.readyState).toBe(WebSocket.OPEN)
        expect(requested).toEqual([
          "https://generalist.test/sessions/session-one/snapshot",
          "https://generalist.test/sessions/session-two/snapshot",
        ])
        yield* Scope.close(processScope, Exit.void)
        expect(second.readyState).toBe(WebSocket.CLOSED)
        expect(second.sent).toEqual([])
      }),
    )
  })
})
