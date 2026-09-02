import { Effect, Layer, Schema, Stream } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { SSE, WebSocket } from "generalist/unstable/transport"

const searchTool = Tool.make("web_search", {
  description: "Search the web",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(searchTool)

const agent = Agent.make({ name: "research-agent", toolkit })

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "Answer." })),
  }),
)

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

const agentServices = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ web_search: () => Effect.succeed("results") }),
  ToolExecutor.layerTest({
    execute: () => Effect.succeed({ _tag: "Success", result: "results", encodedResult: "results" }),
  }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtimeLayer = Runtime.layerMemory({
  addresses: [],
}).pipe(Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)))

const registrationLayer = Layer.effectDiscard(Runtime.Runtime.use((runtime) => runtime.register(agent))).pipe(
  Layer.orDie,
)

const appLayer = Layer.mergeAll(routesLayer, HttpRouter.cors(), registrationLayer)

export const serverLayer: Layer.Layer<never, never, HttpServer.HttpServer> = HttpRouter.serve(appLayer, {
  disableLogger: false,
}).pipe(Layer.provideMerge(runtimeLayer), Layer.provideMerge(agentServices), Layer.provideMerge(FetchHttpClient.layer))
