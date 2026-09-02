import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Cursor, ExecutableResolver, Runtime } from "generalist/runtime"

const agent = Agent.make({ name: "chat-agent" })
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
        Response.makePart("text-delta", { id: "assistant", delta: "Hello from Generalist." }),
        Response.makePart("finish", { reason: "stop", usage, response: { status: 200, headers: {} } }),
      ),
  }),
)

const agentServices = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtimeLayer = Layer.merge(
  Runtime.layerMemory({
    addresses: [],
  }).pipe(Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie))),
  agentServices,
)

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
  yield* runtime.register(agent)
  const handle = yield* runtime.start(agent, "Say hello", {
    sessionId: "docs-1",
    idempotencyKey: "hello-1",
  })
  const live = yield* collectRun(handle.runId)
  yield* Console.log(`live:   ${tags(live)}`)
  const replayed = yield* collectRun(handle.runId, 2)
  yield* Console.log(`replay: ${tags(replayed)}`)
})

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
await runtime.dispose()
