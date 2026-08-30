import { Console, Effect, ManagedRuntime, Stream } from "effect"
import { Agent, AgentManifest, Pins } from "tenetkit"
import { ExecutableManifest, ExecutableResolver, RunExecutor, RunStore, Runtime } from "tenetkit/runtime"
import { TestModel } from "tenetkit/test"
import { SSE } from "tenetkit/transport"

const agent = Agent.make({ name: "transport-agent" })
const pinnedAgent = AgentManifest.fromLiveAgent(agent, {
  model: Pins.makeModel({ fixture: "transport-agent", revision: "1" }),
  tools: [],
  skills: [],
  services: [],
  policy: { _tag: "Portable", policy: agent.policy.snapshot! },
  budget: agent.budget ?? {},
  children: [],
})
const executable = ExecutableManifest.make({ root: pinnedAgent.pin, entries: [{ _tag: "Agent", ...pinnedAgent }] })
const registrations = executable.manifest.entries.flatMap((entry) =>
  entry._tag === "Agent"
    ? [
        entry.manifest.model,
        ...entry.manifest.tools.map(({ pin }) => pin),
        ...(entry.manifest.policy._tag === "Pinned" ? [entry.manifest.policy.pin] : []),
      ].map((pin) => ({ pin, codec: "example", version: "1", payload: { fixture: "transport-agent" } }))
    : [],
)
const agentServices = TestModel.layer([TestModel.text("Hello from transport.")])

const runtimeLayer = Runtime.layerMemory({
  resolver: ExecutableResolver.makeStatic([{ executable, agent: Agent.close(agent, agentServices) }]),
  addresses: [],
  subscriberQueueCapacity: 16,
})

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const receipt = yield* runtime.start({
    executable,
    registrations,
    sessionId: "guide-session",
    idempotencyKey: "guide-message-1",
    prompt: "Say hello",
  })
  const store = yield* RunStore.RunStore
  const host = yield* RunExecutor.RunExecutor
  yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "composition-guide" }))
  const first = yield* runtime.events({ runId: receipt.runId }).pipe(Stream.take(1), Stream.runCollect)
  yield* Console.log(
    `admitted ${receipt.runId}; first event: ${Array.from(first)[0]?._tag}; SSE schema: ${SSE.streamSuccess._tag}`,
  )
})

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
