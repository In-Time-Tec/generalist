import { expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Layer, Option, Schema, Scope, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ToolContext, ToolExecutor } from "tenetkit"
import { Address, ExecutionHost, ExecutableResolver, Runtime, RunStore } from "../../src/runtime/index.js"
import { Runtime as SqliteRuntime } from "../../src/runtime/sqlite-bun.js"
import { registrationsFor } from "./helpers.js"
import { testExecutable } from "./identity.js"
import { operationRecoverySuite } from "./operation-recovery-suite.js"
import { tempDbPath } from "./sqlite-helpers.js"
import { toolCancellationSuite } from "./tool-cancellation-suite.js"

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

operationRecoverySuite({
  name: "sqlite",
  makeLayer: (options) => SqliteRuntime.layerSqlite({ ...options, filename: tempDbPath("operation-recovery") }),
})

toolCancellationSuite({
  name: "sqlite",
  makeLayer: (options) => SqliteRuntime.layerSqlite({ ...options, filename: tempDbPath("tool-cancellation") }),
})

it.live("reconciles a crashed framework tool before resuming its Agent", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("execution-crash-recovery")
    const tool = Tool.make("external_write", { parameters: Schema.Struct({}), success: Schema.String })
    const toolkit = Toolkit.make(tool)
    const agent = Agent.make({ name: "execution-crash-recovery", toolkit })
    const executable = testExecutable(agent, "execution-crash-recovery-v1")
    const address = Address.make("agent:execution-crash-recovery")
    const crashScope = yield* Scope.make()
    let firstModelCalls = 0

    const firstModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          firstModelCalls += 1
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("tool-call", {
              id: "external-write-1",
              name: "external_write",
              params: {},
              providerExecuted: false,
            }),
            finish,
          ])
        },
      }),
    )
    const firstExecutor = ToolExecutor.layerTest({
      execute: (request) =>
        Effect.gen(function* () {
          const context = yield* ToolContext.ToolContext
          yield* context.emit({ toolCallId: request.call.id, message: "external write started" })
          return yield* Effect.never
        }),
    })
    const handlers = toolkit.toLayer({
      external_write: () => Effect.die("ToolExecutor owns external_write"),
    })
    const firstResolver = ExecutableResolver.makeStatic([
      {
        executable,
        agent: Agent.close(agent, Layer.mergeAll(firstModel, firstExecutor, handlers)),
      },
    ])
    const first = yield* scopedWith(
      SqliteRuntime.layerSqlite({
        filename,
        resolver: firstResolver,
        addresses: [{ address, executable, registrations: registrationsFor(executable) }],
        scheduler: { pollInterval: "1 hour" },
      }),
    )(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* ExecutionHost.ExecutionHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:execution-crash-recovery",
          idempotencyKey: "execution-crash-recovery",
          prompt: "write once",
        })
        const fiber = yield* host
          .execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "process-before-crash" }))
          .pipe(Effect.forkIn(crashScope))
        const progress = yield* runtime.events({ runId: receipt.runId }).pipe(
          Stream.filter((event) => event._tag === "ToolProgress"),
          Stream.runHead,
        )
        expect(Option.isSome(progress)).toBe(true)
        const operation = yield* store.getOperationByKey({
          runId: receipt.runId,
          operationKey: `${receipt.runId}:tool:0:external-write-1:external_write`,
        })
        expect(operation?.status).toBe("running")
        const history = yield* runtime.history({ runId: receipt.runId, limit: 100 })
        const tags = history.map((event) => event._tag)
        expect(tags).toContain("ModelResponseCommitted")
        expect(tags).toContain("ModelAttemptCompleted")
        expect(tags).toContain("ModelCallCompleted")
        expect(tags).toContain("ToolExecutionStarted")
        expect(tags).toContain("ToolProgress")
        return {
          fiber,
          runId: receipt.runId,
          operationId: operation!.operationId,
          turnStarted: tags.filter((tag) => tag === "TurnStarted").length,
        }
      }),
    )

    yield* Fiber.interrupt(first.fiber)
    yield* Scope.close(crashScope, Exit.succeed(undefined))
    expect(firstModelCalls).toBe(1)

    let recoveredModelCalls = 0
    let recoveredToolCalls = 0
    let recoveredPrompt = ""
    const recoveredModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (request) => {
          recoveredModelCalls += 1
          recoveredPrompt = JSON.stringify(request.prompt.content)
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: "recovered", delta: "recovered normally" }),
            finish,
          ])
        },
      }),
    )
    const recoveredExecutor = ToolExecutor.layerTest({
      execute: () =>
        Effect.sync(() => {
          recoveredToolCalls += 1
          return { _tag: "Success" as const, result: "duplicate", encodedResult: "duplicate" }
        }),
    })
    const recoveredResolver = ExecutableResolver.makeStatic([
      {
        executable,
        agent: Agent.close(agent, Layer.mergeAll(recoveredModel, recoveredExecutor, handlers)),
      },
    ])

    yield* scopedWith(
      SqliteRuntime.layerSqlite({
        filename,
        resolver: recoveredResolver,
        addresses: [{ address, executable, registrations: registrationsFor(executable) }],
        scheduler: { pollInterval: "1 hour" },
      }),
    )(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* ExecutionHost.ExecutionHost
        const store = yield* RunStore.RunStore

        yield* host.execute(yield* store.claimExecution({ runId: first.runId, ownerId: "recovery-check" }))

        expect((yield* runtime.inspect(first.runId)).status).toBe("needs-resolution")
        expect((yield* store.getOperation({ runId: first.runId, operationId: first.operationId })).status).toBe(
          "unknown",
        )
        const blockedHistory = yield* runtime.history({ runId: first.runId, limit: 100 })
        expect(blockedHistory.filter((event) => event._tag === "OperationUnknown")).toHaveLength(1)
        expect(blockedHistory.filter((event) => event._tag === "TurnStarted")).toHaveLength(first.turnStarted)
        expect(blockedHistory.filter((event) => event._tag === "RunFailed")).toHaveLength(0)
        expect(recoveredModelCalls).toBe(0)
        expect(recoveredToolCalls).toBe(0)

        yield* runtime.resolveOperation({
          runId: first.runId,
          operationId: first.operationId,
          idempotencyKey: "resolve-after-crash",
          resolution: {
            _tag: "Succeeded",
            value: {
              _tag: "Success",
              result: "resolved external write",
              encodedResult: "resolved external write",
            },
          },
        })
        yield* host.execute(yield* store.claimExecution({ runId: first.runId, ownerId: "recovery-resume" }))

        const completedHistory = yield* runtime.history({ runId: first.runId, limit: 100 })
        expect((yield* runtime.inspect(first.runId)).status).toBe("succeeded")
        expect(recoveredModelCalls).toBe(1)
        expect(recoveredToolCalls).toBe(0)
        expect(recoveredPrompt).toContain("resolved external write")
        expect(completedHistory.map((event) => event._tag)).toContain("ToolExecutionCompleted")
        expect(completedHistory.map((event) => event._tag)).not.toContain("RunFailed")
      }),
    )
  }),
)

