import { BunCrypto } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { Config, Effect, Layer, Redacted, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { HttpClient, HttpClientRequest, HttpClientResponse, HttpRouter, HttpServer } from "effect/unstable/http"
import { Agent, Approvals, Permissions } from "generalist"
import { layerMemory as layerBlobStoreMemory } from "generalist/blob-store"
import { Generalist } from "generalist/host"
import { ExecutableResolver, LocalScheduler, Runtime } from "generalist/runtime"
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
