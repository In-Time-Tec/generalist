import { BunCrypto } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { Config, Deferred, Effect, Layer, Redacted, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { HttpClient, HttpClientRequest, HttpClientResponse, HttpRouter, HttpServer } from "effect/unstable/http"
import { Agent, Approvals, Permissions } from "generalist"
import { layerMemory as layerBlobStoreMemory } from "generalist/blob-store"
import { Generalist } from "generalist/host"
import { ExecutableResolver, LocalScheduler, RunStore, Runtime } from "generalist/runtime"
import { Server, type Client } from "generalist/server"

const usage = Response.Usage.make({
  inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = Response.makePart("finish", { reason: "stop", usage, response: undefined })
const model = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => Stream.make(Response.makePart("text-delta", { id: "answer", delta: "server complete" }), finish),
  }),
)
const runtime = Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
  Layer.provide(ExecutableResolver.layerStatic([])),
)
const blobStore = layerBlobStoreMemory().pipe(Layer.provide(BunCrypto.layer))
const services = Layer.mergeAll(runtime, model, Permissions.layerAllowAll, Approvals.layerAutoApprove, blobStore)

const makeTransport = (handler: (request: Request) => Promise<Response>): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    HttpClientRequest.toWeb(request).pipe(
      Effect.orDie,
      Effect.flatMap((webRequest) => Effect.promise(() => handler(webRequest))),
      Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
    ),
  )

const makeClient = (transport: HttpClient.HttpClient, token: string): Effect.Effect<Client> =>
  Server.client({ baseUrl: "http://generalist.test" }).pipe(
    Effect.provideService(
      HttpClient.HttpClient,
      transport.pipe(HttpClient.mapRequest(HttpClientRequest.bearerToken(token))),
    ),
  )

const runScheduler = Effect.gen(function* () {
  const scheduler = yield* LocalScheduler.LocalScheduler
  yield* scheduler.tick
  yield* scheduler.idle
})

