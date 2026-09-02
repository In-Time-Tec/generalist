import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Instructions, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, Runtime } from "generalist/runtime"

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})
const finish = (reason: Response.FinishReason) => Response.makePart("finish", { reason, usage, response: undefined })

let modelCalls = 0
const scriptedModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      modelCalls += 1
      return modelCalls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "echo-1",
              name: "host_echo",
              params: { text: "hello" },
              providerExecuted: false,
            }),
            finish("tool-calls"),
          )
        : Stream.make(
            Response.makePart("text-delta", {
              id: "answer",
              delta: "The host plugin echoed: hello.",
            }),
            finish("stop"),
          )
    },
  }),
)

const echo = Tool.make("host_echo", {
  description: "Echo text through the Host plugin",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
})
let handled = false
const echoHandler = Toolkit.make(echo).toLayer({
  host_echo: ({ text }) =>
    Effect.sync(() => {
      handled = true
      return text
    }),
})

const assistant = Agent.make({
  name: "host-example",
  input: Schema.Struct({ request: Schema.String }),
  output: Schema.String,
})
const plugin = Generalist.plugin({
  name: "echo",
  tools: [echo],
  instructions: [Instructions.fromText("echo", "Use host_echo when the user asks you to echo text.")],
})

const program = Effect.gen(function* () {
  const host = yield* Generalist.create({ agents: [assistant], plugins: [plugin] })
  const session = yield* host.sessions.create({ id: "session:host-example", title: "Host example" })
  const run = yield* host.runs.start(
    session.id,
    assistant,
    { request: "Echo hello through the plugin." },
    { idempotencyKey: "echo-hello" },
  )
  const answer = yield* run.await
  const events = Array.from(
    yield* (yield* host.events.subscribe(session.id)).pipe(
      Stream.takeUntil((event) => event._tag === "Completed"),
      Stream.runCollect,
    ),
  )

  yield* Console.log(`Session: ${session.id} (${session.title})`)
  yield* Console.log(`Run: ${run.id}`)
  yield* Console.log(`Events: ${events.map((event) => event._tag).join(" -> ")}`)
  yield* Console.log(`Plugin handled: ${handled}`)
  yield* Console.log(`Answer: ${answer}`)
})

const runtimeLayer = Runtime.layerMemory({ addresses: [] }).pipe(Layer.provide(ExecutableResolver.layerStatic([])))
const runtime = ManagedRuntime.make(
  Layer.mergeAll(runtimeLayer, scriptedModel, Permissions.layerAllowAll, Approvals.layerAutoApprove, echoHandler),
)

try {
  await runtime.runPromise(program)
} finally {
  await runtime.dispose()
}
