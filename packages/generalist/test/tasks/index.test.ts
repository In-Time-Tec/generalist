/* oxlint-disable effecttsgo/strict-effect-provide -- Each test is a test-host Layer composition root. */
import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option, Ref, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, AgentTool, Approvals, Compaction, Hooks, Permissions, RunBudget, Tasks } from "../../src/index.js"
import { Generalist } from "../../src/host/index.js"
import { RunExecutor, ExecutableResolver, Runtime, RunStore } from "../../src/runtime/index.js"
import { Runtime as SqliteRuntime } from "../../src/runtime/sqlite-bun.js"
import { JournalFault } from "../../src/runtime/operation/journal-fault.js"
import { tempDbPath } from "../runtime/sql/scenario.js"

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = (reason: Response.FinishReason) => Response.makePart("finish", { reason, usage, response: undefined })
const textResponse = (text: string) =>
  Stream.make(Response.makePart("text-delta", { id: "tasks-answer", delta: text }), finish("stop"))
const modelLayer = (streamText: Parameters<typeof LanguageModel.make>[0]["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text" as const, text: "unused" }]),
      streamText,
    }),
  )
const authorization = Layer.mergeAll(Permissions.layerAllowAll, Approvals.layerAutoApprove)
const resolver = ExecutableResolver.layerStatic([]).pipe(Layer.orDie)
const readToolName = "tasks_read"
const writeToolName = "tasks_write"
const systemMessage = (prompt: Prompt.Prompt, marker: string): string | undefined =>
  prompt.content
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .find((content): content is string => Schema.is(Schema.String)(content) && content.startsWith(marker))
const scopedWith =
  <A, E>(layer: Layer.Layer<A, E, never>) =>
  <B, E2, R extends A>(effect: Effect.Effect<B, E2, R>): Effect.Effect<B, E | E2> =>
    Effect.scoped(Layer.build(layer).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))))
const interruptAfter = (operationCount: number): Layer.Layer<JournalFault> =>
  Layer.effect(
    JournalFault,
    Ref.make(0).pipe(
      Effect.map((count) =>
        JournalFault.of({
          afterJournaledOperation: Ref.updateAndGet(count, (current) => current + 1).pipe(
            Effect.flatMap((current) => (current === operationCount ? Effect.interrupt : Effect.void)),
          ),
        }),
      ),
    ),
  )

const initialItems: Tasks.TaskItems = [
  { id: "research", title: "Research the runtime", status: "doing", note: "Keep the journal authoritative" },
  { id: "ship", title: "Ship the change", status: "todo" },
]
const encodedItems = JSON.stringify(Schema.encodeSync(Tasks.Items)(initialItems))
const formattedItems = [
  "<generalist-tasks>",
  "Current journaled task list. Use tasks_write with the complete replacement to change it.",
  encodedItems,
  "</generalist-tasks>",
].join("\n")

