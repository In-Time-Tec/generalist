import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Hooks, Permissions } from "../../../../src/index.js"
import { ExecutableResolver, RunExecutor, Runtime, RunStore } from "../../../../src/runtime/index.js"
import { Runtime as SqliteRuntime } from "../../../../src/runtime/sqlite-bun.js"
import { provideScoped } from "../../../runtime/execution/scoped-provide.js"
import { tempDbPath } from "../../../runtime/sql/scenario.js"

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
    const filename = tempDbPath(input.label)
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
      Hooks.onToolCall(({ tool }) =>
        Effect.sync(() => {
          if (tool === "first_call") {
            hookCalls.first += 1
            if (input.blockFirst) return Hooks.Block({ reason: "blocked for replay test" })
          } else {
            hookCalls.second += 1
          }
          return Hooks.Ask()
        }),
      ),
      Hooks.onRunEnd<string>(() =>
        Effect.sync(() => {
          hookCalls.runEnd += 1
          return Hooks.Replace(`hook completed:${input.label}`)
        }),
      ),
    ])
    const environment = Layer.mergeAll(
      Permissions.layerAllowAll,
      Approvals.layerTest({ resolve: (pending) => Effect.succeed(pending) }),
      model,
      handlers,
      hooks,
    )
    const resolver = ExecutableResolver.layerStatic([]).pipe(Layer.orDie)
    const runtimeLayer = () =>
      Layer.merge(
        SqliteRuntime.layerSqlite({
          filename,
          addresses: [],
          scheduler: { pollInterval: "1 hour" },
        }).pipe(Layer.provide(resolver)),
        environment,
      )
    const startOptions = {
      sessionId: `session:${input.label}`,
      idempotencyKey: input.label,
    }

    const suspended = yield* provideScoped(
      runtimeLayer(),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        yield* runtime.register(agent)
        const handle = yield* runtime.start(agent, "run the approval batch", startOptions)
        yield* host.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: `${input.label}:seed` }))
        const inspection = yield* runtime.inspect(handle.runId)
        expect(inspection.status).toBe("waiting")
        expect(inspection.waits).toHaveLength(1)
        return { runId: handle.runId, waitId: inspection.waits[0]!.waitId }
      }),
    )

    yield* provideScoped(
      runtimeLayer(),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        yield* runtime.register(agent)
        const handle = yield* runtime.start(agent, "run the approval batch", startOptions)
        expect(handle.runId).toBe(suspended.runId)
        yield* runtime.respond({
          runId: suspended.runId,
          waitId: suspended.waitId,
          resolution: { _tag: "Approved" },
        })
        yield* host
          .execute(yield* store.claimExecution({ runId: suspended.runId, ownerId: `${input.label}:first-resume` }))
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
            .execute(yield* store.claimExecution({ runId: suspended.runId, ownerId: `${input.label}:second-resume` }))
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

it.live("replays a blocked and approved tool batch once after SQLite reopen", () =>
  approvalBatchScenario({ label: "blocked-approved-batch-replay", blockFirst: true }),
)

it.live("resumes two approval-gated calls one after another", () =>
  approvalBatchScenario({ label: "sequential-approval-batch-replay", blockFirst: false }),
)
