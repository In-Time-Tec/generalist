import { Approvals, Chat, ModelMiddleware, ToolExecutor } from "@batonfx/core"
import { Address, AgentHost, AgentRef, RunStore, Runtime } from "@batonfx/runtime"
import { Sse, Ws } from "@batonfx/transport"
import { Effect, Layer, Schema } from "effect"
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Persistence } from "effect/unstable/persistence"
import { agent } from "./agent"
import { modelLayer } from "./model"
import { cannedLayer } from "./search-provider"
import { toolkit, toolkitLayer } from "./tools"

const agentRef = AgentRef.make({ id: "research-agent", version: "1", digest: "sha256:research-agent" })
const agentAddress = Address.make("agent:research")

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
  }),
)

export const approvalsLayer = Approvals.layerTest({
  resolve: (request) => Effect.succeed({ ...request, token: `approve-${request.call.id}` }),
}) as Layer.Layer<Approvals.Approvals>

export const toolExecutorLayer = Layer.unwrap(
  Effect.gen(function* () {
    const handledToolkit = yield* toolkit.pipe(Effect.provide(toolkitLayer))
    return ToolExecutor.layerToolkit(handledToolkit)
  }),
).pipe(Layer.provide(cannedLayer)) as Layer.Layer<ToolExecutor.ToolExecutor>

const persistenceLayer = Chat.layerPersisted({ storeId: "research-agent" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)

const agentServices = Layer.mergeAll(
  modelLayer,
  toolExecutorLayer,
  approvalsLayer,
  ModelMiddleware.layerIdentity,
  persistenceLayer,
)

export const runtimeLayer: Layer.Layer<Runtime.Runtime | RunStore.RunStore | AgentHost.AgentHost> = Runtime.layerMemory(
  {
    agents: [{ ref: agentRef, agent, services: agentServices }],
    addresses: [{ address: agentAddress, agent: agentRef }],
  },
)

export const httpLayer: Layer.Layer<never, never, HttpServer.HttpServer> = HttpRouter.serve(
  Layer.mergeAll(routesLayer, HttpRouter.cors()),
).pipe(Layer.provide(runtimeLayer))
