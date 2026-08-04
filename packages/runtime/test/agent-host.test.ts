import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Ref, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, AgentRef, ToolContext, ToolExecutor } from "@batonfx/core"
import { Address, AgentHost, Cursor, Runtime, RunStore } from "../src/index.js"

const waitTool = Tool.make("wait_for_human", {
  parameters: Schema.Struct({ question: Schema.String }),
  success: Schema.String,
})

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

describe("AgentHost", () => {
  it.effect("persists operations and resumes a suspended Agent in the same Run", () => {
    let phase: "suspend" | "resume" = "suspend"
    let modelCalls = 0
    const agent = Agent.make({ name: "durable-assistant", toolkit: Toolkit.make(waitTool) })
    const ref = AgentRef.fromAgent(agent, "2026-08-03")
    const address = Address.make("agent:durable-assistant")
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
                    id: "wait-call-1",
                    name: "wait_for_human",
                    params: { question: "Continue?" },
                    providerExecuted: false,
                  }),
                  finish,
                ]
              : [Response.makePart("text-delta", { id: "answer", delta: "continued" }), finish],
          )
        },
      }),
    )
    const executor = ToolExecutor.layerTest({
      execute: () =>
        phase === "suspend"
          ? Effect.succeed({ _tag: "Suspend", token: "approval-token" })
          : Effect.succeed({ _tag: "Success", result: "approved", encodedResult: "approved" }),
    })
    const handlers = Toolkit.make(waitTool).toLayer({
      wait_for_human: () => Effect.die("ToolExecutor test layer owns execution"),
    })
    const runtimeLayer = Runtime.layerMemory({
      agents: [{ ref, agent, services: Layer.mergeAll(model, executor, handlers) }],
      addresses: [{ address, agent: ref }],
    })

    return Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const host = yield* AgentHost.AgentHost
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: address,
        sessionId: "session:durable",
        idempotencyKey: "message:1",
        prompt: "Wait and then continue.",
      })

      const firstClaim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "memory" })
      yield* host.execute(firstClaim)
      const waiting = yield* runtime.inspect(receipt.runId)
      if (waiting.status === "failed") {
        const failedEvents = yield* runtime.events({ runId: receipt.runId }).pipe(
          Stream.takeUntil((event) => event._tag === "RunFailed"),
          Stream.runCollect,
        )
        const failed = [...failedEvents].find((event) => event._tag === "RunFailed")
        throw new Error(failed?._tag === "RunFailed" ? failed.error.message : "run failed")
      }
      expect(waiting.status).toBe("waiting")
      expect(waiting.wait?.waitId).toBe("wait-call-1")
      const persisted = yield* store.loadExecution(receipt.runId)
      expect(persisted.checkpoint?.driverVersion).toBe("1")
      expect(persisted.checkpoint?.agent).toEqual(ref)
      expect(Object.keys(persisted.checkpoint?.execution.toolSchemaDigests ?? {})).toEqual(["wait_for_human"])
      expect(persisted.transcript).toBeDefined()
      expect(persisted.suspension?.token).toBe("approval-token")

      phase = "resume"
      yield* runtime.respond({
        runId: receipt.runId,
        waitId: "wait-call-1",
        idempotencyKey: "response:1",
        resolution: { _tag: "ToolResult", result: "approved", encodedResult: "approved" },
      })
      const resumeClaim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "memory" })
      yield* host.execute(resumeClaim)

      const completed = yield* runtime.inspect(receipt.runId)
      if (completed.status === "failed") {
        const history = yield* store.history({ runId: receipt.runId, cursor: Cursor.origin, limit: 100 })
        const failure = history.find((event) => event._tag === "RunFailed")
        throw new Error(failure?._tag === "RunFailed" ? failure.error.message : "run failed")
      }
      expect(completed.runId).toBe(receipt.runId)
      expect(completed.status).toBe("succeeded")
      const events = yield* runtime.events({ runId: receipt.runId, cursor: Cursor.origin }).pipe(
        Stream.takeUntil((event) => event._tag === "RunCompleted"),
        Stream.runCollect,
      )
      const replay = [...events]
      expect(replay.filter((event) => event._tag === "RunCompleted")).toHaveLength(1)
      expect(replay.map((event) => event.sequence)).toEqual(replay.map((_, index) => index))
      expect(new Set(replay.map((event) => event.runId))).toEqual(new Set([receipt.runId]))
      expect(modelCalls).toBe(2)

      modelCalls = 0
      phase = "suspend"
      const cancelled = yield* runtime.send({
        to: address,
        sessionId: "session:durable-cancel",
        idempotencyKey: "message:cancel",
        prompt: "Wait until cancelled.",
      })
      yield* host.execute(yield* store.claimExecution({ runId: cancelled.runId, ownerId: "memory" }))
      expect((yield* runtime.inspect(cancelled.runId)).status).toBe("waiting")
      yield* runtime.cancel({ runId: cancelled.runId, reason: "stop while suspended" })
      expect((yield* runtime.inspect(cancelled.runId)).status).toBe("cancelled")
    }).pipe(Effect.provide(runtimeLayer))
  })

  it.effect("interrupts an active model when Runtime.cancel commits cancellation", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const interrupted = yield* Ref.make(false)
      const agent = Agent.make({ name: "cancel-model" })
      const ref = AgentRef.fromAgent(agent, "cancel-v2")
      const address = Address.make("agent:cancel-model")
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.never,
          streamText: () =>
            Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
              Stream.flatMap(() => Stream.never),
              Stream.ensuring(Ref.set(interrupted, true)),
            ),
        }),
      )
      const runtimeLayer = Runtime.layerMemory({
        agents: [{ ref, agent, services: model }],
        addresses: [{ address, agent: ref }],
      })
      yield* Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* AgentHost.AgentHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:cancel",
          idempotencyKey: "cancel:1",
          prompt: "wait",
        })
        const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "memory" })
        const fiber = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)
        yield* runtime.cancel({ runId: receipt.runId, reason: "stop" })
        const exit = yield* Fiber.await(fiber)
        expect(exit._tag).toBe("Success")
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
        expect(yield* Ref.get(interrupted)).toBe(true)
        expect(
          (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).map((event) => event._tag),
        ).not.toContain("RunFailed")
      }).pipe(Effect.provide(runtimeLayer))
    }),
  )

  it.effect("interrupts active tool execution when Runtime.cancel commits cancellation", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const interrupted = yield* Ref.make(false)
      const tool = Tool.make("block", { parameters: Schema.Struct({}), success: Schema.String })
      const agent = Agent.make({ name: "cancel-tool", toolkit: Toolkit.make(tool) })
      const ref = AgentRef.fromAgent(agent, "cancel-tool-v1")
      const address = Address.make("agent:cancel-tool")
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
          streamText: () =>
            Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("tool-call", { id: "block-1", name: "block", params: {}, providerExecuted: false }),
              finish,
            ]),
        }),
      )
      const executor = ToolExecutor.layerTest({
        execute: () =>
          Effect.gen(function* () {
            const context = yield* ToolContext.ToolContext
            context.signal.addEventListener("abort", () => {
              Effect.runSync(Ref.set(interrupted, true))
            })
            yield* Deferred.succeed(started, undefined)
            return yield* Effect.never
          }),
      })
      const handlers = Toolkit.make(tool).toLayer({ block: () => Effect.die("ToolExecutor test layer owns execution") })
      const runtimeLayer = Runtime.layerMemory({
        agents: [{ ref, agent, services: Layer.mergeAll(model, executor, handlers) }],
        addresses: [{ address, agent: ref }],
      })
      yield* Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* AgentHost.AgentHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:cancel-tool",
          idempotencyKey: "cancel-tool:1",
          prompt: "block",
        })
        const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "memory" })
        const fiber = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)
        yield* runtime.cancel({ runId: receipt.runId, reason: "stop" })
        const exit = yield* Fiber.await(fiber)
        expect(exit._tag).toBe("Success")
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
        expect(yield* Ref.get(interrupted)).toBe(true)
        expect(
          (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).map((event) => event._tag),
        ).not.toContain("RunFailed")
      }).pipe(Effect.provide(runtimeLayer))
    }),
  )

  it.effect("rejects stale execution checkpoint writers", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: Address.make("agent:fence"),
        sessionId: "session:fence",
        idempotencyKey: "fence:1",
        prompt: "fence",
      })
      const first = yield* store.claimExecution({ runId: receipt.runId, ownerId: "worker-a" })
      const operation = yield* store.recordOperation({
        ...first,
        operationKey: "tool:fenced",
        kind: "tool",
        inputDigest: "fenced",
        input: {},
        replayPolicy: "never",
        attempt: 1,
      })
      yield* store.startOperation({ ...first, operationId: operation.operationId })
      yield* store.claimExecution({ runId: receipt.runId, ownerId: "worker-b" })
      const stale = yield* store
        .saveExecution({
          runId: receipt.runId,
          ownerId: "worker-a",
          attemptFence: first.attemptFence,
        })
        .pipe(Effect.flip)
      expect(stale._tag).toBe("@batonfx/runtime/StaleClaim")
      const staleRecovery = yield* store
        .expireRunningOperation({
          ...first,
          operationId: operation.operationId,
        })
        .pipe(Effect.flip)
      expect(staleRecovery._tag).toBe("@batonfx/runtime/StaleClaim")
      expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
        "running",
      )
    }).pipe(
      Effect.provide(
        Runtime.layerMemory({
          agents: (() => {
            const agent = Agent.make({ name: "fence" })
            return [{ ref: AgentRef.fromAgent(agent, "1"), agent }]
          })(),
          addresses: (() => {
            const agent = Agent.make({ name: "fence" })
            return [{ address: Address.make("agent:fence"), agent: AgentRef.fromAgent(agent, "1") }]
          })(),
        }),
      ),
    ),
  )
})
