import { type AgentCard, type Message, Role, type SendMessageRequest, type StreamResponse } from "@a2a-js/sdk"
import { ServerCallContext } from "@a2a-js/sdk/server"
import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, AgentManifest, Approvals, Permissions, Pins } from "generalist"
import { Generalist } from "generalist/host"
import { Address, ExecutableManifest, ExecutableRegistration, ExecutableResolver, Runtime } from "generalist/runtime"
import { A2A } from "generalist/unstable/a2a"

const agentBAddress = Address.make("agent:a2a-example-b")
const agentBSessionId = "session:a2a-agent-b"
const agentB = Agent.make({ name: "a2a-example-b" })
const agentBManifest = AgentManifest.fromLiveAgent(agentB, {
  model: Pins.makeModel({ example: "a2a", agent: agentB.name, revision: "1" }),
  tools: [],
  skills: [],
  services: [],
  policy:
    agentB.policy.snapshot === undefined
      ? { _tag: "Pinned", pin: Pins.makeCapability({ example: "a2a", agent: agentB.name, policy: "1" }) }
      : { _tag: "Portable", policy: agentB.policy.snapshot },
  budget: agentB.budget ?? {},
  children: [],
})
const agentBExecutable = ExecutableManifest.make({
  root: agentBManifest.pin,
  entries: [{ _tag: "Agent", ...agentBManifest }],
})
const registrations = [...ExecutableRegistration.requiredPins(agentBExecutable)].map((pin) => ({
  pin,
  codec: "a2a-example",
  version: "1",
  payload: { agent: agentB.name },
}))

const card: AgentCard = {
  name: "Generalist Agent B",
  description: "The delegated offline specialist",
  supportedInterfaces: [
    { url: "http://127.0.0.1/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0", tenant: "" },
  ],
  provider: undefined,
  version: "1",
  capabilities: { streaming: true, extensions: [] },
  securitySchemes: {},
  securityRequirements: [],
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [],
  signatures: [],
}

const delegate = Tool.make("delegate_to_agent_b", {
  description: "Delegate a request to Agent B over A2A",
  parameters: Schema.Struct({ request: Schema.String }),
  success: Schema.String,
})
const delegateToolkit = Toolkit.make(delegate)
const agentA = Agent.make({ name: "a2a-example-a", toolkit: delegateToolkit })

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})
const finish = (reason: Response.FinishReason) => Response.makePart("finish", { reason, usage, response: undefined })

type ModelOptions = Parameters<typeof LanguageModel.make>[0]
const modelLayer = (streamText: ModelOptions["streamText"]): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

let agentACalls = 0
const hostModel = modelLayer((options) => {
  if (!options.tools.some((tool) => tool.name === delegate.name)) {
    return Stream.make(
      Response.makePart("text-delta", { id: "agent-b-answer", delta: "Agent B completed the delegated work." }),
      finish("stop"),
    )
  }
  agentACalls += 1
  return agentACalls === 1
    ? Stream.make(
        Response.makePart("tool-call", {
          id: "delegate-1",
          name: delegate.name,
          params: { request: "Complete the offline delegated task." },
          providerExecuted: false,
        }),
        finish("tool-calls"),
      )
    : Stream.make(
        Response.makePart("text-delta", {
          id: "agent-a-answer",
          delta: "Agent A received Agent B's A2A artifact: Agent B completed the delegated work.",
        }),
        finish("stop"),
      )
})
const agentBModel = modelLayer(() =>
  Stream.make(
    Response.makePart("text-delta", { id: "agent-b-answer", delta: "Agent B completed the delegated work." }),
    finish("stop"),
  ),
)

let a2aEventTypes: ReadonlyArray<string> = []
const delegateHandlers = delegateToolkit.toLayer(
  Effect.gen(function* () {
    const a2a = yield* A2A.A2A
    return {
      delegate_to_agent_b: ({ request }) =>
        Effect.gen(function* () {
          const message: Message = {
            messageId: "message:delegate-to-b",
            contextId: agentBSessionId,
            taskId: "",
            role: Role.ROLE_USER,
            parts: [
              { content: { $case: "text", value: request }, mediaType: "text/plain", filename: "", metadata: {} },
            ],
            metadata: {},
            extensions: [],
            referenceTaskIds: [],
          }
          const input: SendMessageRequest = { tenant: "", message, configuration: undefined, metadata: {} }
          const responses = yield* Stream.fromAsyncIterable(
            a2a.handler.sendMessageStream(input, new ServerCallContext()),
            (cause) => cause,
          ).pipe(Stream.orDie, Stream.runCollect)
          a2aEventTypes = Array.from(responses, (response) => response.payload?.$case ?? "empty")
          const artifact = Array.from(responses).find(
            (response): response is StreamResponse & { payload: { $case: "artifactUpdate" } } =>
              response.payload?.$case === "artifactUpdate",
          )
          const content = artifact?.payload.value.artifact?.parts[0]?.content
          if (content?.$case !== "text") return yield* Effect.die("Agent B did not return a text A2A artifact")
          return content.value
        }),
    }
  }),
)

const authorization = () => Layer.mergeAll(Permissions.layerAllowAll, Approvals.layerAutoApprove)
const resolver = ExecutableResolver.layerStatic([
  {
    executable: agentBExecutable,
    agent: Agent.close(agentB, Layer.mergeAll(agentBModel, authorization())),
  },
]).pipe(Layer.orDie)
const runtimeLayer = Runtime.layerMemory({
  addresses: [{ address: agentBAddress, executable: agentBExecutable, registrations }],
  scheduler: { concurrency: 2 },
}).pipe(Layer.provide(resolver))
const protocolServices = delegateHandlers.pipe(
  Layer.provideMerge(A2A.layer({ address: agentBAddress, card })),
  Layer.provideMerge(runtimeLayer),
  Layer.provideMerge(hostModel),
  Layer.provideMerge(authorization()),
)

const program = Effect.gen(function* () {
  const hostA = yield* Generalist.create({ agents: [agentA] })
  const hostB = yield* Generalist.create({ agents: [agentB] })
  yield* hostB.sessions.create({ id: agentBSessionId, title: "A2A delegated work" })
  const session = yield* hostA.sessions.create({ id: "session:a2a-example", title: "A2A delegation" })
  const run = yield* hostA.runs.start(session.id, agentA, "Delegate this request to Agent B.", {
    idempotencyKey: "delegate-to-b",
  })
  const answer = yield* run.await
  const observedRuns = yield* hostB.runs.list(agentBSessionId)

  if (observedRuns.length !== 1) return yield* Effect.die("Host B did not observe the delegated A2A run")
  yield* Console.log(`Hosts: ${agentA.name} -> ${agentB.name}`)
  yield* Console.log(`A2A events: ${a2aEventTypes.join(" -> ")}`)
  yield* Console.log(`Runs visible to Host B: ${observedRuns.length}`)
  yield* Console.log(`Answer: ${answer}`)
})

const runtime = ManagedRuntime.make(protocolServices)
try {
  await runtime.runPromise(program)
} finally {
  await runtime.dispose()
}
