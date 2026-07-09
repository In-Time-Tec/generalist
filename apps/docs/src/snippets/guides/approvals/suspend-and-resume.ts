import { Console, Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, AgentEvent, Approvals, ModelMiddleware } from "@batonfx/core"

const deployTool = Tool.make("deploy_service", {
  description: "Deploy a service to production",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const toolkit = Toolkit.make(deployTool)
const agent = Agent.make({ name: "release-agent", toolkit })

let calls = 0

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      return calls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "deploy-1",
              name: "deploy_service",
              params: { service: "api" },
              providerExecuted: false,
            }),
          )
        : Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "api is deployed." }))
    },
  }),
)

const toolkitLayer = toolkit.toLayer({
  deploy_service: ({ service }) => Effect.succeed(`deployed ${service}`),
})

const pendingLayers = Layer.mergeAll(
  modelLayer,
  toolkitLayer,
  Approvals.testLayer({
    check: (request) => Effect.succeed({ _tag: "Pending", token: `approval:${request.call.id}` }),
  }),
  ModelMiddleware.identityLayer,
)

const approvedLayers = Layer.mergeAll(modelLayer, toolkitLayer, Approvals.autoApprove, ModelMiddleware.identityLayer)

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