layer(services)("Server", (it) => {
  it.effect("rejects unknown Session streams and Run inspection before committing a success response", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const agent = Agent.make({ name: "server-not-found" })
        const host = yield* Generalist.create({ agents: [agent] })
        const app = HttpRouter.toWebHandler(
          Server.layer({
            host,
            auth: Server.authBearer(Config.succeed(Redacted.make("secret"))),
          }).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))
        const request = (path: string) =>
          app.handler(new Request(`http://generalist.test${path}`, { headers: { authorization: "Bearer secret" } }))

        for (const path of ["/sessions/not-real/events", "/sessions/not-real/ws"]) {
          const response = yield* Effect.promise(() => request(path))
          expect(response.status).toBe(404)
          expect(yield* Effect.promise(() => response.json())).toMatchObject({
            _tag: "generalist/host/SessionNotFound",
            sessionId: "not-real",
          })
        }

        const response = yield* Effect.promise(() => request("/runs/not-real"))
        expect(response.status).toBe(404)
        expect(yield* Effect.promise(() => response.json())).toMatchObject({
          _tag: "generalist/runtime/RunNotFound",
          runId: "not-real",
        })

        yield* host.sessions.create({ id: "session:expired-cursor" })
        const committed = yield* Effect.promise(() =>
          app.handler(
            new Request("http://generalist.test/sessions/session:expired-cursor/events", {
              headers: { authorization: "Bearer secret", "last-event-id": "1" },
            }),
          ),
        )
        expect(committed.status).toBe(200)
        expect(yield* Effect.promise(() => committed.text())).toContain(
          'event: effect/httpapi/stream/failure\ndata: [{"_tag":"Fail","error":{"_tag":"generalist/host/SessionCursorExpired"',
        )
      }),
    ),
  )

  it.effect("serves authenticated Host operations and resumes SSE from Last-Event-ID", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "server-test",
          input: Schema.Struct({ question: Schema.String }),
          output: Schema.String,
        })
        const host = yield* Generalist.create({ agents: [agent] })
        const app = HttpRouter.toWebHandler(
          Server.layer({
            host,
            auth: Server.authBearer(Config.succeed(Redacted.make("secret"))),
          }).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))
        const transport = makeTransport(app.handler)
        const client = yield* makeClient(transport, "secret")

        const attachmentData = new TextEncoder().encode("attachment")
        const attachment = yield* client.attachments.put({
          data: attachmentData,
          mediaType: "application/pdf",
          filename: "report.pdf",
        })
        const downloaded = yield* client.attachments.get({ sha256: attachment.sha256 })
        expect(downloaded.body).toEqual(attachmentData)
        expect(downloaded.headers).toMatchObject({
          "content-type": "application/pdf",
          "x-filename": "report.pdf",
        })
        expect(yield* client.attachments.get({ sha256: "0".repeat(64) }).pipe(Effect.flip)).toMatchObject({
          _tag: "generalist/blob-store/BlobNotFound",
          sha256: "0".repeat(64),
        })

        const session = yield* client.sessions.create({ id: "session:server", title: "Server test" })
        const started = yield* client.runs.start({
          sessionId: session.id,
          agent: agent.name,
          input: { question: "status" },
        })
        yield* runScheduler

        expect(yield* client.runs.inspect({ runId: started.id })).toMatchObject({
          runId: started.id,
          status: "succeeded",
        })
        const events = Array.from(
          yield* client.events.subscribe({ sessionId: session.id }).pipe(
            Stream.takeUntil((event) => event._tag === "Completed"),
            Stream.runCollect,
          ),
        )
        expect(events.map((event) => event._tag)).toEqual(["RunStarted", "Turn", "Turn", "Completed"])
        const resumed = Array.from(
          yield* client.events.subscribe({ sessionId: session.id, cursor: events[0]!.cursor }).pipe(
            Stream.takeUntil((event) => event._tag === "Completed"),
            Stream.runCollect,
          ),
        )
        expect(resumed.map((event) => event.cursor)).toEqual(events.slice(1).map((event) => event.cursor))

        const cancelled = yield* client.runs.start({
          sessionId: session.id,
          agent: agent.name,
          input: { question: "cancel" },
        })
        yield* client.runs.cancel({ runId: cancelled.id, reason: "user stopped" })
        expect(yield* client.runs.inspect({ runId: cancelled.id })).toMatchObject({ status: "cancelled" })

        const disabled = yield* client.operator
          .retry({ runId: started.id, operator: "operator:test" })
          .pipe(Effect.flip)
        expect(disabled).toMatchObject({ _tag: "generalist/server/OperatorDisabled", operation: "retry" })

        const unauthorized = yield* makeClient(transport, "wrong").pipe(
          Effect.flatMap((rejected) => rejected.attachments.get({ sha256: attachment.sha256 })),
          Effect.flip,
        )
        expect(unauthorized).toMatchObject({ _tag: "generalist/server/Unauthorized" })
      }),
    ),
  )

  it.effect("keeps an admitted Run alive after its SSE response is cancelled and replays completion", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        let calls = 0
        const controlledModel = yield* LanguageModel.make({
          generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
          streamText: () =>
            Stream.fromEffect(
              Effect.sync(() => {
                calls += 1
              }).pipe(Effect.andThen(Deferred.succeed(entered, undefined)), Effect.andThen(Deferred.await(release))),
            ).pipe(
              Stream.drain,
              Stream.concat(Stream.make(Response.makePart("text-delta", { id: "answer", delta: "complete" }), finish)),
            ),
        })
        const agent = Agent.make({ name: "server-disconnect" })
        const host = yield* Generalist.create({ agents: [agent] }).pipe(
          Effect.provideService(LanguageModel.LanguageModel, controlledModel),
        )
        const app = HttpRouter.toWebHandler(
          Server.layer({ host, auth: Server.authBearer(Config.succeed(Redacted.make("secret"))) }).pipe(
            Layer.provide(HttpServer.layerServices),
          ),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))
        const client = yield* makeClient(makeTransport(app.handler), "secret")
        const session = yield* client.sessions.create({ id: "session:server:disconnect" })
        const input = { sessionId: session.id, agent: agent.name, input: "answer", idempotencyKey: "answer-once" }
        const run = yield* client.runs.start(input)
        expect((yield* client.runs.start(input)).id).toBe(run.id)
        const scheduler = yield* LocalScheduler.LocalScheduler
        yield* scheduler.tick
        yield* Deferred.await(entered)

        const response = yield* Effect.promise(() =>
          app.handler(
            new Request(`http://generalist.test/sessions/${session.id}/events`, {
              headers: { authorization: "Bearer secret" },
            }),
          ),
        )
        expect(response.status).toBe(200)
        const reader = response.body!.getReader()
        const first = yield* Effect.promise(() => reader.read())
        expect(new TextDecoder().decode(first.value)).toContain("RunStarted")
        yield* Effect.promise(() => reader.cancel())
        expect(yield* client.runs.inspect({ runId: run.id })).toMatchObject({ status: "running" })

        yield* Deferred.succeed(release, undefined)
        yield* scheduler.idle
        expect(yield* client.runs.inspect({ runId: run.id })).toMatchObject({ status: "succeeded" })
        expect(calls).toBe(1)
        const events = yield* client.events.subscribe({ sessionId: session.id }).pipe(
          Stream.takeUntil((event) => event._tag === "Completed"),
          Stream.runCollect,
        )
        expect(events.filter((event) => event._tag === "RunStarted")).toHaveLength(1)
        expect(events.filter((event) => event._tag === "Completed")).toHaveLength(1)
      }),
    ),
  )

  it.effect("resolves an unknown operation through the enabled authenticated operator endpoint", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const agent = Agent.make({ name: "server-unknown" })
        const host = yield* Generalist.create({ agents: [agent] })
        const app = HttpRouter.toWebHandler(
          Server.layer({ host, auth: Server.authBearer(Config.succeed(Redacted.make("secret"))), operator: true }).pipe(
            Layer.provide(HttpServer.layerServices),
          ),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))
        const transport = makeTransport(app.handler)
        const client = yield* makeClient(transport, "secret")
        const session = yield* client.sessions.create({ id: "session:server:unknown" })
        const run = yield* client.runs.start({ sessionId: session.id, agent: agent.name, input: "answer" })
        const store = yield* RunStore.RunStore
        const claim = yield* store.claimExecution({ runId: run.id, ownerId: "failed-worker" })
        const operation = yield* store.recordOperation({
          ...claim,
          operationKey: "tool:external-write",
          kind: "tool",
          inputDigest: "write:1",
          input: { value: "once" },
          replayPolicy: "never",
          attempt: 1,
        })
        yield* store.startOperation({ ...claim, operationId: operation.operationId })
        yield* store.expireRunningOperation({ ...claim, operationId: operation.operationId })
        expect(yield* client.operator.explain({ runId: run.id })).toMatchObject({
          status: "needs-resolution",
          decision: { _tag: "Unknown", operationId: operation.operationId },
        })
        const resolution = {
          runId: run.id,
          operationId: operation.operationId,
          operator: "operator:test",
          resolution: { outcome: "succeeded" as const, result: "confirmed external receipt" },
        }
        const unauthorized = yield* makeClient(transport, "wrong")
        expect(yield* unauthorized.operator.resolveUnknown(resolution).pipe(Effect.flip)).toMatchObject({
          _tag: "generalist/server/Unauthorized",
        })
        expect(yield* client.runs.inspect({ runId: run.id })).toMatchObject({ status: "needs-resolution" })
        yield* client.operator.resolveUnknown(resolution)
        expect(yield* store.getOperation({ runId: run.id, operationId: operation.operationId })).toMatchObject({
          status: "succeeded",
          result: "confirmed external receipt",
        })
        expect(yield* client.operator.explain({ runId: run.id })).toMatchObject({ decision: { _tag: "Resume" } })
      }),
    ),
  )

  it.effect("isolates tenant-owned Hosts, stores, and bearer credentials", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const tenants = yield* Effect.forEach(
          ["tenant-a", "tenant-b"],
          Effect.fn(function* (tenant) {
            const context = yield* Layer.build(Layer.fresh(services))
            const agent = Agent.make({ name: "tenant-assistant" })
            const host = yield* Generalist.create({ agents: [agent] }).pipe(Effect.provideContext(context))
            const app = HttpRouter.toWebHandler(
              Server.layer({ host, auth: Server.authBearer(Config.succeed(Redacted.make(tenant))) }).pipe(
                Layer.provide(HttpServer.layerServices),
              ),
              { disableLogger: true },
            )
            yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))
            const transport = makeTransport(app.handler)
            return { client: yield* makeClient(transport, tenant), transport, agent }
          }),
        )
        const [alice, bob] = tenants
        const session = yield* alice!.client.sessions.create({ id: "session:private-a", title: "Private A" })
        const run = yield* alice!.client.runs.start({
          sessionId: session.id,
          agent: alice!.agent.name,
          input: "private",
        })
        const attachment = yield* alice!.client.attachments.put({
          data: new TextEncoder().encode("private attachment"),
          mediaType: "text/plain",
        })

        expect(yield* bob!.client.sessions.list()).toEqual([])
        expect(yield* bob!.client.sessions.get({ sessionId: session.id }).pipe(Effect.flip)).toMatchObject({
          _tag: "generalist/host/SessionNotFound",
        })
        expect(yield* bob!.client.runs.inspect({ runId: run.id }).pipe(Effect.flip)).toMatchObject({
          _tag: "generalist/runtime/RunNotFound",
        })
        expect(yield* bob!.client.attachments.get({ sha256: attachment.sha256 }).pipe(Effect.flip)).toMatchObject({
          _tag: "generalist/blob-store/BlobNotFound",
        })
        expect(
          yield* bob!.client.events.subscribe({ sessionId: session.id }).pipe(Stream.runCollect, Effect.flip),
        ).toMatchObject({
          _tag: "generalist/host/SessionNotFound",
        })
        const wrongTenant = yield* makeClient(alice!.transport, "tenant-b")
        expect(yield* wrongTenant.sessions.list().pipe(Effect.flip)).toMatchObject({
          _tag: "generalist/server/Unauthorized",
        })
      }),
    ),
  )
})

