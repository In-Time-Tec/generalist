import { BunCrypto, BunHttpServer } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { vi } from "vitest"
import { Config, Context, Effect, Layer, Redacted, Ref, Schema, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpRouter, HttpServer } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Agent, Approvals, BlobStore, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, RunStore } from "generalist/runtime"
import { Server } from "generalist/server"
import { TestModel } from "generalist/testing"
import { Artifact, Yjs, layer as artifactLayer } from "generalist/unstable/artifact"
import { ObjectStore } from "../../src/durability/object-store.js"
import { makeObjectStorage, objectRuntimeLayer } from "../runtime/execution/object.js"

const authenticatedSocket = (url: string): WebSocket =>
  Schema.decodeUnknownSync(Schema.instanceOf(WebSocket))(
    Reflect.construct(WebSocket, [url, { headers: { authorization: "Bearer local-token" } }]),
  )

const storage = makeObjectStorage()
const services = Layer.mergeAll(
  objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(ExecutableResolver.layerStatic([]))),
  BlobStore.layer({ environment: "test", tenant: "local" }).pipe(
    Layer.provide(Layer.merge(BunCrypto.layer, Layer.succeed(ObjectStore, storage.store))),
  ),
  artifactLayer,
  TestModel.layer([]),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  FetchHttpClient.layer,
)

