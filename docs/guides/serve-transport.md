---
title: "How to serve an agent over SSE and WebSocket"
description: "Expose a Generalist Host through one typed HttpApi with HTTP, SSE, and WebSocket."
---

Let a client submit work, observe progress, and reconnect to a hosted agent. `generalist/server` mounts one schema-first HttpApi over a `generalist/host`. The Host delegates execution and persistence to Runtime while Server owns HTTP translation, authentication, SSE and WebSocket framing, and its generated client. Keeping the connection open is not what makes the work durable; the object-backed Runtime is.

**Terminal**

```bash
bun add effect@4.0.0-rc.112 generalist @aws-sdk/client-s3 @smithy/fetch-http-handler
```

## 1. Run an agent with object durability

`Durability.layer` reconstructs the object-backed Runtime and `Durability.activate` starts its scheduler only inside an owned scope. `S3.layer` supplies the canonical object transport; the host also supplies `BunCrypto` and an `ExecutableResolver`. Set `GENERALIST_ENVIRONMENT`, `GENERALIST_TENANT`, `GENERALIST_PARTITION`, `GENERALIST_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`; `AWS_SESSION_TOKEN` is optional. For a custom endpoint, also set `GENERALIST_S3_ENDPOINT` and `GENERALIST_S3_CAPABILITIES_CONFIRMED` only after qualifying its conditional-create, strong-read, and consistent-listing guarantees. The object transport is not a provider certification or a claim of deployed support.

**session-frames.ts**

```typescript
import { BunCrypto } from "@effect/platform-bun"
import { Console, Config, Effect, Layer, Option, Stream } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { LanguageModel, Response } from "effect/unstable/ai"
import { activate, layer as layerDurability } from "generalist/durability"
import { type Options, layer as layerS3 } from "generalist/durability/s3"
import { Cursor, ExecutableResolver, Runtime } from "generalist/runtime"
const agent = Agent.make({ name: "chat-agent" })
const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () =>
      Stream.make(
        Response.makePart("text-delta", { id: "assistant", delta: "Hello from Generalist." }),
        Response.makePart("finish", { reason: "stop", usage, response: { status: 200, headers: {} } }),
      ),
  }),
)

const agentServices = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtimeLayer = Layer.unwrap(
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
    const confirmed = endpoint === undefined ? false : yield* Config.boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED")
    let credentials: Options["credentials"] = { accessKeyId, secretAccessKey }
    if (sessionToken !== undefined) credentials = { ...credentials, sessionToken }
    let transport: Options = { bucket, region, credentials }
    if (endpoint !== undefined) {
      transport = {
        ...transport,
        endpoint,
        forcePathStyle: true,
        capabilities: {
          conditionalCreate: confirmed,
          strongReadAfterWrite: confirmed,
          consistentListing: confirmed,
        },
      }
    }
    return layerDurability({ environment, tenant, partition, addresses: [] }).pipe(
      Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
      Layer.provide(layerS3(transport)),
      Layer.provide(BunCrypto.layer),
    )
  }),
)

const collectRun = (runId: string, cursor?: number) => {
  const options = { runId }
  if (cursor !== undefined) Object.assign(options, { cursor: Cursor.make(cursor) })
  return Runtime.Runtime.use((runtime) =>
    runtime.events(options).pipe(
      Stream.takeUntil((event) => event._tag === "RunCompleted"),
      Stream.runCollect,
    ),
  )
}

const tags = (events: Iterable<{ readonly sequence: number; readonly _tag: string }>) =>
  Array.from(events)
    .map((event) => `${event.sequence}:${event._tag}`)
    .join(" ")

const program = Effect.scoped(
  Effect.gen(function* () {
    yield* activate
    const runtime = yield* Runtime.Runtime
    yield* runtime.register(agent)
    const handle = yield* runtime.start(agent, "Say hello", {
      sessionId: "docs-1",
      idempotencyKey: "hello-1",
    })
    const live = yield* collectRun(handle.runId)
    yield* Console.log(`live:   ${tags(live)}`)
    const replayed = yield* collectRun(handle.runId, 2)
    yield* Console.log(`replay: ${tags(replayed)}`)
  }),
)

await Effect.runPromise(program.pipe(Effect.provide(Layer.merge(runtimeLayer, agentServices))))
```

