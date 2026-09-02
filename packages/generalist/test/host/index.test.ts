import { expect, it, layer } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Hooks, Instructions, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, LocalScheduler, Runtime } from "generalist/runtime"
import { Runtime as SqliteRuntime } from "generalist/runtime/sqlite-bun"
import { tempDbPath } from "../runtime/sql/scenario.js"

const usage = Response.Usage.make({
  inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = (reason: Response.FinishReason) => Response.makePart("finish", { reason, usage, response: undefined })
const textResponse = (text: string) =>
  Stream.make(Response.makePart("text-delta", { id: "answer", delta: text }), finish("stop"))
const modelLayer = (streamText: Parameters<typeof LanguageModel.make>[0]["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )
const resolver = ExecutableResolver.layerStatic([])
const authorization = Layer.mergeAll(Permissions.layerAllowAll, Approvals.layerAutoApprove)
const memoryRuntime = Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
  Layer.provide(resolver),
)
const sqliteRuntime = (filename: string) =>
  SqliteRuntime.layerSqlite({ filename, addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
    Layer.provide(resolver),
  )
const completeRun = Effect.gen(function* () {
  const scheduler = yield* LocalScheduler.LocalScheduler
  yield* scheduler.tick
  yield* scheduler.idle
})

for (const [backend, runtimeLayer] of [
  ["memory", memoryRuntime],
  ["sqlite", sqliteRuntime(tempDbPath("host-api"))],
] as const) {
  layer(
    Layer.mergeAll(
      runtimeLayer,
      modelLayer(() => textResponse(`${backend} complete`)),
      authorization,
    ),
  )(`${backend} host`, (test) => {
    test.effect("creates Sessions, starts typed Runs, replays events, and lists state", () => {
      const agent = Agent.make({
        name: `host-${backend}`,
        input: Schema.Struct({ question: Schema.String }),
        output: Schema.String,
      })
      return Effect.gen(function* () {
        const host = yield* Generalist.create({ agents: [agent] })
        const session = yield* host.sessions.create({ id: `session:host:${backend}`, title: "Support inbox" })
        const run = yield* host.runs.start(session.id, agent, { question: "status" }, { idempotencyKey: "first" })
        yield* completeRun

        expect(yield* run.await).toBe(`${backend} complete`)
        expect(yield* host.sessions.get(session.id)).toEqual(session)
        expect(yield* host.sessions.list()).toContainEqual(session)
        expect(yield* host.runs.list(session.id)).toEqual([expect.objectContaining({ runId: run.id })])
        expect(yield* host.runs.inspect(run.id)).toMatchObject({ runId: run.id, status: "succeeded" })

        expect(yield* host.events.subscribe("session:missing").pipe(Effect.flip)).toMatchObject({
          _tag: "generalist/host/SessionNotFound",
          sessionId: "session:missing",
        })
        const eventStream = yield* host.events.subscribe(session.id)
        const events = Array.from(
          yield* eventStream.pipe(
            Stream.takeUntil((event) => event._tag === "Completed"),
            Stream.runCollect,
          ),
        )
        expect(events.map(({ _tag }) => _tag)).toEqual(["RunStarted", "Turn", "Turn", "Completed"])
        expect(events.map(({ cursor }) => cursor)).toEqual(
          events.map(({ cursor }) => cursor).toSorted((left, right) => left - right),
        )
        expect(events.at(-1)).toMatchObject({ _tag: "Completed", runId: run.id })
      })
    })
  })
}

layer(
  Layer.mergeAll(
    memoryRuntime,
    modelLayer(() => textResponse("unused")),
    authorization,
  ),
)("host cancellation", (test) => {
  test.effect("cancels a Session Run through Runtime", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "host-cancel" })
      const host = yield* Generalist.create({ agents: [agent] })
      const session = yield* host.sessions.create({ id: "session:host:cancel" })
      const run = yield* host.runs.start(session.id, agent, "wait")
      yield* host.runs.cancel(run.id, "user stopped")

      expect(yield* host.runs.inspect(run.id)).toMatchObject({ status: "cancelled" })
      const terminal = yield* run.await.pipe(Effect.flip)
      expect(terminal).toMatchObject({ _tag: "RunCancelled", reason: "user stopped" })
    }),
  )
})

