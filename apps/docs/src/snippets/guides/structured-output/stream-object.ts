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

const program = Agent.stream(agent, {
  prompt: "Invoice total is 42 USD.",
  schema: invoiceSchema,
  objectName: "invoice",
  objectPrompt: "Return the invoice as JSON matching the schema.",
}).pipe(
  Stream.runForEach((event) =>
    event._tag === "StructuredOutput"
      ? Console.log(`${event._tag}: ${JSON.stringify(event.value)}`)
      : Console.log(event._tag),
  ),
  Effect.provide(
    Layer.mergeAll(
      modelLayer,
      ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool call") }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
    ),
  ),
)

await Effect.runPromise(program)
