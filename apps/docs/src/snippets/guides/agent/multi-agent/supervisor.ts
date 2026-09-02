import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { LanguageModel, Response, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Handoff, ModelMiddleware, Permissions, ToolExecutor } from "generalist"

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

let supervisorCalls = 0

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      const isChildTurn = options.tools.length === 0
      if (isChildTurn) {
        return Stream.make(
          Response.makePart("text-delta", { id: "assistant", delta: "Refund for order 42 issued." }),
          Response.makePart("finish", { reason: "stop", usage, response: undefined }),
        )
      }
      supervisorCalls += 1
      return supervisorCalls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "route-1",
              name: "handoff_to_billing",
              params: { prompt: "Refund order 42" },
              providerExecuted: false,
            }),
            Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
          )
        : Stream.make(
            Response.makePart("text-delta", { id: "assistant", delta: "Billing handled it: refund issued." }),
            Response.makePart("finish", { reason: "stop", usage, response: undefined }),
          )
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

const program = Agent.run(supervisor.agent, "I want a refund for order 42.").pipe(
  Effect.flatMap((result) => Console.log(result)),
)

const handlerLayer = supervisor.agent.toolkit.toLayer(
  // SAFETY: every key comes directly from this toolkit's tools and every value has the toolkit handler shape.
  Object.fromEntries(
    Object.keys(supervisor.agent.toolkit.tools).map((name) => [
      name,
      () => Effect.die("ToolExecutor owns handoff tool execution"),
    ]),
  ) as Toolkit.HandlersFrom<typeof supervisor.agent.toolkit.tools>,
)

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerToolkit(supervisor.toolkit),
  handlerLayer,
  supervisor.catalog,
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
