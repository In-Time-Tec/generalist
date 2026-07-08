import { Console, Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, AgentEvent, Approvals, ModelMiddleware, ToolExecutor } from "@batonfx/core"

const deployTool = Ai.Tool.make("deploy", {
  description: "Deploy a service to production",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const agent = Agent.make({
  name: "release-agent",
  instructions: "Deploy what the user asks for.",
  toolkit: Ai.Toolkit.make(deployTool),
})

let modelCalls = 0

const modelLayer = Layer.effect(
  Ai.LanguageModel.LanguageModel,
  Ai.LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      modelCalls += 1
      return modelCalls === 1
        ? Stream.make(
            Ai.Response.makePart("tool-call", {
              id: "deploy-1",
              name: "deploy",
              params: { service: "api" },
              providerExecuted: false,
            }),
          )
        : Stream.make(Ai.Response.makePart("text-delta", { id: "assistant", delta: "The api service is deployed." }))
    },
  }),
)

let approvalChecks = 0

const layers = Layer.mergeAll(
  modelLayer,
  ToolExecutor.testLayer({
    execute: () => Effect.succeed({ _tag: "Success", result: "deployed api", encodedResult: "deployed api" }),
  }),
  Approvals.testLayer({
    check: () => {
      approvalChecks += 1
      return Effect.succeed<Approvals.Decision>(
        approvalChecks === 1 ? { _tag: "Pending", token: "approval-deploy-1" } : { _tag: "Approved" },
      )
    },
  }),
  ModelMiddleware.identityLayer,
)

let transcript: Ai.Prompt.Prompt = Ai.Prompt.empty

const program = Effect.gen(function* () {
  const suspension = yield* Agent.stream(agent, { prompt: "Deploy the api service." }).pipe(
    Stream.runForEach((event) =>
      Effect.sync(() => {
        if (event._tag === "TurnCompleted") transcript = event.transcript
      }),
    ),
    Effect.flatMap(() => Effect.die("expected the run to suspend")),
    Effect.catchIf(
      (error): error is AgentEvent.AgentSuspended => error instanceof AgentEvent.AgentSuspended,
      (error) => Effect.succeed(error),
    ),
  )
  yield* Console.log(`suspended reason=${suspension.reason} tool=${suspension.tool_name} token=${suspension.token}`)
  const result = yield* Agent.generate(agent, {
    prompt: "",
    history: transcript,
    resume: {
      call: { id: suspension.tool_call_id, name: suspension.tool_name, params: suspension.tool_params },
    },
  })
  yield* Console.log(result.text)
}).pipe(Effect.provide(layers))

await Effect.runPromise(program)
