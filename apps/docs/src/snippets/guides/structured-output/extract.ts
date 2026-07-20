import { Console, Effect, Layer, Schema, Stream } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, Response, ToolExecutor } from "@batonfx/core"

const invoiceSchema = Schema.Struct({ total: Schema.Number, currency: Schema.String })

const agent = Agent.make({ name: "extractor", instructions: "Extract invoice data." })

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    streamText: () => Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "Extracting invoice." })),
    generateText: () => Effect.succeed([{ type: "text", text: '{"total":42,"currency":"USD"}' }]),
  }),
)

const program = Effect.gen(function* () {
  const result = yield* Agent.generate(agent, {
    prompt: "Invoice total is 42 USD.",
    output: { schema: invoiceSchema },
  })
  yield* Console.log(`${result.value.total} ${result.value.currency}`)
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      modelLayer,
      ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool call") }),
      Approvals.autoApprove,
      ModelMiddleware.layerIdentity,
    ),
  ),
)

await Effect.runPromise(program)
