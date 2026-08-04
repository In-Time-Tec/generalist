import { Effect, Layer, Schema, Stream } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Persistence } from "effect/unstable/persistence"
import {
  Agent,
  Approvals,
  Chat,
  LanguageModel,
  ModelMiddleware,
  Response,
  Tool,
  ToolExecutor,
  Toolkit,
} from "@batonfx/core"
import { Address, AgentHost, AgentRef, RunStore, Runtime } from "@batonfx/runtime"
import { Sse, Ws } from "@batonfx/transport"

const searchTool = Tool.make("web_search", {
  description: "Search the web",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(searchTool)

const agent = Agent.make({ name: "research-agent", toolkit })
const agentRef = AgentRef.make({ id: "research-agent", version: "1", digest: "sha256:research-agent" })
const agentAddress = Address.make("agent:research")

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "Answer." })),
  }),
)

const SendMessageInput = Schema.Struct({
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
    const host = yield* AgentHost.AgentHost
    yield* host.execute(yield* store.claimExecution({ runId, ownerId: "http-server" }))
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
      HttpRouter.schemaJson(SendMessageInput).pipe(
        Effect.flatMap(({ body }) =>
          Runtime.Runtime.use((runtime) =>
            runtime.send({
              ...(body.runId === undefined ? {} : { runId: body.runId }),
              to: agentAddress,
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
  ToolExecutor.layerTest({
    execute: () => Effect.succeed({ _tag: "Success", result: "results", encodedResult: "results" }),
  }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  Chat.layerPersisted({ storeId: "research-agent" }).pipe(Layer.provide(Persistence.layerBackingMemory)),
)

const runtimeLayer = Runtime.layerMemory({
  agents: [{ ref: agentRef, agent, services: agentServices }],
  addresses: [{ address: agentAddress, agent: agentRef }],
})

const appLayer = Layer.mergeAll(routesLayer, HttpRouter.cors())

export const serverLayer: Layer.Layer<never, never, HttpServer.HttpServer> = HttpRouter.serve(appLayer, {
  disableLogger: false,
}).pipe(Layer.provideMerge(runtimeLayer), Layer.provideMerge(FetchHttpClient.layer))