it.live("emits TasksUpdated and restores the list from SQLite without redispatching tasks_write", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("tasks-reopen")
    const agent = Agent.make({ name: "tasks-reopen" })
    const options = {
      filename,
      addresses: [],
      scheduler: { pollInterval: "1 hour" as const },
    }
    const startOptions = {
      idempotencyKey: "tasks-reopen",
    }
    let dispatches = 0
    const hooks = Hooks.layer([
      Hooks.onToolCall(({ tool }) =>
        Effect.sync(() => {
          if (tool === writeToolName) dispatches += 1
          return Hooks.Continue()
        }),
      ),
    ])
    let firstModelCalls = 0
    const firstModel = modelLayer(() => {
      firstModelCalls += 1
      return Stream.make(
        Response.makePart("tool-call", {
          id: "tasks-write-once",
          name: writeToolName,
          params: { items: initialItems },
          providerExecuted: false,
        }),
        finish("tool-calls"),
      )
    })
    const firstLayer = Layer.mergeAll(
      SqliteRuntime.layerSqlite(options).pipe(Layer.provide(Layer.merge(resolver, interruptAfter(5)))),
      firstModel,
      authorization,
      Tasks.layer(),
      hooks,
    )

    const run = yield* scopedWith(firstLayer)(
      Effect.gen(function* () {
        const host = yield* Generalist.create({ agents: [agent] })
        const session = yield* host.sessions.create({ id: "session:tasks-reopen" })
        const handle = yield* host.runs.start(session.id, agent, "make a task list", startOptions)
        const executor = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        yield* executor.execute(yield* store.claimExecution({ runId: handle.id, ownerId: "before-reopen" }))
        expect((yield* host.runs.inspect(handle.id)).status).toBe("running")
        expect(dispatches).toBe(1)
        expect(firstModelCalls).toBe(1)
        return { runId: handle.id, sessionId: session.id }
      }),
    )

    let recoveredModelCalls = 0
    let recoveredTaskMessage = ""
    const recoveredModel = modelLayer((request) => {
      recoveredModelCalls += 1
      const taskMessage = systemMessage(request.prompt, "<generalist-tasks>")
      if (taskMessage !== undefined) recoveredTaskMessage = taskMessage
      return textResponse("recovered")
    })
    const recoveredLayer = Layer.mergeAll(
      SqliteRuntime.layerSqlite(options).pipe(Layer.provide(resolver)),
      recoveredModel,
      authorization,
      Tasks.layer(),
      hooks,
    )

    yield* scopedWith(recoveredLayer)(
      Effect.gen(function* () {
        const host = yield* Generalist.create({ agents: [agent] })
        const handle = yield* host.runs.start(run.sessionId, agent, "make a task list", startOptions)
        const executor = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        expect(handle.id).toBe(run.runId)
        yield* executor.execute(yield* store.claimExecution({ runId: handle.id, ownerId: "after-reopen" }))
        expect(yield* handle.await).toBe("recovered")

        const stream = yield* host.events.subscribe(run.sessionId)
        const events = Array.from(
          yield* stream.pipe(
            Stream.takeUntil((event) => event._tag === "Completed"),
            Stream.runCollect,
          ),
        )
        const updated = events.find((event) => event._tag === "TasksUpdated")
        expect(updated).toMatchObject({ _tag: "TasksUpdated", runId: run.runId, items: initialItems })
        expect(dispatches).toBe(1)
        expect(recoveredModelCalls).toBe(1)
        expect(recoveredTaskMessage).toBe(formattedItems)
      }),
    )
  }),
)

it.effect("retains the exact current list in compaction history", () => {
  let compactionTaskMessage = ""
  let secondModelTaskMessage = ""
  let modelCalls = 0
  const model = modelLayer((request) => {
    modelCalls += 1
    if (modelCalls === 1) {
      return Stream.make(
        Response.makePart("tool-call", {
          id: "tasks-before-compaction",
          name: writeToolName,
          params: { items: initialItems },
          providerExecuted: false,
        }),
        finish("tool-calls"),
      )
    }
    const taskMessage = systemMessage(request.prompt, "<generalist-tasks>")
    if (taskMessage !== undefined) secondModelTaskMessage = taskMessage
    return textResponse("compacted")
  })
  const compaction = Compaction.layerTest({
    maybeCompact: (request) => {
      const taskMessage = systemMessage(request.history, "<generalist-tasks>")
      if (taskMessage === undefined) return Effect.succeed(Option.none())
      compactionTaskMessage = taskMessage
      return Effect.succeed(
        Option.some({
          _tag: "Microcompact" as const,
          history: Prompt.make("compacted history without tasks"),
          prompt: request.prompt,
        }),
      )
    },
  })
  const agent = Agent.make({ name: "tasks-compaction" })

  return Agent.run(agent, "write and retain tasks").pipe(
    Effect.provide(Layer.mergeAll(model, authorization, Tasks.layer(), compaction)),
    Effect.tap((result) => Effect.sync(() => expect(result).toBe("compacted"))),
    Effect.tap(() =>
      Effect.sync(() => {
        expect(compactionTaskMessage).toBe(formattedItems)
        expect(secondModelTaskMessage).toBe(compactionTaskMessage)
      }),
    ),
  )
})

