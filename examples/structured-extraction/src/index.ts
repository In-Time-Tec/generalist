import { Console, Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, Approvals, ModelMiddleware, ToolExecutor } from "@batonfx/core"

type ModelParams = Parameters<typeof Ai.LanguageModel.make>[0]

const invoiceSchema = Schema.Struct({ total: Schema.Number, currency: Schema.String })

const modelLayer = (
  streamText: ModelParams["streamText"],
  generateText: ModelParams["generateText"],
): Layer.Layer<Ai.LanguageModel.LanguageModel> =>
  Layer.effect(Ai.LanguageModel.LanguageModel, Ai.LanguageModel.make({ streamText, generateText }))

const agent = Agent.make({ name: "extractor", instructions: "Extract invoice data." })

const program = Effect.gen(function* () {
  const result = yield* Agent.generateObject(agent, {
    prompt: "Invoice total is 42 USD.",
    schema: invoiceSchema,
  })
  yield* Console.log(`${result.value.total} ${result.value.currency}`)
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      modelLayer(
        () => Stream.make(Ai.Response.makePart("text-delta", { id: "assistant", delta: "Extracting invoice." })),
        () => Effect.succeed([{ type: "text", text: '{"total":42,"currency":"USD"}' }]),
      ),
      ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool call") }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
    ),
  ),
)

await Effect.runPromise(program)
