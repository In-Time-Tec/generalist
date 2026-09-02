import { Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { SSE, WebSocket } from "generalist/unstable/transport"
import { Effect, Layer, Schema } from "effect"
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { agent } from "./agent"
import { modelLayer } from "./model"
import { toolkit, toolkitLayer } from "./tools"
import { cannedLayer } from "./web-search"

const StartRunInput = Schema.Struct({
  body: Schema.Struct({
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
          Runtime.Runtime.use((runtime) =>
            runtime.start(agent, body.prompt, {
              sessionId: body.sessionId,
              idempotencyKey: body.idempotencyKey,
            }),
          ),
        ),
        Effect.map((handle) => HttpServerResponse.jsonUnsafe({ runId: handle.runId }, { status: 202 })),
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
          ),
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
  Permissions.layerAllowAll,
  approvalsLayer,
  ModelMiddleware.layerIdentity,
)

const runtimeLayer = Runtime.layerMemory({ addresses: [] }).pipe(
  Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
)

const registrationLayer = Layer.effectDiscard(Runtime.Runtime.use((runtime) => runtime.register(agent))).pipe(
  Layer.orDie,
)

export const httpLayer: Layer.Layer<never, never, HttpServer.HttpServer> = HttpRouter.serve(
  Layer.mergeAll(routesLayer, HttpRouter.cors(), registrationLayer),
).pipe(Layer.provideMerge(runtimeLayer), Layer.provideMerge(agentServices))
