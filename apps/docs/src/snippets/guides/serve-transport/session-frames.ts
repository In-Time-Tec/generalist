import { Console, Effect, Layer, Stream } from "effect"
import { Persistence } from "effect/unstable/persistence"
import { Agent, Approvals, Chat, LanguageModel, ModelMiddleware, Response, ToolExecutor } from "@batonfx/core"
import { SessionRegistry } from "@batonfx/transport"

const agent = Agent.make({ name: "chat-agent" })

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "Hello from Baton." })),
  }),
)

const persistenceLayer = Chat.layerPersisted({ storeId: "serve-transport-demo" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)

const registryLayer = SessionRegistry.layerMemory({ agent }).pipe(
  Layer.provide(
    Layer.mergeAll(
      modelLayer,
      ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
      Approvals.layerAutoApprove,
      ModelMiddleware.layerIdentity,
      persistenceLayer,
    ),
  ),
)

const collectRun = (sessionId: string, afterSeq?: number) =>
  SessionRegistry.SessionRegistry.use((registry) =>
    registry.attach(sessionId, afterSeq).pipe(
      Stream.takeUntil((frame) => frame._tag === "Ended"),
      Stream.runCollect,
    ),
  )

const tags = (frames: Iterable<{ readonly seq: number; readonly _tag: string }>) =>
  Array.from(frames)
    .map((frame) => `${frame.seq}:${frame._tag}`)
    .join(" ")

const program = Effect.gen(function* () {
  const registry = yield* SessionRegistry.SessionRegistry
  yield* registry.open({ sessionId: "docs-1" })
  yield* registry.send("docs-1", "Say hello")
  const live = yield* collectRun("docs-1")
  yield* Console.log(`live:   ${tags(live)}`)
  const replayed = yield* collectRun("docs-1", 2)
  yield* Console.log(`replay: ${tags(replayed)}`)
}).pipe(Effect.provide(registryLayer))

await Effect.runPromise(program)