it.effect("sqlite reconciles every running operation before execution", () => {
  const backend = "sqlite"
  const agent = Agent.make({ name: `retry-safe-recovery-${backend}` })
  const executable = testExecutable(agent, `retry-safe-recovery-${backend}-v1`)
  const address = Address.make(`agent:retry-safe-recovery-${backend}`)
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () => Stream.empty,
    }),
  )
  const resolver = ExecutableResolver.makeStatic([{ executable, agent: Agent.close(agent, model) }])
  const options = {
    resolver,
    addresses: [{ address, executable, registrations: registrationsFor(executable) }],
    scheduler: { pollInterval: "1 hour" as const },
  }
  const runtimeLayer = SqliteRuntime.layerSqlite({
    ...options,
    filename: tempDbPath(`retry-safe-recovery-${backend}`),
  })
  return scopedWith(runtimeLayer)(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: address,
        sessionId: `session:retry-safe-recovery-${backend}`,
        idempotencyKey: "retry-safe-recovery",
        prompt: "recover",
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "before-recovery" })
      const pure = yield* store.recordOperation({
        ...claim,
        operationKey: "memory:pure",
        kind: "memory",
        inputDigest: "pure",
        input: {},
        replayPolicy: "pure",
        attempt: claim.attempt,
      })
      const idempotent = yield* store.recordOperation({
        ...claim,
        operationKey: "model:idempotent",
        kind: "model",
        inputDigest: "idempotent",
        input: {},
        replayPolicy: "provider-idempotent",
        attempt: claim.attempt,
      })
      const firstNever = yield* store.recordOperation({
        ...claim,
        operationKey: "tool:first-never",
        kind: "tool",
        inputDigest: "first-never",
        input: {},
        replayPolicy: "never",
        attempt: claim.attempt,
      })
      const secondNever = yield* store.recordOperation({
        ...claim,
        operationKey: "tool:second-never",
        kind: "tool",
        inputDigest: "second-never",
        input: {},
        replayPolicy: "never",
        attempt: claim.attempt,
      })
      for (const operation of [pure, idempotent, firstNever, secondNever]) {
        yield* store.startOperation({ ...claim, operationId: operation.operationId })
      }

      expect(yield* store.recoverRunningOperations(claim)).toBe("blocked")
      expect((yield* store.getOperation({ runId: receipt.runId, operationId: pure.operationId })).status).toBe(
        "requested",
      )
      expect((yield* store.getOperation({ runId: receipt.runId, operationId: idempotent.operationId })).status).toBe(
        "requested",
      )
      expect((yield* store.getOperation({ runId: receipt.runId, operationId: firstNever.operationId })).status).toBe(
        "unknown",
      )
      expect((yield* store.getOperation({ runId: receipt.runId, operationId: secondNever.operationId })).status).toBe(
        "unknown",
      )
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
      expect(
        (yield* runtime.history({ runId: receipt.runId, limit: 100 })).filter(
          (event) => event._tag === "OperationUnknown",
        ),
      ).toHaveLength(2)

      yield* runtime.resolveOperation({
        runId: receipt.runId,
        operationId: firstNever.operationId,
        idempotencyKey: "resolve-first-never",
        resolution: { _tag: "Succeeded", value: "first resolved" },
      })
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")

      yield* runtime.resolveOperation({
        runId: receipt.runId,
        operationId: secondNever.operationId,
        idempotencyKey: "resolve-second-never",
        resolution: { _tag: "Succeeded", value: "second resolved" },
      })
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("running")
    }),
  )
})
