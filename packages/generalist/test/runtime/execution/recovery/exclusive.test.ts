import { expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Layer, Option, Ref, Schema, Scope, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, ToolContext, ToolExecutor } from "../../../../src/index.js"
import { Address, RunExecutor, ExecutableResolver, Runtime, RunStore } from "../../../../src/runtime/index.js"
import { Runtime as SqliteRuntime } from "../../../../src/runtime/sqlite-bun.js"
import { LoopDriverState } from "../../../../src/core/durable/loop-driver-state.js"
import { registrationsFor } from "../fixtures.js"
import { testExecutable } from "../../run/identity.js"
import { operationRecoverySuite } from "../../operation/suites/recovery.js"
import { tempDbPath } from "../../sql/scenario.js"
import { toolCancellationSuite } from "../../operation/suites/tool-cancellation.js"
import { allowAllAuthorization } from "../../../authorization.js"
import { JournalFault } from "../../../../src/runtime/operation/journal-fault.js"

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

const layerInterruptAfter = (operationCount: number): Layer.Layer<JournalFault> =>
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

operationRecoverySuite({
  name: "sqlite",
  makeLayer: (options) => SqliteRuntime.layerSqlite({ ...options, filename: tempDbPath("operation-recovery") }),
})

toolCancellationSuite({
  name: "sqlite",
  makeLayer: (options) => SqliteRuntime.layerSqlite({ ...options, filename: tempDbPath("tool-cancellation") }),
})

it.live("reopens a typed Agent start without redispatching its completed tool call", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("typed-agent-start-recovery")
    const tool = Tool.make("write_once", {
      parameters: Schema.Struct({ value: Schema.String }),
      success: Schema.String,
    })
    const toolkit = Toolkit.make(tool)
    const agent = Agent.make({ name: "typed-agent-start-recovery", toolkit })
    let toolCalls = 0
    const handlers = toolkit.toLayer({
      write_once: ({ value }) =>
        Effect.sync(() => {
          toolCalls += 1
          return value
        }),
    })
    const resolver = ExecutableResolver.layerStatic([]).pipe(Layer.orDie)
    const options = {
      filename,
      addresses: [],
      scheduler: { pollInterval: "1 hour" as const },
    }
    const startOptions = {
      sessionId: "session:typed-agent-start-recovery",
      idempotencyKey: "typed-agent-start-recovery",
    }
    let firstModelCalls = 0
    const firstModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          firstModelCalls += 1
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("tool-call", {
              id: "write-once-1",
              name: "write_once",
              params: { value: "written" },
              providerExecuted: false,
            }),
            finish,
          ])
        },
      }),
    )
    const firstEnvironment = Layer.mergeAll(allowAllAuthorization, firstModel, handlers)
    const firstLayer = Layer.merge(
      SqliteRuntime.layerSqlite(options).pipe(Layer.provide(Layer.merge(resolver, layerInterruptAfter(5)))),
      firstEnvironment,
    )

    const runId = yield* scopedWith(firstLayer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        yield* runtime.register(agent)
        const handle = yield* runtime.start(agent, "write exactly once", startOptions)
        yield* host.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "before-restart" }))

        expect((yield* runtime.inspect(handle.runId)).status).toBe("running")
        expect(toolCalls).toBe(1)
        expect(firstModelCalls).toBe(1)
        return handle.runId
      }),
    )

    let recoveredModelCalls = 0
    const recoveredModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          recoveredModelCalls += 1
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: "recovered", delta: "complete after restart" }),
            finish,
          ])
        },
      }),
    )
    const recoveredEnvironment = Layer.mergeAll(allowAllAuthorization, recoveredModel, handlers)
    const recoveredLayer = Layer.merge(
      SqliteRuntime.layerSqlite(options).pipe(Layer.provide(resolver)),
      recoveredEnvironment,
    )

    yield* scopedWith(recoveredLayer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        yield* runtime.register(agent)
        const handle = yield* runtime.start(agent, "write exactly once", startOptions)

        expect(handle.runId).toBe(runId)
        yield* host.execute(yield* store.claimExecution({ runId, ownerId: "after-restart" }))
        expect(yield* handle.await).toBe("complete after restart")
        expect(toolCalls).toBe(1)
        expect(recoveredModelCalls).toBe(1)
        const history = yield* runtime.history({ runId, limit: 100 })
        expect(history.filter((event) => event._tag === "ToolExecutionStarted")).toHaveLength(1)
        expect(history.filter((event) => event._tag === "ToolExecutionCompleted")).toHaveLength(1)
      }),
    )
  }),
)

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
    const firstResolverLayer = ExecutableResolver.layerStatic([
      {
        executable,
        agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, firstModel, firstExecutor, handlers)),
      },
    ]).pipe(Layer.orDie)
    const first = yield* scopedWith(
      SqliteRuntime.layerSqlite({
        filename,
        addresses: [{ address, executable, registrations: registrationsFor(executable) }],
        scheduler: { pollInterval: "1 hour" },
      }).pipe(Layer.provide(firstResolverLayer)),
    )(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
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
    const recoveredResolverLayer = ExecutableResolver.layerStatic([
      {
        executable,
        agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, recoveredModel, recoveredExecutor, handlers)),
      },
    ]).pipe(Layer.orDie)

    yield* scopedWith(
      SqliteRuntime.layerSqlite({
        filename,
        addresses: [{ address, executable, registrations: registrationsFor(executable) }],
        scheduler: { pollInterval: "1 hour" },
      }).pipe(Layer.provide(recoveredResolverLayer)),
    )(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore

        const reopened = yield* runtime.inspect(first.runId)
        if (reopened.status === "running") {
          yield* host.execute(yield* store.claimExecution({ runId: first.runId, ownerId: "recovery-check" }))
        }

        expect((yield* runtime.inspect(first.runId)).status).toBe("needs-resolution")
        expect((yield* store.getOperation({ runId: first.runId, operationId: first.operationId })).status).toBe(
          "unknown",
        )
        expect((yield* runtime.operator.explain(first.runId)).decision).toMatchObject({
          _tag: "Unknown",
          operationId: first.operationId,
        })
        const blockedHistory = yield* runtime.history({ runId: first.runId, limit: 100 })
        expect(blockedHistory.filter((event) => event._tag === "OperationUnknown")).toHaveLength(1)
        expect(blockedHistory.filter((event) => event._tag === "TurnStarted")).toHaveLength(first.turnStarted)
        expect(blockedHistory.filter((event) => event._tag === "RunFailed")).toHaveLength(0)
        expect(recoveredModelCalls).toBe(0)
        expect(recoveredToolCalls).toBe(0)

        yield* runtime.operator.resolveUnknown(
          first.runId,
          first.operationId,
          {
            outcome: "succeeded",
            result: {
              _tag: "Success",
              result: "resolved external write",
              encodedResult: "resolved external write",
            },
          },
          "operator:crash-recovery",
        )
        yield* host.execute(yield* store.claimExecution({ runId: first.runId, ownerId: "recovery-resume" }))

        const completedHistory = yield* runtime.history({ runId: first.runId, limit: 100 })
        expect((yield* runtime.inspect(first.runId)).status).toBe("succeeded")
        expect(recoveredModelCalls).toBe(1)
        expect(recoveredToolCalls).toBe(0)
        expect(recoveredPrompt).toContain("resolved external write")
        expect(completedHistory.map((event) => event._tag)).toContain("ToolExecutionCompleted")
        expect(completedHistory.filter((event) => event._tag === "ToolExecutionStarted")).toHaveLength(1)
        expect(completedHistory.map((event) => event._tag)).not.toContain("RunFailed")
      }),
    )
  }),
)

