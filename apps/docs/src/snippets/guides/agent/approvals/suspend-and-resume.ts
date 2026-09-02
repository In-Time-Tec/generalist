import { Console, Effect, Layer, Schema, Stream } from "effect"
import { Agent, AgentEvent, Approvals, ModelMiddleware, Permissions } from "generalist"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

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
            Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
          )
        : Stream.make(
            Response.makePart("text-delta", { id: "assistant", delta: "api is deployed." }),
            Response.makePart("finish", { reason: "stop", usage, response: undefined }),
          )
    },
  }),
)

const toolkitLayer = toolkit.toLayer({
  deploy_service: ({ service }) => Effect.succeed(`deployed ${service}`),
})

const pendingLayers = Layer.mergeAll(
  modelLayer,
  toolkitLayer,
  Permissions.layerAllowAll,
  Approvals.layerTest({
    resolve: (request) => Effect.succeed({ ...request, token: `approval:${request.call.id}` }),
  }),
  ModelMiddleware.layerIdentity,
)

const approvedLayers = Layer.mergeAll(
  modelLayer,
  toolkitLayer,
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const prompt = "Deploy the api service."

const program = Effect.gen(function* () {
  let transcript = Prompt.empty
  const failure = yield* Effect.scoped(
    Effect.flatMap(Layer.build(pendingLayers), (services) =>
      Agent.stream(agent, prompt).pipe(
        Stream.runForEach((event) =>
          Effect.sync(() => {
            if (event._tag === "TurnCompleted") transcript = event.transcript
          }),
        ),
        Effect.provideContext(services),
      ),
    ),
  ).pipe(Effect.flip)
  if (!Schema.is(AgentEvent.AgentSuspended)(failure)) {
    return yield* Effect.die("expected the run to suspend")
  }
  const [wait] = failure.waits
  if (wait === undefined) {
    return yield* Effect.die("expected an approval wait")
  }
  yield* Console.log(`suspended reason=${wait.reason} tool=${wait.call.name} token=${wait.token}`)
  const resumed = yield* Effect.scoped(
    Effect.flatMap(Layer.build(approvedLayers), (services) =>
      Agent.run(agent, prompt, {
        history: transcript,
        resume: {
          suspension: failure,
          resolutions: [{ waitId: wait.waitId, resolution: { _tag: "Approved" } }],
        },
      }).pipe(Effect.provideContext(services)),
    ),
  )
  yield* Console.log(resumed)
})

await Effect.runPromise(program)
