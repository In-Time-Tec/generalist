import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Toolkit } from "effect/unstable/ai"
import { Agent, AgentTool, RunBudget } from "../../../src/index.js"
import { ExecutableResolver, RunExecutor, RunStore, Runtime } from "../../../src/runtime/index.js"
import { allowAllAuthorization } from "../../authorization.js"
import { provideScoped } from "../execution/scoped-provide.js"

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = Response.makePart("finish", { reason: "stop", usage, response: undefined })
const ModelToolNames = Schema.Array(Schema.Struct({ name: Schema.String }))
const tools = (options: Parameters<Parameters<typeof LanguageModel.make>[0]["streamText"]>[0]) =>
  Schema.decodeSync(ModelToolNames)(options.tools).map((tool) => tool.name)

const failureFixture = (onFailure: "collect" | "failFast") => {
  const worker = Agent.make({
    name: `durable-${onFailure}-worker`,
    output: Schema.Struct({ value: Schema.String }),
  })
  const delegate = AgentTool.fanOut({
    name: `delegate_${onFailure}`,
    description: "Exercise durable child failure policy",
    agents: { worker },
    maxChildren: 2,
  })
  const parent = Agent.make({ name: `durable-${onFailure}-parent`, toolkit: Toolkit.make(delegate) })
  let parentCalls = 0
  let outputCalls = 0
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => {
        outputCalls += 1
        return Effect.succeed([
          {
            type: "text",
            text: outputCalls === 1 ? '{"output":{"value":42}}' : '{"output":{"value":"ok"}}',
          },
        ])
      },
      streamText: (options) => {
        if (tools(options).includes(delegate.name)) {
          parentCalls += 1
          if (parentCalls === 1) {
            return Stream.fromIterable([
              Response.makePart("tool-call", {
                id: `${onFailure}-call`,
                name: delegate.name,
                params: {
                  children: [
                    { agent: "worker", input: "invalid" },
                    { agent: "worker", input: "valid" },
                  ],
                  concurrency: onFailure === "failFast" ? 1 : 2,
                  onFailure,
                },
                providerExecuted: false,
              }),
              Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
            ])
          }
          return Stream.fromIterable([
            Response.makePart("text-delta", { id: "parent", delta: "parent recovered" }),
            finish,
          ])
        }
        return Stream.fromIterable([
          Response.makePart("text-delta", {
            id: "child",
            delta: "draft",
          }),
          finish,
        ])
      },
    }),
  )
  return {
    parent,
    delegate,
    layer: Layer.merge(
      Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
        Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
      ),
      Layer.merge(allowAllAuthorization, model),
    ),
  }
}

it.effect("runs typed durable children under the parent and returns their ordered Exits", () => {
  const researcher = Agent.make({ name: "durable-researcher" })
  const delegate = AgentTool.fanOut({
    name: "delegate_research",
    description: "Research independent topics",
    agents: { researcher },
    maxChildren: 4,
  })
  const parent = Agent.make({ name: "durable-parent", toolkit: Toolkit.make(delegate) })
  let parentCalls = 0
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: (options) => {
        if (tools(options).includes("delegate_research")) {
          parentCalls += 1
          if (parentCalls === 1) {
            return Stream.fromIterable([
              Response.makePart("tool-call", {
                id: "fan-out-call",
                name: "delegate_research",
                params: {
                  children: [
                    { agent: "researcher", input: "alpha" },
                    { agent: "researcher", input: "beta", budget: { tokens: 10 } },
                  ],
                  concurrency: 2,
                  onFailure: "collect",
                },
                providerExecuted: false,
              }),
              Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
            ])
          }
          return Stream.fromIterable([
            Response.makePart("text-delta", { id: "parent", delta: "parent complete" }),
            finish,
          ])
        }
        const prompt = JSON.stringify(options.prompt.content)
        return Stream.fromIterable([
          Response.makePart("text-delta", {
            id: "child",
            delta: prompt.includes("alpha") ? "alpha result" : "beta result",
          }),
          finish,
        ])
      },
    }),
  )
  const layer = Layer.merge(
    Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
      Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
    ),
    Layer.merge(allowAllAuthorization, model),
  )
  return provideScoped(
    layer,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const executor = yield* RunExecutor.RunExecutor
      const store = yield* RunStore.RunStore
      yield* runtime.register(parent)
      const handle = yield* runtime.start(parent, "research", {
        budget: RunBudget.make({ tokens: 100, children: 4 }),
      })
      yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "fan-out-parent-1" }))

      const checkpoint = yield* runtime.treeCheckpoint(handle.runId)
      const children = checkpoint.inspection.runs.filter((entry) => entry.parentRunId === handle.runId)
      expect(children).toHaveLength(2)
      expect(children.map((entry) => entry.run.status)).toEqual(["queued", "queued"])
      for (const [index, child] of children.entries()) {
        yield* executor.execute(
          yield* store.claimExecution({ runId: child.run.runId, ownerId: `fan-out-child-${index}` }),
        )
      }

      expect(yield* runtime.inspect(handle.runId)).toMatchObject({
        status: "running",
        budget: { children: 2 },
        children: [{ status: "succeeded" }, { status: "succeeded" }],
      })
      yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "fan-out-parent-2" }))
      expect(yield* handle.await).toBe("parent complete")

      const history = yield* runtime.history({ runId: handle.runId, limit: 100 })
      expect(history.filter((event) => event._tag === "ChildLinked").map((event) => event.budget?.tokens)).toEqual([
        24, 10,
      ])
      const completion = history.find(
        (event) => event._tag === "ToolExecutionCompleted" && event.call.name === "delegate_research",
      )
      expect(completion?._tag === "ToolExecutionCompleted" && completion.result.encodedResult).toMatchObject([
        { _tag: "Success", value: "alpha result" },
        { _tag: "Success", value: "beta result" },
      ])
      expect(history.map((event) => event._tag)).toContain("FanOutJoined")
    }),
  )
})

