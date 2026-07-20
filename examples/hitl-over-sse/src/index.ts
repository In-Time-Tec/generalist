import { Console, Effect, Layer, Schema, Stream } from "effect"
import { Persistence } from "effect/unstable/persistence"
import { Agent, Approvals, Chat, LanguageModel, ModelMiddleware, Response, Tool, Toolkit } from "@batonfx/core"
import { SessionRegistry, Sse } from "@batonfx/transport"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const deployTool = Tool.make("deploy", {
  description: "Deploy a service",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const toolkit = Toolkit.make(deployTool)
const agent = Agent.make({ name: "release-agent", toolkit })
const toolkitLayer = toolkit.toLayer({ deploy: () => Effect.die("approval should suspend before execution") })
const persistenceLayer = Chat.layerPersisted({ storeId: "hitl-over-sse" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)

const collectRun = (sessionId: string) =>
  SessionRegistry.SessionRegistry.use((registry) =>
    registry.attach(sessionId).pipe(
      Stream.takeUntil((frame) => frame._tag === "Ended"),
      Stream.runCollect,
    ),
  )

const program = Effect.gen(function* () {
  const registry = yield* SessionRegistry.SessionRegistry
  yield* registry.open({ sessionId: "release-1" })
  yield* registry.send("release-1", "Deploy api")
  const frames = yield* collectRun("release-1")
  const sseSchema = Sse.streamSuccess(toolkit)
  yield* Console.log(
    `${sseSchema._tag}: ${Array.from(frames)
      .map((frame) => frame._tag)
      .join(" -> ")}`,
  )
}).pipe(
  Effect.provide(
    SessionRegistry.layerMemory({ agent }).pipe(
      Layer.provide(
        Layer.mergeAll(
          modelLayer(() =>
            Stream.make(
              Response.makePart("tool-call", {
                id: "deploy-1",
                name: "deploy",
                params: { service: "api" },
                providerExecuted: false,
              }),
            ),
          ),
          toolkitLayer,
          Approvals.testLayer({
            resolve: (pending) => Effect.succeed({ ...pending, token: "approve-deploy-1" }),
          }),
          ModelMiddleware.layerIdentity,
          persistenceLayer,
        ),
      ),
    ),
  ),
)

await Effect.runPromise(program)