it.effect("gives inherit.tasks read-only parent context while the default gives none", () => {
  let parentCalls = 0
  const childPrompts: Array<string> = []
  const model = modelLayer((request) => {
    if (!request.tools.some((tool) => tool.name === "delegate_tasks")) {
      childPrompts.push(systemMessage(request.prompt, "<generalist-inherited-tasks") ?? "")
      return textResponse("child complete")
    }
    parentCalls += 1
    if (parentCalls === 1) {
      return Stream.make(
        Response.makePart("tool-call", {
          id: "tasks-before-children",
          name: writeToolName,
          params: { items: initialItems },
          providerExecuted: false,
        }),
        finish("tool-calls"),
      )
    }
    if (parentCalls === 2) {
      return Stream.make(
        Response.makePart("tool-call", {
          id: "delegate-with-tasks",
          name: "delegate_tasks",
          params: {
            children: [
              { agent: "reader", input: "child-with-tasks" },
              { agent: "isolated", input: "child-without-tasks" },
            ],
            concurrency: 1,
          },
          providerExecuted: false,
        }),
        finish("tool-calls"),
      )
    }
    return textResponse("parent complete")
  })
  const child = Agent.make({ name: "tasks-child" })
  const delegate = AgentTool.fanOut({
    name: "delegate_tasks",
    description: "Run task inheritance checks",
    agents: {
      reader: { agent: child, inherit: { tasks: "read", instructions: "own" } },
      isolated: { agent: child, inherit: { instructions: "own" } },
    },
    maxChildren: 2,
  })
  const parent = Agent.make({ name: "tasks-parent", toolkit: Toolkit.make(delegate) })

  return Agent.run(parent, "delegate after writing tasks").pipe(
    Effect.provide(Layer.mergeAll(model, authorization, Tasks.layer())),
    Effect.tap((result) => Effect.sync(() => expect(result).toBe("parent complete"))),
    Effect.tap(() =>
      Effect.sync(() => {
        expect(childPrompts).toHaveLength(2)
        expect(childPrompts[0]).toContain('<generalist-inherited-tasks readonly="true">')
        expect(childPrompts[0]).toContain(encodedItems)
        expect(childPrompts[1]).not.toContain("generalist-inherited-tasks")
      }),
    ),
  )
})

it.effect("journals task inheritance for durable children", () => {
  let parentCalls = 0
  const childTaskMessages: Array<string> = []
  const child = Agent.make({ name: "tasks-durable-child" })
  const delegate = AgentTool.fanOut({
    name: "delegate_durable_tasks",
    description: "Run durable task inheritance checks",
    agents: {
      reader: { agent: child, inherit: { tasks: "read", instructions: "own" } },
      isolated: { agent: child, inherit: { instructions: "own" } },
    },
    maxChildren: 2,
  })
  const parent = Agent.make({ name: "tasks-durable-parent", toolkit: Toolkit.make(delegate) })
  const model = modelLayer((request) => {
    if (!request.tools.some((tool) => tool.name === delegate.name)) {
      childTaskMessages.push(systemMessage(request.prompt, "<generalist-inherited-tasks") ?? "")
      return textResponse("child complete")
    }
    parentCalls += 1
    if (parentCalls === 1) {
      return Stream.make(
        Response.makePart("tool-call", {
          id: "durable-tasks-write",
          name: writeToolName,
          params: { items: initialItems },
          providerExecuted: false,
        }),
        finish("tool-calls"),
      )
    }
    if (parentCalls === 2) {
      return Stream.make(
        Response.makePart("tool-call", {
          id: "durable-tasks-delegate",
          name: delegate.name,
          params: {
            children: [
              { agent: "reader", input: "read tasks" },
              { agent: "isolated", input: "no tasks" },
            ],
            concurrency: 2,
          },
          providerExecuted: false,
        }),
        finish("tool-calls"),
      )
    }
    return textResponse("parent complete")
  })
  const layer = Layer.mergeAll(
    Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(Layer.provide(resolver)),
    model,
    authorization,
    Tasks.layer(),
  )

  return scopedWith(layer)(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const executor = yield* RunExecutor.RunExecutor
      const store = yield* RunStore.RunStore
      yield* runtime.register(parent)
      const handle = yield* runtime.start(parent, "delegate after writing tasks", {
        budget: RunBudget.make({ children: 2 }),
      })
      yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "tasks-parent-1" }))
      const tree = yield* runtime.treeCheckpoint(handle.runId)
      const children = tree.inspection.runs.filter((entry) => entry.parentRunId === handle.runId)
      expect(children).toHaveLength(2)
      for (const [index, entry] of children.entries()) {
        yield* executor.execute(
          yield* store.claimExecution({ runId: entry.run.runId, ownerId: `tasks-child-${index}` }),
        )
      }
      yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "tasks-parent-2" }))

      expect(yield* handle.await).toBe("parent complete")
      expect(childTaskMessages).toHaveLength(2)
      expect(childTaskMessages[0]).toContain(encodedItems)
      expect(childTaskMessages[1]).toBe("")
    }),
  )
})

