import { expect, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, DurableDriver, RunBudget } from "../../../../src/index.js"
import { ExecutableResolver, RunExecutor, RunStore, Runtime } from "../../../../src/runtime/index.js"
import { AgentExecutionFailure, RuntimeUnavailable } from "../../../../src/runtime/errors.js"
import { Runtime as SqliteRuntime } from "../../../../src/runtime/sqlite-bun.js"
import { layer as activeExecutionsLayer } from "../../../../src/runtime/execution/active-executions.js"
import { make as makeRunExecutor } from "../../../../src/runtime/execution/run-executor-internal.js"
import { allowAllAuthorization } from "../../../authorization.js"
import { registrationsFor, textPrompt } from "../fixtures.js"
import { testExecutable } from "../../run/identity.js"
import { tempDbPath } from "../../sql/scenario.js"

const scopedWith =
  <A, E>(layer: Layer.Layer<A, E>) =>
  <B, E2, R extends A>(effect: Effect.Effect<B, E2, R>) =>
    Effect.scoped(Layer.build(layer).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))))

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

for (const boundary of ["cancel-settlement", "stream-completion"] as const) {
  for (const persisted of [false, true]) {
    it.live(
      `${boundary} recovers after ${persisted ? "persisted write" : "pre-write"} interruption/failure on reopened SQLite`,
      () =>
        Effect.gen(function* () {
          const filename = tempDbPath(boundary)
          const started = yield* Deferred.make<void>()
          const committing = yield* Deferred.make<void>()
          const agent = Agent.make({ name: boundary })
          const executable = testExecutable(agent)
          let invocations = 0
          let exhausted = false
          let writes = 0
          const fault = RuntimeUnavailable.make({ message: "injected settlement storage failure" })
          const model = Layer.effect(
            LanguageModel.LanguageModel,
            LanguageModel.make({
              generateText: () => Effect.die("stream only"),
              streamText: () =>
                Stream.suspend(() => {
                  invocations += 1
                  return boundary === "cancel-settlement"
                    ? Stream.make(Response.makePart("text-delta", { id: "partial", delta: "partial" })).pipe(
                        Stream.concat(
                          Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
                            Stream.flatMap(() => Stream.never),
                          ),
                        ),
                      )
                    : Stream.fromIterable<Response.StreamPartEncoded>([
                        Response.makePart("text-delta", { id: "answer", delta: "done" }),
                        finish,
                      ]).pipe(
                        Stream.concat(
                          Stream.fromEffect(
                            Effect.gen(function* () {
                              const interpreter = yield* Effect.serviceOption(DurableDriver.DriverInterpreter)
                              if (Option.isNone(interpreter)) return yield* Effect.die("missing driver")
                              yield* interpreter.value.updateCapabilityCheckpoint((current) => ({
                                checkpoint: {
                                  events: [
                                    ...(current?.events ?? []),
                                    { _tag: "TaintCleared", turn: 0, compaction: "during-source" },
                                  ],
                                  taint: [],
                                },
                                value: undefined,
                              }))
                              exhausted = true
                            }).pipe(Effect.orDie),
                          ).pipe(Stream.drain),
                        ),
                      )
                }),
            }),
          )
          const resolver = ExecutableResolver.layerStatic([
            { executable, agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, model)) },
          ]).pipe(Layer.orDie)
          const layer = () =>
            SqliteRuntime.layerSqlite({ filename, addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
              Layer.provide(resolver),
            )

          const first = yield* scopedWith(layer())(
            Effect.gen(function* () {
              const runtime = yield* Runtime.Runtime
              const store = yield* RunStore.RunStore
              const receipt = yield* runtime.startExecution({
                executable,
                registrations: registrationsFor(executable),
                sessionId: `${boundary}:${persisted}`,
                idempotencyKey: "boundary",
                prompt: textPrompt("answer once"),
                budget: RunBudget.make({ tokens: 3 }),
              })
              const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "before-reopen" })
              const faultyStore: RunStore.Service = {
                ...store,
                commitInterruptedModelResponse: (input) =>
                  Effect.gen(function* () {
                    writes += 1
                    if (persisted) yield* store.commitInterruptedModelResponse(input)
                    return yield* fault
                  }),
                commitModelResponse: (input) =>
                  Effect.gen(function* () {
                    writes += 1
                    if (persisted) yield* store.commitModelResponse(input)
                    yield* Deferred.succeed(committing, undefined)
                    return yield* Effect.never
                  }),
              }
              yield* scopedWith(
                Layer.mergeAll(Layer.succeed(RunStore.RunStore, faultyStore), activeExecutionsLayer, resolver),
              )(
                Effect.gen(function* () {
                  const host = yield* makeRunExecutor
                  const caller = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
                  if (boundary === "cancel-settlement") {
                    yield* Deferred.await(started).pipe(Effect.timeout("5 seconds"))
                    // Persist the request before interrupting, as Runtime.cancel does.
                    yield* store.cancel({ runId: receipt.runId, reason: "test cancellation" })
                  } else {
                    yield* Deferred.await(committing).pipe(Effect.timeout("5 seconds"))
                    expect(exhausted).toBe(true)
                  }
                  yield* host.interrupt(receipt.runId)
                  const exit = yield* Fiber.await(caller).pipe(Effect.timeout("5 seconds"))
                  if (boundary === "cancel-settlement") {
                    expect(Exit.isFailure(exit)).toBe(true)
                    if (Exit.isFailure(exit)) {
                      expect(exit.cause.reasons).toContainEqual(expect.objectContaining({ defect: fault }))
                      expect(Cause.hasInterrupts(exit.cause)).toBe(false)
                    }
                  } else {
                    // RunExecutor observes the child interruption; its hosting caller finishes normally.
                    expect(Exit.isSuccess(exit)).toBe(true)
                  }
                }),
              )
              expect(writes).toBe(1)
              expect(invocations).toBe(1)
              const operation = yield* store.getOperationByKey({
                runId: receipt.runId,
                operationKey: `${receipt.runId}:model:0:0:conversation`,
              })
              expect(operation).toBeDefined()
              if (boundary === "cancel-settlement") {
                expect(operation?.status).toBe(persisted ? "failed" : "running")
              } else {
                expect(operation?.status).toBe(persisted ? "succeeded" : "unknown")
                // Completion must preserve checkpoint updates made after scheduling the model.
                expect((yield* store.loadExecution(receipt.runId)).checkpoint).toMatchObject({
                  state: { capabilities: { events: [{ _tag: "TaintCleared", compaction: "during-source" }] } },
                })
              }
              return { runId: receipt.runId, operationId: operation!.operationId }
            }),
          )

          yield* scopedWith(layer())(
            Effect.gen(function* () {
              const runtime = yield* Runtime.Runtime
              const store = yield* RunStore.RunStore
              const host = yield* RunExecutor.RunExecutor
              if ((yield* runtime.inspect(first.runId)).status !== "needs-resolution") {
                yield* host.execute(yield* store.claimExecution({ runId: first.runId, ownerId: "reopened" }))
              }
              if (!persisted) {
                expect((yield* runtime.inspect(first.runId)).status).toBe("needs-resolution")
                expect((yield* store.getOperation(first)).status).toBe("unknown")
                expect((yield* runtime.operator.explain(first.runId)).decision).toMatchObject({
                  _tag: "Unknown",
                  operationId: first.operationId,
                })
                expect(invocations).toBe(1)
                yield* runtime.resolveOperation({
                  ...first,
                  idempotencyKey: "external-evidence",
                  resolution: {
                    _tag: "Failed",
                    error: AgentExecutionFailure.make({ message: "operator confirmed no usable result" }),
                  },
                })
                if (boundary !== "cancel-settlement") {
                  yield* host.execute(yield* store.claimExecution({ runId: first.runId, ownerId: "resolved" }))
                }
              }
              const recoveredStatus = persisted ? "succeeded" : "failed"
              expect((yield* runtime.inspect(first.runId)).status).toBe(
                boundary === "cancel-settlement" ? "cancelled" : recoveredStatus,
              )
              expect(invocations).toBe(1)
              expect((yield* store.getOperation(first)).status).toBe(
                boundary === "stream-completion" && persisted ? "succeeded" : "failed",
              )
              const events = yield* runtime.history({ runId: first.runId, limit: 100 })
              expect(events.filter((event) => event._tag === "OperationUnknown")).toHaveLength(persisted ? 0 : 1)
              expect(events.filter((event) => event._tag === "ModelResponseCommitted")).toHaveLength(
                boundary === "stream-completion" && persisted ? 1 : 0,
              )
              if (boundary === "stream-completion" && persisted) {
                expect(events.find((event) => event._tag === "RunCompleted")?.result).toMatchObject({
                  text: "done",
                  output: "done",
                })
                expect((yield* store.loadExecution(first.runId)).checkpoint).toMatchObject({
                  budget: { remaining: { tokens: 1 } },
                  state: { capabilities: { events: [{ _tag: "TaintCleared", compaction: "during-source" }] } },
                })
              }
            }),
          )
        }),
    )
  }
}

