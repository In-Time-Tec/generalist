import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Permissions, ToolContext } from "generalist"
import { Generalist, WaitInvalid, WaitResult, type HostRun } from "generalist/host"
import { ExecutableResolver, RunExecutor, RunStore, Runtime, SessionSender } from "generalist/runtime"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../runtime/execution/object.js"
import { provideScoped } from "../runtime/execution/scoped-provide.js"

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

it.effect("reopens a message-completed wait without redispatch and preserves the sibling result barrier", () => {
  const storage = makeObjectStorage()
  let modelCalls = 0
  let waitCalls = 0
  let siblingCalls = 0
  let waitFor: HostRun<unknown>["wait"] = () => Effect.die("The parent handle must be assigned before execution")
  let childId = ""
  const waitTool = Tool.make("wait", {
    parameters: Schema.Struct({}),
    success: WaitResult,
    failure: Schema.Union([WaitInvalid, Agent.AwaitEventInvalid]),
  }).addDependency(ToolContext.ToolContext)
  const siblingTool = Tool.make("sibling", {
    parameters: Schema.Struct({}),
    success: Agent.AwaitEventResult,
    failure: Agent.AwaitEventInvalid,
  }).addDependency(ToolContext.ToolContext)
  const toolkit = Toolkit.make(waitTool, siblingTool)
  const child = Agent.make({ name: "question-child" })
  const agent = Agent.make({
    name: "question-parent",
    toolkit,
    children: [child.name],
    toolScheduling: { maxConcurrency: 2, parallelSafe: ["wait", "sibling"] },
  })
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: (options) => {
        modelCalls++
        if (modelCalls === 1)
          return Stream.fromIterable([
            Response.makePart("tool-call", { id: "wait-call", name: "wait", params: {}, providerExecuted: false }),
            Response.makePart("tool-call", {
              id: "sibling-call",
              name: "sibling",
              params: {},
              providerExecuted: false,
            }),
            finish,
          ])
        const results = options.prompt.content
          .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
          .filter(
            (part): part is { readonly type: "tool-result"; readonly id: string } =>
              typeof part === "object" &&
              part !== null &&
              "type" in part &&
              part.type === "tool-result" &&
              "id" in part &&
              typeof part.id === "string",
          )
        expect(results).toHaveLength(2)
        expect(results.map((part) => part.id)).toEqual(["wait-call", "sibling-call"])
        return Stream.make(Response.makePart("text-delta", { id: "done", delta: "I can answer the child now" }), finish)
      },
    }),
  )
  const handlers = toolkit.toLayer({
    wait: () =>
      Effect.suspend(() => {
        waitCalls++
        return waitFor({ runs: [childId], messages: true, commandId: "wait-question", timeout: "1 minute" })
      }),
    sibling: () =>
      Effect.suspend(() => {
        siblingCalls++
        return Agent.awaitEvent({ _tag: "Webhook", source: "sibling" }, { timeout: "1 minute" })
      }),
  })
  const hostLayer = () =>
    Layer.mergeAll(
      objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(ExecutableResolver.layerStatic([]))),
      model,
      handlers,
      Permissions.layerAllowAll,
      Approvals.layerAutoApprove,
    )
  const execute = (runId: string, commandId: string) =>
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const executor = yield* RunExecutor.RunExecutor
      yield* executor.execute(yield* store.claimExecution({ runId, commandId, ownerId: objectWorkerId }))
    })
  return Effect.gen(function* () {
    const admitted = yield* provideScoped(
      hostLayer(),
      Effect.gen(function* () {
        const host = yield* Generalist.create({ agents: [agent, child] })
        const session = yield* host.sessions.create({ id: "question-parent", agent: agent.name })
        const parent = yield* host.runs.start(session.id, agent, "Coordinate")
        waitFor = parent.wait
        const childRun = yield* parent.spawn(child.name, "I need clarification", { commandId: "child" })
        childId = childRun.run.id
        yield* execute(parent.id, "first-execution")
        expect((yield* host.runs.inspect(parent.id)).waits).toHaveLength(2)
        yield* session
          .message("Which files should I review?", { commandId: "question" })
          .pipe(Effect.provideService(SessionSender, { runId: childId }))
        expect((yield* host.runs.inspect(parent.id)).waits).toHaveLength(1)
        yield* execute(parent.id, "partial-execution")
        expect({ modelCalls, waitCalls, siblingCalls }).toEqual({ modelCalls: 1, waitCalls: 1, siblingCalls: 1 })
        return { parentId: parent.id, childId }
      }),
    )
    yield* provideScoped(
      hostLayer(),
      Effect.gen(function* () {
        const host = yield* Generalist.create({ agents: [agent, child] })
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const parent = yield* host.runs.get(admitted.parentId)
        waitFor = parent.wait
        const before = yield* runtime.history({ runId: parent.id, limit: 100 })
        const cursor = before.at(-1)!.sequence
        expect((yield* store.loadExecution(parent.id)).resolutions).toMatchObject([
          { resolution: { result: { _tag: "Message", cursor: 0 } } },
        ])
        yield* runtime.wake({
          runId: parent.id,
          commandId: "finish-sibling",
          event: { _tag: "Webhook", source: "sibling", dedupeKey: "sibling", payload: null, headers: {} },
        })
        yield* execute(parent.id, "final-execution")
        expect(yield* parent.await).toBe("I can answer the child now")
        expect({ modelCalls, waitCalls, siblingCalls }).toEqual({ modelCalls: 2, waitCalls: 1, siblingCalls: 1 })
        expect((yield* host.runs.inspect(admitted.childId)).status).not.toBe("cancelled")
        const replay = yield* runtime.history({ runId: parent.id, cursor, limit: 100 })
        expect(replay.every((event) => event.sequence > cursor)).toBe(true)
        expect({ modelCalls, waitCalls, siblingCalls }).toEqual({ modelCalls: 2, waitCalls: 1, siblingCalls: 1 })
      }),
    )
  })
})
