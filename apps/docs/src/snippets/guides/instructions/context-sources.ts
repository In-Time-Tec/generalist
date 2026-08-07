import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { Agent, Approvals, Instructions, LanguageModel, ModelMiddleware, Response, ToolExecutor } from "@batonfx/core"

const persona = Instructions.staticSource("persona", "You are the release-notes assistant.")

const houseStyle = Instructions.staticSource(
  "house-style",
  "Write one sentence per change. Never use exclamation marks.",
)

const instructionsLayer = Instructions.layer([persona, houseStyle])

const agent = Agent.make({ name: "release-notes", instructions: "This fallback is replaced by the registry." })

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      const system = options.prompt.content.find((message) => message.role === "system")
      const text = system === undefined || typeof system.content !== "string" ? "no system message" : system.content
      return Stream.make(Response.makePart("text-delta", { id: "assistant", delta: text }))
    },
  }),
)

const program = Effect.gen(function* () {
  const result = yield* Agent.generate(agent, { prompt: "What are your instructions?" })
  yield* Console.log(result.text)
})

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  instructionsLayer,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
