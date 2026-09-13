import { expect, layer } from "@effect/vitest"
import { Config, Effect, Layer, Redacted, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { Agent, Approvals, Permissions } from "generalist"
import { Host } from "generalist/host"
import { ExecutableResolver } from "generalist/runtime"
import * as Runtime from "../../src/runtime/engine.js"
import { ClientRun, ClientSession, ClientSessionRunsPage, ClientSessionSnapshot, Server } from "generalist/server"
import { TestModel } from "generalist/testing"
import { objectRuntimeLayer } from "../runtime/execution/object.js"
import { assistant, assistantAddress, objectLayer } from "../runtime/execution/fixtures.js"

const services = Layer.mergeAll(
  objectRuntimeLayer({ addresses: [] }).pipe(Layer.provide(ExecutableResolver.layerStatic([]))),
  TestModel.layer([]),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

const marker = "A10_HTTP_PRIVATE_INSTRUCTION_MARKER"
const forbidden = [
  marker,
  '"selection"',
  '"executableRef"',
  '"executableManifest"',
  '"registrations"',
  '"retainedSession"',
  '"treePolicy"',
  '"branches"',
  '"usageFacts"',
  '"activeTools"',
  '"suspension"',
]

const expectPublicBytes = (text: string): void => {
  for (const value of forbidden) expect(text).not.toContain(value)
}

interface JsonRequestBody {
  readonly [key: string]: string | number
}

const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))
const decodeSession = Schema.decodeEffect(Schema.fromJsonString(ClientSession))
const decodeSnapshot = Schema.decodeEffect(Schema.fromJsonString(ClientSessionSnapshot))
const decodeRuns = Schema.decodeEffect(Schema.fromJsonString(Schema.Array(ClientRun)))
const decodeRun = Schema.decodeEffect(Schema.fromJsonString(ClientRun))
const decodeRunsPage = Schema.decodeEffect(Schema.fromJsonString(ClientSessionRunsPage))

layer(Layer.mergeAll(objectLayer, TestModel.layer([]), Permissions.layerAllowAll, Approvals.layerAutoApprove))(
  "Client identity refusal",
  (it) => {
    it.effect("returns a typed unavailable response for a custom Run without an exact public revision", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const receipt = yield* runtime.send({
            to: assistantAddress,
            sessionId: "custom-identity-session",
            idempotencyKey: "custom-identity-run",
            prompt: "Do not execute",
          })
          expect(yield* runtime.inspect(receipt.runId)).not.toHaveProperty("revision")
          const host = yield* Host.make({ revision: "current-host-revision", agents: { assistant } })
          const app = HttpRouter.toWebHandler(
            Server.layer({
              host,
              authorization: { tenantId: "test", authorize: () => Effect.succeed(true) },
              auth: Server.authBearer({
                token: Config.succeed(Redacted.make("secret")),
                principal: { id: "reader", tenantId: "test", role: "controller" },
              }),
            }).pipe(Layer.provide(HttpServer.layerServices)),
            { disableLogger: true },
          )
          yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))
          const response = yield* Effect.promise(() =>
            app.handler(
              new Request(`http://generalist.test/runs/${receipt.runId}`, {
                headers: { authorization: "Bearer secret" },
              }),
            ),
          )
          expect(response.status).toBe(503)
          const text = yield* Effect.promise(() => response.text())
          expectPublicBytes(text)
          expect(text).not.toContain("current-host-revision")
          const failure = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Struct({ _tag: Schema.String })))(
            text,
          )
          expect(failure._tag).toBe("generalist/runtime/RuntimeUnavailable")
        }),
      ),
    )
  },
)

