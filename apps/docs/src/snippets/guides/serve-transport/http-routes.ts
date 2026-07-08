import { Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { FetchHttpClient, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Persistence } from "effect/unstable/persistence"
import { Agent, Approvals, ModelMiddleware, ToolExecutor } from "@batonfx/core"
import { SessionRegistry, Sse, Ws } from "@batonfx/transport"

const searchTool = Ai.Tool.make("web_search", {
  description: "Search the web",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.String,
})

const toolkit = Ai.Toolkit.make(searchTool)

const agent = Agent.make({ name: "research-agent", toolkit })

const modelLayer = Layer.effect(
  Ai.LanguageModel.LanguageModel,
  Ai.LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => Stream.make(Ai.Response.makePart("text-delta", { id: "assistant", delta: "Answer." })),
  }),
)

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

const routesLayer = HttpRouter.use((router) =>
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
      HttpRouter.schemaNoBody(SessionPathInput).pipe(
        Effect.flatMap(({ pathParams }) =>
          SessionRegistry.SessionRegistry.use((registry) => registry.interrupt(pathParams.id)),
        ),
        Effect.map(() => HttpServerResponse.jsonUnsafe({ status: "cancelled" })),
        Effect.catchTag("@batonfx/transport/SessionError", errorResponse(400)),
      ),
    )
  }),
)

const sessionRegistryLayer = SessionRegistry.layerMemory({ agent }).pipe(
  Layer.provide(
    Layer.mergeAll(
      modelLayer,
      ToolExecutor.testLayer({
        execute: () => Effect.succeed({ _tag: "Success", result: "results", encodedResult: "results" }),
      }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
      Ai.Chat.layerPersisted({ storeId: "research-agent" }).pipe(Layer.provide(Persistence.layerBackingMemory)),
    ),
  ),
)

const appLayer = Layer.mergeAll(routesLayer, HttpRouter.cors())

export const serverLayer = HttpRouter.serve(appLayer, { disableLogger: false }).pipe(
  Layer.provideMerge(sessionRegistryLayer),
  Layer.provideMerge(FetchHttpClient.layer),
)
