import { layer } from "@effect/platform-bun/BunHttpServer"
import { runMain } from "@effect/platform-bun/BunRuntime"
import { Approvals, Chat, ModelMiddleware } from "@batonfx/core"
import { SessionRegistry, Sse, Ws } from "@batonfx/transport"
import { Config, Effect, Layer, Schema } from "effect"
import { FetchHttpClient, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Persistence } from "effect/unstable/persistence"
import { agent } from "./agent"
import { layerOrDeterministic } from "./model"
import { searchProviderLayer } from "./search-provider"
import { toolkit, toolkitLayer } from "./tools"

const OpenSessionInput = Schema.Struct({
  body: Schema.Struct({ sessionId: Schema.optionalKey(Schema.String) }),
})

const SendMessageInput = Schema.Struct({
  pathParams: Schema.Struct({ id: Schema.String }),
  body: Schema.Struct({ prompt: Schema.String }),
})

const CancelInput = Schema.Struct({
  pathParams: Schema.Struct({ id: Schema.String }),
})

const SessionPathInput = Schema.Struct({
  pathParams: Schema.Struct({ id: Schema.String }),
})

const errorResponse = (status: number) => (error: { readonly message: string }) =>
  Effect.succeed(HttpServerResponse.jsonUnsafe({ message: error.message }, { status }))

/** @experimental */
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

    yield* router.add(
      "POST",
      "/sessions/:id/cancel",
      HttpRouter.schemaNoBody(CancelInput).pipe(
        Effect.flatMap(({ pathParams }) =>
          SessionRegistry.SessionRegistry.use((registry) => registry.interrupt(pathParams.id)),
        ),
        Effect.map(() => HttpServerResponse.jsonUnsafe({ status: "cancelled" })),
        Effect.catchTag("@batonfx/transport/SessionError", errorResponse(400)),
      ),
    )
  }),
)

const persistenceLayer = Chat.layerPersisted({ storeId: "deep-research-agent" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)

/** @experimental */
export const toolkitHandlersLayer = toolkitLayer.pipe(Layer.provideMerge(searchProviderLayer))

/** @experimental */
export const modelLayer = layerOrDeterministic({
  model: "openai/gpt-4o-mini",
  apiKey: Config.redacted("OPENROUTER_API_KEY"),
})

/** @experimental */
export const sessionRegistryLayer = SessionRegistry.layerMemory({ agent }).pipe(
  Layer.provide(
    Layer.mergeAll(
      modelLayer,
      toolkitHandlersLayer,
      Approvals.layerAutoApprove,
      ModelMiddleware.layerIdentity,
      persistenceLayer,
    ),
  ),
)

/** @experimental */
export const appLayer = Layer.mergeAll(routesLayer, HttpRouter.cors())

// `HttpRouter.add` wraps route-level requirements (SessionRegistry here) in
// an internal marker type that only `HttpRouter.serve` unwraps back into a
// plain service tag. Route-level dependencies are provided AFTER `serve`,
// not on the raw route layer — mirrors relay's `server-app.ts`.
/** @experimental */
export const serverLayer = (port: number) =>
  HttpRouter.serve(appLayer, { disableLogger: false }).pipe(
    Layer.provideMerge(layer({ port })),
    Layer.provideMerge(sessionRegistryLayer),
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
