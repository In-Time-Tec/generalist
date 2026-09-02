import { layer } from "@effect/platform-bun/BunHttpServer"
import { runMain } from "@effect/platform-bun/BunRuntime"
import { Agent, AgentManifest, Approvals, ModelMiddleware, Permissions, Pins, ToolExecutor } from "generalist"
import { ExecutableManifest, ExecutableResolver, RunExecutor, RunStore, Runtime } from "generalist/runtime"
import { SSE, WebSocket } from "generalist/unstable/transport"
import { Config, Effect, Layer, Schema } from "effect"
import { FetchHttpClient, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { agent } from "./agent"
import { layerOrDeterministic } from "./model"
import { toolkit, toolkitLayer, webSearchTool } from "./tools"
import { layer as webSearchLayer } from "./web-search"

const pinnedAgent = AgentManifest.fromLiveAgent(agent, {
  model: Pins.makeModel({ provider: "openrouter", model: "openai/gpt-4o-mini" }),
  tools: [{ name: webSearchTool.name, pin: Pins.makeCapability({ tool: webSearchTool.name, version: "1" }) }],
  skills: [],
  services: [],
  policy: { _tag: "Portable", policy: agent.policy.snapshot! },
  budget: agent.budget ?? {},
  children: [],
})
const executable = ExecutableManifest.make({
  root: pinnedAgent.pin,
  entries: [{ _tag: "Agent", ...pinnedAgent }],
})
const registrations = executable.manifest.entries.flatMap((entry) =>
  entry._tag === "Agent"
    ? [
        entry.manifest.model,
        ...entry.manifest.tools.map(({ pin }) => pin),
        ...(entry.manifest.policy._tag === "Pinned" ? [entry.manifest.policy.pin] : []),
      ].map((pin) => ({ pin, codec: "example", version: "1", payload: { fixture: "deep-research-agent" } }))
    : [],
)

const StartRunInput = Schema.Struct({
  body: Schema.Struct({
    runId: Schema.optionalKey(Schema.String),
    sessionId: Schema.String,
    idempotencyKey: Schema.String,
    prompt: Schema.String,
  }),
})

const RunPathInput = Schema.Struct({ pathParams: Schema.Struct({ id: Schema.String }) })

const RespondInput = Schema.Struct({
  pathParams: Schema.Struct({ id: Schema.String }),
  body: Schema.Struct({
    waitId: Schema.String,
    resolution: Schema.Union([
      Schema.TaggedStruct("Approved", {}),
      Schema.TaggedStruct("Denied", { reason: Schema.optionalKey(Schema.String) }),
    ]),
  }),
})

interface ResponseFailure {
  readonly message: string
}

const errorResponse = (status: number) => (error: ResponseFailure) =>
  Effect.succeed(HttpServerResponse.jsonUnsafe({ message: error.message }, { status }))

const executeRun = (runId: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    const host = yield* RunExecutor.RunExecutor
    const claim = yield* store.claimExecution({ runId, ownerId: "deep-research-server" })
    yield* host.execute(claim)
  })

/** @experimental */
const routesLayer = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add("GET", "/ws", WebSocket.handle)

    yield* router.add(
      "GET",
      "/runs/:id/events",
      HttpRouter.schemaNoBody(RunPathInput).pipe(
        Effect.flatMap(({ pathParams }) =>
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest
            return yield* SSE.respond({ runId: pathParams.id, request, keepAlive: "5 seconds" })
          }),
        ),
        Effect.catchTag("generalist/transport/InvalidCursor", errorResponse(400)),
      ),
    )

    yield* router.add(
      "POST",
      "/runs",
      HttpRouter.schemaJson(StartRunInput).pipe(
        Effect.flatMap(({ body }) =>
          Runtime.Runtime.use((runtime) => {
            const input = {
              executable,
              registrations,
              sessionId: body.sessionId,
              idempotencyKey: body.idempotencyKey,
              prompt: body.prompt,
            }
            return runtime.start(body.runId === undefined ? input : { ...input, runId: body.runId })
          }),
        ),
        Effect.tap((receipt) => (receipt.duplicate ? Effect.void : executeRun(receipt.runId))),
        Effect.map((receipt) => HttpServerResponse.jsonUnsafe(receipt, { status: 202 })),
        Effect.catch(errorResponse(400)),
      ),
    )

    yield* router.add(
      "POST",
      "/runs/:id/respond",
      HttpRouter.schemaJson(RespondInput).pipe(
        Effect.flatMap(({ pathParams, body }) =>
          Runtime.Runtime.use((runtime) =>
            runtime.respond({ runId: pathParams.id, waitId: body.waitId, resolution: body.resolution }),
          ).pipe(Effect.andThen(executeRun(pathParams.id))),
        ),
        Effect.map(() => HttpServerResponse.jsonUnsafe({ status: "accepted" }, { status: 202 })),
        Effect.catch(errorResponse(400)),
      ),
    )

    yield* router.add(
      "POST",
      "/runs/:id/cancel",
      HttpRouter.schemaNoBody(RunPathInput).pipe(
        Effect.flatMap(({ pathParams }) => Runtime.Runtime.use((runtime) => runtime.cancel({ runId: pathParams.id }))),
        Effect.map(() => HttpServerResponse.jsonUnsafe({ status: "cancellation-requested" }, { status: 202 })),
        Effect.catch(errorResponse(400)),
      ),
    )
  }),
)

/** @experimental */
export const toolkitHandlersLayer = toolkitLayer.pipe(Layer.provideMerge(webSearchLayer))

const toolExecutorLayer = Layer.unwrap(
  Effect.gen(function* () {
    const handlers = yield* Layer.build(toolkitHandlersLayer)
    const handledToolkit = yield* toolkit.pipe(Effect.provideContext(handlers))
    return ToolExecutor.layerToolkit(handledToolkit)
  }),
)

/** @experimental */
export const modelLayer = layerOrDeterministic({
  model: "openai/gpt-4o-mini",
  apiKey: Config.redacted("OPENROUTER_API_KEY"),
})

const agentServices = Layer.mergeAll(
  modelLayer,
  toolExecutorLayer,
  toolkitHandlersLayer,
  Permissions.layerAllowAll,
  Approvals.layerTest({
    resolve: (request) => Effect.succeed({ ...request, token: `approve-${request.call.id}` }),
  }),
  ModelMiddleware.layerIdentity,
)

/** @experimental */
const runtimeLayer = Runtime.layerMemory({
  addresses: [],
}).pipe(
  Layer.provide(
    ExecutableResolver.layerStatic([{ executable, agent: Agent.close(agent, agentServices) }]).pipe(Layer.orDie),
  ),
)

/** @experimental */
const appLayer = Layer.mergeAll(routesLayer, HttpRouter.cors())

/** @experimental */
const serverLayer = (port: number) =>
  HttpRouter.serve(appLayer, { disableLogger: false }).pipe(
    Layer.provideMerge(layer({ port })),
    Layer.provideMerge(runtimeLayer),
    Layer.provideMerge(FetchHttpClient.layer),
  )

/** @experimental */
export const main = Effect.fn("DeepResearchAgent.Server.main")(function* () {
  const port = yield* Config.port("PORT").pipe(Config.withDefault(4000))
  yield* Effect.log(`deep-research-agent server listening on http://localhost:${port} (ws at /ws)`)
  return yield* Layer.launch(serverLayer(port))
})

if (import.meta.main) {
  runMain(main())
}
