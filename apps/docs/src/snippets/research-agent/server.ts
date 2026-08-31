import { Agent, AgentManifest, Approvals, ModelMiddleware, Permissions, Pins, ToolExecutor } from "generalist"
import { ExecutableManifest, ExecutableResolver, RunExecutor, RunStore, Runtime } from "generalist/runtime"
import { SSE, WebSocket } from "generalist/transport"
import { Effect, Layer, Schema } from "effect"
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { agent } from "./agent"
import { modelLayer } from "./model"
import { toolkit, toolkitLayer, webSearchTool } from "./tools"
import { cannedLayer } from "./web-search"

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

const errorResponse = (status: number) => (error: Error) =>
  Effect.succeed(HttpServerResponse.jsonUnsafe({ message: error.message }, { status }))

const executeRun = (runId: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    const host = yield* RunExecutor.RunExecutor
    yield* host.execute(yield* store.claimExecution({ runId, ownerId: "research-agent-server" }))
  })

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
            if (body.runId !== undefined) Object.assign(input, { runId: body.runId })
            return runtime.start(input)
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
  }),
)

export const approvalsLayer: Layer.Layer<Approvals.Approvals> = Approvals.layerTest({
  resolve: (request) => Effect.succeed({ ...request, token: `approve-${request.call.id}` }),
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
  approvalsLayer,
  ModelMiddleware.layerIdentity,
)

export const runtimeLayer: Layer.Layer<Runtime.Runtime | RunStore.RunStore | RunExecutor.RunExecutor> =
  Runtime.layerMemory({ addresses: [] }).pipe(
    Layer.provide(
      ExecutableResolver.layerStatic([{ executable, agent: Agent.close(agent, agentServices) }]).pipe(Layer.orDie),
    ),
  )

export const httpLayer: Layer.Layer<never, never, HttpServer.HttpServer> = HttpRouter.serve(
  Layer.mergeAll(routesLayer, HttpRouter.cors()),
).pipe(Layer.provide(runtimeLayer))
