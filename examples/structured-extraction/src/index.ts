import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, Permissions, Response, ToolExecutor } from "generalist"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const invoiceSchema = Schema.Struct({ total: Schema.Finite, currency: Schema.String })

const modelLayer = (
  streamText: ModelParams["streamText"],
  generateText: ModelParams["generateText"],
): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(LanguageModel.LanguageModel, LanguageModel.make({ streamText, generateText }))

const agent = Agent.make({ name: "extractor", instructions: "Extract invoice data.", output: invoiceSchema })

const program = Effect.gen(function* () {
  const result = yield* Agent.run(agent, "Invoice total is 42 USD.")
  yield* Console.log(`${result.total} ${result.currency}`)
})

const runtimeLayer = Layer.mergeAll(
  modelLayer(
    () => Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "Extracting invoice." })),
    () => Effect.succeed([{ type: "text", text: '{"output":{"total":42,"currency":"USD"}}' }]),
  ),
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
