import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { Persistence } from "effect/unstable/persistence"
import {
  Agent,
  AgentManifest,
  Approvals,
  Chat,
  LanguageModel,
  ModelMiddleware,
  Pins,
  Response,
  ToolExecutor,
} from "tenetkit"
import { ExecutionHost, ExecutableManifest, ExecutableResolver, Cursor, RunStore, Runtime } from "tenetkit/runtime"

const agent = Agent.make({ name: "chat-agent" })
const pinnedAgent = AgentManifest.fromLiveAgent(agent, {
  model: Pins.makeModel({ fixture: "chat-agent", revision: "1" }),
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
      ].map((pin) => ({ pin, codec: "docs", version: "1", payload: { fixture: "chat-agent" } }))
    : [],
)
const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () =>
      Stream.make(
        Response.makePart("text-delta", { id: "assistant", delta: "Hello from TenetKit." }),
        Response.makePart("finish", { reason: "stop", usage, response: { status: 200, headers: {} } }),
      ),
  }),
)

const persistenceLayer = Chat.layerPersisted({ storeId: "serve-transport-demo" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)

const agentServices = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  persistenceLayer,
)

const runtimeLayer = Runtime.layerMemory({
  resolver: ExecutableResolver.makeStatic([{ executable, agent: Agent.close(agent, agentServices) }]),
  addresses: [],
})

const collectRun = (runId: string, cursor?: number) => {
  const options = { runId }
  if (cursor !== undefined) Object.assign(options, { cursor: Cursor.make(cursor) })
  return Runtime.Runtime.use((runtime) =>
    runtime.events(options).pipe(
      Stream.takeUntil((event) => event._tag === "RunCompleted"),
      Stream.runCollect,
    ),
  )
}

const tags = (events: Iterable<{ readonly sequence: number; readonly _tag: string }>) =>
  Array.from(events)
    .map((event) => `${event.sequence}:${event._tag}`)
    .join(" ")

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const receipt = yield* runtime.start({
    executable,
    registrations,
    sessionId: "docs-1",
    idempotencyKey: "hello-1",
    prompt: "Say hello",
  })
  const store = yield* RunStore.RunStore
  const host = yield* ExecutionHost.ExecutionHost
  yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "docs-example" }))
  const live = yield* collectRun(receipt.runId)
  yield* Console.log(`live:   ${tags(live)}`)
  const replayed = yield* collectRun(receipt.runId, 2)
  yield* Console.log(`replay: ${tags(replayed)}`)
})

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
await runtime.dispose()
