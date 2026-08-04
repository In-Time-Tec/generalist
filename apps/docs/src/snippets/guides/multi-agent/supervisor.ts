import { Console, Effect, Layer, Stream } from "effect"
import { Agent, Approvals, Handoff, LanguageModel, ModelMiddleware, Response, ToolExecutor } from "@batonfx/core"

let supervisorCalls = 0

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      const isChildTurn = options.tools.length === 0
      if (isChildTurn) {
        return Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "Refund for order 42 issued." }))
      }
      supervisorCalls += 1
      return supervisorCalls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "route-1",
              name: "transfer_to_billing",
              params: { prompt: "Refund order 42" },
              providerExecuted: false,
            }),
          )
        : Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "Billing handled it: refund issued." }))
    },
  }),
)

const billingAgent = Agent.make({ name: "billing", instructions: "Resolve billing requests." })
const billing = Handoff.target(billingAgent)

const supervisor = Handoff.supervisor({
  name: "front-desk",
  instructions: "Route each request to the right specialist.",
  specialists: [billing],
})

const program = Agent.generate(supervisor.agent, { prompt: "I want a refund for order 42." }).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
  Effect.provide(
    Layer.mergeAll(
      modelLayer,
      ToolExecutor.layerToolkit(supervisor.toolkit),
      supervisor.catalog,
      Approvals.layerAutoApprove,
      ModelMiddleware.layerIdentity,
    ),
  ),
)

await Effect.runPromise(program)