const approvalRequests: Array<Approvals.DurableRequest> = []
let approvalModelCalls = 0
let approvalToolCalls = 0
const gatedWrite = Tool.make("gated_write", {
  parameters: Schema.Struct({ value: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})
const approvalToolkit = Toolkit.make(gatedWrite)
const approvalModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      approvalModelCalls += 1
      return approvalModelCalls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "gated-write-1",
              name: gatedWrite.name,
              params: { value: "once" },
              providerExecuted: false,
            }),
            Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
          )
        : Stream.make(Response.makePart("text-delta", { id: "answer", delta: "approved" }), finish)
    },
  }),
)
const approvalHandlers = approvalToolkit.toLayer({
  gated_write: ({ value }) =>
    Effect.sync(() => {
      approvalToolCalls += 1
      return value
    }),
})
const durableApprovals = Approvals.layerDurable({
  notify: (request) => Effect.sync(() => approvalRequests.push(request)),
}).pipe(Layer.provide(runtime))
const approvalServices = Layer.mergeAll(
  runtime,
  approvalModel,
  approvalHandlers,
  Permissions.layerAllowAll,
  durableApprovals,
)

layer(approvalServices)("Server approvals", (it) => {
  it.effect("resolves one durable approval and lets the Run continue", () =>
    Effect.scoped(
      Effect.gen(function* () {
        approvalRequests.length = 0
        approvalModelCalls = 0
        approvalToolCalls = 0
        const agent = Agent.make({ name: "server-approval", toolkit: approvalToolkit })
        const host = yield* Generalist.create({ agents: [agent] })
        const app = HttpRouter.toWebHandler(
          Server.layer({
            host,
            auth: Server.authBearer(Config.succeed(Redacted.make("secret"))),
          }).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))
        const client = yield* makeClient(makeTransport(app.handler), "secret")
        const session = yield* client.sessions.create({ id: "session:server:approval" })
        const run = yield* client.runs.start({ sessionId: session.id, agent: agent.name, input: "approve" })
        yield* runScheduler

        expect(yield* client.runs.inspect({ runId: run.id })).toMatchObject({ status: "waiting" })
        expect(approvalRequests).toHaveLength(1)
        const token = approvalRequests[0]!.token
        yield* client.approvals.resolve({
          runId: run.id,
          token,
          decision: { _tag: "Approved" },
          operator: "operator:test",
        })
        yield* runScheduler

        expect(yield* client.runs.inspect({ runId: run.id })).toMatchObject({ status: "succeeded" })
        expect(approvalToolCalls).toBe(1)
      }),
    ),
  )
})
