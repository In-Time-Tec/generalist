import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, Permissions, Response, ToolExecutor } from "generalist"

const invoiceSchema = Schema.Struct({ total: Schema.Finite, currency: Schema.String })

const agent = Agent.make({ name: "extractor", instructions: "Extract invoice data." })

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    streamText: () =>
      Stream.make(
        Response.makePart("text-delta", { id: "assistant", delta: "Extracting invoice." }),
        Response.makePart("finish", { reason: "stop", usage, response: undefined }),
      ),
    generateText: () => Effect.succeed([{ type: "text", text: '{"total":42,"currency":"USD"}' }]),
  }),
)

const program = Agent.stream(agent, {
  prompt: "Invoice total is 42 USD.",
  output: {
    schema: invoiceSchema,
    name: "invoice",
    prompt: "Return the invoice as JSON matching the schema.",
  },
}).pipe(
  Stream.filter((event) => event._tag !== "ModelPart"),
  Stream.runForEach((event) =>
    event._tag === "StructuredOutput"
      ? Console.log(`${event._tag}: ${JSON.stringify(event.value)}`)
      : Console.log(event._tag),
  ),
)

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
