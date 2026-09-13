import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Context, Deferred, Effect, Exit, Layer, Option, Predicate, Result, Scope, Stream } from "effect"
import { AiError, LanguageModel, Response } from "effect/unstable/ai"
import { Agent } from "generalist"
import { ObjectStore } from "generalist/durability/object-store"
import { Runtime } from "generalist/runtime"
import { makeObjectStorage } from "./execution/object.js"

const usage = Response.Usage.make({
  inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = Response.makePart("finish", { reason: "stop", usage, response: undefined })
const output = (text: string) => Stream.make(Response.makePart("text-delta", { id: "answer", delta: text }), finish)
const idleModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => output("unused"),
  }),
)

const namespace = {
  environment: "test",
  tenant: "execution-services",
  partition: "composition",
}

const storageLayer = (store: ReturnType<typeof makeObjectStorage>["store"]) =>
  Layer.merge(Layer.succeed(ObjectStore, store), BunCrypto.layer)

const failureTag = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.result,
    Effect.map((result) => {
      expect(Result.isFailure(result)).toBe(true)
      return Result.isFailure(result) &&
        Predicate.hasProperty(result.failure, "_tag") &&
        Predicate.isString(result.failure._tag)
        ? result.failure._tag
        : undefined
    }),
  )

describe("Runtime.layer execution services", () => {
  it.live("acquires after readiness with the published Runtime identity and attempt-owned cleanup", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "late-bound-agent" })
      const seen = yield* Deferred.make<{
        readonly scope: Runtime.ExecutionScope<{ readonly "late-bound-agent": typeof agent }>
        readonly runtime: Runtime.Service
      }>()
      const released = yield* Deferred.make<void>()
      let phase: "building" | "ready" = "building"
      let finalized = 0
      const live = Runtime.layer({
        agents: { "late-bound-agent": agent },
        revision: "late-bound-v1",
        services: Layer.empty,
        executionServices: (scope: Runtime.ExecutionScope<{ readonly "late-bound-agent": typeof agent }>) =>
          Layer.effect(
            LanguageModel.LanguageModel,
            Effect.gen(function* () {
              expect(phase).toBe("ready")
              const runtime = yield* Runtime.Runtime
              yield* Deferred.succeed(seen, { scope, runtime })
              return yield* Effect.acquireRelease(
                LanguageModel.make({
                  generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                  streamText: () => output("late-bound"),
                }),
                () =>
                  Effect.sync(() => finalized++).pipe(
                    Effect.andThen(Deferred.succeed(released, undefined)),
                    Effect.asVoid,
                  ),
              )
            }),
          ),
        storage: storageLayer(makeObjectStorage().store),
        namespace,
        scheduler: { pollInterval: "10 millis" },
      })
      const context = yield* Layer.build(live)
      const runtime = Context.get(context, Runtime.Runtime)
      phase = "ready"
      const run = yield* runtime.start(agent, "run", { idempotencyKey: "late-bound-run" })
      const acquired = yield* Deferred.await(seen)
      expect(acquired.runtime).toBe(runtime)
      expect(acquired.scope.runId).toBe(run.runId)
      expect(yield* run.await).toBe("late-bound")
      yield* Deferred.await(released)
      expect(finalized).toBe(1)
    }).pipe(Effect.scoped),
  )

  it.live("recovers a retained run with its historical factory, never the current factory", () =>
    Effect.gen(function* () {
      const storage = makeObjectStorage()
      const historicalAgent = Agent.make({ name: "versioned-agent" })
      const currentAgent = historicalAgent
      const historicalScope =
        yield* Deferred.make<Runtime.ExecutionScope<{ readonly "versioned-agent": typeof historicalAgent }>>()
      const blocked = yield* Deferred.make<void>()
      const recoveredReleased = yield* Deferred.make<void>()
      let historicalAcquisitions = 0
      let historicalFinalizations = 0
      let recoveredRuntime: Runtime.Service | undefined
      let currentAcquisitions = 0
      const historicalExecutionServices = (
        scope: Runtime.ExecutionScope<{ readonly "versioned-agent": typeof historicalAgent }>,
      ) =>
        Layer.effect(
          LanguageModel.LanguageModel,
          Effect.gen(function* () {
            historicalAcquisitions += 1
            recoveredRuntime = yield* Runtime.Runtime
            yield* Deferred.succeed(historicalScope, scope)
            return yield* Effect.acquireRelease(
              LanguageModel.make({
                generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                streamText: () =>
                  historicalAcquisitions === 1
                    ? Stream.fromEffect(Deferred.await(blocked)).pipe(Stream.flatMap(() => output("unreachable")))
                    : output("historical"),
              }),
              () =>
                Effect.sync(() => ++historicalFinalizations).pipe(
                  Effect.flatMap((finalizations) =>
                    finalizations === 2 ? Deferred.succeed(recoveredReleased, undefined) : Effect.void,
                  ),
                  Effect.asVoid,
                ),
            )
          }),
        )
      const oldLayer = Runtime.layer({
        agents: { "versioned-agent": historicalAgent },
        revision: "versioned-v1",
        services: Layer.empty,
        executionServices: historicalExecutionServices,
        storage: storageLayer(storage.store),
        namespace,
        scheduler: { pollInterval: "10 millis" },
      })
      const oldScope = yield* Scope.make()
      const oldContext = yield* Layer.build(oldLayer).pipe(Scope.provide(oldScope))
      const oldRuntime = Context.get(oldContext, Runtime.Runtime)
      const retained = yield* oldRuntime.start(historicalAgent, "retain", {
        idempotencyKey: "versioned-run",
      })
      const leaked = yield* Deferred.await(historicalScope)
      yield* Scope.close(oldScope, Exit.void)
      expect(historicalFinalizations).toBe(1)
      expect(
        yield* leaked.children.list.pipe(
          Effect.flip,
          Effect.map((error) => error._tag),
        ),
      ).toBe("generalist/runtime/ExecutionScopeRetired")

      const historicalDefinition = {
        agents: { "versioned-agent": historicalAgent },
        revision: "versioned-v1",
        services: Layer.empty,
        executionServices: historicalExecutionServices,
      } satisfies Runtime.ExecutionRevisionDefinition<
        { readonly "versioned-agent": typeof historicalAgent },
        never,
        never,
        never,
        LanguageModel.LanguageModel,
        Runtime.Runtime
      >
      const options = {
        agents: { "versioned-agent": currentAgent },
        revision: "versioned-v2",
        services: Layer.empty,
        executionServices: () => {
          currentAcquisitions += 1
          return Layer.effect(
            LanguageModel.LanguageModel,
            LanguageModel.make({
              generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
              streamText: () => output("current"),
            }),
          )
        },
        storage: storageLayer(storage.store),
        namespace,
        scheduler: { pollInterval: "10 millis" },
        loadRevision: (request) =>
          Effect.succeed(
            request.revision === "versioned-v1"
              ? ({ _tag: "Found", definition: historicalDefinition } as const)
              : ({
                  _tag: "NotFound",
                  revision: request.revision,
                  agentName: request.agentName,
                } as const),
          ),
      } satisfies Runtime.VersionedExecutionServicesOptions<
        { readonly "versioned-agent": typeof currentAgent },
        never,
        never,
        never,
        never,
        never,
        LanguageModel.LanguageModel,
        never,
        { readonly "versioned-agent": typeof historicalAgent },
        never,
        never,
        never,
        never,
        never,
        LanguageModel.LanguageModel,
        Runtime.Runtime
      >
      const newContext = yield* Layer.build(Runtime.layer(options))
      const newRuntime = Context.get(newContext, Runtime.Runtime)
      const completion = yield* newRuntime.events({ runId: retained.runId }).pipe(
        Stream.filter((event) => event._tag === "RunCompleted"),
        Stream.runHead,
      )
      expect(Option.getOrThrow(completion).result).toMatchObject({ output: "historical" })
      yield* Deferred.await(recoveredReleased)
      expect(historicalAcquisitions).toBe(2)
      expect(historicalFinalizations).toBe(2)
      expect(currentAcquisitions).toBe(0)
      expect(recoveredRuntime).toBe(newRuntime)
    }).pipe(Effect.scoped),
  )

  it.live("releases attempt-owned services after execution failure", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "failed-execution-services" })
      const released = yield* Deferred.make<void>()
      const modelFailure = AiError.make({
        module: "ExecutionServicesTest",
        method: "streamText",
        reason: AiError.UnknownError.make({ description: "terminal model failure" }),
      })
      const context = yield* Layer.build(
        Runtime.layer({
          agents: { "failed-execution-services": agent },
          revision: "failed-execution-services-v1",
          services: Layer.empty,
          executionServices: () =>
            Layer.effect(
              LanguageModel.LanguageModel,
              Effect.acquireRelease(
                LanguageModel.make({
                  generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                  streamText: () => Stream.fail(modelFailure),
                }),
                () => Deferred.succeed(released, undefined).pipe(Effect.asVoid),
              ),
            ),
          storage: storageLayer(makeObjectStorage().store),
          namespace: { ...namespace, partition: "failed-execution-services" },
          scheduler: { pollInterval: "10 millis" },
        }),
      )
      const runtime = Context.get(context, Runtime.Runtime)
      const run = yield* runtime.start(agent, "fail", { idempotencyKey: "failed-execution-services" })
      const result = yield* Effect.result(run.await)
      expect(Result.isFailure(result)).toBe(true)
      yield* Deferred.await(released)
    }).pipe(Effect.scoped),
  )

  it.effect("guards held and grouped Session handles after Runtime retirement", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "guarded-handles" })
      const runtimeScope = yield* Scope.make()
      const context = yield* Layer.build(
        Runtime.layer({
          agents: { "guarded-handles": agent },
          revision: "guarded-handles-v1",
          services: idleModel,
          storage: storageLayer(makeObjectStorage().store),
          namespace: { ...namespace, partition: "guarded-handles" },
          scheduler: { pollInterval: "1 hour" },
        }),
      ).pipe(Scope.provide(runtimeScope))
      const runtime = Context.get(context, Runtime.Runtime)
      const held = yield* runtime.hold(agent, "held", { idempotencyKey: "guarded-held" })
      const session = yield* runtime.sessions.create({ sessionId: "guarded-session" })

      yield* Scope.close(runtimeScope, Exit.void)

      const retired = "generalist/runtime/RuntimeRetired"
      expect(yield* failureTag(held.activate("activate-after-retire"))).toBe(retired)
      expect(yield* failureTag(held.send("send-after-retire"))).toBe(retired)
      expect(yield* failureTag(runtime.sessions.list)).toBe(retired)
      expect(yield* failureTag(runtime.sessions.get("guarded-session"))).toBe(retired)
      expect(yield* failureTag(session.inspect)).toBe(retired)
      expect(yield* failureTag(session.queue)).toBe(retired)
      expect(yield* failureTag(session.submit(agent, "queued", { commandId: "submit-after-retire" }))).toBe(retired)
      expect(yield* failureTag(session.control("close", "control-after-retire"))).toBe(retired)
      expect(yield* failureTag(Stream.runHead(session.events()))).toBe(retired)
    }),
  )
})
