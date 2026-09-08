/* oxlint-disable effecttsgo/strict-effect-provide -- This example assembles and owns its complete application Layer. */
import { BunCrypto } from "@effect/platform-bun"
import { layer as bunHttpServer } from "@effect/platform-bun/BunHttpServer"
import { Config, Console, Effect, Layer, ManagedRuntime, Option, Queue, Redacted, Schema } from "effect"
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpRouter,
  HttpServer,
  HttpServerResponse,
} from "effect/unstable/http"
import { Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, BlobStore, Permissions } from "generalist"
import { activate, layer as layerDurability } from "generalist/durability"
import { type ConnectionOptions, layer as layerS3 } from "generalist/durability/s3"
import { Host } from "generalist/host"
import { ExecutableResolver } from "generalist/runtime"
import { Server } from "generalist/server"
import { TestModel } from "generalist/testing"
import { Artifact, Yjs, layer as artifactLayer } from "generalist/unstable/artifact"

import { make as makeBrowserAuth } from "./browser-auth.js"

const artifactName = "plan.md"
export const editorPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Host co-edit</title>
    <style>
      :root { color-scheme: light dark; font: 16px/1.5 system-ui, sans-serif; }
      body { max-width: 54rem; margin: 3rem auto; padding: 0 1rem; }
      textarea { box-sizing: border-box; min-height: 20rem; padding: 1rem; width: 100%; font: inherit; }
      #status { color: #777; }
      #updates { font-family: ui-monospace, monospace; }
    </style>
  </head>
  <body>
    <h1>Shared plan</h1>
    <form id="login">
      <label for="token">Server token</label>
      <input id="token" type="password" autocomplete="off" required>
      <button type="submit">Connect</button>
    </form>
    <p id="status" data-testid="status">Enter the configured server token to connect.</p>
    <textarea data-testid="editor" aria-label="Shared plan" disabled></textarea>
    <h2>Attributed updates</h2>
    <ol id="updates" data-testid="updates"></ol>
    <script type="module">
      const login = document.querySelector("#login")
      const tokenInput = document.querySelector("#token")
      const status = document.querySelector("#status")
      const editor = document.querySelector("textarea")
      const updates = document.querySelector("#updates")
      let version = 0
      let content = ""
      let commandSequence = 0
      let pending = false
      let socket
      const connect = () => {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:"
      socket = new WebSocket(protocol + "//" + location.host + "/artifacts/plan.md/ws?version=0")

      socket.addEventListener("open", () => { status.textContent = "Connected" })
      socket.addEventListener("close", () => {
        status.textContent = "Disconnected"
        editor.disabled = true
        login.hidden = false
      })
      socket.addEventListener("message", (message) => {
        const event = JSON.parse(message.data)
        content = event.document.content
        version = event.document.version
        editor.value = content
        pending = false
        editor.disabled = false
        status.textContent = "Connected at version " + version
        if (event._tag === "Update") {
          const item = document.createElement("li")
          item.textContent = event.update.attribution._tag + ": " + event.update.attribution.actor
          updates.append(item)
        }
      })
      }
      login.addEventListener("submit", (event) => {
        event.preventDefault()
        const token = tokenInput.value
        tokenInput.value = ""
        status.textContent = "Authenticating…"
        fetch("/auth/session", { method: "POST", credentials: "same-origin", headers: { authorization: "Bearer " + token } })
          .then((response) => {
            if (response.status !== 204) { status.textContent = "Authentication failed. Check the server token."; return }
            login.hidden = true
            connect()
          })
          .catch(() => { status.textContent = "Could not reach the server." })
      })
      editor.addEventListener("input", () => {
        if (socket?.readyState !== WebSocket.OPEN) return
        if (pending) return
        pending = true
        editor.disabled = true
        socket.send(JSON.stringify({
          commandId: "browser-edit-" + (++commandSequence),
          _tag: "Edit",
          base: version,
          operation: { _tag: "Replace", from: 0, to: content.length, text: editor.value },
        }))
      })
    </script>
  </body>
