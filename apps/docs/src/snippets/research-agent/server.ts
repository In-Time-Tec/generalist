import { Agent, AgentManifest, Approvals, Chat, ModelMiddleware, Pins, ToolExecutor } from "@batonfx/core"
import { ExecutionHost, ExecutableManifest, ExecutableResolver, RunStore, Runtime } from "@batonfx/runtime"
import { Sse, Ws } from "@batonfx/transport"
import { Effect, Layer, Schema } from "effect"
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Persistence } from "effect/unstable/persistence"
import { agent } from "./agent"
import { modelLayer } from "./model"
import { cannedLayer } from "./search-provider"
import { toolkit, toolkitLayer, webSearchTool } from "./tools"

const pinnedAgent = AgentManifest.fromLiveAgent(agent, {
  model: Pins.makeModel({ fixture: "research-agent", revision: "1" }),
  tools: [{ name: webSearchTool.name, pin: Pins.makeCapability({ tool: webSearchTool.name, version: "1" }) }],
  skills: [],
  services: [],
  policy: { _tag: "Portable", policy: agent.policy.snapshot! },
  budget: agent.budget ?? {},
  children: [],
})
const executable = ExecutableManifest.make({ root: pinnedAgent.pin, entries: [{ _tag: "Agent", ...pinnedAgent }] })
const registrations = executable.manifest.entries.flatMap((entry) =>
  entry._tag === "Agent"
    ? [
        entry.manifest.model,
        ...entry.manifest.tools.map(({ pin }) => pin),
        ...(entry.manifest.policy._tag === "Pinned" ? [entry.manifest.policy.pin] : []),
      ].map((pin) => ({ pin, codec: "docs", version: "1", payload: { fixture: "research-agent" } }))
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

const RunPathInput = Schema.Struct({
  pathParams: Schema.Struct({ id: Schema.String }),
})

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

const errorResponse = (status: number) => (error: unknown) =>
  Effect.succeed(HttpServerResponse.jsonUnsafe({ message: String(error) }, { status }))

const executeRun = (runId: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    const host = yield* ExecutionHost.ExecutionHost
    yield* host.execute(yield* store.claimExecution({ runId, ownerId: "research-agent-server" }))
  })

const routesLayer = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add("GET", "/ws", Ws.handle)

    yield* router.add(
      "GET",
      "/runs/:id/events",
      HttpRouter.schemaNoBody(RunPathInput).pipe(
        Effect.flatMap(({ pathParams }) =>
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest
            return yield* Sse.respond({ runId: pathParams.id, request, keepAlive: "5 seconds" })
          }),
        ),
        Effect.catchTag("@batonfx/transport/InvalidCursor", errorResponse(400)),
      ),
    )

    yield* router.add(
      "POST",
      "/runs",
      HttpRouter.schemaJson(StartRunInput).pipe(
        Effect.flatMap(({ body }) =>
          Runtime.Runtime.use((runtime) =>
            runtime.start({
              ...(body.runId === undefined ? {} : { runId: body.runId }),
              executable,
              registrations,
              sessionId: body.sessionId,
              idempotencyKey: body.idempotencyKey,
              prompt: body.prompt,
            }),
          ),
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
  }),
)

export const approvalsLayer = Approvals.layerTest({
  resolve: (request) => Effect.succeed({ ...request, token: `approve-${request.call.id}` }),
}) as Layer.Layer<Approvals.Approvals>

export const toolExecutorLayer = Layer.unwrap(
  Effect.gen(function* () {
    const handlers = yield* Layer.build(toolkitLayer)
    const handledToolkit = yield* toolkit.pipe(Effect.provideContext(handlers))
    return ToolExecutor.layerToolkit(handledToolkit)
  }),
).pipe(Layer.provide(cannedLayer)) as Layer.Layer<ToolExecutor.ToolExecutor>

const persistenceLayer = Chat.layerPersisted({ storeId: "research-agent" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)

const agentServices = Layer.mergeAll(
  modelLayer,
  toolExecutorLayer,
  toolkitLayer.pipe(Layer.provideMerge(cannedLayer)),
  approvalsLayer,
  ModelMiddleware.layerIdentity,
  persistenceLayer,
)

export const runtimeLayer: Layer.Layer<Runtime.Runtime | RunStore.RunStore | ExecutionHost.ExecutionHost> =
  Runtime.layerMemory({
    resolver: ExecutableResolver.makeStatic([{ executable, agent: Agent.close(agent, agentServices) }]),
    addresses: [],
  })

export const httpLayer: Layer.Layer<never, never, HttpServer.HttpServer> = HttpRouter.serve(
  Layer.mergeAll(routesLayer, HttpRouter.cors()),
).pipe(Layer.provide(runtimeLayer))
