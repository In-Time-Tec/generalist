import { expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Hooks, Permissions, ToolExecutor, ToolOutput } from "../../../../src/index.js"
import { ExecutableResolver } from "../../../../src/runtime/index.js"
import * as Runtime from "../../../../src/runtime/engine.js"
import { RunStore } from "../../../../src/runtime/run/store.js"
import { RunExecutor } from "../../../../src/runtime/execution/run-executor.js"
import { provideScoped } from "../../../runtime/execution/scoped-provide.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../../../runtime/execution/object.js"

const finish = (reason: "stop" | "tool-calls") =>
  Response.makePart("finish", {
    reason,
    usage: Response.Usage.make({
      inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    }),
    response: undefined,
  })

const approvalBatchScenario = (input: { readonly label: string; readonly blockFirst: boolean }) =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    const first = Tool.make("first_call", { parameters: Schema.Struct({}), success: Schema.String })
    const second = Tool.make("second_call", { parameters: Schema.Struct({}), success: Schema.String })
    const toolkit = Toolkit.make(first, second)
    const agent = Agent.make({ name: input.label, toolkit })
    const executions = { first: 0, second: 0 }
    const hookCalls = { first: 0, second: 0, runEnd: 0 }
    let modelCalls = 0
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          modelCalls += 1
          return Stream.fromIterable<Response.StreamPartEncoded>(
            modelCalls === 1
              ? [
                  Response.makePart("tool-call", {
                    id: "first-call",
                    name: "first_call",
                    params: {},
                    providerExecuted: false,
                  }),
                  Response.makePart("tool-call", {
                    id: "second-call",
                    name: "second_call",
                    params: {},
                    providerExecuted: false,
                  }),
                  finish("tool-calls"),
                ]
              : [Response.makePart("text-delta", { id: "done", delta: "model completed" }), finish("stop")],
          )
        },
      }),
    )
    const handlers = toolkit.toLayer({
      first_call: () =>
        Effect.sync(() => {
          executions.first += 1
          return "first result"
        }),
      second_call: () =>
        Effect.sync(() => {
          executions.second += 1
          return "second result"
        }),
    })
    const hooks = Hooks.layer([
      Hooks.onToolCall({
        key: "test.core.agent.tools.resume.batch.onToolCall.1",
        version: "1",
        replayPolicy: "never",
        hook: ({ tool }) =>
          Effect.sync(() => {
            if (tool === "first_call") {
              hookCalls.first += 1
              if (input.blockFirst) return Hooks.Block({ reason: "blocked for replay test" })
            } else {
              hookCalls.second += 1
            }
            return Hooks.Ask()
          }),
      }),
      Hooks.onRunEnd<string>({
        key: "test.core.agent.tools.resume.batch.onRunEnd.1",
        version: "1",
        replayPolicy: "never",
        hook: () =>
          Effect.sync(() => {
            hookCalls.runEnd += 1
            return Hooks.Replace(`hook completed:${input.label}`)
          }),
      }),
    ])
    const environment = Layer.mergeAll(
      Permissions.layerAllowAll,
      Approvals.layerTest({ resolve: (pending) => Effect.succeed(pending) }),
      model,
      handlers,
      hooks,
    )
    const resolver = ExecutableResolver.layerStatic([]).pipe(Layer.orDie)
    const runtimeLayer = (workerId: string) =>
      Layer.merge(
        objectRuntimeLayer({ addresses: [], scheduler: { pollInterval: "1 hour" }, workerId }, storage).pipe(
          Layer.provide(resolver),
        ),
        environment,
      )
    const startOptions = {
      sessionId: `session:${input.label}`,
      idempotencyKey: input.label,
    }

    const suspended = yield* provideScoped(
      runtimeLayer(objectWorkerId),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor
        const store = yield* RunStore
        yield* runtime.register(agent)
        const handle = yield* runtime.start(agent, "run the approval batch", startOptions)
        yield* host.execute(
          yield* store.claimExecution({
            runId: handle.runId,
            ownerId: objectWorkerId,
            commandId: `resume-batch:${input.label}:seed`,
          }),
        )
        const inspection = yield* runtime.inspect(handle.runId)
        expect(inspection.status).toBe("waiting")
        expect(inspection.waits).toHaveLength(1)
        return { runId: handle.runId, waitId: inspection.waits[0]!.waitId }
      }),
    )

    yield* provideScoped(
      runtimeLayer(`${objectWorkerId}:${input.label}:reopen`),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor
        const store = yield* RunStore
        yield* runtime.register(agent)
        const handle = yield* runtime.start(agent, "run the approval batch", startOptions)
        expect(handle.runId).toBe(suspended.runId)
        yield* runtime.respond({
          runId: suspended.runId,
          waitId: suspended.waitId,
          resolution: { _tag: "Approved" },
        })
        yield* host
          .execute(
            yield* store.claimExecution({
              runId: suspended.runId,
              ownerId: `${objectWorkerId}:${input.label}:reopen`,
              commandId: `resume-batch:${input.label}:first-resume`,
            }),
          )
          .pipe(Effect.timeout("5 seconds"))

        if (!input.blockFirst) {
          const secondWait = yield* runtime.inspect(suspended.runId)
          expect(secondWait.status).toBe("waiting")
          expect(secondWait.waits).toHaveLength(1)
          yield* runtime.respond({
            runId: suspended.runId,
            waitId: secondWait.waits[0]!.waitId,
            resolution: { _tag: "Approved" },
          })
          yield* host
            .execute(
              yield* store.claimExecution({
                runId: suspended.runId,
                ownerId: `${objectWorkerId}:${input.label}:reopen`,
                commandId: `resume-batch:${input.label}:second-resume`,
              }),
            )
            .pipe(Effect.timeout("5 seconds"))
        }

        expect(yield* handle.await).toBe(`hook completed:${input.label}`)
        const history = yield* runtime.history({ runId: suspended.runId, limit: 100 })
        expect(history.filter((event) => event._tag === "TurnCompleted")).toHaveLength(input.blockFirst ? 3 : 4)
      }),
    )

    expect(executions).toEqual({ first: input.blockFirst ? 0 : 1, second: 1 })
    expect(hookCalls).toEqual({ first: 1, second: 1, runEnd: 1 })
    expect(modelCalls).toBe(2)
  })

