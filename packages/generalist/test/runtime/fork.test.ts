import { expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ToolContext } from "../../src/index.js"
import { ExecutableResolver, RunExecutor, Runtime, RunStore } from "../../src/runtime/index.js"
import { Runtime as SqliteRuntime } from "../../src/runtime/sqlite-bun.js"
import { allowAllAuthorization } from "../authorization.js"
import { tempDbPath } from "./sql/scenario.js"

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const scopedWith =
  <A, E>(layer: Layer.Layer<A, E, never>) =>
  <B, E2, R extends A>(effect: Effect.Effect<B, E2, R>): Effect.Effect<B, E | E2> =>
    Effect.scoped(Layer.build(layer).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))))

it.live("replays a substituted tool result after reopen without redispatch", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("counterfactual-fork")
    const tool = Tool.make("lookup", { parameters: Schema.Struct({}), success: Schema.String }).addDependency(
      ToolContext.ToolContext,
    )
    const toolkit = Toolkit.make(tool)
    const agent = Agent.make({ name: "counterfactual-fork", toolkit })
    let toolCalls = 0
    const handlers = toolkit.toLayer({
      lookup: () =>
        Effect.gen(function* () {
          toolCalls += 1
          const context = yield* ToolContext.ToolContext
          yield* context.emit({
            toolCallId: context.toolCallId ?? "lookup-1",
            message: "SandboxSnapshot",
            data: { _tag: "SandboxSnapshot", snapshotId: "snapshot:counterfactual" },
          })
          return "original"
        }),
    })
    const options = {
      filename,
      addresses: [],
      scheduler: { pollInterval: "1 hour" as const },
    }
    const resolver = ExecutableResolver.layerStatic([]).pipe(Layer.orDie)
    let firstModelCalls = 0
    const firstModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          firstModelCalls += 1
          if (firstModelCalls > 1) return Stream.never
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("tool-call", {
              id: "lookup-1",
              name: "lookup",
              params: {},
              providerExecuted: false,
            }),
            finish,
          ])
        },
      }),
    )
    const firstLayer = Layer.merge(
      SqliteRuntime.layerSqlite(options).pipe(Layer.provide(resolver)),
      Layer.mergeAll(allowAllAuthorization, firstModel, handlers),
    )
    const source = yield* scopedWith(firstLayer)(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const executor = yield* RunExecutor.RunExecutor
          const store = yield* RunStore.RunStore
          yield* runtime.register(agent)
          const handle = yield* runtime.start(agent, "look it up", {
            sessionId: "session:counterfactual-fork",
            idempotencyKey: "counterfactual-fork",
          })
          yield* executor
            .execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "counterfactual-source" }))
            .pipe(Effect.forkScoped)
          const completed = yield* runtime.events({ runId: handle.runId }).pipe(
            Stream.filter((event) => event._tag === "ToolExecutionCompleted"),
            Stream.runHead,
          )
          expect(Option.isSome(completed)).toBe(true)
          const operation = yield* store.getOperationByKey({
            runId: handle.runId,
            operationKey: `${handle.runId}:tool:0:lookup-1:lookup`,
          })
          expect(operation?.status).toBe("succeeded")
          return {
            runId: handle.runId,
            operationId: operation!.operationId,
            atSequence: completed.pipe(Option.getOrThrow).sequence,
          }
        }),
      ),
    )

    let recoveredPrompt = ""
    let recoveredModelCalls = 0
    const recoveredModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (request) => {
          recoveredModelCalls += 1
          recoveredPrompt = JSON.stringify(request.prompt.content)
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: "counterfactual", delta: "counterfactual complete" }),
            finish,
          ])
        },
      }),
    )
    const recoveredLayer = Layer.merge(
      SqliteRuntime.layerSqlite(options).pipe(Layer.provide(resolver)),
      Layer.mergeAll(allowAllAuthorization, recoveredModel, handlers),
    )

    yield* scopedWith(recoveredLayer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const executor = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        yield* runtime.register(agent)
        const branch = yield* runtime.fork(source.runId, {
          atSequence: source.atSequence,
          substitute: {
            operationId: source.operationId,
            result: { _tag: "Success", result: "substituted", encodedResult: "substituted" },
          },
        })
        yield* executor.execute(yield* store.claimExecution({ runId: branch.runId, ownerId: "counterfactual-branch" }))
        expect(yield* branch.await).toBe("counterfactual complete")
        expect(toolCalls).toBe(1)
        expect(recoveredModelCalls).toBe(1)
        expect(recoveredPrompt).toContain("substituted")
        const history = yield* runtime.history({ runId: branch.runId, limit: 100 })
        expect(history.filter((event) => event._tag === "Substituted")).toHaveLength(1)
        expect(history.filter((event) => event._tag === "ToolExecutionStarted")).toHaveLength(1)
      }),
    )
  }),
)
