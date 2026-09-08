import { register as registerSnapshots } from "./snapshot-suite.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../runtime/execution/object.js"
import { BunCrypto } from "@effect/platform-bun"
import { expect, it, layer } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Hooks, Instructions, Permissions } from "generalist"
import { Generalist, type Host } from "generalist/host"
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
    test.effect("keeps direct root activation behind the active conversational Run", () =>
      Effect.gen(function* () {
        const agent = Agent.make({ name: "host-active-conversation" })
        const host = yield* Generalist.create({ agents: [agent] })
        const session = yield* host.sessions.create({ id: "host-active-conversation", agent: agent.name })
        yield* session.submit("active", { commandId: "active" })
        const before = yield* session.inspect
        const queued = yield* host.runs.start(session.id, agent, "explicit next")
        const store = yield* RunStore.RunStore
        expect(
          yield* store.activate({ runId: queued.id, commandId: "cannot-overtake" }).pipe(Effect.flip),
        ).toMatchObject({ _tag: "generalist/runtime/RuntimeUnavailable" })
        expect((yield* session.inspect).activeRunId).toBe(before.activeRunId)
        expect(yield* host.runs.inspect(queued.id)).toMatchObject({ status: "queued" })
        yield* completeRun(before.activeRunId!, "active-finished")
        expect((yield* session.inspect).activeRunId).toBe(queued.id)
      }),
    )
    test.effect("edits Session inputs before their distinct Runs start", () =>
      Effect.gen(function* () {
        const agent = Agent.make({ name: "host-session-queue" })
        const host = yield* Generalist.create({ agents: [agent] })
        const session = yield* host.sessions.create({ id: "host-queue", agent: agent.name })
        const first = yield* session.submit("first", { commandId: "first" })
        const firstState = yield* session.inspect
        expect(firstState.queue).toEqual([])
        expect(firstState.activeRunId).toBeDefined()
        const second = yield* session.submit("second", { commandId: "second" })
        const edit = yield* session.queue.update(second.id, "edited", {
          commandId: "edit",
          expectedRevision: second.revision,
        })
        expect(yield* session.queue.list()).toEqual([expect.objectContaining({ id: second.id, revision: 2 })])
        yield* completeRun(firstState.activeRunId!, "queue-first")
        const next = yield* (yield* host.sessions.get(session.id)).inspect
        expect(next.activeRunId).not.toBe(firstState.activeRunId)
        expect(next.queue).toEqual([])
        expect(yield* session.submit("first", { commandId: "first" })).toEqual(first)
        expect(
          yield* session.queue.update(second.id, "edited", { commandId: "edit", expectedRevision: second.revision }),
        ).toEqual(edit)
        expect(
          yield* session.queue.remove(second.id, { commandId: "late-remove", expectedRevision: 2 }).pipe(Effect.flip),
        ).toMatchObject({ _tag: "generalist/session/SessionQueueConflict", reason: "revision" })
        yield* completeRun(next.activeRunId!, "queue-second")
        expect((yield* session.inspect).activeRunId).toBeUndefined()
        expect(yield* host.runs.list(session.id)).toHaveLength(2)
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
        expect(yield* (yield* host.sessions.get(session.id)).inspect).toEqual(yield* session.inspect)
        expect(yield* host.sessions.list()).toContainEqual(yield* session.inspect)
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

it.effect("replays named Agent edits before resolving a changed or removed fresh Host registration", () =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    const writer = Agent.make({ name: "queue-retry-writer" })
    const originalReviewer = Agent.make({ name: "queue-retry-reviewer", instructions: "Original reviewer" })
    const changedReviewer = Agent.make({ name: "queue-retry-reviewer", instructions: "Replacement reviewer" })
    const withHost = <A, E>(
      reviewer: typeof writer | undefined,
      use: (
        host: Host<ReadonlyArray<typeof writer>>,
      ) => Effect.Effect<A, E, RunExecutor.RunExecutor | RunStore.RunStore>,
    ) =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(
            Layer.mergeAll(
              objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(resolver)),
              modelLayer(() => textResponse("done")),
              authorization,
            ),
          )
          return yield* Effect.gen(function* () {
            const agents = reviewer === undefined ? [writer] : [writer, reviewer]
            return yield* use(yield* Generalist.create({ agents }))
          }).pipe(Effect.provideContext(context))
        }),
      )
    const sessionId = "named-agent-retry"
    const editOptions = { commandId: "edit-1", expectedRevision: 1, agent: originalReviewer.name }
    const original = yield* withHost(originalReviewer, (host) =>
      Effect.gen(function* () {
        const session = yield* host.sessions.create({ id: sessionId, agent: writer.name })
        yield* session.submit("active", { commandId: "first" })
        const pending = yield* session.submit("draft", { commandId: "second" })
        const receipt = yield* session.queue.update(pending.id, "review", editOptions)
        const before = yield* session.inspect
        const pin = before.queue[0]!.selection.executableRef.active
        yield* completeRun(before.activeRunId!, "promote-review")
        expect(yield* session.queue.list()).toEqual([])
        return { id: pending.id, receipt, pin }
      }),
    )
    const replacement = yield* withHost(changedReviewer, (host) =>
      Effect.gen(function* () {
        const session = yield* host.sessions.get(sessionId)
        expect(yield* session.queue.update(original.id, "review", editOptions)).toEqual(original.receipt)
        expect(
          yield* session.queue.update(original.id, "changed content", editOptions).pipe(Effect.flip),
        ).toMatchObject({ reason: "input-conflict" })
        expect(
          yield* session.queue.update(original.id, "review", { ...editOptions, agent: writer.name }).pipe(Effect.flip),
        ).toMatchObject({ reason: "input-conflict" })
        const pending = yield* session.submit("new draft", { commandId: "third" })
        const options = { ...editOptions, commandId: "edit-2" }
        const receipt = yield* session.queue.update(pending.id, "new review", options)
        const queue = yield* session.queue.list()
        expect(queue[0]!.selection.executableRef.active).not.toBe(original.pin)
        return { id: pending.id, options, receipt, queue }
      }),
    )
    yield* withHost(undefined, (host) =>
      Effect.gen(function* () {
        const session = yield* host.sessions.get(sessionId)
        expect(yield* session.queue.update(original.id, "review", editOptions)).toEqual(original.receipt)
        expect(yield* session.queue.update(replacement.id, "new review", replacement.options)).toEqual(
          replacement.receipt,
        )
        expect(
          yield* session.queue
            .update(replacement.id, "not accepted", { ...editOptions, commandId: "revoked", expectedRevision: 2 })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "generalist/host/AgentNotRegistered", name: originalReviewer.name })
        expect(yield* session.queue.list()).toEqual(replacement.queue)
        expect(yield* host.runs.list(sessionId)).toHaveLength(2)
      }),
    )
  }),
)

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