**Output**

```text
live:   0:RunAccepted 1:RunAttemptStarted 2:TurnStarted 3:ModelCallStarted 4:ModelAttemptStarted 5:ModelAttemptFirstOutput 6:ModelResponseCommitted 7:ModelAttemptCompleted 8:ModelCallCompleted 9:TurnCompleted 10:RunCompleted
replay: 3:ModelCallStarted 4:ModelAttemptStarted 5:ModelAttemptFirstOutput 6:ModelResponseCommitted 7:ModelAttemptCompleted 8:ModelCallCompleted 9:TurnCompleted 10:RunCompleted
```

- A Host Session assigns one durable cursor across Run lifecycle entries and committed Conversation updates. Some Run entries are filtered from the product stream, so visible cursor values can have gaps.
- `ModelResponseCommitted` references the exact Runtime Session entry containing the complete normalized response for a successful model operation; `ModelResponseInterrupted` references normalized output retained before cancellation or failure. Runtime stores the content once in Session. Host filters those raw Run events but exposes committed user/tool/assistant content through the Session conversation snapshot and Conversation updates. Provider fragments never enter that durable display stream.
- Terminal lifecycle facts are `RunCompleted`, `RunFailed`, and `RunCancelled`.
- A Server cursor is exclusive: cursor n requests Host events after authoritative Session entry n.
- The Host Session ID addresses streaming and lists root Runs; the Run ID addresses inspection and control.

