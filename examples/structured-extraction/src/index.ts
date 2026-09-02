import { Console, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { TestModel } from "generalist/testing"

const invoiceSchema = Schema.Struct({ total: Schema.Finite, currency: Schema.String })

const agent = Agent.make({ name: "extractor", instructions: "Extract invoice data.", output: invoiceSchema })

const program = Effect.gen(function* () {
  const result = yield* Agent.run(agent, "Invoice total is 42 USD.")
  yield* Console.log(`${result.total} ${result.currency}`)
})

const runtimeLayer = Layer.mergeAll(
  TestModel.layer([
    TestModel.text("Extracting invoice."),
    TestModel.object({ output: { total: 42, currency: "USD" } }),
  ]),
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