it.live("replays a blocked and approved tool batch once after object storage reopen", () =>
  approvalBatchScenario({ label: "blocked-approved-batch-replay", blockFirst: true }),
)

it.live("resumes two approval-gated calls one after another", () =>
  approvalBatchScenario({ label: "sequential-approval-batch-replay", blockFirst: false }),
)

const resolvedBatchScenario = (input: { readonly label: string }) =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    const payload = "z".repeat(60 * 1024)
    const waitTool = Tool.make("wait_call", { parameters: Schema.Struct({}), success: Schema.String })
    const toolkit = Toolkit.make(waitTool)
    const agent = Agent.make({ name: input.label, toolkit })
    const puts: Array<string> = []
    let modelCalls = 0
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          modelCalls += 1
          return Stream.fromIterable<Response.StreamPartEncoded>(
            modelCalls === 1
              ? [
                  Response.makePart("tool-call", {
                    id: "wait-call",
                    name: "wait_call",
                    params: {},
                    providerExecuted: false,
                  }),
                  finish("tool-calls"),
                ]
              : [Response.makePart("text-delta", { id: "done", delta: "model completed" }), finish("stop")],
          )
        },
      }),
    )
    const environment = Layer.mergeAll(
      Permissions.layerAllowAll,
      Approvals.layerAutoApprove,
      model,
      toolkit.toLayer({ wait_call: () => Effect.die("ToolExecutor owns this call") }),
      ToolExecutor.layerTest({
        execute: () => Effect.succeed({ _tag: "Suspend" as const, token: "wait-token" }),
      }),
      ToolOutput.layerTest({
        put: (toolCallId) => {
          puts.push(toolCallId)
          return Effect.succeed(Option.some(`mem:${puts.length}`))
        },
      }),
    )
    const resolver = ExecutableResolver.layerStatic([]).pipe(Layer.orDie)
    const runtimeLayer = (workerId: string) =>
      Layer.merge(
        objectRuntimeLayer({ addresses: [], scheduler: { pollInterval: "1 hour" }, workerId }, storage).pipe(
          Layer.provide(resolver),
        ),
        environment,
      )
    const startOptions = {
      sessionId: `session:${input.label}`,
      idempotencyKey: input.label,
    }

    const suspended = yield* provideScoped(
      runtimeLayer(objectWorkerId),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor
        const store = yield* RunStore
        yield* runtime.register(agent)
        const handle = yield* runtime.start(agent, "run the resolved batch", startOptions)
        yield* host.execute(
          yield* store.claimExecution({
            runId: handle.runId,
            ownerId: objectWorkerId,
            commandId: `resolved-batch:${input.label}:seed`,
          }),
        )
        expect((yield* runtime.inspect(handle.runId)).status).toBe("waiting")
        return { runId: handle.runId }
      }),
    )

    yield* provideScoped(
      runtimeLayer(`${objectWorkerId}:${input.label}:reopen`),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor
        const store = yield* RunStore
        yield* runtime.register(agent)
        const handle = yield* runtime.start(agent, "run the resolved batch", startOptions)
        expect(handle.runId).toBe(suspended.runId)
        const waiting = yield* runtime.inspect(suspended.runId)
        expect(waiting.status).toBe("waiting")
        yield* runtime.respond({
          runId: suspended.runId,
          waitId: waiting.waits[0]!.waitId,
          resolution: { _tag: "ToolResult", result: payload, encodedResult: payload },
        })
        yield* host
          .execute(
            yield* store.claimExecution({
              runId: suspended.runId,
              ownerId: `${objectWorkerId}:${input.label}:reopen`,
              commandId: `resolved-batch:${input.label}:resume`,
            }),
          )
          .pipe(Effect.timeout("5 seconds"))
        expect(yield* handle.await.pipe(Effect.timeout("5 seconds"))).toBe("model completed")
        expect(puts).toEqual(["wait-call"])
      }),
    )

    // A fresh Layer exact retry observes the committed bounded outcome and must not spill again.
    yield* provideScoped(
      runtimeLayer(`${objectWorkerId}:${input.label}:replay`),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        yield* runtime.register(agent)
        const handle = yield* runtime.start(agent, "run the resolved batch", startOptions)
        expect(handle.runId).toBe(suspended.runId)
        expect((yield* runtime.inspect(suspended.runId)).status).toBe("succeeded")
        const completions = (yield* runtime.history({ runId: suspended.runId, limit: 100 })).filter(
          (event) => event._tag === "ToolExecutionCompleted",
        )
        expect(completions).toHaveLength(1)
        const completed = completions[0]
        if (completed?._tag !== "ToolExecutionCompleted") return yield* Effect.die("tool completion missing")
        expect(completed.result.result).toMatchObject({
          inline: { truncated: true, bytes: 60 * 1024 + 2, maxBytes: 50 * 1024 },
          outputPaths: ["mem:1"],
        })
        expect(puts).toEqual(["wait-call"])
      }),
    )

    expect(modelCalls).toBe(2)
  })

it.live("bounds and spills a host ToolResult resolution once across object storage reopen", () =>
  resolvedBatchScenario({ label: "resolved-output-batch-replay" }),
)