it.effect("applies Tasks.update through runtime steer", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const wait = Tool.make("wait_for_steer", { parameters: Schema.Struct({}), success: Schema.String })
    const toolkit = Toolkit.make(wait)
    const agent = Agent.make({ name: "tasks-steering", toolkit })
    let modelCalls = 0
    const model = modelLayer(() => {
      modelCalls += 1
      if (modelCalls === 1) {
        return Stream.make(
          Response.makePart("tool-call", {
            id: "tasks-steer-initial",
            name: writeToolName,
            params: { items: initialItems },
            providerExecuted: false,
          }),
          finish("tool-calls"),
        )
      }
      if (modelCalls === 2) {
        return Stream.make(
          Response.makePart("tool-call", {
            id: "tasks-steer-wait",
            name: "wait_for_steer",
            params: {},
            providerExecuted: false,
          }),
          finish("tool-calls"),
        )
      }
      if (modelCalls === 3) {
        return Stream.make(
          Response.makePart("tool-call", {
            id: "tasks-steer-read",
            name: readToolName,
            params: {},
            providerExecuted: false,
          }),
          finish("tool-calls"),
        )
      }
      if (modelCalls === 4) {
        return Stream.make(
          Response.makePart("tool-call", {
            id: "tasks-steer-write",
            name: writeToolName,
            params: { items: initialItems.map((item) => (item.id === "ship" ? { ...item, status: "done" } : item)) },
            providerExecuted: false,
          }),
          finish("tool-calls"),
        )
      }
      return textResponse("steered")
    })
    const handlers = toolkit.toLayer({
      wait_for_steer: () =>
        Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as("released")),
    })
    const runtimeLayer = Layer.mergeAll(
      Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(Layer.provide(resolver)),
      model,
      authorization,
      handlers,
      Tasks.layer(),
    )

    yield* scopedWith(runtimeLayer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const executor = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        yield* runtime.register(agent)
        const handle = yield* runtime.start(agent, "start tasks", {
          sessionId: "session:tasks-steering",
          idempotencyKey: "tasks-steering",
        })
        const execution = yield* executor
          .execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "tasks-steering" }))
          .pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)
        yield* runtime.send(handle.runId, Tasks.update([{ id: "ship", status: "done" }]), { policy: "steer" })
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(execution)

        expect(yield* handle.await).toBe("steered")
        const history = yield* runtime.history({ runId: handle.runId, limit: 100 })
        const updates = history.flatMap((event) =>
          event._tag === "ToolExecutionCompleted" && event.tasksUpdated !== undefined ? [event.tasksUpdated] : [],
        )
        expect(updates).toHaveLength(2)
        expect(updates.at(-1)?.find((item) => item.id === "ship")?.status).toBe("done")
      }),
    )
  }),
)