layer(services, { excludeTestServices: true })("Local server transports", (it) => {
  it.effect("pins Host ceilings on serialized queued and direct admissions", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "server-policy" })
      const limits = { tree: { maxDepth: 2, maxSessions: 8 }, concurrency: { agents: 2, tools: 4 } }
      const host = yield* Generalist.create({ agents: [agent], limits })
      const server = yield* Layer.build(
        HttpRouter.serve(
          Server.layer({
            host,
            auth: Server.authBearer({
              token: Config.succeed(Redacted.make("local-token")),
              principal: { id: "controller", tenantId: "local", role: "controller" },
            }),
            authorization: { tenantId: "local", authorize: () => Effect.succeed(true) },
          }),
          { disableLogger: true },
        ).pipe(Layer.provideMerge(BunHttpServer.layer({ hostname: "127.0.0.1", port: 0 }))),
      )
      const baseUrl = HttpServer.formatAddress(Context.get(server, HttpServer.HttpServer).address)
      const http = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest(HttpClientRequest.bearerToken("local-token")),
      )
      const client = yield* Server.client({ baseUrl }).pipe(Effect.provideService(HttpClient.HttpClient, http))
      const session = yield* client.sessions.create({ id: "server-policy-queue", agent: agent.name })
      yield* client.sessions.submit({ sessionId: session.id, input: "bounded queued input", commandId: "queued" })
      const queued = yield* client.sessions.get({ sessionId: session.id })
      const direct = yield* client.runs.start({
        sessionId: session.id,
        agent: agent.name,
        input: "bounded direct input",
      })
      const store = yield* RunStore.RunStore
      for (const runId of [queued.activeRunId!, direct.id])
        expect(yield* store.loadExecution(runId)).toMatchObject({
          treePolicy: { ...limits.tree, concurrency: limits.concurrency },
        })
    }),
  )

  it.effect("loads an existing Session before connecting and observes an admission racing the snapshot response", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "local-snapshot" })
      const host = yield* Generalist.create({ agents: [agent] })
      const session = yield* host.sessions.create({ id: "local-snapshot" })
      const original = yield* host.runs.start(session.id, agent, "existing input")
      const before = yield* host.sessions.snapshot(session.id)
      const server = yield* Layer.build(
        HttpRouter.serve(
          Server.layer({
            host,
            auth: Server.authBearer({
              token: Config.succeed(Redacted.make("local-token")),
              principal: { id: "reader", tenantId: "local", role: "spectator" },
            }),
            authorization: { tenantId: "local", authorize: () => Effect.succeed(true) },
          }),
          { disableLogger: true },
        ).pipe(Layer.provideMerge(BunHttpServer.layer({ hostname: "127.0.0.1", port: 0 }))),
      )
      const baseUrl = HttpServer.formatAddress(Context.get(server, HttpServer.HttpServer).address)
      const raced = yield* Ref.make<string | undefined>(undefined)
      const http = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest(HttpClientRequest.bearerToken("local-token")),
        HttpClient.transformResponse(
          Effect.tap((response) =>
            response.request.url.endsWith("/snapshot")
              ? host.runs.start(session.id, agent, "concurrent external admission").pipe(
                  Effect.flatMap((run) => Ref.set(raced, run.id)),
                  Effect.orDie,
                )
              : Effect.void,
          ),
        ),
      )
      const client = yield* Server.client({ baseUrl }).pipe(Effect.provideService(HttpClient.HttpClient, http))
      const connection = yield* client.events
        .connect({ sessionId: session.id })
        .pipe(Effect.provideService(Socket.WebSocketConstructor, authenticatedSocket))
      expect(connection.snapshot).toEqual(before)
      expect(connection.snapshot.runs.map((entry) => entry.run.runId)).toEqual([original.id])
      const events = yield* connection.events.pipe(Stream.take(1), Stream.runCollect)
      expect(events[0]).toMatchObject({ _tag: "RunStarted", runId: yield* Ref.get(raced) })
      expect(yield* host.runs.list(session.id)).toHaveLength(2)
    }),
  )

  for (const mode of ["spectator", "revoked"] as const) {
    it.effect(`rejects Session cancellation and Artifact edits over real WebSockets for ${mode}`, () =>
      Effect.gen(function* () {
        const allowed = yield* Ref.make(true)
        const agent = Agent.make({ name: `local-${mode}` })
        const host = yield* Generalist.create({ agents: [agent] })
        const session = yield* host.sessions.create({ id: `local-${mode}` })
        const run = yield* host.runs.start(session.id, agent, "existing input")
        const document = yield* Artifact.open(`local-${mode}.md`, { crdt: Yjs.layer(), initial: "draft" })
        const cancel = vi.spyOn(host.runs, "cancel")
        const edit = vi.spyOn(host.artifacts, "edit")
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            cancel.mockRestore()
            edit.mockRestore()
          }),
        )
        const server = yield* Layer.build(
          HttpRouter.serve(
            Server.layer({
              host,
              auth: Server.authBearer({
                token: Config.succeed(Redacted.make("local-token")),
                principal: {
                  id: "local-user",
                  tenantId: "local",
                  role: mode === "spectator" ? "spectator" : "controller",
                },
              }),
              authorization: { tenantId: "local", authorize: () => Ref.get(allowed) },
              operator: true,
            }),
            { disableLogger: true },
          ).pipe(Layer.provideMerge(BunHttpServer.layer({ hostname: "127.0.0.1", port: 0 }))),
        )
        const baseUrl = HttpServer.formatAddress(Context.get(server, HttpServer.HttpServer).address)
        const http = (yield* HttpClient.HttpClient).pipe(
          HttpClient.mapRequest(HttpClientRequest.bearerToken("local-token")),
        )
        const client = yield* Server.client({ baseUrl }).pipe(Effect.provideService(HttpClient.HttpClient, http))
        const initial = yield* client.sessions.snapshot({ sessionId: session.id })
        expect(initial.runs.map((entry) => entry.run.runId)).toEqual([run.id])
        const replay = yield* client.events.subscribe({ sessionId: session.id }).pipe(Stream.take(1), Stream.runCollect)
        expect(replay[0]).toMatchObject({ _tag: "RunStarted", runId: run.id })
        const commands = [
          { path: `/sessions/${session.id}/ws`, body: { _tag: "Cancel", runId: run.id, commandId: "socket-cancel" } },
          {
            path: `/artifacts/${document.name}/ws`,
            body: {
              _tag: "Edit",
              commandId: "socket-edit",
              base: 0,
              operation: { _tag: "Insert", at: 5, text: " forbidden" },
              attribution: { _tag: "Human", actor: "controller" },
            },
          },
        ]
        for (const command of commands) {
          yield* Ref.set(allowed, true)
          const body = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(command.body)
          const error = yield* Effect.scoped(
            Effect.gen(function* () {
              const socket = yield* Socket.makeWebSocket(baseUrl.replace("http:", "ws:") + command.path).pipe(
                Effect.provideService(Socket.WebSocketConstructor, authenticatedSocket),
              )
              const writer = yield* socket.writer
              return yield* socket
                .runRaw(() => Effect.void, {
                  onOpen: Ref.set(allowed, mode !== "revoked").pipe(Effect.andThen(writer(body)), Effect.orDie),
                })
                .pipe(Effect.flip)
            }),
          )
          expect(error.reason).toMatchObject({ _tag: "SocketCloseError", code: 1008, closeReason: "forbidden" })
        }
        expect(cancel).not.toHaveBeenCalled()
        expect(edit).not.toHaveBeenCalled()
        expect(yield* host.artifacts.read(document.name)).toMatchObject({ version: 0, content: "draft" })
      }),
    )
  }
})
