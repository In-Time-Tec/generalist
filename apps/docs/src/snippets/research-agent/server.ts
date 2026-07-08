import { Approvals, ModelMiddleware, ToolExecutor } from "@batonfx/core"
import { SessionRegistry, Sse, Ws } from "@batonfx/transport"
import { Effect, Layer, Schema } from "effect"
import * as Ai from "effect/unstable/ai"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Persistence } from "effect/unstable/persistence"
import { agent } from "./agent"
import { modelLayer } from "./model"
import * as SearchProvider from "./search-provider"
import { toolkit, toolkitLayer } from "./tools"

const OpenSessionInput = Schema.Struct({
  body: Schema.Struct({ sessionId: Schema.optionalKey(Schema.String) }),
})

const SendMessageInput = Schema.Struct({
  pathParams: Schema.Struct({ id: Schema.String }),
  body: Schema.Struct({ prompt: Schema.String }),
})

const SessionPathInput = Schema.Struct({
  pathParams: Schema.Struct({ id: Schema.String }),
})

const errorResponse = (status: number) => (error: { readonly message: string }) =>
  Effect.succeed(HttpServerResponse.jsonUnsafe({ message: error.message }, { status }))

export const routesLayer = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add("GET", "/ws", Ws.handle(toolkit))

    yield* router.add(
      "GET",
      "/sessions/:id/events",
      HttpRouter.schemaNoBody(SessionPathInput).pipe(
        Effect.flatMap(({ pathParams }) =>
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest
            return yield* Sse.respond(toolkit)({ sessionId: pathParams.id, request, keepAlive: "5 seconds" })
          }),
        ),
        Effect.catchTag("@batonfx/transport/SessionError", errorResponse(400)),
      ),
    )

    yield* router.add(
      "POST",
      "/sessions",
      HttpRouter.schemaJson(OpenSessionInput).pipe(
        Effect.flatMap(({ body }) =>
          SessionRegistry.SessionRegistry.use((registry) =>
            registry.open(body.sessionId === undefined ? {} : { sessionId: body.sessionId }),
          ),
        ),
        Effect.map((info) => HttpServerResponse.jsonUnsafe(info)),
        Effect.catchTag("@batonfx/transport/SessionError", errorResponse(400)),
      ),
    )

    yield* router.add(
      "POST",
      "/sessions/:id/messages",
      HttpRouter.schemaJson(SendMessageInput).pipe(
        Effect.flatMap(({ pathParams, body }) =>
          SessionRegistry.SessionRegistry.use((registry) => registry.send(pathParams.id, body.prompt)),
        ),
        Effect.map(() => HttpServerResponse.jsonUnsafe({ status: "accepted" })),
        Effect.catchTag("@batonfx/transport/SessionError", errorResponse(400)),
        Effect.catchTag("@batonfx/transport/SessionBusy", (error) =>
          errorResponse(409)({ message: `Session ${error.sessionId} is busy` }),
        ),
      ),
    )
  }),
)

export const approvalsLayer = Approvals.testLayer({
  check: (request) => Effect.succeed({ _tag: "Pending", token: `approve-${request.call.id}` }),
})

export const toolExecutorLayer = Layer.unwrap(
  Effect.gen(function* () {
    const handledToolkit = yield* toolkit.pipe(Effect.provide(toolkitLayer))
    return ToolExecutor.fromToolkit(handledToolkit)
  }),
).pipe(Layer.provide(SearchProvider.cannedLayer))

const persistenceLayer = Ai.Chat.layerPersisted({ storeId: "research-agent" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)

export const sessionRegistryLayer = SessionRegistry.layerMemory({ agent, stripTranscripts: true }).pipe(
  Layer.provide(
    Layer.mergeAll(modelLayer, toolExecutorLayer, approvalsLayer, ModelMiddleware.identityLayer, persistenceLayer),
  ),
)

export const appLayer = Layer.mergeAll(routesLayer, HttpRouter.cors())
