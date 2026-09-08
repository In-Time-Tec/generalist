import { BunHttpServer } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { vi } from "vitest"
import { Config, Context, Effect, Layer, Option, Redacted, Ref, Schema, Stream } from "effect"
import { Prompt } from "effect/unstable/ai"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpRouter, HttpServer } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Agent, Approvals, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, RunStore } from "generalist/runtime"
import { Server } from "generalist/server"
import { TestModel } from "generalist/testing"
import { SessionCursorExpired, SessionSubscriberLagged } from "../../../../src/runtime/session/host.js"
import { RuntimeUnavailable } from "../../../../src/runtime/errors.js"
import { Chat, Connection } from "../../../../src/unstable/foldkit/index.js"
import { objectRuntimeLayer, objectWorkerId } from "../../../runtime/execution/object.js"

const services = Layer.mergeAll(
  objectRuntimeLayer({ addresses: [] }).pipe(Layer.provide(ExecutableResolver.layerStatic([]))),
  TestModel.layer([]),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  FetchHttpClient.layer,
)

layer(services, { excludeTestServices: true })("Foldkit real Server client", (it) => {
  for (const mode of [
    "cursor-expired",
    "lagged",
    "persistent-expiry",
    "conversation-gap",
    "socket-retry",
    "status-backlog",
  ] as const) {
    const reason = mode === "persistent-expiry" ? "cursor-expired" : mode
    const persistent = mode === "persistent-expiry"
    const reconnects = persistent ? 3 : 1
    it.effect(`loads an existing snapshot and automatically replaces it after ${mode}`, () =>
      Effect.gen(function* () {
        const agent = Agent.make({ name: `foldkit-${mode}` })
        const host = yield* Generalist.create({ agents: [agent] })
        const session = yield* host.sessions.create({ id: `foldkit-${mode}` })
        const original = yield* host.runs.start(session.id, agent, "existing input")
        const firstSnapshot = yield* host.sessions.snapshot(session.id)
        const subscribe = host.events.subscribe
        let subscriptions = 0
        let replacementRunId: string | undefined
        let lateCursor = -1
        const spy = vi.spyOn(host.events, "subscribe").mockImplementation((sessionId, cursor) =>
          Effect.gen(function* () {
            const events = yield* subscribe(sessionId, cursor)
            subscriptions++
            if (subscriptions === 1)
              replacementRunId = (yield* host.runs.start(session.id, agent, "concurrent input").pipe(Effect.orDie)).id
            if (subscriptions !== 1 && !persistent) return events
            if (mode === "conversation-gap") {
              return events.pipe(
                Stream.filter((event) => event._tag !== "Conversation" || event.update.previousLeafId !== null),
              )
            }
            if (mode === "socket-retry" || mode === "status-backlog") {
              return Stream.fail(RuntimeUnavailable.make({ message: "replacement host required" }))
            }
            const latest = yield* host.sessions.snapshot(session.id).pipe(Effect.orDie)
            return Stream.fail(
              reason === "cursor-expired"
                ? SessionCursorExpired.make({
                    sessionId,
                    cursor: cursor ?? -1,
                    earliestCursor: latest.cursor,
                    latestCursor: latest.cursor,
                  })
                : SessionSubscriberLagged.make({ sessionId, lastDeliveredCursor: cursor ?? -1 }),
            )
          }),
        )
        yield* Effect.addFinalizer(() => Effect.sync(() => spy.mockRestore()))
        const server = yield* Layer.build(
          HttpRouter.serve(
            Server.layer({
              host,
              auth: Server.authBearer({
                token: Config.succeed(Redacted.make("foldkit-token")),
                principal: { id: "reader", tenantId: "foldkit", role: "spectator" },
              }),
              authorization: { tenantId: "foldkit", authorize: () => Effect.succeed(true) },
            }),
            { disableLogger: true },
          ).pipe(Layer.provideMerge(BunHttpServer.layer({ hostname: "127.0.0.1", port: 0 }))),
        )
        const baseUrl = HttpServer.formatAddress(Context.get(server, HttpServer.HttpServer).address)
        const http = (yield* HttpClient.HttpClient).pipe(
          HttpClient.mapRequest(HttpClientRequest.bearerToken("foldkit-token")),
        )
        const sockets: Array<WebSocket> = []
        const clientContext = yield* Layer.build(
          Connection.layerWebSocket({ baseUrl }).pipe(
            Layer.provide(
              Layer.merge(
                Layer.succeed(HttpClient.HttpClient, http),
                Layer.succeed(Socket.WebSocketConstructor, (url) => {
                  const previous = sockets.at(-1)
                  if (previous !== undefined)
                    expect([WebSocket.CLOSING, WebSocket.CLOSED]).toContain(previous.readyState)
                  const socket = Schema.decodeUnknownSync(Schema.instanceOf(WebSocket))(
                    Reflect.construct(WebSocket, [url, { headers: { authorization: "Bearer foldkit-token" } }]),
                  )
                  sockets.push(socket)
                  return socket
                }),
              ),
            ),
          ),
        )
        const client = Context.get(clientContext, Connection.Connection)
        const received = yield* Ref.make<ReadonlyArray<Connection.Incoming>>([])
        const models = yield* Effect.scoped(
          Effect.gen(function* () {
            const connected = yield* client.session({ sessionId: session.id })
            const oldStatusSeen = yield* Ref.make(false)
            const projected = connected.frames.pipe(
              Stream.tap((event) => Ref.update(received, (events) => [...events, event])),
              Stream.tap((event) =>
                event._tag === "ConnectionLost" && event.epoch === 0 ? Ref.set(oldStatusSeen, true) : Effect.void,
              ),
              Stream.tap((event) =>
                mode === "status-backlog" && event._tag === "SessionSnapshot" && event.epoch === 0
                  ? Effect.sleep("250 millis")
                  : Effect.void,
              ),
              Stream.tap((event) =>
                mode === "status-backlog" && event._tag === "SessionSnapshot" && event.epoch === 1
                  ? Effect.gen(function* () {
                      yield* host.runs.start(session.id, agent, "later queued input")
                      lateCursor = (yield* host.sessions.snapshot(session.id)).cursor
                    })
                  : Effect.void,
              ),
              Stream.tap((event) =>
                mode === "conversation-gap" && event._tag === "SessionSnapshot" && event.epoch === 0
                  ? Effect.gen(function* () {
                      const store = yield* RunStore.RunStore
                      const claim = yield* store.claimExecution({
                        runId: original.id,
                        ownerId: objectWorkerId,
                        commandId: "conversation-gap:claim",
                      })
                      const writer = Option.getOrThrow(yield* store.claimedSessionStore(claim))
                      for (const text of ["missed prefix", "received suffix"])
                        yield* writer.append(
                          {
                            _tag: "Message",
                            message: Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] }),
                          },
                          { commandId: `conversation-gap:${text}` },
                        )
                    })
                  : Effect.void,
              ),
              Stream.scan(
                Chat.initialModel(session.id),
                (model, event) => Chat.update(model, Chat.ReceivedConnection({ event }))[0],
              ),
            )
            return yield* (
              mode === "status-backlog"
                ? projected.pipe(
                    Stream.mapEffect((model) => Ref.get(oldStatusSeen).pipe(Effect.map((seen) => ({ model, seen })))),
                    Stream.takeUntil(
                      ({ model, seen }) =>
                        seen &&
                        model.connectionEpoch === 1 &&
                        model.connection === "open" &&
                        model.lastSeq >= lateCursor,
                    ),
                    Stream.map(({ model }) => model),
                  )
                : projected.pipe(
                    Stream.takeUntil((model) =>
                      persistent
                        ? model.run._tag === "Failed"
                        : model.connectionEpoch === reconnects && model.connection === "open",
                    ),
                  )
            ).pipe(Stream.runCollect)
          }),
        )
        const snapshots = (yield* Ref.get(received)).filter(Schema.is(Connection.SessionSnapshot))
        expect(snapshots).toHaveLength(reconnects + 1)
        expect(snapshots[0]?.snapshot).toEqual(firstSnapshot)
        expect(snapshots[0]?.snapshot.runs.map((run) => run.runId)).toEqual([original.id])
        expect(snapshots[1]?.snapshot.runs.map((run) => run.runId)).toEqual([original.id, replacementRunId])
        expect(snapshots[1]?.snapshot.session.activeRunId).toBe(original.id)
        if (mode === "conversation-gap")
          expect(models.at(-1)?.entries).toEqual([
            { _tag: "UserEntry", text: "missed prefix" },
            { _tag: "UserEntry", text: "received suffix" },
          ])
        expect(models.at(-1)).toMatchObject({
          connectionEpoch: reconnects,
          lastSeq: mode === "status-backlog" ? lateCursor : snapshots[1]?.snapshot.cursor,
          run: { _tag: persistent ? "Failed" : "Running" },
        })
        expect(sockets).toHaveLength(reconnects + 1)
        expect(
          sockets.every((socket) => socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING),
        ).toBe(true)
        expect(subscriptions).toBe(reconnects + 1)
        if (mode === "status-backlog") {
          const replacementIndex = (yield* Ref.get(received)).findIndex(
            (event) => event._tag === "SessionSnapshot" && event.epoch === 1,
          )
          const delayedOldStatus = (yield* Ref.get(received)).find(
            (event) => event._tag === "ConnectionLost" && event.epoch === 0,
          )
          expect(replacementIndex).toBeGreaterThan(-1)
          expect(delayedOldStatus).toBeDefined()
          const current = models.at(-1)!
          expect(current.previewAuthority?.runId).toBe(original.id)
          expect((yield* Ref.get(received)).findLast(Schema.is(Connection.HostDelivery))).toMatchObject({
            activeRunId: original.id,
            event: { cursor: lateCursor, _tag: "RunStarted" },
          })
          const withPreview = Chat.update(
            current,
            Chat.ReceivedConnection({
              event: Connection.PreviewDelivery({
                epoch: 1,
                delivery: {
                  _tag: "PreviewDelivery",
                  sessionId: session.id,
                  runId: original.id,
                  authorityAttemptFence: 1,
                  event: {
                    _tag: "ModelPreview",
                    runId: original.id,
                    attemptFence: 1,
                    turn: 0,
                    modelCallId: "current-call",
                    modelAttemptId: "current-attempt",
                    attempt: 0,
                    generation: 1,
                    sequence: 0,
                    changes: [{ channel: "text", offset: 0, delta: "current preview" }],
                  },
                },
              }),
            }),
          )[0]
          expect(withPreview.preview?.text).toBe("current preview")
          expect(Chat.update(withPreview, Chat.ReceivedConnection({ event: delayedOldStatus! }))[0]).toEqual(
            withPreview,
          )
        }
      }),
    )
  }
})
