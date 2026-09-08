import { register as registerSnapshots } from "./snapshot-suite.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../runtime/execution/object.js"
import { BunCrypto } from "@effect/platform-bun"
import { expect, it, layer } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Hooks, Instructions, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, RunExecutor, RunStore } from "generalist/runtime"
import { layer as blobStoreLayer } from "../../src/blob-store/index.js"
import { ObjectStore } from "../../src/durability/object-store.js"

registerSnapshots({ makeObjectStorage })

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
const runtimeStorage = makeObjectStorage()
const attachmentStorage = makeObjectStorage()
const blobStore = blobStoreLayer({ environment: "test", tenant: "host" }).pipe(
  Layer.provide(Layer.merge(BunCrypto.layer, Layer.succeed(ObjectStore, attachmentStorage.store))),
)
const runtimeLayer = objectRuntimeLayer({ addresses: [] }, runtimeStorage).pipe(Layer.provide(resolver))
const completeRun = (runId: string, commandId: string) =>
  Effect.gen(function* () {
    const executor = yield* RunExecutor.RunExecutor
    const store = yield* RunStore.RunStore
    yield* executor.execute(yield* store.claimExecution({ runId, ownerId: objectWorkerId, commandId }))
  })

const backend = "object" as const
{
  layer(
    Layer.mergeAll(
      runtimeLayer,
      modelLayer(() => textResponse(`${backend} complete`)),
      authorization,
      blobStore,
    ),
  )(`${backend} host`, (test) => {
    test.effect("compiles named children and pins detached Host limits on both start routes", () =>
      Effect.gen(function* () {
        const root = Agent.make({ name: "host-profile-root", children: ["host-profile-child"] })
        const child = Agent.make({ name: "host-profile-child", children: ["host-profile-child"] })
        const limits = { tree: { maxDepth: 3, maxSessions: 8 }, concurrency: { agents: 2, tools: 4 } }
        const host = yield* Generalist.create({ agents: [root, child], limits })
        limits.concurrency.agents = 100
        const store = yield* RunStore.RunStore
        const typedSession = yield* host.sessions.create({ id: "host-profile-typed" })
        const namedSession = yield* host.sessions.create({ id: "host-profile-named" })
        const typed = yield* host.runs.start(typedSession.id, root, "root")
        const named = yield* host.runs.startByName(namedSession.id, child.name, "child")
        for (const run of [typed, named]) {
          const record = yield* store.loadExecution(run.id)
          expect(record.treePolicy).toEqual({ maxDepth: 3, maxSessions: 8, concurrency: { agents: 2, tools: 4 } })
          expect(record.executableManifest.profiles.map((profile) => profile.selection)).toEqual([child.name])
        }
        yield* completeRun(typed.id, "host-profile-typed-complete")
        yield* completeRun(named.id, "host-profile-named-complete")
        expect(yield* typed.await).toBe(`${backend} complete`)
        expect(yield* named.await).toBe(`${backend} complete`)
      }),
    )

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
        yield* completeRun(run.id, "host:api")

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
        expect(events.map(({ _tag }) => _tag)).toEqual([
          "RunStarted",
          "Turn",
          "Conversation",
          "Conversation",
          "Turn",
          "Completed",
        ])
        expect(
          events
            .filter((event) => event._tag === "Conversation")
            .flatMap((event) => event.update.entries)
            .flatMap((entry) => entry.messages)
            .map((message) => message.role),
        ).toEqual(["user", "assistant"])
        expect(events.map(({ cursor }) => cursor)).toEqual(
          events.map(({ cursor }) => cursor).toSorted((left, right) => left - right),
        )
        expect(events.at(-1)).toMatchObject({ _tag: "Completed", runId: run.id })
      })
    })

    test.effect("puts and gets attachments through BlobStore", () =>
      Effect.gen(function* () {
        const host = yield* Generalist.create({ agents: [] })
        const data = new TextEncoder().encode(`${backend} attachment`)
        const ref = yield* host.attachments.put({ data, mediaType: "application/pdf", filename: "report.pdf" })
        expect(yield* host.attachments.get(ref.sha256)).toEqual({ ref, data })
      }),
    )
  })
}

layer(
  Layer.mergeAll(
    runtimeLayer,
    modelLayer(() => textResponse("unused")),
    authorization,
  ),
)("host cancellation", (test) => {
  test.effect("keeps BlobStore optional for Hosts that do not use attachments", () =>
    Effect.gen(function* () {
      const host = yield* Generalist.create({ agents: [] })
      expect(
        yield* host.attachments
          .put({ data: new Uint8Array([1]), mediaType: "application/octet-stream" })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/blob-store/BlobStoreError", operation: "host attachment" })
    }),
  )

  test.effect("cancels a Session Run through Runtime", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "host-cancel" })
      const host = yield* Generalist.create({ agents: [agent] })
      const session = yield* host.sessions.create({ id: "session:host:cancel" })
      const run = yield* host.runs.start(session.id, agent, "wait")
      yield* host.runs.cancel(run.id, "cancel:host-run", "user stopped")

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

layer(Layer.mergeAll(runtimeLayer, model, authorization, handlers))("host plugins", (test) => {
  test.effect("loads plugin tools, instructions, and skills in declared order", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "host-plugin" })
      const plugin = Generalist.plugin({
        name: "echo-plugin",
        tools: [pluginTool],
        instructions: [Instructions.fromText("echo-plugin", "Plugin guidance")],
        hooks: [
          Hooks.onRunEnd({
            key: "test.host.index.onRunEnd.1",
            version: "1",
            replayPolicy: "never",
            hook: () => Effect.succeed(Hooks.Replace("plugin hook complete")),
          }),
        ],
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
      yield* completeRun(run.id, "host:plugin")

      expect(yield* run.await).toBe("plugin hook complete")
      expect(handled).toBe(true)
      expect(advertisedTools).toContain("plugin_echo")
      expect(system).toContain("Plugin guidance")
      expect(system).toContain("plugin-skill")
    }),
  )
})

it.effect("object storage preserves Sessions and their root Run list across a fresh Layer", () => {
  const storage = makeObjectStorage()
  const agent = Agent.make({ name: "host-reopen" })
  const services = (workerId: string) =>
    Layer.mergeAll(
      objectRuntimeLayer({ addresses: [], workerId }, storage).pipe(Layer.provide(resolver)),
      modelLayer(() => textResponse("unused")),
      authorization,
    )
  return Effect.gen(function* () {
    const runId = yield* Effect.scoped(
      Layer.build(services("host-before-reopen")).pipe(
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
      Layer.build(services("host-after-reopen")).pipe(
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
