import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Ref, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, AgentEvent, ToolContext, ToolExecutor } from "@batonfx/core"
import { testExecutable } from "./identity.js"
import { Address, AgentHost, Cursor, Errors, ExecutableResolver, Runtime, RunStore } from "../src/index.js"
import { assistant, assistantRef, researcherRef } from "./helpers.js"

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
  it.effect("resolves only at execution and finalizes resolver resources", () =>
    Effect.gen(function* () {
      const resolved = yield* Ref.make(0)
      const lifecycle = yield* Ref.make<ReadonlyArray<string>>([])
      const agent = Agent.make({ name: "lazy-resolver" })
      const executable = testExecutable(agent, "lazy-v1")
      const address = Address.make("agent:lazy-resolver")
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        Effect.acquireRelease(
          Ref.update(lifecycle, (events) => [...events, "service acquired"]).pipe(
            Effect.andThen(
              LanguageModel.make({
                generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                streamText: () => Stream.fromIterable<Response.StreamPartEncoded>([finish]),
              }),
            ),
          ),
          () => Ref.update(lifecycle, (events) => [...events, "service finalized"]),
        ),
      )
      const resolver = ExecutableResolver.ExecutableResolver.of({
        resolve: () =>
          Effect.gen(function* () {
            yield* Ref.update(resolved, (count) => count + 1)
            yield* Ref.update(lifecycle, (events) => [...events, "resolver acquired"])
            yield* Effect.addFinalizer(() => Ref.update(lifecycle, (events) => [...events, "resolver finalized"]))
            return { agent, services: model, attestation: executable }
          }),
      })
      const runtimeLayer = Runtime.layerMemory({
        resolver,
        addresses: [{ address, executable }],
      })

      yield* Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* AgentHost.AgentHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:lazy",
          idempotencyKey: "lazy:1",
          prompt: "run",
        })
        expect(yield* Ref.get(resolved)).toBe(0)
        const persisted = yield* store.loadExecution(receipt.runId)
        expect(persisted.executableRef).toEqual(executable.ref)
        expect(persisted.executableManifest).toEqual(executable.manifest)

        yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "lazy" }))
        expect(yield* Ref.get(resolved)).toBe(1)
        expect(yield* Ref.get(lifecycle)).toEqual([
          "resolver acquired",
          "service acquired",
          "service finalized",
          "resolver finalized",
        ])
      }).pipe(Effect.provide(runtimeLayer))
    }),
  )

  it.effect("interrupts and finalizes a blocked resolver before model execution", () =>
    Effect.gen(function* () {
      const resolving = yield* Deferred.make<void>()
      const finalized = yield* Deferred.make<void>()
      const modelCalls = yield* Ref.make(0)
      const agent = Agent.make({ name: "blocked-resolver" })
      const executable = testExecutable(agent, "blocked-v1")
      const address = Address.make("agent:blocked-resolver")
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        Ref.update(modelCalls, (count) => count + 1).pipe(
          Effect.andThen(
            LanguageModel.make({
              generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
              streamText: () => Stream.fromIterable<Response.StreamPartEncoded>([finish]),
            }),
          ),
        ),
      )
      const resolver = ExecutableResolver.ExecutableResolver.of({
        resolve: () =>
          Effect.gen(function* () {
            yield* Effect.addFinalizer(() => Deferred.succeed(finalized, undefined))
            yield* Deferred.succeed(resolving, undefined)
            yield* Effect.never
            return { agent, services: model, attestation: executable }
          }),
      })
      const runtimeLayer = Runtime.layerMemory({ resolver, addresses: [{ address, executable }] })

      yield* Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* AgentHost.AgentHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:blocked-resolver",
          idempotencyKey: "blocked-resolver:1",
          prompt: "never resolve",
        })
        const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "blocked-resolver" })
        const execution = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(resolving)
        yield* runtime.cancel({ runId: receipt.runId, reason: "stop resolving" })

        expect((yield* Fiber.await(execution))._tag).toBe("Success")
        yield* Deferred.await(finalized)
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
        expect(yield* Ref.get(modelCalls)).toBe(0)
      }).pipe(Effect.provide(runtimeLayer))
    }),
  )

  it.effect("finalizes services before resolver resources when model execution fails", () =>
    Effect.gen(function* () {
      const lifecycle: Array<string> = []
      const agent = Agent.make({ name: "failing-model" })
      const executable = testExecutable(agent, "failing-v1")
      const address = Address.make("agent:failing-model")
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        Effect.acquireRelease(
          Effect.sync(() => lifecycle.push("service acquired")).pipe(
            Effect.andThen(
              LanguageModel.make({
                generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                streamText: () => Stream.die(new Error("model failed")),
              }),
            ),
          ),
          () => Effect.sync(() => lifecycle.push("service finalized")),
        ),
      )
      const resolver = ExecutableResolver.ExecutableResolver.of({
        resolve: () =>
          Effect.gen(function* () {
            lifecycle.push("resolver acquired")
            yield* Effect.addFinalizer(() => Effect.sync(() => lifecycle.push("resolver finalized")))
            return { agent, services: model, attestation: executable }
          }),
      })

      yield* Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* AgentHost.AgentHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:failing-model",
          idempotencyKey: "failing-model:1",
          prompt: "fail",
        })
        yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "failing-model" }))

        expect((yield* runtime.inspect(receipt.runId)).status).toBe("failed")
        expect(lifecycle).toEqual(["resolver acquired", "service acquired", "service finalized", "resolver finalized"])
      }).pipe(Effect.provide(Runtime.layerMemory({ resolver, addresses: [{ address, executable }] })))
    }),
  )

  it.effect("persists typed missing and mismatched executable failures", () => {
    const agent = Agent.make({ name: "resolution-failure" })
    const executable = testExecutable(agent, "expected")
    const other = testExecutable(Agent.make({ name: "other-resolution" }), "actual")
    const address = Address.make("agent:resolution-failure")

    const verify = (
      resolver: ExecutableResolver.Interface,
      expectedTag: string,
      key: string,
      finalized: Ref.Ref<boolean>,
    ) =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* AgentHost.AgentHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: `session:${key}`,
          idempotencyKey: key,
          prompt: "run",
        })
        yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: key }))
        const failed = (yield* runtime.history({ runId: receipt.runId, limit: 20 })).find(
          (event) => event._tag === "RunFailed",
        )
        expect(failed?._tag).toBe("RunFailed")
        if (failed?._tag === "RunFailed") expect(failed.error._tag).toBe(expectedTag)
        expect(yield* Ref.get(finalized)).toBe(true)
      }).pipe(Effect.provide(Runtime.layerMemory({ resolver, addresses: [{ address, executable }] })))

    return Effect.gen(function* () {
      const missingFinalized = yield* Ref.make(false)
      const mismatchFinalized = yield* Ref.make(false)
      const missing = ExecutableResolver.ExecutableResolver.of({
        resolve: (input) =>
          Effect.addFinalizer(() => Ref.set(missingFinalized, true)).pipe(
            Effect.andThen(Errors.ExecutablePinMissing.make({ runId: input.runId, ref: input.ref })),
          ),
      })
      const mismatched = ExecutableResolver.ExecutableResolver.of({
        resolve: () =>
          Effect.addFinalizer(() => Ref.set(mismatchFinalized, true)).pipe(Effect.as({ agent, attestation: other })),
      })
      yield* verify(missing, "@batonfx/runtime/ExecutablePinMissing", "missing", missingFinalized)
      yield* verify(mismatched, "@batonfx/runtime/ExecutableIdentityMismatch", "mismatch", mismatchFinalized)
    })
  })

  it.effect("persists operations and resumes a suspended Agent in the same Run", () => {
    let phase: "suspend" | "resume" = "suspend"
    let modelCalls = 0
    const lifecycle: Array<string> = []
    const agent = Agent.make({ name: "durable-assistant", toolkit: Toolkit.make(waitTool) })
    const ref = testExecutable(agent, "2026-08-03")
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
    const resources = Layer.effectDiscard(
      Effect.acquireRelease(
        Effect.sync(() => lifecycle.push("service acquired")),
        () => Effect.sync(() => lifecycle.push("service finalized")),
      ),
    )
    const resolver = ExecutableResolver.ExecutableResolver.of({
      resolve: () =>
        Effect.gen(function* () {
          lifecycle.push("resolver acquired")
          yield* Effect.addFinalizer(() => Effect.sync(() => lifecycle.push("resolver finalized")))
          return { agent, services: Layer.mergeAll(model, executor, handlers, resources), attestation: ref }
        }),
    })
    const runtimeLayer = Runtime.layerMemory({
      resolver,
      addresses: [{ address, executable: ref }],
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
      expect(persisted.checkpoint?.executable).toEqual(ref.ref)
      expect(persisted.transcript).toBeDefined()
      expect(persisted.suspension?.token).toBe("approval-token")
      expect(lifecycle).toEqual(["resolver acquired", "service acquired", "service finalized", "resolver finalized"])

      phase = "resume"
      lifecycle.length = 0
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
      expect(lifecycle).toEqual(["resolver acquired", "service acquired", "service finalized", "resolver finalized"])

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
      const lifecycle: Array<string> = []
      const agent = Agent.make({ name: "cancel-model" })
      const ref = testExecutable(agent, "cancel-v2")
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
      const resources = Layer.effectDiscard(
        Effect.acquireRelease(
          Effect.sync(() => lifecycle.push("service acquired")),
          () => Effect.sync(() => lifecycle.push("service finalized")),
        ),
      )
      const resolver = ExecutableResolver.ExecutableResolver.of({
        resolve: () =>
          Effect.gen(function* () {
            lifecycle.push("resolver acquired")
            yield* Effect.addFinalizer(() => Effect.sync(() => lifecycle.push("resolver finalized")))
            return { agent, services: Layer.merge(model, resources), attestation: ref }
          }),
      })
      const runtimeLayer = Runtime.layerMemory({
        resolver,
        addresses: [{ address, executable: ref }],
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
        expect(lifecycle).toEqual(["resolver acquired", "service acquired", "service finalized", "resolver finalized"])
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
      const ref = testExecutable(agent, "cancel-tool-v1")
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
        resolver: ExecutableResolver.makeStatic([
          { executable: ref, agent, services: Layer.mergeAll(model, executor, handlers) },
        ]),
        addresses: [{ address, executable: ref }],
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
          resolver: (() => {
            const agent = Agent.make({ name: "fence" })
            return ExecutableResolver.makeStatic([{ executable: testExecutable(agent, "1"), agent }])
          })(),
          addresses: (() => {
            const agent = Agent.make({ name: "fence" })
            return [{ address: Address.make("agent:fence"), executable: testExecutable(agent, "1") }]
          })(),
        }),
      ),
    ),
  )

  it.effect("exposes only pre-commit or post-commit operation and checkpoint states", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: Address.make("agent:atomic-operation"),
        sessionId: "session:atomic-operation",
        idempotencyKey: "atomic-operation",
        prompt: "handoff",
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "atomic-worker" })
      const operation = yield* store.recordOperation({
        ...claim,
        operationKey: "handoff:atomic",
        kind: "handoff",
        inputDigest: "handoff:atomic",
        input: { targetAgentPin: researcherRef.ref.active },
        replayPolicy: "pure",
        attempt: claim.attempt,
      })
      yield* store.startOperation({ ...claim, operationId: operation.operationId })

      expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
        "running",
      )
      expect((yield* store.loadExecution(receipt.runId)).executableRef).toEqual(assistantRef.ref)

      const checkpoint = {
        driverVersion: "1" as const,
        executable: researcherRef.ref,
        turn: 1,
        budget: { allocation: {}, remaining: {}, depth: 0 },
        state: {},
      }
      yield* store.completeOperation({
        ...claim,
        operationId: operation.operationId,
        outcome: { _tag: "Succeeded", value: { accepted: true } },
        checkpoint,
      })

      expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
        "succeeded",
      )
      const committed = yield* store.loadExecution(receipt.runId)
      expect(committed.checkpoint).toEqual(checkpoint)
      expect(committed.executableRef).toEqual(researcherRef.ref)
    }).pipe(
      Effect.provide(
        Runtime.layerMemory({
          resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: assistant }]),
          addresses: [{ address: Address.make("agent:atomic-operation"), executable: assistantRef }],
        }),
      ),
    ),
  )

  it.effect("atomically commits failed, unknown, and suspended execution state", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const checkpoint = {
        driverVersion: "1" as const,
        executable: assistantRef.ref,
        turn: 2,
        budget: { allocation: {}, remaining: {}, depth: 0 },
        state: { committed: true },
      }
      for (const outcome of [{ _tag: "Failed" as const, error: { message: "failed" } }, { _tag: "Unknown" as const }]) {
        const receipt = yield* runtime.send({
          to: Address.make("agent:atomic-operation"),
          sessionId: `session:${outcome._tag}`,
          idempotencyKey: outcome._tag,
          prompt: outcome._tag,
        })
        const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "atomic-worker" })
        const operation = yield* store.recordOperation({
          ...claim,
          operationKey: `tool:${outcome._tag}`,
          kind: "tool",
          inputDigest: outcome._tag,
          input: {},
          replayPolicy: "never",
          attempt: claim.attempt,
        })
        yield* store.startOperation({ ...claim, operationId: operation.operationId })
        expect((yield* store.loadExecution(receipt.runId)).checkpoint).toBeUndefined()
        yield* store.completeOperation({ ...claim, operationId: operation.operationId, outcome, checkpoint })
        expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
          outcome._tag === "Failed" ? "failed" : "unknown",
        )
        expect((yield* store.loadExecution(receipt.runId)).checkpoint).toEqual(checkpoint)
        expect((yield* runtime.inspect(receipt.runId)).status).toBe(
          outcome._tag === "Unknown" ? "needs-resolution" : "running",
        )
      }

      const receipt = yield* runtime.send({
        to: Address.make("agent:atomic-operation"),
        sessionId: "session:suspend",
        idempotencyKey: "suspend",
        prompt: "suspend",
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "atomic-worker" })
      const suspension = AgentEvent.AgentSuspended.make({
        token: "approval",
        reason: "approval",
        tool_call_id: "approval",
        tool_name: "approve",
        tool_params: {},
        tool_call_batch: [],
      })
      expect((yield* store.loadExecution(receipt.runId)).suspension).toBeUndefined()
      expect((yield* runtime.inspect(receipt.runId)).wait).toBeUndefined()
      yield* store.suspend({
        ...claim,
        suspension,
        checkpoint,
        transcript: Prompt.make("saved transcript"),
        wait: {
          waitId: "approval",
          reason: "approval",
          status: "open",
          openedAt: "2026-08-04T00:00:00.000Z",
        },
      })
      const execution = yield* store.loadExecution(receipt.runId)
      const inspection = yield* runtime.inspect(receipt.runId)
      expect(execution.suspension).toEqual(suspension)
      expect(execution.checkpoint).toEqual(checkpoint)
      expect(execution.transcript).toEqual(Prompt.make("saved transcript"))
      expect(inspection.status).toBe("waiting")
      expect(inspection.wait?.waitId).toBe("approval")
    }).pipe(
      Effect.provide(
        Runtime.layerMemory({
          resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: assistant }]),
          addresses: [{ address: Address.make("agent:atomic-operation"), executable: assistantRef }],
        }),
      ),
    ),
  )

  it.effect("resolves the checkpoint active pin when recovering a Run", () => {
    let seen: string | undefined
    const resolver = ExecutableResolver.ExecutableResolver.of({
      resolve: (input) =>
        Effect.sync(() => {
          seen = input.ref.active
        }).pipe(Effect.andThen(Errors.ExecutablePinMissing.make({ runId: input.runId, ref: input.ref }))),
    })
    return Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const host = yield* AgentHost.AgentHost
      const receipt = yield* runtime.send({
        to: Address.make("agent:handoff-recovery"),
        sessionId: "session:handoff-recovery",
        idempotencyKey: "handoff-recovery",
        prompt: "handoff",
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "handoff-recovery" })
      yield* store.saveExecution({
        ...claim,
        checkpoint: {
          driverVersion: "1",
          executable: researcherRef.ref,
          turn: 1,
          budget: { allocation: {}, remaining: {}, depth: 0 },
          state: {},
        },
      })
      yield* host.execute(claim)
      expect(seen).toBe(researcherRef.ref.active)
    }).pipe(
      Effect.provide(
        Runtime.layerMemory({
          resolver,
          addresses: [{ address: Address.make("agent:handoff-recovery"), executable: assistantRef }],
        }),
      ),
    )
  })
})
