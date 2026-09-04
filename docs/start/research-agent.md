---
title: "Tutorial: a research agent with approvals and a live UI"
description: "Build a research agent with a real web_search tool, human approval over the wire, and a live FoldKit chat UI: zero-credential by default, live with one env var."
---

In this tutorial we build a research agent with a real web_search tool, human approval, and a live FoldKit chat UI. It runs with zero credentials by default and goes live against a real model with one environment variable.

Three parts: a Bun server that streams agent runs over SSE and WebSocket, an approval resolved over the wire, and a browser chat UI. If you have not done [the quickstart](/start/quickstart), start there. The finished, styled version of this app lives in the repository at [examples/deep-research-agent](https://github.com/In-Time-Tec/generalist/tree/main/examples/deep-research-agent).

## Part 1: The server

### Scaffold the server

**Terminal**

```bash
mkdir research-agent && cd research-agent
bun init -y
bun add effect@4.0.0-rc.112 generalist@0.45.0 @effect/ai-openrouter@4.0.0-rc.112 @effect/platform-bun@4.0.0-rc.112
```

### A web search service

Tools should not talk to the outside world directly; they resolve services you own. Ours answers every query with canned results so the tutorial runs offline; swapping in a real search API later means swapping this one layer.

**web-search.ts**

```typescript
import { Context, Effect, Layer, Schema } from "effect"

export const SearchResult = Schema.Struct({
  title: Schema.String,
  url: Schema.String,
  snippet: Schema.String,
})

export type SearchResult = typeof SearchResult.Type

export interface Service {
  readonly search: (query: string) => Effect.Effect<ReadonlyArray<SearchResult>>
}

export class WebSearch extends Context.Service<WebSearch, Service>()(
  "generalist-docs/research-agent/web-search/WebSearch",
) {}

const cannedResults: ReadonlyArray<SearchResult> = [
  {
    title: "Effect - production-grade TypeScript",
    url: "https://effect.website",
    snippet: "Effect is a TypeScript library for building robust, type-safe, and composable applications.",
  },
  {
    title: "Effect-TS on GitHub",
    url: "https://github.com/Effect-TS/effect",
    snippet: "The Effect monorepo: the core library, Schema, platform integrations, and the CLI.",
  },
]

export const cannedLayer: Layer.Layer<WebSearch> = Layer.succeed(
  WebSearch,
  WebSearch.of({ search: () => Effect.succeed(cannedResults) }),
)
```

### The web_search tool

`Tool.make` declares the name, parameter schema, and success schema; `dependencies` names the service the handler resolves; `failureMode: "return"` feeds tool failures back to the model as results. The one line that changes everything downstream is `needsApproval: true`. This tool will not run without a human decision.

**tools.ts**

```typescript
import { Effect, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { SearchResult, WebSearch } from "./web-search"
export const webSearchTool = Tool.make("web_search", {
  description: "Search the web for a query and return a short list of results with titles, URLs, and snippets.",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Struct({ results: Schema.Array(SearchResult) }),
  failureMode: "return",
  needsApproval: true,
  dependencies: [WebSearch],
})

export const toolkit = Toolkit.make(webSearchTool)

const webSearchHandler = Effect.fn("ResearchAgent.webSearch")(function* (params: { readonly query: string }) {
  const webSearch = yield* WebSearch
  const results = yield* webSearch.search(params.query)
  return { results }
})

export const toolkitLayer = toolkit.toLayer({ web_search: webSearchHandler })
```

### A model with a deterministic fallback

When `OPENROUTER_API_KEY` resolves, the layer is a real OpenRouter model. When it does not, a scripted model stands in: it reads the growing prompt, where no prior `web_search` result means emit a tool call; a prior result means synthesize a cited answer from it.

**model.ts**

```typescript
import { layer as openRouterLayer } from "generalist/providers/openrouter"
import { Config, Effect, Layer, Option, Schema, Stream } from "effect"
import { ModelRegistry } from "generalist"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { FetchHttpClient } from "effect/unstable/http"

const WebSearchSuccess = Schema.Struct({
  results: Schema.Array(Schema.Struct({ title: Schema.String, url: Schema.String, snippet: Schema.String })),
})
type WebSearchSuccess = typeof WebSearchSuccess.Type

const findWebSearchResult = (prompt: Prompt.Prompt): WebSearchSuccess | undefined => {
  for (const message of prompt.content) {
    if (message.role !== "tool") continue
    for (const part of message.content) {
      if (part.type === "tool-result" && part.name === "web_search" && !part.isFailure) {
        return Schema.decodeUnknownOption(WebSearchSuccess)(part.result).pipe(Option.getOrUndefined)
      }
    }
  }
  return undefined
}

const latestUserQuestion = (prompt: Prompt.Prompt): string => {
  const last = prompt.content.findLast((message) => message.role === "user")
  if (last === undefined) return "the topic"
  for (const part of last.content) {
    if (part.type === "text") return part.text
  }
  return "the topic"
}

const synthesizeAnswer = (found: WebSearchSuccess): string => {
  const summary = found.results.map((item) => item.snippet).join(" ")
  const citations = found.results.map((item, index) => `[${index + 1}] ${item.title} — ${item.url}`).join("\n")
  return [
    `Based on ${found.results.length} sources, here is what I found:`,
    "",
    summary,
    "",
    "Sources:",
    citations,
  ].join("\n")
}

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const scriptedModel: Layer.Layer<LanguageModel.LanguageModel> = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      const found = findWebSearchResult(options.prompt)
      if (found !== undefined) {
        return Stream.make(
          Response.makePart("text-delta", { id: "assistant", delta: synthesizeAnswer(found) }),
          Response.makePart("finish", { reason: "stop", usage, response: undefined }),
        )
      }
      return Stream.make(
        Response.makePart("tool-call", {
          id: "search-1",
          name: "web_search",
          params: { query: latestUserQuestion(options.prompt) },
          providerExecuted: false,
        }),
        Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
      )
    },
  }),
)

export const modelLayer: Layer.Layer<LanguageModel.LanguageModel> = Layer.unwrap(
  Effect.gen(function* () {
    const registration = yield* Effect.scoped(
      Layer.build(
        Layer.provide(
          openRouterLayer({ model: "openai/gpt-4o-mini", apiKey: Config.redacted("OPENROUTER_API_KEY") }),
          FetchHttpClient.layer,
        ),
      ).pipe(
        Effect.flatMap((context) => ModelRegistry.registrations().pipe(Effect.provide(context))),
        Effect.map((registrations) => registrations[0]),
      ),
    ).pipe(
      Effect.asSome,
      Effect.catchTag("ConfigError", () => Effect.succeedNone),
    )
    return Option.match(registration, {
      onNone: () => scriptedModel,
      onSome: (openRouter) => openRouter?.layer ?? scriptedModel,
    })
  }),
)
```

### The agent

**agent.ts**

```typescript
import { Agent, Policy } from "generalist"
import type { LanguageModel, Tool } from "effect/unstable/ai"
import { toolkit, type webSearchTool } from "./tools"
import { WebSearch } from "./web-search"

type Tools = { readonly web_search: typeof webSearchTool }

export const agent: Agent.Agent<Tools, LanguageModel.LanguageModel | WebSearch | Tool.HandlersFor<Tools>> = Agent.make({
  name: "research-agent",
  instructions: "Plan briefly, call web_search as needed, then synthesize a cited answer with source URLs.",
  toolkit,
  policy: Policy.recurs(6),
})
```

### Runtime and routes

`Runtime.layerMemory` owns durable execution, while `Generalist.create` creates the product-facing Host that owns Sessions, named Agents, Runs, approvals, and the Session event cursor. The approvals layer parks an approval-gated tool until a human resolves its durable token. `Server.layer` mounts that Host through one typed API: `POST /sessions` creates a Session, `POST /sessions/:sessionId/runs` starts a configured Agent, and `GET /sessions/:id/events` and `GET /sessions/:id/ws` follow the same HostEvent stream over SSE and WebSocket.

**server.ts**

```typescript
import { Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { Server } from "generalist/server"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { agent } from "./agent"
import { modelLayer } from "./model"
import { toolkit, toolkitLayer } from "./tools"
import { cannedLayer } from "./web-search"

export const approvalsLayer = Approvals.layerDurable({
  notify: (request) => Effect.logInfo("approval requested", request),
})

export const toolExecutorLayer: Layer.Layer<ToolExecutor.ToolExecutor> = Layer.unwrap(
  Effect.gen(function* () {
    const handlers = yield* Layer.build(toolkitLayer)
    const handledToolkit = yield* toolkit.pipe(Effect.provideContext(handlers))
    return ToolExecutor.layerToolkit(handledToolkit)
  }),
).pipe(Layer.provide(cannedLayer))

const agentServices = Layer.mergeAll(
  modelLayer,
  toolExecutorLayer,
  toolkitLayer.pipe(Layer.provideMerge(cannedLayer)),
  Permissions.layerAllowAll,
  approvalsLayer,
  ModelMiddleware.layerIdentity,
)

const runtimeLayer = Runtime.layerMemory({ addresses: [] }).pipe(
  Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
)

const demoAuth = Layer.succeed(Server.Authentication, Server.Authentication.of({ bearer: (httpEffect) => httpEffect }))

const apiLayer = Layer.unwrap(
  Generalist.create({ agents: [agent] }).pipe(
    Effect.map((host) =>
      Server.layer({
        host,
        auth: demoAuth,
      }),
    ),
    Effect.orDie,
  ),
)

export const httpLayer: Layer.Layer<never, never, HttpServer.HttpServer> = HttpRouter.serve(
  Layer.merge(apiLayer, HttpRouter.cors()).pipe(Layer.provide(HttpServer.layerServices)),
).pipe(Layer.provideMerge(agentServices), Layer.provideMerge(runtimeLayer))
```

### Serve it with Bun

The entrypoint provides the platform HTTP server from `@effect/platform-bun` and launches the layer. Start it with `bun run index.ts`:

**index.ts**

```typescript
import { layer } from "@effect/platform-bun/BunHttpServer"
import { runMain } from "@effect/platform-bun/BunRuntime"
import { Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { httpLayer } from "./server"

const serverLayer = httpLayer.pipe(Layer.provideMerge(layer({ port: 4000 })), Layer.provideMerge(FetchHttpClient.layer))

runMain(Layer.launch(serverLayer))
```

### Watch a run suspend

With the server running, create a stable Session and start the named Agent with an idempotency key. Keep both the Session ID used by the event stream and the returned Run ID:

**Terminal**

```bash
export SESSION_ID=research-1
curl -fsS -X POST http://localhost:4000/sessions \
  -H "content-type: application/json" \
  -d "{\"id\":\"$SESSION_ID\"}" >/dev/null
export RUN_ID=$(curl -fsS -X POST "http://localhost:4000/sessions/$SESSION_ID/runs" \
  -H "content-type: application/json" \
  -d '{"agent":"research-agent","input":"What is Effect for TypeScript?","idempotencyKey":"question-1"}' | jq -r .id)
printf '{"sessionId":"%s","runId":"%s"}\n' "$SESSION_ID" "$RUN_ID"
```

**Output**

```text
{"sessionId":"research-1","runId":"run_1"}
```

Then tail the SSE stream:

**Terminal**

```bash
curl -Ns "http://localhost:4000/sessions/${SESSION_ID:?run open-session.sh first}/events" | awk '
  /^event: ApprovalRequested$/ { approval = 1 }
  approval && /^$/ { exit }
  { print }
'
```

**Output**

```text
id: 0
event: RunStarted
data: {"_tag":"RunStarted","sessionId":"research-1","cursor":0,"runId":"run_1","event":{"specVersion":"1","eventId":"run_1:0","runId":"run_1","sequence":0,"executableRef":{"executable":"executable-pin:v1:sha256:81794eb076cb8c991e181deffa9229205e2eae4bc54eaec041e9e2ed66e56b54","active":"agent-pin:v1:sha256:280ce7a45d5d8a4242f9b322c68fb97682c66fcc5f7e26ce15ffd6896571298c"},"rootRunId":"run_1","depth":0,"correlationId":"question-1","occurredAt":"2026-09-02T19:07:48.815Z","_tag":"RunAccepted","messageId":"start:question-1","address":"runtime:start","budget":{}}}

id: 2
event: Turn
data: {"_tag":"Turn","sessionId":"research-1","cursor":2,"runId":"run_1","event":{"specVersion":"1","eventId":"run_1:2","runId":"run_1","sequence":2,"executableRef":{"executable":"executable-pin:v1:sha256:81794eb076cb8c991e181deffa9229205e2eae4bc54eaec041e9e2ed66e56b54","active":"agent-pin:v1:sha256:280ce7a45d5d8a4242f9b322c68fb97682c66fcc5f7e26ce15ffd6896571298c"},"attemptId":"run_1:attempt:1","rootRunId":"run_1","depth":0,"correlationId":"question-1","occurredAt":"2026-09-02T19:07:49.317Z","_tag":"TurnStarted","turn":0}}

id: 9
event: ApprovalRequested
data: {"_tag":"ApprovalRequested","sessionId":"research-1","cursor":9,"runId":"run_1","event":{"specVersion":"1","eventId":"run_1:9","runId":"run_1","sequence":9,"executableRef":{"executable":"executable-pin:v1:sha256:81794eb076cb8c991e181deffa9229205e2eae4bc54eaec041e9e2ed66e56b54","active":"agent-pin:v1:sha256:280ce7a45d5d8a4242f9b322c68fb97682c66fcc5f7e26ce15ffd6896571298c"},"attemptId":"run_1:attempt:1","rootRunId":"run_1","depth":0,"correlationId":"question-1","occurredAt":"2026-09-02T19:07:49.358Z","_tag":"ApprovalRequested","turn":0,"call":{"type":"tool-call","id":"search-1","name":"web_search","params":{"query":"What is Effect for TypeScript?"},"providerExecuted":false,"metadata":{}},"request":{"approvalId":"runtime-approval:run_1:approval:search-1","operation":"search-1","capability":"web_search","input":{"query":"What is Effect for TypeScript?"}}}}
```

Read the HostEvents in order: the Run started, the model planned a `tool-call`, `ApprovalRequested` was emitted, and then the Run parked before tool execution. Every HostEvent has a durable Session `cursor`. A reconnect resumes strictly after that cursor; visible cursor values need not be consecutive because Host intentionally filters internal Runtime events.

## Part 2: Approvals over the wire

The Run is waiting rather than failed. Each `ApprovalRequested` event carries an opaque `event.request.approvalId`; a turn can produce several approval requests, so never construct or predict these tokens. [Suspension as a typed error](/learn/suspension) explains the underlying typed suspension. This script builds `Server.client`, takes the first approval request from the Session stream, and sends that exact token to `client.approvals.resolve`, which calls `POST /runs/:id/approvals/:token` with the human operator identity. Run it again for each later approval request:

**approve.ts**

```typescript
import { Config, Console, Effect, ManagedRuntime, Option, Stream } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { Server } from "generalist/server"

const program = Effect.gen(function* () {
  const sessionId = yield* Config.string("SESSION_ID")
  const client = yield* Server.client({ baseUrl: "http://localhost:4000" })
  const approval = yield* client.events.subscribe({ sessionId }).pipe(
    Stream.filter((event) => event._tag === "ApprovalRequested"),
    Stream.runHead,
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.die("expected the session to emit ApprovalRequested"),
        onSome: Effect.succeed,
      }),
    ),
  )
  if (approval.event._tag !== "ApprovalRequested") {
    return yield* Effect.die("expected an ApprovalRequested Runtime event")
  }

  yield* client.approvals.resolve({
    runId: approval.runId,
    token: approval.event.request.approvalId,
    decision: { _tag: "Approved" },
    operator: "tutorial:human",
  })
  yield* Console.log(`approved ${approval.event.request.capability} for ${approval.runId}`)
})

const runtime = ManagedRuntime.make(FetchHttpClient.layer)
await runtime.runPromise(program)
await runtime.dispose()
```

**Output**

```text
approved web_search for run_1
```

The stream resumes, the tool executes, the second model turn synthesizes, and the run ends. The `Completed` HostEvent carries the cited answer built from the search results. With `OPENROUTER_API_KEY` set, the same frames carry a real model's answer instead.

## Part 3: The FoldKit UI

### Scaffold the web app

**Terminal**

```bash
mkdir web && cd web
bun init -y
bun add effect@4.0.0-rc.112 generalist@0.45.0 foldkit@0.148.2
bun add -d vite
```

**index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Research Agent</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
```

### Wire the chat

`generalist/unstable/foldkit` ships a headless chat submodel that decodes durable HostEvents and projects connection, turn, tool, approval, cancellation, and terminal state. The program embeds `Chat.Model` in its own model, forwards `Chat.subscriptions` with `Subscription.lift`, routes every child action through a `GotChatAction` wrapper, and provides the connection as a layer: `Connection.layerWebSocket`. When `model.chat.run` is `AwaitingApproval`, the view renders Approve and Deny buttons dispatching `Chat.ClickedApprove` and `Chat.ClickedDeny`. Those commands resolve the same durable approval token as Part 2. Host intentionally excludes internal model-response records from the product event stream, so this projection does not currently reconstruct incremental or committed assistant-response rows.

**main.ts**

```typescript
import { Chat, Connection } from "generalist/unstable/foldkit"
import { Cause, Effect, Layer, Schema } from "effect"
import { FetchHttpClient, HttpBody, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { type Command, define, mapMessages } from "foldkit/command"
import type { Document, Html } from "foldkit/html"
import { m } from "foldkit/message"
import { type ApplicationInit, makeApplication, run } from "foldkit/runtime"
import { ts } from "foldkit/schema"
import { type Subscriptions, lift } from "foldkit/subscription"
import { evo } from "foldkit/struct"
import { html } from "../../html"
const SERVER_HTTP_URL = "http://localhost:4000"

const SessionOpening = ts("SessionOpening")
const SessionReady = ts("SessionReady")
const SessionFailed = ts("SessionFailed", { message: Schema.String })

type SessionState = typeof SessionOpening.Type | typeof SessionReady.Type | typeof SessionFailed.Type

const SessionState: Schema.Schema<SessionState> = Schema.Union([SessionOpening, SessionReady, SessionFailed])

const Model = Schema.Struct({
  chat: Chat.Model,
  session: SessionState,
})

type Model = typeof Model.Type

const GotChatAction = m("GotChatAction", { action: Chat.Action })
const OpenedSession = m("OpenedSession", { sessionId: Schema.String })
const FailedOpenSession = m("FailedOpenSession", { reason: Schema.String })

const Message = Schema.Union([GotChatAction, OpenedSession, FailedOpenSession])

type Message = typeof Message.Type

const OpenSession = define("OpenSession", {
  messages: [OpenedSession, FailedOpenSession],
  execute: Effect.gen(function* () {
    const httpClient = yield* Layer.build(FetchHttpClient.layer)
    const response = yield* HttpClient.post(`${SERVER_HTTP_URL}/sessions`, {
      body: HttpBody.jsonUnsafe({}),
    }).pipe(Effect.provideContext(httpClient))
    const body = yield* HttpClientResponse.schemaBodyJson(Schema.Struct({ id: Schema.String }))(response)
    return OpenedSession({ sessionId: body.id })
  }).pipe(
    Effect.scoped,
    Effect.catchCause((cause) => Effect.succeed(FailedOpenSession({ reason: Cause.pretty(cause) }))),
  ),
})

const init: ApplicationInit<Model, Message, void, Connection.Connection> = () => [
  { chat: Chat.initialModel(null), session: SessionOpening() },
  [OpenSession()],
]

type ProgramCommand = Command<Message, never, Connection.Connection>

const asProgramCommands = <Failure>(
  commands: ReadonlyArray<Command<Message, Failure, Connection.Connection>>,
): ReadonlyArray<ProgramCommand> =>
  commands.map((command) => ({
    ...command,
    effect: command.effect.pipe(Effect.catch(() => Effect.die("Chat command failed"))),
  }))

const update = (model: Model, message: Message): readonly [Model, ReadonlyArray<ProgramCommand>] => {
  switch (message._tag) {
    case "OpenedSession":
      return [
        evo(model, {
          chat: (chat) => evo(chat, { sessionId: () => message.sessionId }),
          session: () => SessionReady(),
        }),
        [],
      ]
    case "FailedOpenSession":
      return [evo(model, { session: () => SessionFailed({ message: message.reason }) }), []]
    case "GotChatAction": {
      const [chat, chatCommands] = Chat.update(model.chat, message.action)
      return [
        evo(model, { chat: () => chat }),
        asProgramCommands(mapMessages(chatCommands, (chatAction) => GotChatAction({ action: chatAction }))),
      ]
    }
  }
}

const subscriptions: Subscriptions<Model, Message, Connection.Connection> = lift(Chat.subscriptions)({
  toChildModel: (model: Model) => model.chat,
  toParentMessage: (chatAction) => GotChatAction({ action: chatAction }),
})

const entryView = (entry: Chat.ChatEntry): Html => {
  const h = html<Message>()
  switch (entry._tag) {
    case "UserEntry":
      return h.div([h.Class("self-end rounded-xl bg-blue-600 px-4 py-2 text-white")], [entry.text])
    case "AssistantEntry":
      return h.div([h.Class("self-start whitespace-pre-wrap rounded-xl bg-gray-100 px-4 py-2")], [entry.text])
    case "ToolEntry":
      return h.div(
        [h.Class("self-start rounded-xl border border-dashed px-4 py-2 text-sm text-gray-600")],
        [
          h.div([h.Class("font-mono font-semibold")], [`${entry.name} (${entry.phase})`]),
          h.pre([h.Class("mt-1 overflow-auto text-xs")], [JSON.stringify(entry.params)]),
          ...(entry.outcome._tag === "Completed"
            ? [h.pre([h.Class("mt-1 max-h-40 overflow-auto text-xs")], [JSON.stringify(entry.outcome.result)])]
            : []),
        ],
      )
  }
}

const runStateView = (runState: Chat.RunState): Html => {
  const h = html<Message>()
  switch (runState._tag) {
    case "Idle":
      return h.p([h.Class("text-sm text-gray-500")], ["Ready"])
    case "Running":
      return h.p([h.Class("text-sm text-gray-500")], [`Working on turn ${runState.turn}…`])
    case "AwaitingApproval":
      return h.p([h.Class("text-sm text-amber-700")], ["Waiting for approval"])
    case "Failed":
      return h.p([h.Class("text-sm text-red-700")], [runState.message])
  }
}

const approvalView = (awaitingApproval: Extract<Chat.RunState, { _tag: "AwaitingApproval" }>): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class("rounded-xl border border-amber-400 bg-amber-50 p-4")],
    [
      h.p([h.Class("font-semibold")], [`The agent wants to run ${awaitingApproval.toolName}`]),
      h.pre([h.Class("mt-1 overflow-auto text-xs")], [JSON.stringify(awaitingApproval.params)]),
      h.div(
        [h.Class("mt-3 flex gap-2")],
        [
          h.button(
            [
              h.OnClick(GotChatAction({ action: Chat.ClickedApprove() })),
              h.Class("rounded bg-emerald-600 px-3 py-1 text-white"),
            ],
            ["Approve"],
          ),
          h.button(
            [
              h.OnClick(GotChatAction({ action: Chat.ClickedDeny({ reason: null }) })),
              h.Class("rounded bg-red-600 px-3 py-1 text-white"),
            ],
            ["Deny"],
          ),
        ],
      ),
    ],
  )
}

