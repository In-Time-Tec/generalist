import { Console, Effect, Layer, ManagedRuntime, Option, Schema, Stream } from "effect"
import { Agent, Approvals, Instructions, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { LanguageModel, Response } from "effect/unstable/ai"

const persona = Instructions.fromText("persona", "You are the release-notes assistant.")

const houseStyle = Instructions.fromText("house-style", "Write one sentence per change. Never use exclamation marks.")

const instructionsLayer = Instructions.layer([persona, houseStyle])

const agent = Agent.make({ name: "release-notes", instructions: "This fallback is replaced by the registry." })

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      const system = options.prompt.content.find((message) => message.role === "system")
      const text =
        system === undefined
          ? "no system message"
          : Option.getOrElse(Schema.decodeOption(Schema.String)(system.content), () => "no system message")
      return Stream.make(Response.makePart("text-delta", { id: "assistant", delta: text }))
    },
  }),
)

const program = Effect.gen(function* () {
  const result = yield* Agent.run(agent, "What are your instructions?")
  yield* Console.log(result)
})

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  instructionsLayer,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
