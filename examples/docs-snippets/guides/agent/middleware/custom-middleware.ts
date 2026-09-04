import { Console, Effect, Layer, ManagedRuntime, Option, Stream } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { LanguageModel, Response } from "effect/unstable/ai"

const dropReasoning: ModelMiddleware.Middleware = {
  transformPart: (part) => Effect.succeed(part.type === "reasoning-delta" ? Option.none() : Option.some(part)),
}

const agent = Agent.make({ name: "terse-agent" })

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () =>
      Stream.make(
        Response.makePart("reasoning-delta", { id: "thinking", delta: "Considering the question at length." }),
        Response.makePart("text-delta", { id: "assistant", delta: "Blue." }),
        Response.makePart("finish", { reason: "stop", usage, response: undefined }),
      ),
  }),
)

const program = Effect.gen(function* () {
  const events = yield* Stream.runCollect(Agent.stream(agent, "Favorite color?"))
  const partTypes = events
    .filter((event) => event._tag === "ModelResponseCommitted")
    .flatMap((event) => event.response.content.map((part) => part.type))
  yield* Console.log(`semantic parts committed by the loop: ${partTypes.join(", ")}`)
})

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layer([dropReasoning]),
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