it.effect("encodes a durable child failure in collect results without failing the parent", () => {
  const fixture = failureFixture("collect")
  return provideScoped(
    fixture.layer,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const executor = yield* RunExecutor.RunExecutor
      const store = yield* RunStore.RunStore
      yield* runtime.register(fixture.parent)
      const handle = yield* runtime.start(fixture.parent, "collect failures")
      yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "collect-parent-1" }))
      const children = (yield* runtime.inspect(handle.runId)).children
      for (const [index, child] of children.entries()) {
        yield* executor.execute(
          yield* store.claimExecution({ runId: child.childRunId, ownerId: `collect-child-${index}` }),
        )
      }
      expect(yield* runtime.inspect(handle.runId)).toMatchObject({
        status: "running",
        children: [{ status: "failed" }, { status: "succeeded" }],
      })
      yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "collect-parent-2" }))
      expect(yield* handle.await).toBe("parent recovered")
      const history = yield* runtime.history({ runId: handle.runId, limit: 100 })
      const completion = history.find(
        (event) => event._tag === "ToolExecutionCompleted" && event.call.name === fixture.delegate.name,
      )
      expect(completion?._tag === "ToolExecutionCompleted" && completion.result.encodedResult).toMatchObject([
        { _tag: "Failure" },
        { _tag: "Success", value: { value: "ok" } },
      ])
    }),
  )
})

it.effect("fails the durable parent and requests cancellation of siblings in failFast mode", () => {
  const fixture = failureFixture("failFast")
  return provideScoped(
    fixture.layer,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const executor = yield* RunExecutor.RunExecutor
      const store = yield* RunStore.RunStore
      yield* runtime.register(fixture.parent)
      const handle = yield* runtime.start(fixture.parent, "fail fast")
      yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "fail-fast-parent-1" }))
      const children = (yield* runtime.inspect(handle.runId)).children
      yield* executor.execute(
        yield* store.claimExecution({ runId: children[0]!.childRunId, ownerId: "fail-fast-child" }),
      )
      expect(yield* runtime.inspect(handle.runId)).toMatchObject({
        status: "running",
        children: [{ status: "failed" }, { status: "cancelled" }],
      })
      yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "fail-fast-parent-2" }))
      const failed = yield* handle.await.pipe(Effect.flip)
      expect(failed).toMatchObject({ _tag: "RunFailed" })
      const siblingHistory = yield* runtime.history({ runId: children[1]!.childRunId, limit: 100 })
      expect(siblingHistory.map((event) => event._tag)).toContain("RunCancellationRequested")
      expect(siblingHistory.map((event) => event._tag)).toContain("RunCancelled")
    }),
  )
})