it.live("replays a committed tool response across two interruptions and a budget extension without redispatch", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("repeated-model-replay")
    const toolkit = Toolkit.make(Tool.make("write", { parameters: Schema.Struct({}), success: Schema.String }))
    const agent = Agent.make({ name: "repeated-model-replay", toolkit })
    const executable = testExecutable(agent)
    let modelCalls = 0
    let toolCalls = 0
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.die("stream only"),
        streamText: () =>
          Stream.suspend(() => {
            modelCalls += 1
            return Stream.fromIterable<Response.StreamPartEncoded>(
              modelCalls === 1
                ? [
                    Response.makePart("tool-call", {
                      id: "write-once",
                      name: "write",
                      params: {},
                      providerExecuted: false,
                    }),
                    finish,
                  ]
                : [
                    Response.makePart("text-delta", { id: "done", delta: "written" }),
                    Response.makePart("finish", {
                      reason: "stop",
                      response: undefined,
                      usage: Response.Usage.make({
                        inputTokens: { total: 0, uncached: 0, cacheRead: undefined, cacheWrite: undefined },
                        outputTokens: { total: 0, text: 0, reasoning: undefined },
                      }),
                    }),
                  ],
            )
          }),
      }),
    )
    const resolver = ExecutableResolver.layerStatic([
      {
        executable,
        agent: Agent.close(
          agent,
          Layer.mergeAll(
            allowAllAuthorization,
            model,
            toolkit.toLayer({
              write: () =>
                Effect.sync(() => {
                  toolCalls += 1
                  return "written"
                }),
            }),
          ),
        ),
      },
    ]).pipe(Layer.orDie)
    const layer = () =>
      SqliteRuntime.layerSqlite({ filename, addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
        Layer.provide(resolver),
      )
    let runId = ""
    for (const phase of ["write", "replay"] as const) {
      yield* scopedWith(layer())(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          if (phase === "write") {
            const receipt = yield* runtime.startExecution({
              executable,
              registrations: registrationsFor(executable),
              sessionId: "repeated-model-replay",
              idempotencyKey: "repeated-model-replay",
              prompt: "write once",
              budget: RunBudget.make({ tokens: 1 }),
            })
            runId = receipt.runId
          } else {
            // Canonical usage exhausted the budget. Reopening must suspend before dispatching anything.
            const host = yield* RunExecutor.RunExecutor
            yield* host.execute(yield* store.claimExecution({ runId, ownerId: "exhausted" }))
            expect((yield* runtime.inspect(runId)).status).toBe("waiting")
            expect(modelCalls).toBe(1)
            expect(toolCalls).toBe(0)
            yield* runtime.extendBudget(runId, { tokens: 2 })
          }
          const paused = yield* Deferred.make<void>()
          const faultyStore: RunStore.Service = {
            ...store,
            commitModelResponse: (input) =>
              store
                .commitModelResponse(input)
                .pipe(
                  Effect.tap(() =>
                    input.transitionDigest === undefined
                      ? Effect.void
                      : Deferred.succeed(paused, undefined).pipe(Effect.andThen(Effect.never)),
                  ),
                ),
          }
          yield* scopedWith(
            Layer.mergeAll(Layer.succeed(RunStore.RunStore, faultyStore), activeExecutionsLayer, resolver),
          )(
            Effect.gen(function* () {
              const host = yield* makeRunExecutor
              const caller = yield* host
                .execute(yield* store.claimExecution({ runId, ownerId: phase }))
                .pipe(Effect.forkChild({ startImmediately: true }))
              yield* Deferred.await(paused).pipe(Effect.timeout("5 seconds"))
              yield* host.interrupt(runId)
              expect(Exit.isSuccess(yield* Fiber.await(caller).pipe(Effect.timeout("5 seconds")))).toBe(true)
            }),
          )
          expect(modelCalls).toBe(1)
          expect(toolCalls).toBe(0)
          expect(
            (yield* store.getOperationByKey({ runId, operationKey: `${runId}:model:0:0:conversation` }))?.status,
          ).toBe("succeeded")
        }),
      )
    }
    yield* scopedWith(layer())(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const host = yield* RunExecutor.RunExecutor
        yield* host.execute(yield* store.claimExecution({ runId, ownerId: "final" }))
        expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
        expect(modelCalls).toBe(2)
        expect(toolCalls).toBe(1)
        expect((yield* runtime.snapshot(runId)).budget.tokens).toBe(1)
        const history = yield* runtime.history({ runId, limit: 100 })
        expect(history.filter((event) => event._tag === "ModelResponseCommitted")).toHaveLength(2)
        expect(history.filter((event) => event._tag === "ToolExecutionStarted")).toHaveLength(1)
        expect(history.find((event) => event._tag === "RunCompleted")?.result).toMatchObject({
          text: "written",
          output: "written",
        })
        const session = yield* store.sessionReader("repeated-model-replay")
        expect(Option.isSome(session)).toBe(true)
        if (Option.isSome(session))
          expect((yield* session.value.path()).filter((entry) => entry._tag === "ModelResponse")).toHaveLength(2)
      }),
    )
  }),
)
