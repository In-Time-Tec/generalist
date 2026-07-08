import { Console, Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, AgentEvent, Approvals, ModelMiddleware, ToolExecutor } from "@batonfx/core"

const reportTool = Ai.Tool.make("fetch_report", {
  description: "Fetch a long-running report",
  parameters: Schema.Struct({ name: Schema.String }),
  success: Schema.String,
})

const agent = Agent.make({
  name: "reporting-agent",
  instructions: "Fetch the report the user names.",
  toolkit: Ai.Toolkit.make(reportTool),
})

const modelLayer = Layer.effect(
  Ai.LanguageModel.LanguageModel,
  Ai.LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () =>
      Stream.make(
        Ai.Response.makePart("tool-call", {
          id: "report-1",
          name: "fetch_report",
          params: { name: "quarterly" },
          providerExecuted: false,
        }),
      ),
  }),
)

const durableHostExecutor = ToolExecutor.testLayer({
  execute: (request) => Effect.succeed({ _tag: "Suspend", token: `wait:tool:${request.call.id}` }),
})

let transcriptMessages = 0

const program = Agent.stream(agent, { prompt: "Fetch the quarterly report." }).pipe(
  Stream.runForEach((event) =>
    Effect.sync(() => {
      if (event._tag === "TurnCompleted") transcriptMessages = event.transcript.content.length
    }),
  ),
  Effect.catchIf(
    (error): error is AgentEvent.AgentSuspended => error instanceof AgentEvent.AgentSuspended,
    (suspension) =>
      Console.log(
        `suspended reason=${suspension.reason} token=${suspension.token} transcript-messages=${transcriptMessages}`,
      ),
  ),
  Effect.provide(Layer.mergeAll(modelLayer, durableHostExecutor, Approvals.autoApprove, ModelMiddleware.identityLayer)),
)

await Effect.runPromise(program)
