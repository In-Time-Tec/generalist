import { Console, Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, AgentEvent, Approvals, ModelMiddleware, ToolExecutor } from "@batonfx/core"

const deployTool = Ai.Tool.make("deploy_service", {
  description: "Deploy a service to production",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const agent = Agent.make({ name: "release-agent", toolkit: Ai.Toolkit.make(deployTool) })

let calls = 0

const modelLayer = Layer.effect(
  Ai.LanguageModel.LanguageModel,
  Ai.LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      return calls === 1
        ? Stream.make(
            Ai.Response.makePart("tool-call", {
              id: "deploy-1",
              name: "deploy_service",
              params: { service: "api" },
              providerExecuted: false,
            }),
          )
        : Stream.make(Ai.Response.makePart("text-delta", { id: "assistant", delta: "api is deployed." }))
    },
  }),
)

const executorLayer = ToolExecutor.testLayer({
  execute: (request) =>
    Effect.succeed({
      _tag: "Success",
      result: `deployed ${String((request.call.params as { readonly service?: string }).service ?? "unknown")}`,
      encodedResult: `deployed ${String((request.call.params as { readonly service?: string }).service ?? "unknown")}`,
    }),
})

const pendingLayers = Layer.mergeAll(
  modelLayer,
  executorLayer,
  Approvals.testLayer({
    check: (request) => Effect.succeed({ _tag: "Pending", token: `approval:${request.call.id}` }),
  }),
  ModelMiddleware.identityLayer,
)

const approvedLayers = Layer.mergeAll(modelLayer, executorLayer, Approvals.autoApprove, ModelMiddleware.identityLayer)

const prompt = "Deploy the api service."

const program = Effect.gen(function* () {
  const failure = yield* Agent.generate(agent, { prompt }).pipe(Effect.provide(pendingLayers), Effect.flip)
  if (!(failure instanceof AgentEvent.AgentSuspended)) {
    return yield* Effect.die("expected the run to suspend")
  }
  yield* Console.log(`suspended reason=${failure.reason} tool=${failure.tool_name} token=${failure.token}`)
  const resumed = yield* Agent.generate(agent, {
    prompt,
    resume: {
      call: { id: failure.tool_call_id, name: failure.tool_name, params: failure.tool_params },
    },
  }).pipe(Effect.provide(approvedLayers))
  yield* Console.log(resumed.text)
})

await Effect.runPromise(program)
