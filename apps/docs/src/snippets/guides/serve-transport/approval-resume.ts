import { Console, Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Persistence } from "effect/unstable/persistence"
import { Agent, Approvals, ModelMiddleware, ToolExecutor } from "@batonfx/core"
import { SessionRegistry } from "@batonfx/transport"

const deployTool = Ai.Tool.make("deploy", {
  description: "Deploy a service",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const agent = Agent.make({ name: "release-agent", toolkit: Ai.Toolkit.make(deployTool) })

let calls = 0

const modelLayer = Layer.effect(
  Ai.LanguageModel.LanguageModel,
  Ai.LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      return calls === 1
        ? Stream.make(
            Ai.Response.makePart("tool-call", {
              id: "deploy-1",
              name: "deploy",
              params: { service: "api" },
              providerExecuted: false,
            }),
          )
        : Stream.make(Ai.Response.makePart("text-delta", { id: "assistant", delta: "Deployed api to production." }))
    },
  }),
)

const registryLayer = SessionRegistry.layerMemory({ agent }).pipe(
  Layer.provide(
    Layer.mergeAll(
      modelLayer,
      ToolExecutor.testLayer({
        execute: () => Effect.succeed({ _tag: "Success", result: "deployed", encodedResult: "deployed" }),
      }),
      Approvals.testLayer({ check: () => Effect.succeed({ _tag: "Pending", token: "deploy-token-1" }) }),
      ModelMiddleware.identityLayer,
      Ai.Chat.layerPersisted({ storeId: "approval-demo" }).pipe(Layer.provide(Persistence.layerBackingMemory)),
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

const program = Effect.gen(function* () {
  const registry = yield* SessionRegistry.SessionRegistry
  yield* registry.open({ sessionId: "release-1" })
  yield* registry.send("release-1", "Deploy the api service")
  const firstRun = yield* collectRun("release-1")
  const suspended = Array.from(firstRun).find((frame) => frame._tag === "Suspended")
  if (suspended === undefined || suspended._tag !== "Suspended") {
    return yield* Effect.die("expected a Suspended frame")
  }
  yield* Console.log(`suspended on ${suspended.suspension.tool_name} with token ${suspended.suspension.token}`)
  const lastSeq = Array.from(firstRun).at(-1)?.seq ?? -1
  yield* registry.resolveApproval("release-1", suspended.suspension.token, { _tag: "Approved" })
  const secondRun = yield* collectRun("release-1", lastSeq)
  const completed = Array.from(secondRun).find((frame) => frame._tag === "Event" && frame.event._tag === "Completed")
  if (completed === undefined || completed._tag !== "Event" || completed.event._tag !== "Completed") {
    return yield* Effect.die("expected a Completed event")
  }
  yield* Console.log(completed.event.text)
}).pipe(Effect.provide(registryLayer))

await Effect.runPromise(program)
