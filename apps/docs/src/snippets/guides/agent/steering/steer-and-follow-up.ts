import { Console, Effect, Layer, ManagedRuntime, Option, Schema, Stream } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, Response, Tool, Toolkit } from "generalist"

const statusTool = Tool.make("check_status", {
  description: "Check the deploy status of a service",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(statusTool)

const agent = Agent.make({
  name: "release-agent",
  instructions: "Report deploy status using tools.",
  toolkit,
})

let calls = 0

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1 },
  outputTokens: { total: 1, text: 1 },
})

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      calls += 1
      if (calls === 1) {
        return Stream.make(
          Response.makePart("tool-call", {
            id: "status-1",
            name: "check_status",
            params: { service: "api" },
            providerExecuted: false,
          }),
          Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
        )
      }
      const promptText = JSON.stringify(options.prompt.content)
      const delta = promptText.includes("worker service")
        ? "Follow-up: the worker deploy is healthy too."
        : "The api deploy is healthy, in one sentence as steered. "
      return Stream.make(
        Response.makePart("text-delta", { id: "assistant", delta }),
        Response.makePart("finish", { reason: "stop", usage, response: undefined }),
      )
    },
  }),
)

const layers = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ check_status: ({ service }) => Effect.succeed(`${service} is healthy`) }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const program = Effect.scoped(
  Effect.gen(function* () {
    const run = yield* Agent.allocateRun(agent, { prompt: "Is the api deploy healthy?" })
    yield* run.steer({ prompt: "Keep the answer to one sentence." })
    yield* run.followUp({ prompt: "Also check the worker service." })
    const last = yield* Stream.runLast(run.events)
    if (Option.isNone(last) || last.value._tag !== "Completed") {
      return yield* Effect.die("expected the Run to complete")
    }
    yield* Console.log(`turns: ${last.value.turns}`)
    yield* Console.log(last.value.text)
  }),
)

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