let calls = 0
let handled = false
let advertisedTools: ReadonlyArray<string> = []
let system: string | undefined
const pluginTool = Tool.make("plugin_echo", {
  description: "Echo text from a host plugin",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
})
const handlers = Toolkit.make(pluginTool).toLayer({
  plugin_echo: ({ text }) =>
    Effect.sync(() => {
      handled = true
      return `plugin:${text}`
    }),
})
const model = modelLayer((options) => {
  calls += 1
  advertisedTools = Schema.decodeSync(Schema.Array(Schema.Struct({ name: Schema.String })))(options.tools).map(
    ({ name }) => name,
  )
  for (const message of options.prompt.content) {
    if (message.role === "system") system = message.content
  }
  if (calls === 1) {
    return Stream.make(
      Response.makePart("tool-call", {
        id: "plugin-call",
        name: "plugin_echo",
        params: { text: "hello" },
        providerExecuted: false,
      }),
      finish("tool-calls"),
    )
  }
  return textResponse("plugin complete")
})

layer(Layer.mergeAll(memoryRuntime, model, authorization, handlers))("host plugins", (test) => {
  test.effect("loads plugin tools, instructions, and skills in declared order", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "host-plugin" })
      const plugin = Generalist.plugin({
        name: "echo-plugin",
        tools: [pluginTool],
        instructions: [Instructions.fromText("echo-plugin", "Plugin guidance")],
        hooks: [Hooks.onRunEnd(() => Effect.succeed(Hooks.Replace("plugin hook complete")))],
        skills: [
          {
            name: "plugin-skill",
            description: "A plugin-contributed skill",
            instructions: Effect.succeed("Use the plugin carefully"),
            tools: [],
          },
        ],
      })

      const host = yield* Generalist.create({ agents: [agent], plugins: [plugin] })
      const session = yield* host.sessions.create({ id: "session:host:plugin" })
      const run = yield* host.runs.start(session.id, agent, "use the plugin")
      yield* completeRun

      expect(yield* run.await).toBe("plugin hook complete")
      expect(handled).toBe(true)
      expect(advertisedTools).toContain("plugin_echo")
      expect(system).toContain("Plugin guidance")
      expect(system).toContain("plugin-skill")
    }),
  )
})

it.effect("SQLite preserves Sessions and their root Run list across a fresh Layer", () => {
  const filename = tempDbPath("host-reopen")
  const agent = Agent.make({ name: "host-reopen" })
  const services = () =>
    Layer.mergeAll(
      sqliteRuntime(filename),
      modelLayer(() => textResponse("unused")),
      authorization,
    )
  return Effect.gen(function* () {
    const runId = yield* Effect.scoped(
      Layer.build(services()).pipe(
        Effect.flatMap((context) =>
          Effect.provide(
            Effect.gen(function* () {
              const host = yield* Generalist.create({ agents: [agent] })
              const session = yield* host.sessions.create({ id: "session:host:reopen", title: "Persistent" })
              return (yield* host.runs.start(session.id, agent, "persist", { idempotencyKey: "persist" })).id
            }),
            context,
          ),
        ),
      ),
    )

    yield* Effect.scoped(
      Layer.build(services()).pipe(
        Effect.flatMap((context) =>
          Effect.provide(
            Effect.gen(function* () {
              const host = yield* Generalist.create({ agents: [agent] })
              expect(yield* host.sessions.get("session:host:reopen")).toMatchObject({ title: "Persistent" })
              expect(yield* host.runs.list("session:host:reopen")).toEqual([expect.objectContaining({ runId })])
            }),
            context,
          ),
        ),
      ),
    )
  })
})