</html>`

const services = Layer.unwrap(
  Effect.gen(function* () {
    const environment = yield* Config.string("GENERALIST_ENVIRONMENT")
    const tenant = yield* Config.string("GENERALIST_TENANT")
    const partition = yield* Config.string("GENERALIST_PARTITION")
    const bucket = yield* Config.string("GENERALIST_BUCKET")
    const region = yield* Config.string("AWS_REGION")
    const accessKeyId = yield* Config.string("AWS_ACCESS_KEY_ID")
    const secretAccessKey = yield* Config.string("AWS_SECRET_ACCESS_KEY")
    const sessionToken = Option.getOrUndefined(yield* Config.option(Config.string("AWS_SESSION_TOKEN")))
    const endpoint = Option.getOrUndefined(yield* Config.option(Config.string("GENERALIST_S3_ENDPOINT")))
    const credentials = { accessKeyId, secretAccessKey }
    if (sessionToken !== undefined) Object.assign(credentials, { sessionToken })
    const connection: ConnectionOptions = {
      bucket,
      region,
      credentials,
    }
    if (endpoint !== undefined) {
      Object.assign(connection, {
        endpoint,
        forcePathStyle: true,
        capabilities: {
          conditionalCreate: yield* Config.boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED"),
          strongReadAfterWrite: yield* Config.boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED"),
          consistentListing: yield* Config.boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED"),
        },
      })
    }
    const objectStore = layerS3(connection)
    const reconstructed = layerDurability({
      environment,
      tenant,
      partition,
      addresses: [],
      scheduler: { concurrency: 1 },
    }).pipe(
      Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
      Layer.provide(objectStore),
      Layer.provide(BunCrypto.layer),
    )
    const blobs = BlobStore.layer({ environment, tenant }).pipe(
      Layer.provide(objectStore),
      Layer.provide(BunCrypto.layer),
    )
    return Layer.mergeAll(
      Layer.effectDiscard(activate).pipe(Layer.provideMerge(reconstructed)),
      blobs,
      artifactLayer,
      TestModel.layer([
        TestModel.toolCall("artifact_read_cGxhbi5tZA", {}, { id: "read-plan" }),
        TestModel.toolCall(
          "artifact_edit_cGxhbi5tZA",
          { base: 1, operation: { _tag: "Replace", from: 7, to: 11, text: "document" } },
          { id: "edit-plan" },
        ),
        TestModel.text("The shared plan is updated."),
      ]),
      Permissions.layerAllowAll,
      Approvals.layerAutoApprove,
    )
  }),
)

const pageRoute = HttpRouter.add("GET", "/", () =>
  Effect.succeed(HttpServerResponse.text(editorPage, { contentType: "text/html; charset=utf-8" })),
)
const routes = Layer.unwrap(
  Effect.gen(function* () {
    const browserAuth = yield* makeBrowserAuth
    const document = yield* Artifact.open(artifactName, { crdt: Yjs.layer(), initial: "Draft plan" })
    const writer = Agent.make({
      name: "co-edit-writer",
      toolkit: Toolkit.make(Artifact.readTool(document), Artifact.tool(document)),
    })
    const host = yield* Host.make({ revision: "local", agents: [writer] })
    return Layer.mergeAll(
      Server.layer({
        authorization: { tenantId: browserAuth.tenantId, authorize: () => Effect.succeed(true) },
        host,
        auth: browserAuth.auth,
      }),
      pageRoute,
      browserAuth.login,
    )
  }).pipe(Effect.orDie),
).pipe(Layer.provide(services))
const authenticatedHttp = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const token = yield* Config.redacted("GENERALIST_SERVER_TOKEN")
    return (yield* HttpClient.HttpClient).pipe(HttpClient.mapRequest(HttpClientRequest.bearerToken(token)))
  }),
).pipe(Layer.provide(FetchHttpClient.layer))
const application = Layer.merge(
  HttpRouter.serve(routes, { disableLogger: true }).pipe(
    Layer.provideMerge(bunHttpServer({ hostname: "127.0.0.1", port: 0 })),
  ),
  authenticatedHttp,
)

interface BrowserPeer {
  readonly socket: WebSocket
  readonly messages: Queue.Dequeue<string>
}

const connectPeer = (url: string): Effect.Effect<BrowserPeer, Schema.SchemaError> =>
  Effect.gen(function* () {
    const token = yield* Config.redacted("GENERALIST_SERVER_TOKEN").pipe(Effect.orDie)
    const messages = yield* Queue.unbounded<string>()
    const client = yield* Schema.decodeUnknownEffect(Schema.instanceOf(WebSocket))(
      Reflect.construct(WebSocket, [url, { headers: { authorization: `Bearer ${Redacted.value(token)}` } }]),
    )
    const socket = yield* Effect.callback<WebSocket>((resume) => {
      client.addEventListener("message", (event) => {
        const message = Schema.decodeUnknownOption(Schema.String)(event.data)
        if (Option.isSome(message)) Queue.offerUnsafe(messages, message.value)
      })
      client.addEventListener("open", () => resume(Effect.succeed(client)), { once: true })
      client.addEventListener("error", () => resume(Effect.die("The artifact WebSocket failed to connect")), {
        once: true,
      })
      return Effect.sync(() => client.close())
    })
    return { socket, messages }
  })

const EventJson = Schema.fromJsonString(Server.ArtifactServerEvent)
const CommandJson = Schema.fromJsonString(Server.ArtifactClientCommand)
const nextEvent = (peer: BrowserPeer) => Queue.take(peer.messages).pipe(Effect.flatMap(Schema.decodeEffect(EventJson)))
const RunStarted = Schema.Struct({ id: Schema.String })
const RunStatus = Schema.Struct({ status: Schema.String })

const startAgent = (baseUrl: string) =>
  Effect.gen(function* () {
    const session = yield* HttpClientRequest.post(`${baseUrl}/sessions`).pipe(
      HttpClientRequest.bodyJsonUnsafe({ id: "session:co-edit", title: "Shared plan" }),
      HttpClient.execute,
      Effect.orDie,
    )
    if (session.status < 200 || session.status >= 300) {
      return yield* Effect.die(`Session creation failed with ${session.status}`)
    }
    const response = yield* HttpClientRequest.post(`${baseUrl}/sessions/session%3Aco-edit/runs`).pipe(
      HttpClientRequest.bodyJsonUnsafe({
        agent: "co-edit-writer",
        input: "Update the shared plan",
        idempotencyKey: "co-edit-update-plan",
      }),
      HttpClient.execute,
      Effect.orDie,
    )
    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.die(`Agent start failed with ${response.status}`)
    }
    return yield* HttpClientResponse.schemaBodyJson(RunStarted)(response).pipe(Effect.orDie)
  })

const awaitSucceeded = (baseUrl: string, runId: string): Effect.Effect<string, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = yield* HttpClient.get(`${baseUrl}/runs/${encodeURIComponent(runId)}`).pipe(Effect.orDie)
      const inspection = yield* HttpClientResponse.schemaBodyJson(RunStatus)(response).pipe(Effect.orDie)
      if (inspection.status === "succeeded") return inspection.status
      yield* Effect.sleep("10 millis")
    }
    return yield* Effect.die("The scripted Agent run did not complete")
  })

const program = Effect.scoped(
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer
    if (server.address._tag !== "TcpAddress") return yield* Effect.die("The co-edit example requires a TCP server")
    const baseUrl = `http://127.0.0.1:${server.address.port}`
    const page = yield* HttpClient.get(baseUrl).pipe(Effect.orDie)
    if (page.status !== 200 || !(yield* page.text.pipe(Effect.orDie)).includes("Shared plan")) {
      return yield* Effect.die("The browser editor page was not served")
    }

    const peer = yield* Effect.acquireRelease(
      connectPeer(`ws://127.0.0.1:${server.address.port}/artifacts/${artifactName}/ws?version=0`),
      ({ socket }) => Effect.sync(() => socket.close()),
    ).pipe(Effect.orDie)
    const initial = yield* nextEvent(peer).pipe(Effect.orDie)
    if (initial._tag !== "Snapshot" || initial.document.content !== "Draft plan") {
      return yield* Effect.die("The WebSocket did not send the initial artifact snapshot")
    }

    const command = yield* Schema.encodeEffect(CommandJson)({
      _tag: "Edit",
      commandId: "browser:edit-1",
      base: 0,
      operation: { _tag: "Replace", from: 0, to: 5, text: "Shared" },
    }).pipe(Effect.orDie)
    peer.socket.send(command)
    const human = yield* nextEvent(peer).pipe(Effect.orDie)
    if (human._tag !== "Update" || human.update.attribution._tag !== "Human") {
      return yield* Effect.die("The browser edit was not streamed with human attribution")
    }

    const run = yield* startAgent(baseUrl)
    const agent = yield* nextEvent(peer).pipe(Effect.orDie)
    if (agent._tag !== "Update" || agent.update.attribution._tag !== "Agent") {
      return yield* Effect.die("The Agent edit was not streamed with Agent attribution")
    }
    const status = yield* awaitSucceeded(baseUrl, run.id)
    const response = yield* HttpClient.get(`${baseUrl}/artifacts/${artifactName}`).pipe(Effect.orDie)
    const final = yield* HttpClientResponse.schemaBodyJson(Artifact.ReadResult)(response).pipe(Effect.orDie)
    if (final.content !== "Shared document" || final.version !== 2) {
      return yield* Effect.die(`The peers did not converge: ${final.content} at version ${final.version}`)
    }

    yield* Console.log(`Browser page: GET / -> ${page.status}`)
    yield* Console.log(`Artifact updates: Human ${human.update.result} -> Agent ${agent.update.result}`)
    yield* Console.log(`Document: ${final.content}; run: ${status}`)
    if (yield* Config.boolean("GENERALIST_COEDIT_SERVE").pipe(Config.withDefault(false))) {
      yield* Console.log(`Open ${baseUrl} and enter GENERALIST_SERVER_TOKEN in the login form.`)
      return yield* Effect.never
    }
  }),
)

if (import.meta.main) {
  const managed = ManagedRuntime.make(application)
  try {
    await managed.runPromise(program)
  } finally {
    await managed.dispose()
  }
}
