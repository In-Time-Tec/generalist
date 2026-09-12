import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../runtime/execution/object.js"
import { BunCrypto } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { Config, Deferred, Effect, Fiber, Layer, Redacted, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { HttpClient, HttpClientRequest, HttpClientResponse, HttpRouter, HttpServer } from "effect/unstable/http"
import { Agent, Approvals, Permissions } from "generalist"
import { Host, ToolIdentity } from "generalist/host"
import { ExecutableResolver, RunExecutor, RunStore } from "generalist/runtime"
import { Server, type Client } from "generalist/server"
import { layer as blobStoreLayer } from "../../src/blob-store/index.js"
import { ObjectStore } from "../../src/durability/object-store.js"
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
const runtimeStorage = makeObjectStorage()
const attachmentStorage = makeObjectStorage()
const runtime = objectRuntimeLayer({ addresses: [] }, runtimeStorage).pipe(
  Layer.provide(ExecutableResolver.layerStatic([])),
)
const blobStore = blobStoreLayer({ environment: "test", tenant: "server" }).pipe(
  Layer.provide(Layer.merge(BunCrypto.layer, Layer.succeed(ObjectStore, attachmentStorage.store))),
)
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

const runScheduler = (runId: string, commandId: string) =>
  Effect.gen(function* () {
    const executor = yield* RunExecutor.RunExecutor
    const store = yield* RunStore.RunStore
    yield* executor.execute(yield* store.claimExecution({ runId, ownerId: objectWorkerId, commandId }))
  })

layer(services)("Server", (it) => {
  it.effect("commits editable Session instructions through the authenticated client", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const agent = Agent.make({ name: "server-queue" })
        const host = yield* Host.make({ revision: "local", agents: { [agent.name]: agent } })
        const app = HttpRouter.toWebHandler(
          Server.layer({
            host,
            authorization: { tenantId: "test", authorize: () => Effect.succeed(true) },
            auth: Server.authBearer({
              token: Config.succeed(Redacted.make("secret")),
              principal: { id: "controller", tenantId: "test", role: "controller" },
            }),
          }).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))
        const client = yield* makeClient(makeTransport(app.handler), "secret")
        const session = yield* client.sessions.create({ id: "server-queue-session", agent: agent.name })
        const first = yield* client.sessions.submit({ sessionId: session.id, input: "first", commandId: "first" })
        const pending = yield* client.sessions.submit({ sessionId: session.id, input: "draft", commandId: "second" })
        const edit = {
          sessionId: session.id,
          id: pending.id,
          input: "edited",
          commandId: "edit",
          expectedRevision: pending.revision,
        }
        const edited = yield* client.sessions.updateInput(edit)
        const current = yield* client.sessions.get({ sessionId: session.id })
        expect(current.queue).toEqual([expect.objectContaining({ id: pending.id, revision: 2 })])
        expect(current.activeRunId).toBeDefined()
        yield* runScheduler(current.activeRunId!, "server-queue-first")
        expect(yield* client.sessions.submit({ sessionId: session.id, input: "first", commandId: "first" })).toEqual(
          first,
        )
        expect(yield* client.sessions.updateInput(edit)).toEqual(edited)
        expect(
          yield* client.sessions
            .removeInput({ sessionId: session.id, id: pending.id, commandId: "stale", expectedRevision: 2 })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "generalist/session/SessionQueueConflict", reason: "revision" })
        const removable = yield* client.sessions.submit({
          sessionId: session.id,
          input: "remove me",
          commandId: "third",
        })
        const remove = {
          sessionId: session.id,
          id: removable.id,
          commandId: "remove",
          expectedRevision: removable.revision,
        }
        const removed = yield* client.sessions.removeInput(remove)
        expect(yield* client.sessions.removeInput(remove)).toEqual(removed)
        expect((yield* client.sessions.get({ sessionId: session.id })).queue).toEqual([])
        expect(yield* host.runs.list(session.id)).toHaveLength(2)
        const denied = yield* makeClient(makeTransport(app.handler), "wrong")
        expect(
          yield* denied.sessions
            .submit({ sessionId: session.id, input: "not accepted", commandId: "denied" })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "generalist/server/Unauthorized" })
        expect(yield* denied.sessions.updateInput(edit).pipe(Effect.flip)).toMatchObject({
          _tag: "generalist/server/Unauthorized",
        })
      }),
    ),
  )
  it.effect("rejects unknown Session streams and Run inspection before committing a success response", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const agent = Agent.make({ name: "server-not-found" })
        const host = yield* Host.make({ revision: "local", agents: { [agent.name]: agent } })
        const app = HttpRouter.toWebHandler(
          Server.layer({
            authorization: { tenantId: "test", authorize: () => Effect.succeed(true) },
            host,
            auth: Server.authBearer({
              token: Config.succeed(Redacted.make("secret")),
              principal: { id: "test-controller", tenantId: "test", role: "controller" },
            }),
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

  it.effect("reports oversized Run input as a client payload error, not RuntimeUnavailable", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const agent = Agent.make({ name: "server-oversized" })
        const host = yield* Host.make({ revision: "local", agents: { [agent.name]: agent } })
        const app = HttpRouter.toWebHandler(
          Server.layer({
            authorization: { tenantId: "test", authorize: () => Effect.succeed(true) },
            host,
            auth: Server.authBearer({
              token: Config.succeed(Redacted.make("secret")),
              principal: { id: "test-controller", tenantId: "test", role: "controller" },
            }),
          }).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))
        yield* host.sessions.create({ id: "oversized-session" })
        const start = (commandId: string, input: string) =>
          app.handler(
            new Request("http://generalist.test/sessions/oversized-session/runs", {
              method: "POST",
              headers: { authorization: "Bearer secret", "content-type": "application/json" },
              body: JSON.stringify({ agent: agent.name, input, commandId }),
            }),
          )
        const control = yield* Effect.promise(() => start("small", "small"))
        expect(control.status).toBe(200)
        expect(yield* Effect.promise(() => control.text())).toContain('"id"')
        const oversized = yield* Effect.promise(() => start("oversized", "x".repeat(1_200_000)))
        expect([400, 413]).toContain(oversized.status)
        const body = yield* Effect.promise(() => oversized.text())
        expect(body).toContain('"generalist/runtime/PayloadTooLarge"')
        expect(body).not.toContain("RuntimeUnavailable")
      }),
    ),
  )

  it.effect("admits canonical children and registered Tools without accepting client definitions", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const checks = Tool.make("server-checks", {
          parameters: Schema.Struct({ count: Schema.FiniteFromString }),
          success: Schema.FiniteFromString,
        }).annotate(ToolIdentity, { implementation: "server-checks-v1", policy: "server-checks-policy-v1" })
        const toolHandlers = Toolkit.make(checks).toLayer({
          "server-checks": ({ count }) => Effect.succeed(count + 1),
        })
        const duplicateChecks = checks.annotate(ToolIdentity, {
          implementation: "server-checks-v2",
          policy: "server-checks-policy-v2",
        })
        const duplicateHandlers = Toolkit.make(duplicateChecks).toLayer({
          "server-checks": ({ count }) => Effect.succeed(count + 2),
        })
        expect(
          yield* Host.make({ revision: "local", agents: {}, tools: [checks, duplicateChecks] }).pipe(
            // oxlint-disable-next-line effecttsgo/strict-effect-provide -- Test-only duplicate registration context.
            Effect.provide(Layer.merge(toolHandlers, duplicateHandlers)),
            Effect.flip,
          ),
        ).toMatchObject({ _tag: "generalist/runtime/ExecutableRegistrationInvalid" })
        const child = Agent.make({ name: "server-child" })
        const parent = Agent.make({ name: "server-parent", children: [child.name] })
        const host = yield* Host.make({
          revision: "local",
          agents: { [parent.name]: parent, [child.name]: child },
          tools: [checks],
        }).pipe(
          // oxlint-disable-next-line effecttsgo/strict-effect-provide -- Test-only Tool registration context.
          Effect.provide(toolHandlers),
        )
        const app = HttpRouter.toWebHandler(
          Server.layer({
            host,
            authorization: { tenantId: "test", authorize: () => Effect.succeed(true) },
            auth: Server.authBearer({
              token: Config.succeed(Redacted.make("secret")),
              principal: { id: "test-controller", tenantId: "test", role: "controller" },
            }),
          }).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))
        const client = yield* makeClient(makeTransport(app.handler), "secret")
        const session = yield* client.sessions.create({ id: "server-contract", agent: parent.name })
        const parentRun = yield* client.runs.start({
          sessionId: session.id,
          agent: parent.name,
          input: "parent",
          commandId: "server-contract:parent",
        })
        const admitted = yield* client.runs.admitChild({
          runId: parentRun.id,
          commandId: "server-contract:child",
          selection: child.name,
          prompt: "child",
        })
        expect(
          yield* client.runs.admitChild({
            runId: parentRun.id,
            commandId: "server-contract:child",
            selection: child.name,
            prompt: "child",
          }),
        ).toEqual(admitted)
        expect(yield* client.runs.listChildren({ runId: parentRun.id })).toEqual([
          expect.objectContaining({ childRunId: admitted.runId, readiness: "ready" }),
        ])
        expect(yield* client.runs.inspectChild({ runId: parentRun.id, childRunId: admitted.runId })).toMatchObject({
          childRunId: admitted.runId,
        })
        const toolRun = yield* client.tools.start({
          runId: parentRun.id,
          name: checks.name,
          commandId: "server-contract:tool",
          input: { count: "3" },
        })
        expect(toolRun.id).toBeDefined()
        expect(
          yield* client.tools
            .start({
              runId: parentRun.id,
              name: checks.name,
              commandId: "server-contract:invalid-tool",
              input: { count: "bad" },
            })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "generalist/server/RequestFailed" })
        expect(
          yield* client.tools.start({
            runId: parentRun.id,
            name: checks.name,
            commandId: "server-contract:tool",
            input: { count: "3" },
          }),
        ).toEqual(toolRun)
        yield* runScheduler(toolRun.id, "server-contract:tool:execute")
        expect(yield* client.tools.inspect({ runId: toolRun.id, name: checks.name })).toMatchObject({
          runId: toolRun.id,
          status: "succeeded",
        })
        const typedToolRun = yield* host.tools.getByName(checks.name, toolRun.id)
        expect(yield* typedToolRun.await).toBe(4)
        expect(yield* client.tools.inspect({ runId: parentRun.id, name: checks.name }).pipe(Effect.flip)).toMatchObject(
          { _tag: "generalist/runtime/RunKindUnsupported" },
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
        const host = yield* Host.make({ revision: "local", agents: { [agent.name]: agent } })
        const app = HttpRouter.toWebHandler(
          Server.layer({
            authorization: { tenantId: "test", authorize: () => Effect.succeed(true) },
            host,
            auth: Server.authBearer({
              token: Config.succeed(Redacted.make("secret")),
              principal: { id: "test-controller", tenantId: "test", role: "controller" },
            }),
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
          commandId: "server:primary:start",
        })
        yield* runScheduler(started.id, "server:primary")

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
        expect(events.map((event) => event._tag)).toEqual([
          "RunStarted",
          "Turn",
          "Conversation",
          "Conversation",
          "Turn",
          "Completed",
        ])
        expect(events.map((event) => event.cursor)).toEqual([0, 2, 3, 7, 11, 12])
        const conversation = events
          .filter((event) => event._tag === "Conversation")
          .flatMap((event) => event.update.entries)
        expect(
          conversation
            .flatMap((entry) => entry.messages)
            .map((message) => ({
              role: message.role,
              text: message.content
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join(""),
            })),
        ).toEqual([
          { role: "user", text: '{"question":"status"}' },
          { role: "assistant", text: "server complete" },
        ])
        expect((yield* client.sessions.snapshot({ sessionId: session.id })).conversation.entries).toEqual(conversation)
        const resumed = Array.from(
          yield* client.events.subscribe({ sessionId: session.id, cursor: events[0]!.cursor }).pipe(
            Stream.takeUntil((event) => event._tag === "Completed"),
            Stream.runCollect,
          ),
        )
        expect(resumed.map((event) => event.cursor)).toEqual(events.slice(1).map((event) => event.cursor))
        expect(resumed).toEqual(events.slice(1))

        const cancelled = yield* client.runs.start({
          sessionId: session.id,
          agent: agent.name,
          input: { question: "cancel" },
          commandId: "server:cancel:start",
        })
        const missingCommandBody = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
          reason: "user stopped",
        })
        const missingCommand = yield* Effect.promise(() =>
          app.handler(
            new Request(`http://generalist.test/runs/${cancelled.id}/cancel`, {
              method: "POST",
              headers: { authorization: "Bearer secret", "content-type": "application/json" },
              body: missingCommandBody,
            }),
          ),
        )
        expect(missingCommand.status).toBe(400)
        const missingCommandText = yield* Effect.promise(() => missingCommand.text())
        expect(missingCommandText).toBe("")
        const emptyCommandBody = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
          commandId: "",
          reason: "user stopped",
        })
        const emptyCommand = yield* Effect.promise(() =>
          app.handler(
            new Request(`http://generalist.test/runs/${cancelled.id}/cancel`, {
              method: "POST",
              headers: { authorization: "Bearer secret", "content-type": "application/json" },
              body: emptyCommandBody,
            }),
          ),
        )
        expect(emptyCommand.status).toBe(400)
        const emptyCommandText = yield* Effect.promise(() => emptyCommand.text())
        expect(emptyCommandText).toBe(missingCommandText)
        expect(emptyCommandText).not.toContain("Cannot encode runtime state")
        expect(yield* client.runs.inspect({ runId: cancelled.id })).toMatchObject({ status: "running" })
        yield* client.runs.cancel({ runId: cancelled.id, commandId: "cancel:http-run", reason: "user stopped" })
        expect(yield* client.runs.inspect({ runId: cancelled.id })).toMatchObject({ status: "cancelled" })
        yield* client.runs.cancel({ runId: cancelled.id, commandId: "cancel:http-run", reason: "user stopped" })
        expect(
          yield* client.runs
            .cancel({ runId: cancelled.id, commandId: "cancel:http-run", reason: "different intent" })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "generalist/server/RequestFailed", operation: "runs.cancel" })

        const disabled = yield* client.operator
          .retry({ runId: started.id, commandId: "retry:disabled" })
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

  it.effect("rejects Session ids that canonical storage or the HTTP router cannot address", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const agent = Agent.make({ name: "server-id-boundary" })
        const host = yield* Host.make({ revision: "local", agents: { [agent.name]: agent } })
        const app = HttpRouter.toWebHandler(
          Server.layer({
            authorization: { tenantId: "test", authorize: () => Effect.succeed(true) },
            host,
            auth: Server.authBearer({
              token: Config.succeed(Redacted.make("secret")),
              principal: { id: "test-controller", tenantId: "test", role: "controller" },
            }),
          }).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))

        const create = (id: string) =>
          Effect.gen(function* () {
            const body = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({ id })
            return yield* Effect.promise(() =>
              app.handler(
                new Request("http://generalist.test/sessions", {
                  method: "POST",
                  headers: { authorization: "Bearer secret", "content-type": "application/json" },
                  body,
                }),
              ),
            )
          })
        const get = (id: string) =>
          Effect.promise(() =>
            app.handler(
              new Request(`http://generalist.test/sessions/${encodeURIComponent(id)}`, {
                headers: { authorization: "Bearer secret" },
              }),
            ),
          )

        const empty = yield* create("")
        const overlongId = `s${"x".repeat(100)}`
        const overlong = yield* create(overlongId)
        const controlId = `s${"c".repeat(99)}`
        const control = yield* create(controlId)
        const controlGet = yield* get(controlId)

        // URL parsers normalize `.` and `..` path segments before routing, and a
        // lone surrogate cannot be percent-encoded into a request path.
        const dot = yield* create(".")
        const dotDot = yield* create("..")
        const loneSurrogate = yield* create("\uD800")

        expect(empty.status).toBe(400)
        expect(overlong.status).toBe(400)
        expect(dot.status).toBe(400)
        expect(dotDot.status).toBe(400)
        expect(loneSurrogate.status).toBe(400)
        expect(yield* Effect.promise(() => empty.text())).not.toContain("Cannot encode runtime state")
        expect(yield* Effect.promise(() => overlong.text())).not.toContain("Cannot encode runtime state")
        expect(control.status).toBe(200)
        expect(controlGet.status).toBe(200)
        expect(yield* Effect.promise(() => controlGet.json())).toMatchObject({ id: controlId })
        expect(
          yield* host.sessions.get(overlongId).pipe(
            Effect.map(() => "found"),
            Effect.catchTag("generalist/host/SessionNotFound", () => Effect.succeed("not-found")),
          ),
        ).toBe("not-found")

        const encodedId = "a%2Fb"
        const encodedCreate = yield* create(encodedId)
        const encodedGet = yield* get(encodedId)
        expect(encodedCreate.status).toBe(200)
        expect(encodedGet.status).toBe(200)
        const slashId = "a/b"
        const slashCreate = yield* create(slashId)
        const slashGet = yield* get(slashId)
        expect(slashCreate.status).toBe(200)
        expect(slashGet.status).toBe(200)
        expect(yield* Effect.promise(() => slashGet.json())).toMatchObject({ id: slashId })
      }),
    ),
  )

  it.effect("encodes stored attachment headers that native Headers rejects instead of hanging the download", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const host = yield* Host.make({ revision: "local", agents: {} })
        const app = HttpRouter.toWebHandler(
          Server.layer({
            authorization: { tenantId: "test", authorize: () => Effect.succeed(true) },
            host,
            auth: Server.authBearer({
              token: Config.succeed(Redacted.make("secret")),
              principal: { id: "test-controller", tenantId: "test", role: "controller" },
            }),
          }).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))
        const put = (data: string, mediaType: string, filename?: string) =>
          host.attachments.put({
            data: new TextEncoder().encode(data),
            mediaType,
            ...(filename === undefined ? undefined : { filename }),
          })
        const download = (sha256: string) =>
          Effect.promise(() =>
            app.handler(
              new Request(`http://generalist.test/attachments/${sha256}`, {
                headers: { authorization: "Bearer secret" },
              }),
            ),
          ).pipe(Effect.timeout("5 seconds"))

        const control = yield* put("attachment-control", "text/plain", "réport name.txt")
        const controlResponse = yield* download(control.sha256)
        expect(controlResponse.status).toBe(200)
        expect(controlResponse.headers.get("x-filename")).toBe("réport name.txt")
        expect(yield* Effect.promise(() => controlResponse.text())).toBe("attachment-control")

        const unsafeFilename = yield* put("attachment-unsafe-filename", "text/plain", "evil\r\nx-injected: 1")
        const unsafeResponse = yield* download(unsafeFilename.sha256)
        expect(unsafeResponse.status).toBe(200)
        expect(unsafeResponse.headers.get("x-filename")).toBe("evil%0D%0Ax-injected: 1")
        expect(yield* Effect.promise(() => unsafeResponse.text())).toBe("attachment-unsafe-filename")

        const unsafeType = yield* put("attachment-unsafe-type", "text/plain\r\nx-injected: 1", "report.txt")
        const unsafeTypeResponse = yield* download(unsafeType.sha256)
        expect(unsafeTypeResponse.status).toBe(200)
        expect(unsafeTypeResponse.headers.get("content-type")).toBe("text/plain%0D%0Ax-injected: 1")

        const nulFilename = yield* put("attachment-nul-filename", "text/plain", "nul\0byte")
        const nulResponse = yield* download(nulFilename.sha256)
        expect(nulResponse.status).toBe(200)
        expect(nulResponse.headers.get("x-filename")).toBe("nul%00byte")

        const emojiFilename = yield* put("attachment-emoji-filename", "text/plain", "emoji 😀.txt")
        const emojiResponse = yield* download(emojiFilename.sha256)
        expect(emojiResponse.status).toBe(200)
        expect(emojiResponse.headers.get("x-filename")).toBe("emoji %F0%9F%98%80.txt")
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
        const host = yield* Host.make({ revision: "local", agents: { [agent.name]: agent } }).pipe(
          Effect.provideService(LanguageModel.LanguageModel, controlledModel),
        )
        const app = HttpRouter.toWebHandler(
          Server.layer({
            authorization: { tenantId: "test", authorize: () => Effect.succeed(true) },
            host,
            auth: Server.authBearer({
              token: Config.succeed(Redacted.make("secret")),
              principal: { id: "test-controller", tenantId: "test", role: "controller" },
            }),
          }).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))
        const client = yield* makeClient(makeTransport(app.handler), "secret")
        const session = yield* client.sessions.create({ id: "session:server:disconnect" })
        const input = { sessionId: session.id, agent: agent.name, input: "answer", commandId: "answer-once" }
        const run = yield* client.runs.start(input)
        expect((yield* client.runs.start(input)).id).toBe(run.id)
        const execution = yield* runScheduler(run.id, "server:disconnect").pipe(
          Effect.forkChild({ startImmediately: true }),
        )
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
        yield* Fiber.join(execution)
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
        const host = yield* Host.make({ revision: "local", agents: { [agent.name]: agent } })
        const app = HttpRouter.toWebHandler(
          Server.layer({
            authorization: { tenantId: "test", authorize: () => Effect.succeed(true) },
            host,
            auth: Server.authBearer({
              token: Config.succeed(Redacted.make("secret")),
              principal: { id: "test-controller", tenantId: "test", role: "controller" },
            }),
            operator: true,
          }).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))
        const transport = makeTransport(app.handler)
        const client = yield* makeClient(transport, "secret")
        const session = yield* client.sessions.create({ id: "session:server:unknown" })
        const run = yield* client.runs.start({
          sessionId: session.id,
          agent: agent.name,
          input: "answer",
          commandId: "server:unknown:start",
        })
        const store = yield* RunStore.RunStore
        const claim = yield* store.claimExecution({
          runId: run.id,
          ownerId: objectWorkerId,
          commandId: "claim:operator-explain",
        })
        const operation = yield* store.recordOperation({
          ...claim,
          operationKey: "tool:external-write",
          kind: "tool",
          inputDigest: "write:1",
          input: { value: "once" },
          replayPolicy: "never",
          attempt: 1,
        })
        yield* store.startOperation({ ...claim, operationId: operation.operationId, commandId: "start:external-write" })
        yield* store.expireRunningOperation({
          ...claim,
          operationId: operation.operationId,
          commandId: "expire:external-write",
        })
        expect(yield* client.operator.explain({ runId: run.id })).toMatchObject({
          status: "needs-resolution",
          decision: { _tag: "Unknown", operationId: operation.operationId },
        })
        const resolution = {
          runId: run.id,
          commandId: "resolve:external-write",
          operationId: operation.operationId,
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
            const context = yield* Layer.build(
              Layer.mergeAll(
                objectRuntimeLayer({ addresses: [], workerId: `server:${tenant}` }, makeObjectStorage()).pipe(
                  Layer.provide(ExecutableResolver.layerStatic([])),
                ),
                model,
                Permissions.layerAllowAll,
                Approvals.layerAutoApprove,
                blobStoreLayer({ environment: "test", tenant }).pipe(
                  Layer.provide(Layer.merge(BunCrypto.layer, Layer.succeed(ObjectStore, makeObjectStorage().store))),
                ),
              ),
            )
            const agent = Agent.make({ name: "tenant-assistant" })
            const host = yield* Host.make({ revision: "local", agents: { [agent.name]: agent } }).pipe(
              Effect.provideContext(context),
            )
            const app = HttpRouter.toWebHandler(
              Server.layer({
                authorization: { tenantId: tenant, authorize: () => Effect.succeed(true) },
                host,
                auth: Server.authBearer({
                  token: Config.succeed(Redacted.make(tenant)),
                  principal: { id: "test-controller", tenantId: tenant, role: "controller" },
                }),
              }).pipe(Layer.provide(HttpServer.layerServices)),
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
          commandId: "private:start",
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
        const host = yield* Host.make({ revision: "local", agents: { [agent.name]: agent } })
        const app = HttpRouter.toWebHandler(
          Server.layer({
            authorization: { tenantId: "test", authorize: () => Effect.succeed(true) },
            host,
            auth: Server.authBearer({
              token: Config.succeed(Redacted.make("secret")),
              principal: { id: "test-controller", tenantId: "test", role: "controller" },
            }),
          }).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))
        const client = yield* makeClient(makeTransport(app.handler), "secret")
        const session = yield* client.sessions.create({ id: "session:server:approval" })
        const run = yield* client.runs.start({
          sessionId: session.id,
          agent: agent.name,
          input: "approve",
          commandId: "approval:start",
        })
        yield* runScheduler(run.id, "server:approval:initial")

        expect(yield* client.runs.inspect({ runId: run.id })).toMatchObject({ status: "waiting" })
        expect(approvalRequests).toHaveLength(1)
        const token = approvalRequests[0]!.token
        yield* client.approvals.resolve({
          runId: run.id,
          token,
          commandId: "approval:resolve",
          decision: { _tag: "Approved" },
        })
        yield* client.approvals.resolve({
          runId: run.id,
          token,
          commandId: "approval:resolve",
          decision: { _tag: "Approved" },
        })
        yield* runScheduler(run.id, "server:approval:resume")

        expect(yield* client.runs.inspect({ runId: run.id })).toMatchObject({ status: "succeeded" })
        expect(approvalToolCalls).toBe(1)
        expect(
          yield* host.approvals
            .resolve(run.id, token, { _tag: "Approved" }, "test-controller", "approval:other")
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "generalist/runtime/IllegalOperatorAction" })
      }),
    ),
  )
})
