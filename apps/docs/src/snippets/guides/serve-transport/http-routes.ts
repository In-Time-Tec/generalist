import { Effect, Layer, Schema, Stream } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Persistence } from "effect/unstable/persistence"
import {
  Agent,
  AgentManifest,
  Approvals,
  Chat,
  LanguageModel,
  ModelMiddleware,
  Pins,
  Response,
  Tool,
  ToolExecutor,
  Toolkit,
} from "@batonfx/core"
import { ExecutionHost, ExecutableManifest, ExecutableResolver, RunStore, Runtime } from "@batonfx/runtime"
import { Sse, Ws } from "@batonfx/transport"

const searchTool = Tool.make("web_search", {
  description: "Search the web",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(searchTool)

const agent = Agent.make({ name: "research-agent", toolkit })
const pinnedAgent = AgentManifest.fromLiveAgent(agent, {
  model: Pins.makeModel({ fixture: "research-agent", revision: "1" }),
  tools: [{ name: searchTool.name, pin: Pins.makeCapability({ tool: searchTool.name, version: "1" }) }],
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

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "Answer." })),
  }),
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
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  Chat.layerPersisted({ storeId: "research-agent" }).pipe(Layer.provide(Persistence.layerBackingMemory)),
)

const runtimeLayer = Runtime.layerMemory({
  resolver: ExecutableResolver.makeStatic([{ executable, agent: Agent.close(agent, agentServices) }]),
  addresses: [],
})

const appLayer = Layer.mergeAll(routesLayer, HttpRouter.cors())

export const serverLayer: Layer.Layer<never, never, HttpServer.HttpServer> = HttpRouter.serve(appLayer, {
  disableLogger: false,
}).pipe(Layer.provideMerge(runtimeLayer), Layer.provideMerge(FetchHttpClient.layer))