layer(services)("Client HTTP handler projection", (it) => {
  it.effect("serves allowlisted Session, queue, Run, page, snapshot, and event payloads", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const agent = Agent.make({ name: "projection-agent", instructions: marker })
        const host = yield* Host.make({ revision: "projection-revision", agents: { [agent.name]: agent } })
        const app = HttpRouter.toWebHandler(
          Server.layer({
            host,
            authorization: { tenantId: "test", authorize: () => Effect.succeed(true) },
            auth: Server.authBearer({
              token: Config.succeed(Redacted.make("secret")),
              principal: { id: "reader", tenantId: "test", role: "controller" },
            }),
          }).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose).pipe(Effect.orDie))
        const request = (path: string, init?: RequestInit) =>
          Effect.promise(() =>
            app.handler(
              new Request(`http://generalist.test${path}`, {
                ...init,
                headers: {
                  authorization: "Bearer secret",
                  ...(init?.body === undefined ? undefined : { "content-type": "application/json" }),
                },
              }),
            ),
          )
        const jsonRequest = (path: string, body: JsonRequestBody) =>
          encodeJson(body).pipe(Effect.flatMap((encoded) => request(path, { method: "POST", body: encoded })))

        const createdResponse = yield* jsonRequest("/sessions", {
          id: "projection-session",
          title: "Visible session",
          agent: agent.name,
        })
        expect(createdResponse.status).toBe(200)
        const createdText = yield* Effect.promise(() => createdResponse.text())
        expectPublicBytes(createdText)
        const created = yield* decodeSession(createdText)
        expect(created).toMatchObject({
          id: "projection-session",
          title: "Visible session",
          lifecycle: "active",
          selectedAgent: { name: agent.name, revision: "projection-revision" },
        })

        const session = yield* host.sessions.get(created.id)
        yield* session.submit("Visible active prompt", { commandId: "projection-active" })
        yield* session.submit("Visible queued prompt", { commandId: "projection-queued" })
        const activeRunId = (yield* session.inspect).activeRunId
        if (activeRunId === undefined) return yield* Effect.die("Expected an active Run")
        const internal = yield* host.sessions.snapshot(created.id)
        expect(yield* encodeJson(internal)).toContain(marker)

        for (const path of [`/sessions/${created.id}`, "/sessions", `/sessions/${created.id}/snapshot`]) {
          const response = yield* request(path)
          expect(response.status).toBe(200)
          expectPublicBytes(yield* Effect.promise(() => response.text()))
        }

        const sessionResponse = yield* request(`/sessions/${created.id}`)
        const projectedSession = yield* decodeSession(yield* Effect.promise(() => sessionResponse.text()))
        expect(projectedSession.queue).toMatchObject([
          {
            id: "projection-queued",
            revision: 1,
            agent: { name: agent.name, revision: "projection-revision" },
          },
        ])

        const snapshotResponse = yield* request(`/sessions/${created.id}/snapshot`)
        const snapshotText = yield* Effect.promise(() => snapshotResponse.text())
        expectPublicBytes(snapshotText)
        const snapshot = yield* decodeSnapshot(snapshotText)
        expect(snapshot.cursor).toBeTypeOf("string")
        expect(snapshot).toMatchObject({
          session: {
            id: created.id,
            selectedAgent: { name: agent.name, revision: "projection-revision" },
          },
          runs: [
            expect.objectContaining({
              runId: activeRunId,
              agent: { name: agent.name, revision: "projection-revision" },
            }),
          ],
        })

        const runsResponse = yield* request(`/sessions/${created.id}/runs`)
        const runsText = yield* Effect.promise(() => runsResponse.text())
        expectPublicBytes(runsText)
        const runs = yield* decodeRuns(runsText)
        expect(runs).toMatchObject([
          {
            runId: activeRunId,
            sessionId: created.id,
            rootRunId: activeRunId,
            agent: { name: agent.name, revision: "projection-revision" },
            status: "running",
          },
        ])

        const runResponse = yield* request(`/runs/${activeRunId}`)
        const runText = yield* Effect.promise(() => runResponse.text())
        expectPublicBytes(runText)
        expect(yield* decodeRun(runText)).toMatchObject({
          runId: activeRunId,
          sessionId: created.id,
          rootRunId: activeRunId,
        })

        const pageResponse = yield* jsonRequest(`/sessions/${created.id}/runs/page`, {
          at: snapshot.cursor,
          limit: 64,
        })
        const pageText = yield* Effect.promise(() => pageResponse.text())
        expectPublicBytes(pageText)
        expect(yield* decodeRunsPage(pageText)).toMatchObject({
          at: snapshot.cursor,
          runs: [expect.objectContaining({ runId: activeRunId })],
        })

        const malformedCursor = yield* jsonRequest(`/sessions/${created.id}/runs/page`, {
          at: "not-a-cursor",
          limit: 64,
        })
        expect(malformedCursor.status).toBe(400)
        expect(yield* Effect.promise(() => malformedCursor.json())).toMatchObject({
          _tag: "generalist/server/InvalidCursor",
          cursor: "not-a-cursor",
        })

        const events = yield* request(`/sessions/${created.id}/events`)
        expect(events.status).toBe(200)
        const reader = events.body!.getReader()
        const chunk = yield* Effect.promise(() => reader.read())
        const eventText = new TextDecoder().decode(chunk.value)
        yield* Effect.promise(() => reader.cancel())
        expect(eventText).toContain("RunChanged")
        expectPublicBytes(eventText)
      }),
    ),
  )
})
