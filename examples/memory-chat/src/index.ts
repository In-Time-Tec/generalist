import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import {
  Agent,
  Approvals,
  LanguageModel,
  Memory,
  ModelMiddleware,
  Permissions,
  Response,
  ToolExecutor,
} from "generalist"
import { WorkingMemory } from "generalist/memory"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const key: Memory.Key = { agent: "memory-agent", subject: "user-ada" }
const agent = Agent.make({ name: "memory-agent" })

const program = Effect.gen(function* () {
  yield* Agent.generate(agent, { prompt: "Ada likes Effect.", memory: { key } })
  const second = yield* Agent.generate(agent, { prompt: "What should you remember?", memory: { key } })
  yield* Console.log(second.text)
})

const runtimeLayer = Layer.mergeAll(
  modelLayer((options) => {
    const content = JSON.stringify(options.prompt.content)
    const text = content.includes("Ada likes Effect") ? "I remember that Ada likes Effect." : "Stored that fact."
    return Stream.make(Response.makePart("text-delta", { id: "assistant", delta: text }))
  }),
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  WorkingMemory.layer({ maxMessages: 4 }),
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
