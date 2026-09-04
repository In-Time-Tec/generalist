---
title: "How to serve an agent over SSE and WebSocket"
description: "Expose a Generalist Host through one typed HttpApi with HTTP, SSE, and WebSocket."
---

`generalist/server` mounts one schema-first HttpApi over a `generalist/host`. The Host delegates execution and persistence to Runtime while Server owns only HTTP translation, authentication, SSE and WebSocket framing, and its generated client.

**Terminal**

```bash
bun add effect@4.0.0-rc.112 generalist
```

## 1. Run an agent in memory

`Runtime.layerMemory` hosts Agents registered once at process startup. The in-memory process claims admitted work through the provided `RunStore` and executes it with `RunExecutor`. `Generalist.create` registers configured Agents and returns the Host. `host.runs.start` retains typed in-process inputs and outputs; the Server route uses `host.runs.startByName` to decode serialized input through the selected Agent Schema.

**session-frames.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { LanguageModel, Response } from "effect/unstable/ai"
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

const runtimeLayer = Layer.merge(
  Runtime.layerMemory({
    addresses: [],
  }).pipe(Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie))),
  agentServices,
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

const program = Effect.gen(function* () {
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
})

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
await runtime.dispose()
```

**Output**

```text
live:   0:RunAccepted 1:RunAttemptStarted 2:TurnStarted 3:ModelCallStarted 4:ModelAttemptStarted 5:ModelAttemptFirstOutput 6:ModelResponseCommitted 7:ModelAttemptCompleted 8:ModelCallCompleted 9:TurnCompleted 10:RunCompleted
replay: 3:ModelCallStarted 4:ModelAttemptStarted 5:ModelAttemptFirstOutput 6:ModelResponseCommitted 7:ModelAttemptCompleted 8:ModelCallCompleted 9:TurnCompleted 10:RunCompleted
```

- A Host Session assigns one durable cursor across the visible events from its root Run trees.
- `ModelResponseCommitted` references the exact Runtime Session entry containing the complete normalized response for a successful model operation; `ModelResponseInterrupted` references normalized output retained before cancellation or failure. Runtime stores the content once in Session. Host does not include these model-response records in its product event projection, and provider fragments never enter the durable stream.
- Terminal lifecycle facts are `RunCompleted`, `RunFailed`, and `RunCancelled`.
- A Server cursor is exclusive: cursor n requests Host events after authoritative Session entry n.
- The Host Session ID addresses streaming and lists root Runs; the Run ID addresses inspection and control.

## 2. Resolve approval waits

A durable approval emits an approval token and suspends the Run. Resolve it with `client.approvals.resolve({ runId, token, decision, operator })`. Runtime verifies the token, journals the operator identity, and rejects a stale decision.

**approval-resume.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
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

const runtimeLayer = Layer.merge(
  Runtime.layerMemory({
    addresses: [],
  }).pipe(Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie))),
  agentServices,
)

const program = Effect.gen(function* () {
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
})

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
await runtime.dispose()
```

**Output**

```text
waiting for Approval on approval:deploy-1
Deployed api to production.
```

WebSocket carries Host events and explicit cancellation only. Resolve approvals through the authenticated Server HTTP route.

## 3. Serve the routes

`Server.layer({ host, auth })` serves Sessions, named-Agent Run admission, inspection, cancellation, approvals, operator actions, Session SSE at `/sessions/:id/events`, Session WebSocket at `/sessions/:id/ws`, and OpenAPI at `/openapi.json`.

**http-routes.ts**

```typescript
import { Config, Effect, Layer, Redacted } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { Agent, Approvals, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { Server } from "generalist/server"
import { TestModel } from "generalist/testing"

const agent = Agent.make({ name: "research-agent" })
const runtimeLayer = Runtime.layerMemory({ addresses: [] }).pipe(
  Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
)
const services = Layer.mergeAll(
  runtimeLayer,
  TestModel.layer([TestModel.text("Answer.")]),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

const apiLayer = Layer.unwrap(
  Generalist.create({ agents: [agent] }).pipe(
    Effect.map((host) =>
      Server.layer({
        host,
        auth: Server.authBearer(Config.succeed(Redacted.make("replace-me"))).pipe(Layer.orDie),
      }),
    ),
    Effect.orDie,
  ),
)

export const serverLayer: Layer.Layer<never, never, HttpServer.HttpServer> = HttpRouter.serve(
  Layer.merge(apiLayer, HttpRouter.cors()).pipe(Layer.provide(HttpServer.layerServices)),
  { disableLogger: false },
).pipe(Layer.provideMerge(services), Layer.provideMerge(FetchHttpClient.layer))
```

Launch the layer with your platform HTTP server, then admit and observe a run:

**Terminal**

```bash
TOKEN=replace-me
SESSION_ID=$(curl -s -X POST localhost:4000/sessions \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"id":"docs-1"}' | jq -r .id)
RUN_ID=$(curl -s -X POST "localhost:4000/sessions/$SESSION_ID/runs" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"agent":"research-agent","input":"Research Effect fibers","idempotencyKey":"message-1"}' | jq -r .id)
curl -N "localhost:4000/sessions/$SESSION_ID/events" -H "authorization: Bearer $TOKEN"
```

## 4. Cursors and backpressure

- `client.events.subscribe` resumes from the exclusive cursor in `Last-Event-ID`, falling back to `?cursor=`.
- A lagging subscriber fails without affecting the Run or other subscribers. The reconnecting client resumes from its last admitted Host cursor.
- `client.runs.inspect({ runId })` is finite Run inspection, separate from the Session event stream.
- `Runtime.previews({ runId })` is a bounded, append-only, lossy process-local observer with detectable sequence and offset gaps. It is not transported, persisted, cursor-addressed, checkpointed, or durably replayed.
- Closing SSE or WebSocket never cancels the run. Cancellation is always explicit through `Runtime.cancel`.

The wire contract is in [the generalist/server reference](/reference/transport), and Runtime ownership is documented in [the generalist/runtime reference](/reference/runtime).