const footerView = (model: Model): Html => {
  const h = html<Message>()
  const isReady = model.session._tag === "SessionReady"
  const isRunning = model.chat.run._tag === "Running" || model.chat.run._tag === "AwaitingApproval"
  return h.form(
    [h.OnSubmit(GotChatAction({ action: Chat.SubmittedMessage() })), h.Class("flex gap-2 border-t p-4")],
    [
      h.input([
        h.Value(model.chat.draft),
        h.OnInput((text) => GotChatAction({ action: Chat.ChangedDraft({ text }) })),
        h.Placeholder(isReady ? "Ask a research question…" : "Opening a session…"),
        h.Class("flex-1 rounded border px-3 py-2"),
      ]),
      isRunning
        ? h.button(
            [
              h.Type("button"),
              h.OnClick(GotChatAction({ action: Chat.ClickedCancel() })),
              h.Class("rounded bg-gray-200 px-4 py-2"),
            ],
            ["Cancel"],
          )
        : h.button([h.Type("submit"), h.Class("rounded bg-blue-600 px-4 py-2 text-white")], ["Send"]),
    ],
  )
}

const view = (model: Model): Document => {
  const h = html<Message>()
  const approval = model.chat.run._tag === "AwaitingApproval" ? [approvalView(model.chat.run)] : []
  return {
    title: "Research Agent",
    body: h.div(
      [h.Class("mx-auto flex h-screen max-w-2xl flex-col")],
      [
        h.header(
          [h.Class("border-b px-4 py-3")],
          [h.h1([h.Class("font-semibold")], [`Research agent — ${model.chat.connection}`])],
        ),
        h.div(
          [h.Class("flex flex-1 flex-col gap-3 overflow-y-auto p-4")],
          [...model.chat.entries.map(entryView), runStateView(model.chat.run), ...approval],
        ),
        footerView(model),
      ],
    ),
  }
}

const resources = Connection.layerWebSocket({ baseUrl: "http://localhost:4000" }).pipe(
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
  Layer.provide(FetchHttpClient.layer),
)

const application = makeApplication({
  Model,
  init,
  update,
  view,
  subscriptions,
  resources,
  container: document.getElementById("root"),
})

run(application)
```

Run `bunx vite` next to the `index.html` and open the printed URL.

## You have built the whole thing

Ask a question in the browser; the Agent pauses with an approval card; click Approve; watch the tool and Run reach their terminal states. Set `OPENROUTER_API_KEY` and restart the server to run the same flow against a real model.

## Next steps

- The transport in depth (replay cursors, snapshots, busy sessions): [How to serve an agent over SSE and WebSocket](/guides/serve-transport).
- The chat model in depth (semantic entries, run state, reconnect states): [How to build a chat UI with FoldKit](/guides/foldkit-chat).
- Where durability lives when runs must survive restarts: [Core and Runtime](/learn/native-runtime).