For an existing Session, `client.events.connect({ sessionId })` first reads a version-1 snapshot containing metadata, Run projections, `conversation: { leafId, entries }`, and the exact exclusive cursor. Each visible entry keeps its original ID and parent ID. Live updates retain the prefix through `afterEntryId` and replace the suffix, rather than assuming every change is an append. FoldKit validates the prior leaf and resynchronizes from a new snapshot when the prefix does not match. Internal instruction, memory, and skill bodies are not display entries. [Snapshot limits](/features/server#snapshot-limits) reject oversized responses instead of truncating them.

## 2. Resolve approval waits

A durable approval emits an approval token and suspends the Run. Resolve it with `client.approvals.resolve({ runId, token, decision, operator })`. Runtime verifies the token, journals the operator identity, and rejects a stale decision.

**approval-resume.ts**

```typescript
import { BunCrypto } from "@effect/platform-bun"
import { Config, Console, Effect, Layer, Option, Schema, Stream } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { activate, layer as layerDurability } from "generalist/durability"
import { type Options, layer as layerS3 } from "generalist/durability/s3"
import { Cursor, ExecutableResolver, Runtime } from "generalist/runtime"

const deployTool = Tool.make("deploy", {
  description: "Deploy a service",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const toolkit = Toolkit.make(deployTool)
const agent = Agent.make({ name: "release-agent", toolkit })
const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

let calls = 0

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      return calls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "deploy-1",
              name: "deploy",
              params: { service: "api" },
              providerExecuted: false,
            }),
            Response.makePart("finish", { reason: "tool-calls", usage, response: { status: 200, headers: {} } }),
          )
        : Stream.make(
            Response.makePart("text-delta", { id: "assistant", delta: "Deployed api to production." }),
            Response.makePart("finish", { reason: "stop", usage, response: { status: 200, headers: {} } }),
          )
    },
  }),
)

const toolkitLayer = toolkit.toLayer({ deploy: () => Effect.succeed("deployed") })
const toolExecutorLayer = Layer.unwrap(
  Effect.gen(function* () {
    const handlers = yield* Layer.build(toolkitLayer)
    const handledToolkit = yield* toolkit.pipe(Effect.provideContext(handlers))
    return ToolExecutor.layerToolkit(handledToolkit)
  }),
)

const agentServices = Layer.mergeAll(
  toolkitLayer,
  modelLayer,
  toolExecutorLayer,
  Permissions.layerAllowAll,
  Approvals.layerTest({
    resolve: (pending) => Effect.succeed({ ...pending, token: "deploy-token-1" }),
  }),
  ModelMiddleware.layerIdentity,
)

const runtimeLayer = Layer.unwrap(
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
    const confirmed = endpoint === undefined ? false : yield* Config.boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED")
    let credentials: Options["credentials"] = { accessKeyId, secretAccessKey }
    if (sessionToken !== undefined) credentials = { ...credentials, sessionToken }
    let transport: Options = { bucket, region, credentials }
    if (endpoint !== undefined) {
      transport = {
        ...transport,
        endpoint,
        forcePathStyle: true,
        capabilities: {
          conditionalCreate: confirmed,
          strongReadAfterWrite: confirmed,
          consistentListing: confirmed,
        },
      }
    }
    return layerDurability({ environment, tenant, partition, addresses: [] }).pipe(
      Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
      Layer.provide(layerS3(transport)),
      Layer.provide(BunCrypto.layer),
    )
  }),
)

const program = Effect.scoped(
  Effect.gen(function* () {
    yield* activate
    const runtime = yield* Runtime.Runtime
    yield* runtime.register(agent)
    const handle = yield* runtime.start(agent, "Deploy the api service", {
      sessionId: "release-1",
      idempotencyKey: "deploy-1",
    })
    const firstRun = yield* handle.events.pipe(
      Stream.takeUntil((event) => event._tag === "RunWaiting"),
      Stream.runCollect,
    )
    const waiting = Array.from(firstRun).find((event) => event._tag === "RunWaiting")
    if (waiting === undefined || waiting._tag !== "RunWaiting") {
      return yield* Effect.die("expected a RunWaiting event")
    }
    yield* Console.log(`waiting for ${waiting.wait.reason._tag} on ${waiting.wait.waitId}`)
    yield* runtime.respond({ runId: handle.runId, waitId: waiting.wait.waitId, resolution: { _tag: "Approved" } })
    const secondRun = yield* runtime.events({ runId: handle.runId, cursor: Cursor.make(waiting.sequence) }).pipe(
      Stream.takeUntil((event) => event._tag === "RunCompleted"),
      Stream.runCollect,
    )
    const completed = Array.from(secondRun).find((event) => event._tag === "RunCompleted")
    if (completed === undefined || completed._tag !== "RunCompleted" || "_tag" in completed.result) {
      return yield* Effect.die("expected an Agent RunCompleted event")
    }
    yield* Console.log(completed.result.text)
  }),
)

await Effect.runPromise(program.pipe(Effect.provide(Layer.merge(runtimeLayer, agentServices))))
```

**Output**

```text
waiting for Approval on runtime-approval:run_1:approval:deploy-1
Deployed api to production.
```

WebSocket carries Host events and explicit cancellation only. Resolve approvals through the authenticated Server HTTP route.

## 3. Serve the routes

`Server.layer({ host, auth })` serves Sessions, named-Agent Run admission, inspection, cancellation, approvals, operator actions, Session SSE at `/sessions/:id/events`, Session WebSocket at `/sessions/:id/ws`, and OpenAPI at `/openapi.json`.

**http-routes.ts**

```typescript
import { BunCrypto } from "@effect/platform-bun"
import { Config, Effect, Layer, Option } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { Agent, Approvals, Permissions } from "generalist"
import { Host } from "generalist/host"
import { type RuntimeServices, activate, layer as layerDurability } from "generalist/durability"
import { type Options, layer as layerS3 } from "generalist/durability/s3"
import { ExecutableResolver } from "generalist/runtime"
import { Server } from "generalist/server"
import { TestModel } from "generalist/testing"

const agent = Agent.make({ name: "research-agent" })
const runtimeLayer = Layer.unwrap(
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
    const confirmed = endpoint === undefined ? false : yield* Config.boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED")
    let credentials: Options["credentials"] = { accessKeyId, secretAccessKey }
    if (sessionToken !== undefined) credentials = { ...credentials, sessionToken }
    let transport: Options = { bucket, region, credentials }
    if (endpoint !== undefined) {
      transport = {
        ...transport,
        endpoint,
        forcePathStyle: true,
        capabilities: {
          conditionalCreate: confirmed,
          strongReadAfterWrite: confirmed,
          consistentListing: confirmed,
        },
      }
    }
    const reconstructed = layerDurability({ environment, tenant, partition, addresses: [] }).pipe(
      Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
      Layer.provide(layerS3(transport)),
      Layer.provide(BunCrypto.layer),
    )
    return Layer.effectDiscard(activate).pipe(Layer.provideMerge(reconstructed))
  }),
)
const services = Layer.mergeAll(
  runtimeLayer,
  TestModel.layer([TestModel.text("Answer.")]),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

const apiLayer = Layer.unwrap(
  Host.make({
    agents: { support: agent },
    revision: "serve-demo-build",
    limits: { tree: { maxDepth: 3, maxSessions: 32 }, concurrency: { agents: 4, tools: 8 } },
  }).pipe(
    Effect.map((host) =>
      Server.layer({
        authorization: { tenantId: "example", authorize: () => Effect.succeed(true) },
        host,
        auth: Server.authBearer({
          token: Config.redacted("GENERALIST_SERVER_TOKEN"),
          principal: { id: "example-controller", tenantId: "example", role: "controller" },
        }).pipe(Layer.orDie),
      }),
    ),
    Effect.orDie,
  ),
)

export const serverLayer: Layer.Layer<
  | RuntimeServices
  | Layer.Success<ReturnType<typeof TestModel.layer>>
  | Permissions.Permissions
  | Approvals.Approvals
  | Layer.Success<typeof FetchHttpClient.layer>,
  Config.ConfigError | Effect.Error<typeof activate> | Layer.Error<ReturnType<typeof layerS3>>,
  HttpServer.HttpServer
> = HttpRouter.serve(Layer.merge(apiLayer, HttpRouter.cors()).pipe(Layer.provide(HttpServer.layerServices)), {
  disableLogger: false,
}).pipe(Layer.provideMerge(services), Layer.provideMerge(FetchHttpClient.layer))
```

Launch the layer with your platform HTTP server, then admit and observe a run:

**Terminal**

```bash
TOKEN=local-demo-only
SESSION_ID=$(curl -s -X POST localhost:4000/sessions \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"id":"docs-1"}' | jq -r .id)
RUN_ID=$(curl -s -X POST "localhost:4000/sessions/$SESSION_ID/runs" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"agent":"research-agent","input":"Research Effect fibers","idempotencyKey":"message-1"}' | jq -r .id)
curl -s -X POST "localhost:4000/runs/$RUN_ID/cancel" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"commandId":"cancel:docs-1","reason":"operator requested"}'
curl -N "localhost:4000/sessions/$SESSION_ID/events" -H "authorization: Bearer $TOKEN"
```

The cancel payload must include a caller-chosen `commandId`; retry the exact payload with that identity rather than generating a new cancellation command. Closing the stream does not cancel the Run.

## 4. Cursors and backpressure

- `client.events.subscribe` resumes from the exclusive cursor in `Last-Event-ID`, falling back to `?cursor=`.
- A lagging subscriber fails without affecting the Run or other subscribers. The reconnecting client resumes from its last admitted Host cursor.
- `client.runs.inspect({ runId })` is finite Run inspection, separate from the Session event stream.
- `Runtime.previews({ runId })` is a bounded, append-only, lossy process-local observer with detectable sequence and offset gaps. It is not transported, persisted, cursor-addressed, checkpointed, or durably replayed.
- Closing SSE or WebSocket never cancels the run. Cancellation is always explicit through `Runtime.cancel` or the authenticated Server route, and each cancellation command carries a caller-supplied `commandId`.

The wire contract is in [the generalist/server reference](/reference/transport), and Runtime ownership is documented in [the generalist/runtime reference](/reference/runtime).