it.live("keeps one tool operation key across approval suspension and SQLite restart", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("approval-operation-key-restart")
    const tool = Tool.make("gated_write", {
      parameters: Schema.Struct({ value: Schema.String }),
      success: Schema.String,
      needsApproval: true,
    })
    const toolkit = Toolkit.make(tool)
    const agent = Agent.make({ name: "approval-operation-key-restart", toolkit })
    const executable = testExecutable(agent, "approval-operation-key-restart-v1")
    const address = Address.make("agent:approval-operation-key-restart")
    const handlers = toolkit.toLayer({ gated_write: () => Effect.die("ToolExecutor owns gated_write") })
    let firstModelCalls = 0
    const firstModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          firstModelCalls += 1
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("tool-call", {
              id: "gated-write-1",
              name: "gated_write",
              params: { value: "once" },
              providerExecuted: false,
            }),
            finish,
          ])
        },
      }),
    )
    const firstResolverLayer = ExecutableResolver.layerStatic([
      {
        executable,
        agent: Agent.close(
          agent,
          Layer.mergeAll(
            allowAllAuthorization,
            firstModel,
            handlers,
            Approvals.layerTest({ resolve: (pending) => Effect.succeed(pending) }),
            ToolExecutor.layerTest({ execute: () => Effect.die("approval must precede execution") }),
          ),
        ),
      },
    ]).pipe(Layer.orDie)

    const suspended = yield* scopedWith(
      SqliteRuntime.layerSqlite({
        filename,
        addresses: [{ address, executable, registrations: registrationsFor(executable) }],
        scheduler: { pollInterval: "1 hour" },
      }).pipe(Layer.provide(firstResolverLayer)),
    )(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:approval-operation-key-restart",
          idempotencyKey: "approval-operation-key-restart",
          prompt: "write once after approval",
        })
        yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "before-restart" }))

        const inspection = yield* runtime.inspect(receipt.runId)
        const approvalToken = `runtime-approval:${encodeURIComponent(receipt.runId)}:approval:gated-write-1`
        expect(inspection.status).toBe("waiting")
        expect(inspection.waits).toMatchObject([{ waitId: approvalToken, reason: { _tag: "Approval" } }])
        const execution = yield* store.loadExecution(receipt.runId)
        if (execution.checkpoint === undefined || !("driverVersion" in execution.checkpoint)) {
          return yield* Effect.die("durable checkpoint missing")
        }
        const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(execution.checkpoint.state).pipe(Effect.orDie)
        const checkpointCall = state.toolBatch?.calls[0]
        if (checkpointCall === undefined) return yield* Effect.die("tool checkpoint missing")
        expect(checkpointCall.state).toMatchObject({
          _tag: "Waiting",
          reason: "approval",
          waitId: approvalToken,
        })
        expect(
          yield* store.getOperationByKey({
            runId: receipt.runId,
            operationKey: checkpointCall.operationKey,
          }),
        ).toBeUndefined()
        return { runId: receipt.runId, operationKey: checkpointCall.operationKey, approvalToken }
      }),
    )
    expect(suspended.operationKey).toBe(`${suspended.runId}:tool:0:gated-write-1:gated_write`)
    expect(firstModelCalls).toBe(1)

    let recoveredModelCalls = 0
    let toolExecutions = 0
    let invocation: ToolContext.Service | undefined
    const recoveredModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          recoveredModelCalls += 1
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: "done", delta: "written once" }),
            finish,
          ])
        },
      }),
    )
    const recoveredExecutor = ToolExecutor.layerTest({
      execute: () =>
        Effect.gen(function* () {
          invocation = yield* ToolContext.ToolContext
          toolExecutions += 1
          return { _tag: "Success" as const, result: "written", encodedResult: "written" }
        }),
    })
    const recoveredResolverLayer = ExecutableResolver.layerStatic([
      {
        executable,
        agent: Agent.close(
          agent,
          Layer.mergeAll(allowAllAuthorization, recoveredModel, recoveredExecutor, handlers, Approvals.layerDenyAll),
        ),
      },
    ]).pipe(Layer.orDie)

    yield* scopedWith(
      SqliteRuntime.layerSqlite({
        filename,
        addresses: [{ address, executable, registrations: registrationsFor(executable) }],
        scheduler: { pollInterval: "1 hour" },
      }).pipe(Layer.provide(recoveredResolverLayer)),
    )(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        const reopened = yield* store.loadExecution(suspended.runId)
        if (reopened.checkpoint === undefined || !("driverVersion" in reopened.checkpoint)) {
          return yield* Effect.die("reopened checkpoint missing")
        }
        const reopenedState = yield* Schema.decodeUnknownEffect(LoopDriverState)(reopened.checkpoint.state).pipe(
          Effect.orDie,
        )
        expect(reopenedState.toolBatch?.calls[0]?.operationKey).toBe(suspended.operationKey)

        yield* runtime.respond({
          runId: suspended.runId,
          waitId: suspended.approvalToken,
          resolution: { _tag: "Approved" },
        })
        yield* host.execute(yield* store.claimExecution({ runId: suspended.runId, ownerId: "after-restart" }))

        expect((yield* runtime.inspect(suspended.runId)).status).toBe("succeeded")
        expect(invocation?.operationKey).toBe(suspended.operationKey)
        expect(invocation?.idempotencyKey).toBe(suspended.operationKey)
        expect(toolExecutions).toBe(1)
        expect(recoveredModelCalls).toBe(1)
        expect(
          yield* store.getOperationByKey({
            runId: suspended.runId,
            operationKey: suspended.operationKey,
          }),
        ).toMatchObject({ status: "succeeded", replayPolicy: "never" })
        const history = yield* runtime.history({ runId: suspended.runId, limit: 100 })
        expect(history.filter((event) => event._tag === "ApprovalRequested")).toHaveLength(1)
        expect(history.filter((event) => event._tag === "ToolExecutionStarted")).toHaveLength(1)
        expect(history.filter((event) => event._tag === "ToolExecutionCompleted")).toHaveLength(1)
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
  const options = {
    addresses: [{ address, executable, registrations: registrationsFor(executable) }],
    scheduler: { pollInterval: "1 hour" as const },
  }
  const runtimeLayer = SqliteRuntime.layerSqlite({
    ...options,
    filename: tempDbPath(`retry-safe-recovery-${backend}`),
  }).pipe(
    Layer.provide(
      ExecutableResolver.layerStatic([
        { executable, agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, model)) },
      ]).pipe(Layer.orDie),
    ),
  )
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
