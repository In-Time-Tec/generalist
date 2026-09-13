import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import {
  Cause,
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Ref,
  Result,
  Schema,
  Scope,
  Stream,
} from "effect"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { Agent } from "generalist"
import { ObjectStore } from "generalist/durability/object-store"
import { Runtime } from "generalist/runtime"
import { TestClock } from "effect/testing"
import { layerRuleStoreMemory } from "../../src/core/policy/permissions.js"
import { runAddress } from "../../src/runtime/execution/agent/directory.js"
import { durableIdentity } from "../../src/runtime/executable/registered-agent.js"
import { engineFor } from "../../src/runtime/hosting/application.js"
import { SessionSender } from "../../src/runtime/session/message.js"
import { makeObjectStorage } from "./execution/object.js"

const usage = Response.Usage.make({
  inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = Response.makePart("finish", { reason: "stop", usage, response: undefined })
const modelService = LanguageModel.make({
  generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
  streamText: () => Stream.make(Response.makePart("text-delta", { id: "answer", delta: "done" }), finish),
})
const modelLayer = Layer.effect(LanguageModel.LanguageModel, modelService)

const storageLayer = () => Layer.merge(Layer.succeed(ObjectStore, makeObjectStorage().store), BunCrypto.layer)

const namespace = { environment: "test", tenant: "runtime-layer", partition: "composition" }

const acquire = <E>(
  layer: Layer.Layer<Runtime.Runtime, E, never>,
): Effect.Effect<Context.Context<Runtime.Runtime>, E, Scope.Scope> => Effect.scoped(Layer.build(layer))

const expectRuntimeRetired = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<void, never, R> =>
  Effect.gen(function* () {
    const result = yield* effect.pipe(Effect.result)
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) expect(result.failure).toMatchObject({ _tag: "generalist/runtime/RuntimeRetired" })
  })

class ModelConfig extends Context.Service<ModelConfig, { readonly model: string }>()(
  "generalist/test/runtime/composition.test/ModelConfig",
) {}
class ModelConfigError extends Schema.TaggedError<ModelConfigError>()(
  "generalist/test/runtime/composition.test/ModelConfigError",
  {
    model: Schema.String,
  },
) {}
class StorageConfig extends Context.Service<StorageConfig, { readonly bucket: string }>()(
  "generalist/test/runtime/composition.test/StorageConfig",
) {}
class StorageConfigError extends Schema.TaggedError<StorageConfigError>()(
  "generalist/test/runtime/composition.test/StorageConfigError",
  {
    bucket: Schema.String,
  },
) {}
class DeploymentLookupError extends Schema.TaggedError<DeploymentLookupError>()(
  "generalist/test/runtime/composition.test/DeploymentLookupError",
  {
    revision: Schema.String,
  },
) {}
class StorageBreach extends Schema.TaggedError<StorageBreach>()(
  "generalist/test/runtime/composition.test/StorageBreach",
  {
    message: Schema.String,
  },
) {}

describe("Runtime.layer", () => {
  it.effect("rejects an empty revision", () =>
    Effect.gen(function* () {
      const assistant = Agent.make({ name: "assistant" })
      const error = yield* acquire(
        Runtime.layer({
          agents: { assistant },
          revision: "",
          services: modelLayer,
          storage: storageLayer(),
          namespace,
        }),
      ).pipe(Effect.flip)
      expect(error).toMatchObject({
        _tag: "generalist/runtime/RuntimeOptionsInvalid",
        field: "revision",
      })
    }),
  )

  it.effect("rejects an empty namespace segment", () =>
    Effect.gen(function* () {
      const assistant = Agent.make({ name: "assistant" })
      const error = yield* acquire(
        Runtime.layer({
          agents: { assistant },
          revision: "assistant-v1",
          services: modelLayer,
          storage: storageLayer(),
          namespace: { ...namespace, tenant: "" },
        }),
      ).pipe(Effect.flip)
      expect(error).toMatchObject({
        _tag: "generalist/runtime/RuntimeOptionsInvalid",
        field: "namespace",
      })
    }),
  )

  it.effect("rejects a registry key that differs from its Agent name", () =>
    Effect.gen(function* () {
      const assistant = Agent.make({ name: "assistant" })
      const error = yield* acquire(
        Runtime.layer({
          agents: { alias: assistant },
          revision: "assistant-v1",
          services: modelLayer,
          storage: storageLayer(),
          namespace,
        }),
      ).pipe(Effect.flip)
      expect(error).toMatchObject({
        _tag: "generalist/runtime/RuntimeOptionsInvalid",
        field: "agents",
      })
    }),
  )

  it.effect("rejects an empty Agent registry", () =>
    Effect.gen(function* () {
      const error = yield* acquire(
        Runtime.layer({
          agents: {},
          revision: "assistant-v1",
          services: Layer.empty,
          storage: storageLayer(),
          namespace,
        }),
      ).pipe(Effect.flip)
      expect(error).toMatchObject({
        _tag: "generalist/runtime/RuntimeOptionsInvalid",
        field: "agents",
      })
    }),
  )

  it.effect("provides Runtime.Runtime and starts a declared Agent", () =>
    Effect.gen(function* () {
      const assistant = Agent.make({ name: "assistant" })
      const runtime = yield* Effect.scoped(
        Layer.build(
          Runtime.layer({
            agents: { assistant },
            revision: "assistant-v1",
            services: modelLayer,
            storage: storageLayer(),
            namespace,
          }),
        ).pipe(Effect.flatMap((context) => engineFor(Context.get(context, Runtime.Runtime)))),
      )
      expect(runtime.start).toBeTypeOf("function")
    }),
  )

  it.effect("preserves service and storage Layer failures as their original tagged values", () =>
    Effect.gen(function* () {
      const assistant = Agent.make({ name: "fallible-assistant" })
      const serviceFailure = ModelConfigError.make({ model: "missing-model" })
      const storageFailure = StorageConfigError.make({ bucket: "missing-bucket" })
      const failedServices = Layer.effect(LanguageModel.LanguageModel, Effect.fail(serviceFailure))
      const failedStorage = Layer.merge(Layer.effect(ObjectStore, Effect.fail(storageFailure)), BunCrypto.layer)

      const observedServiceFailure = yield* acquire(
        Runtime.layer({
          agents: { "fallible-assistant": assistant },
          revision: "fallible-services-v1",
          services: failedServices,
          storage: storageLayer(),
          namespace: { ...namespace, partition: "composition-service-failure" },
        }),
      ).pipe(Effect.flip)
      const observedStorageFailure = yield* acquire(
        Runtime.layer({
          agents: { "fallible-assistant": assistant },
          revision: "fallible-storage-v1",
          services: modelLayer,
          storage: failedStorage,
          namespace: { ...namespace, partition: "composition-storage-failure" },
        }),
      ).pipe(Effect.flip)

      expect(observedServiceFailure).toBe(serviceFailure)
      expect(observedStorageFailure).toBe(storageFailure)
    }),
  )

  it.effect("retries fallible service acquisition with fresh scoped cleanup", () =>
    Effect.gen(function* () {
      const assistant = Agent.make({ name: "retrying-assistant" })
      const failure = ModelConfigError.make({ model: "retry-model" })
      const acquisitions = yield* Ref.make(0)
      const releases = yield* Ref.make(0)
      const services = Layer.effect(
        LanguageModel.LanguageModel,
        Effect.acquireRelease(modelService.pipe(Effect.tap(() => Ref.update(acquisitions, (count) => count + 1))), () =>
          Ref.update(releases, (count) => count + 1),
        ).pipe(Effect.andThen(Effect.fail(failure))),
      )
      const runtimeLayer = Runtime.layer({
        agents: { "retrying-assistant": assistant },
        revision: "retrying-v1",
        services,
        storage: storageLayer(),
        namespace: { ...namespace, partition: "composition-retry" },
      })

      const first = yield* acquire(runtimeLayer).pipe(Effect.flip)
      const second = yield* acquire(runtimeLayer).pipe(Effect.flip)

      expect(first).toBe(failure)
      expect(second).toBe(failure)
      expect(yield* Ref.get(acquisitions)).toBe(2)
      expect(yield* Ref.get(releases)).toBe(2)
    }),
  )

  it.effect("finalizes partial service acquisition when Runtime acquisition is interrupted", () =>
    Effect.gen(function* () {
      const assistant = Agent.make({ name: "interrupted-acquisition-assistant" })
      const acquired = yield* Deferred.make<void>()
      const released = yield* Deferred.make<void>()
      const services = Layer.effect(
        LanguageModel.LanguageModel,
        Effect.acquireRelease(Deferred.succeed(acquired, undefined).pipe(Effect.andThen(modelService)), () =>
          Deferred.succeed(released, undefined),
        ).pipe(Effect.andThen(Effect.never)),
      )
      const runtimeLayer = Runtime.layer({
        agents: { "interrupted-acquisition-assistant": assistant },
        revision: "interrupted-acquisition-v1",
        services,
        storage: storageLayer(),
        namespace: { ...namespace, partition: "composition-interrupted-acquisition" },
      })
      const fiber = yield* acquire(runtimeLayer).pipe(Effect.forkChild({ startImmediately: true }))

      yield* Deferred.await(acquired)
      yield* Fiber.interrupt(fiber)
      expect(yield* Deferred.isDone(released)).toBe(true)
    }),
  )

  it.live("executes a declared Agent to completion", () =>
    Effect.gen(function* () {
      const assistant = Agent.make({ name: "assistant-exec" })
      const runtime = yield* Layer.build(
        Runtime.layer({
          agents: { "assistant-exec": assistant },
          revision: "assistant-exec-v1",
          services: modelLayer,
          storage: storageLayer(),
          namespace: { ...namespace, partition: "composition-exec" },
        }),
      ).pipe(Effect.flatMap((context) => engineFor(Context.get(context, Runtime.Runtime))))
      const run = yield* runtime.start(assistant, "Say hi", { idempotencyKey: "exec-1" })
      expect(yield* run.await).toBe("done")
    }).pipe(Effect.scoped),
  )

  it("fails compilation when a declared Agent service is missing", () => {
    const assistant = Agent.make({ name: "assistant-unclosed" })
    const unclosed = Runtime.layer<{ readonly assistant: typeof assistant }, never, never, never, never>({
      agents: { assistant },
      revision: "assistant-v1",
      // @ts-expect-error the services Layer must close LanguageModel for this Agent
      services: Layer.empty,
      storage: storageLayer(),
      namespace,
    })
    expect(unclosed).toBeDefined()
  })

  it.live("fails a retained Run with RevisionUnavailable when no loader is declared", () =>
    Effect.gen(function* () {
      const storage = makeObjectStorage()
      const assistant = Agent.make({ name: "retained-assistant" })
      const runId = yield* Effect.gen(function* () {
        const context = yield* Layer.build(
          Runtime.layer({
            agents: { "retained-assistant": assistant },
            revision: "retained-v1",
            services: modelLayer,
            storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
            namespace: { ...namespace, partition: "composition-retained" },
            scheduler: { pollInterval: "1 hour" },
          }),
        )
        const runtime = yield* engineFor(Context.get(context, Runtime.Runtime))
        const run = yield* runtime.start(assistant, "persist me", { idempotencyKey: "retained-1" })
        return run.runId
      }).pipe(Effect.scoped)

      const error = yield* Effect.gen(function* () {
        const context = yield* Layer.build(
          Runtime.layer({
            agents: { "retained-assistant": assistant },
            revision: "retained-v2",
            services: modelLayer,
            storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
            namespace: { ...namespace, partition: "composition-retained" },
            scheduler: { pollInterval: "50 millis" },
          }),
        )
        const runtime = yield* engineFor(Context.get(context, Runtime.Runtime))
        const handle = yield* runtime.getRun(runId)
        const exit = yield* Effect.exit(handle.await)
        return Exit.isFailure(exit) ? Cause.squash(exit.cause) : exit.value
      }).pipe(Effect.scoped)
      expect(error).toMatchObject({
        _tag: "RunFailed",
        error: {
          _tag: "generalist/runtime/RevisionUnavailable",
          revision: "retained-v1",
          agentName: "retained-assistant",
        },
      })
    }),
  )

  it.live("fails a retained Run with RevisionMismatch when the loader returns another revision", () =>
    Effect.gen(function* () {
      const storage = makeObjectStorage()
      const assistant = Agent.make({ name: "mismatched-assistant" })
      const stale = Agent.make({ name: "mismatched-assistant" })
      const runId = yield* Effect.gen(function* () {
        const context = yield* Layer.build(
          Runtime.layer({
            agents: { "mismatched-assistant": assistant },
            revision: "mismatched-v1",
            services: modelLayer,
            storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
            namespace: { ...namespace, partition: "composition-mismatch" },
            scheduler: { pollInterval: "1 hour" },
          }),
        )
        const runtime = yield* engineFor(Context.get(context, Runtime.Runtime))
        const run = yield* runtime.start(assistant, "persist me", { idempotencyKey: "mismatched-1" })
        return run.runId
      }).pipe(Effect.scoped)

      const error = yield* Effect.gen(function* () {
        const context = yield* Layer.build(
          Runtime.layer({
            agents: { "mismatched-assistant": assistant },
            revision: "mismatched-v2",
            services: modelLayer,
            storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
            namespace: { ...namespace, partition: "composition-mismatch" },
            scheduler: { pollInterval: "50 millis" },
            loadRevision: () =>
              Effect.succeed({
                _tag: "Found" as const,
                definition: {
                  agents: { "mismatched-assistant": stale },
                  revision: "mismatched-v0",
                  services: modelLayer,
                },
              }),
          }),
        )
        const runtime = yield* engineFor(Context.get(context, Runtime.Runtime))
        const handle = yield* runtime.getRun(runId)
        const exit = yield* Effect.exit(handle.await)
        return Exit.isFailure(exit) ? Cause.squash(exit.cause) : exit.value
      }).pipe(Effect.scoped)
      expect(error).toMatchObject({
        _tag: "RunFailed",
        error: {
          _tag: "generalist/runtime/RevisionMismatch",
          expectedRevision: "mismatched-v1",
          loadedRevision: "mismatched-v0",
        },
      })
    }),
  )

  it.live("resumes a retained Run through a matching loaded revision", () =>
    Effect.gen(function* () {
      const storage = makeObjectStorage()
      const assistant = Agent.make({ name: "resumed-assistant" })
      const historical = Agent.make({ name: "resumed-assistant" })
      const runId = yield* Effect.gen(function* () {
        const context = yield* Layer.build(
          Runtime.layer({
            agents: { "resumed-assistant": assistant },
            revision: "resumed-v1",
            services: modelLayer,
            storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
            namespace: { ...namespace, partition: "composition-resumed" },
            scheduler: { pollInterval: "1 hour" },
          }),
        )
        const runtime = yield* engineFor(Context.get(context, Runtime.Runtime))
        const run = yield* runtime.start(assistant, "persist me", { idempotencyKey: "resumed-1" })
        return run.runId
      }).pipe(Effect.scoped)

      const output = yield* Effect.gen(function* () {
        const context = yield* Layer.build(
          Runtime.layer({
            agents: { "resumed-assistant": assistant },
            revision: "resumed-v2",
            services: modelLayer,
            storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
            namespace: { ...namespace, partition: "composition-resumed" },
            scheduler: { pollInterval: "50 millis" },
            loadRevision: (request) =>
              request.revision === "resumed-v1"
                ? Effect.succeed({
                    _tag: "Found" as const,
                    definition: {
                      agents: { "resumed-assistant": historical },
                      revision: "resumed-v1",
                      services: modelLayer,
                    },
                  })
                : Effect.succeed({
                    _tag: "NotFound" as const,
                    revision: request.revision,
                    agentName: request.agentName,
                  }),
          }),
        )
        const runtime = yield* engineFor(Context.get(context, Runtime.Runtime))
        const handle = yield* runtime.getRun(runId)
        return yield* handle.await
      }).pipe(Effect.scoped)
      expect(output).toBe("done")
    }),
  )

  it.live("registers the current declaration before recovering retained work", () =>
    Effect.gen(function* () {
      const storage = makeObjectStorage()
      const agent = Agent.make({ name: "registered-before-recovery" })
      const runId = yield* Effect.gen(function* () {
        const context = yield* Layer.build(
          Runtime.layer({
            agents: { "registered-before-recovery": agent },
            revision: "registered-before-recovery-v1",
            services: modelLayer,
            storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
            namespace: { ...namespace, partition: "composition-registration-before-recovery" },
            scheduler: { pollInterval: "1 hour" },
          }),
        )
        const runtime = yield* engineFor(Context.get(context, Runtime.Runtime))
        return (yield* runtime.start(agent, "recover after registration", { idempotencyKey: "registration-1" })).runId
      }).pipe(Effect.scoped)

      const output = yield* Effect.gen(function* () {
        const context = yield* Layer.build(
          Runtime.layer({
            agents: { "registered-before-recovery": agent },
            revision: "registered-before-recovery-v1",
            services: modelLayer,
            storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
            namespace: { ...namespace, partition: "composition-registration-before-recovery" },
            scheduler: { pollInterval: "25 millis" },
          }),
        )
        const runtime = yield* engineFor(Context.get(context, Runtime.Runtime))
        return yield* (yield* runtime.getRun(runId)).await
      }).pipe(Effect.scoped)

      expect(output).toBe("done")
    }),
  )

  it("performs no I/O at declaration", () => {
    const assistant = Agent.make({ name: "lazy-assistant" })
    let acquired = false
    const services = Layer.unwrap(
      Effect.sync(() => {
        acquired = true
        return modelLayer
      }),
    )
    const live = Runtime.layer({
      agents: { assistant },
      revision: "lazy-v1",
      services,
      storage: storageLayer(),
      namespace,
    })
    expect(live).toBeDefined()
    expect(acquired).toBe(false)
    expect(inferenceFailureProof).toBeTypeOf("function")
    expect(inferenceRequirementsProof).toBeTypeOf("function")
  })

  it.effect("declaration performs no storage I/O before scoped acquisition", () =>
    Effect.gen(function* () {
      yield* Effect.void
      let reads = 0
      const store = makeObjectStorage()
      const instrumented: typeof store.store = {
        ...store.store,
        read: (key, options) => {
          reads += 1
          return store.store.read(key, options)
        },
        list: (prefix, options) => {
          reads += 1
          return store.store.list(prefix, options)
        },
      }
      const live = Runtime.layer({
        agents: { assistant: Agent.make({ name: "assistant" }) },
        revision: "lazy-v1",
        services: modelLayer,
        storage: Layer.merge(Layer.succeed(ObjectStore, instrumented), BunCrypto.layer),
        namespace: { ...namespace, partition: "composition-lazy-io" },
        scheduler: { pollInterval: "1 hour" },
      })
      expect(live).toBeDefined()
      expect(reads).toBe(0)
    }),
  )

  it.live("the first start after acquisition is ready without Durability.activate", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "ready-assistant" })
      const runtime = yield* Layer.build(
        Runtime.layer({
          agents: { "ready-assistant": agent },
          revision: "ready-v1",
          services: modelLayer,
          storage: storageLayer(),
          namespace: { ...namespace, partition: "composition-ready" },
          scheduler: { pollInterval: "50 millis" },
        }),
      ).pipe(Effect.flatMap((context) => engineFor(Context.get(context, Runtime.Runtime))))
      const run = yield* runtime.start(agent, "Say hi", { idempotencyKey: "ready-1" })
      expect(yield* run.await).toBe("done")
    }).pipe(Effect.scoped),
  )

  it.live("keeps held admission separate from Runtime readiness", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "held-runtime-agent" })
      const identity = durableIdentity(agent, [agent], "held-runtime-v1")
      const runtime = yield* Layer.build(
        Runtime.layer({
          agents: { "held-runtime-agent": agent },
          revision: "held-runtime-v1",
          services: modelLayer,
          storage: storageLayer(),
          namespace: { ...namespace, partition: "composition-held-admission" },
          scheduler: { pollInterval: "25 millis" },
        }),
      ).pipe(Effect.flatMap((context) => engineFor(Context.get(context, Runtime.Runtime))))
      const held = yield* runtime.admit({
        executable: identity.executable,
        registrations: identity.registrations,
        sessionId: "session:held-runtime",
        idempotencyKey: "held-runtime-1",
        prompt: "wait for explicit activation",
      })

      yield* Effect.sleep("100 millis")
      expect(yield* runtime.inspect(held.runId)).toMatchObject({ status: "queued" })

      yield* runtime.activate({ commandId: "held-runtime-activate-1", runId: held.runId })
      expect(yield* (yield* runtime.getRun(held.runId)).await).toBe("done")
    }).pipe(Effect.scoped),
  )

  it.effect("returns RuntimeRetired for addressed admission after its Runtime scope closes", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "retired-runtime-agent" })
      const scope = yield* Scope.make()
      const context = yield* Layer.build(
        Runtime.layer({
          agents: { "retired-runtime-agent": agent },
          revision: "retired-runtime-v1",
          services: modelLayer,
          storage: storageLayer(),
          namespace: { ...namespace, partition: "composition-runtime-retired" },
          scheduler: { pollInterval: "1 hour" },
        }),
      ).pipe(Scope.provide(scope))
      const runtime = yield* engineFor(Context.get(context, Runtime.Runtime))
      const run = yield* runtime.start(agent, "keep accepting addressed input", { idempotencyKey: "retired-runtime-0" })
      const retained = yield* runtime.getRun(run.runId)
      yield* runtime.send(run.runId, "accept before retirement", { idempotencyKey: "retired-runtime-1" })
      yield* runtime.sendMessage({
        fromRunId: run.runId,
        to: runAddress(run.runId),
        idempotencyKey: "retired-runtime-2",
        prompt: "accept before retirement",
      })

      yield* Scope.close(scope, Exit.void)
      expect(
        yield* runtime
          .send(run.runId, "must not admit after retirement", { idempotencyKey: "retired-runtime-3" })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/runtime/RuntimeRetired" })
      expect(
        yield* run.send("must not steer after retirement", { idempotencyKey: "retired-runtime-6" }).pipe(Effect.flip),
      ).toMatchObject({
        _tag: "generalist/runtime/RuntimeRetired",
      })
      expect(
        yield* retained
          .send("must not steer after retirement", { idempotencyKey: "retired-runtime-7" })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/runtime/RuntimeRetired" })
      expect(
        yield* runtime
          .sendMessage({
            fromRunId: run.runId,
            to: runAddress(run.runId),
            idempotencyKey: "retired-runtime-4",
            prompt: "must not admit after retirement",
          })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/runtime/RuntimeRetired" })
      expect(
        yield* runtime
          .send({
            to: runAddress(run.runId),
            sessionId: "session:retired-runtime-root",
            idempotencyKey: "retired-runtime-5",
            prompt: "must not admit a root after retirement",
          })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/runtime/RuntimeRetired" })
    }),
  )

  it.effect("gates every command that can resume execution after Runtime retirement", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "retired-runtime-resume-agent" })
      const scope = yield* Scope.make()
      const context = yield* Layer.build(
        Runtime.layer({
          agents: { "retired-runtime-resume-agent": agent },
          revision: "retired-runtime-resume-v1",
          services: modelLayer,
          storage: storageLayer(),
          namespace: { ...namespace, partition: "composition-runtime-retired-resume" },
          scheduler: { pollInterval: "1 hour" },
        }),
      ).pipe(Scope.provide(scope))
      const runtime = yield* engineFor(Context.get(context, Runtime.Runtime))
      const run = yield* runtime.start(agent, "keep commands addressable", { idempotencyKey: "retired-resume-0" })

      yield* Scope.close(scope, Exit.void)

      yield* expectRuntimeRetired(
        runtime.respond({ runId: run.runId, waitId: "retired-resume-wait", resolution: { _tag: "Approved" } }),
      )
      yield* expectRuntimeRetired(
        runtime.respondApproval({
          runId: run.runId,
          approvalId: "retired-resume-approval",
          commandId: "retired-resume-approval-command",
          decision: { _tag: "Approved" },
        }),
      )
      yield* expectRuntimeRetired(
        runtime.signal({ runId: run.runId, name: "retired-resume-signal", commandId: "retired-resume-signal-command" }),
      )
      yield* expectRuntimeRetired(
        runtime.wake({
          runId: run.runId,
          commandId: "retired-resume-wake-command",
          event: {
            _tag: "Webhook",
            dedupeKey: "retired-resume-wake",
            source: "test",
            payload: {},
            headers: {},
          },
        }),
      )
      yield* expectRuntimeRetired(
        runtime.resolveOperation({
          runId: run.runId,
          operationId: "retired-resume-operation",
          idempotencyKey: "retired-resume-resolution",
          resolution: { _tag: "Retry" },
        }),
      )
      yield* expectRuntimeRetired(
        runtime.extendBudget({ runId: run.runId, commandId: "retired-resume-budget", delta: { tokens: 1 } }),
      )
      yield* expectRuntimeRetired(
        runtime.controlSession({
          sessionId: "retired-resume-session",
          commandId: "retired-resume-session-resume",
          action: "resume",
        }),
      )
      yield* expectRuntimeRetired(
        runtime.submitSessionInput({
          sessionId: "retired-resume-session",
          commandId: "retired-resume-session-submit",
          prompt: Prompt.make("resume from queued input"),
        }),
      )
      yield* expectRuntimeRetired(
        runtime
          .messageSessionInput({
            sessionId: "retired-resume-session",
            commandId: "retired-resume-session-message",
            prompt: Prompt.make("resume from message input"),
          })
          .pipe(Effect.provideService(SessionSender, { user: "test" })),
      )
      yield* expectRuntimeRetired(runtime.operator.retry(run.runId, "operator:test", "retired-resume-retry"))
      yield* expectRuntimeRetired(runtime.operator.wake(run.runId, "operator:test", "retired-resume-operator-wake"))
      yield* expectRuntimeRetired(
        runtime.operator.resolveUnknown(
          run.runId,
          "retired-resume-unknown",
          { outcome: "succeeded", result: "observed" },
          "operator:test",
          "retired-resume-resolve-unknown",
        ),
      )
      yield* expectRuntimeRetired(
        runtime.operator.extendBudget(run.runId, { tokens: 1 }, "operator:test", "retired-resume-operator-budget"),
      )
      yield* expectRuntimeRetired(
        runtime.operator
          .resolveApproval(
            `runtime-approval:${encodeURIComponent(run.runId)}:retired-resume-approval`,
            { _tag: "Approved" },
            "operator:test",
            "retired-resume-resolve-approval",
          )
          // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This test owns the short-lived in-memory RuleStore for the guarded operation.
          .pipe(Effect.provide(layerRuleStoreMemory())),
      )
    }),
  )

  it.live("awaits owned execution cleanup before Runtime scope release", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const finalized = yield* Ref.make(false)
      const blockingModel = LanguageModel.make({
        generateText: () => Effect.never,
        streamText: () =>
          Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
            Stream.flatMap(() => Stream.never),
            Stream.ensuring(Ref.set(finalized, true)),
          ),
      })
      const agent = Agent.make({ name: "scope-retirement-runtime-agent" })
      const scope = yield* Scope.make()
      const context = yield* Layer.build(
        Runtime.layer({
          agents: { "scope-retirement-runtime-agent": agent },
          revision: "scope-retirement-runtime-v1",
          services: Layer.effect(LanguageModel.LanguageModel, blockingModel),
          storage: storageLayer(),
          namespace: { ...namespace, partition: "composition-runtime-scope-retirement" },
          scheduler: { pollInterval: "25 millis" },
        }),
      ).pipe(Scope.provide(scope))
      const runtime = yield* engineFor(Context.get(context, Runtime.Runtime))

      yield* runtime.start(agent, "stay active until scope release", {
        idempotencyKey: "scope-retirement-1",
      })
      const began = yield* Deferred.await(started).pipe(Effect.timeoutOption("2 seconds"))
      expect(Option.isSome(began)).toBe(true)
      yield* Scope.close(scope, Exit.void)
      expect(yield* Ref.get(finalized)).toBe(true)
    }),
  )

  it.effect("stops admission on ownership loss without interrupting unrelated Effects", () =>
    Effect.gen(function* () {
      const storage = makeObjectStorage()
      const client = yield* storage.connect
      const agent = Agent.make({ name: "ownership-loss-runtime-agent" })
      const siblingCompleted = yield* Ref.make(false)
      const scope = yield* Scope.make()
      const context = yield* Layer.build(
        Runtime.layer({
          agents: { "ownership-loss-runtime-agent": agent },
          revision: "ownership-loss-runtime-v1",
          services: modelLayer,
          storage: Layer.merge(Layer.succeed(ObjectStore, client.store), BunCrypto.layer),
          namespace: { ...namespace, partition: "composition-runtime-ownership-loss" },
          scheduler: { pollInterval: "1 hour" },
        }),
      ).pipe(Scope.provide(scope))
      const runtime = yield* engineFor(Context.get(context, Runtime.Runtime))
      const run = yield* runtime.start(agent, "keep accepting addressed input", { idempotencyKey: "ownership-loss-0" })
      yield* runtime.send(run.runId, "accept before ownership loss", { idempotencyKey: "ownership-loss-1" })
      yield* runtime.sendMessage({
        fromRunId: run.runId,
        to: runAddress(run.runId),
        idempotencyKey: "ownership-loss-2",
        prompt: "accept before ownership loss",
      })

      yield* Effect.forkScoped(Effect.sleep("1 second").pipe(Effect.andThen(Ref.set(siblingCompleted, true))))
      yield* client.faults.failNextCreate({ phase: "before", reason: "unavailable" })
      yield* TestClock.adjust("16 seconds")

      expect(
        yield* runtime
          .send(run.runId, "must not admit after ownership loss", { idempotencyKey: "ownership-loss-3" })
          .pipe(Effect.flip),
      ).toMatchObject({
        _tag: "generalist/runtime/RuntimeOwnershipLost",
        reason: "store-unavailable",
      })
      expect(
        yield* runtime
          .sendMessage({
            fromRunId: run.runId,
            to: runAddress(run.runId),
            idempotencyKey: "ownership-loss-4",
            prompt: "must not admit after ownership loss",
          })
          .pipe(Effect.flip),
      ).toMatchObject({
        _tag: "generalist/runtime/RuntimeOwnershipLost",
        reason: "store-unavailable",
      })
      expect(
        yield* runtime
          .send({
            to: runAddress(run.runId),
            sessionId: "session:ownership-loss-root",
            idempotencyKey: "ownership-loss-5",
            prompt: "must not admit a root after ownership loss",
          })
          .pipe(Effect.flip),
      ).toMatchObject({
        _tag: "generalist/runtime/RuntimeOwnershipLost",
        reason: "store-unavailable",
      })
      expect(
        yield* runtime
          .respond({ runId: run.runId, waitId: "ownership-loss-wait", resolution: { _tag: "Approved" } })
          .pipe(Effect.flip),
      ).toMatchObject({
        _tag: "generalist/runtime/RuntimeOwnershipLost",
        reason: "store-unavailable",
      })
      expect(
        yield* runtime.operator.retry(run.runId, "operator:test", "ownership-loss-operator-retry").pipe(Effect.flip),
      ).toMatchObject({
        _tag: "generalist/runtime/RuntimeOwnershipLost",
        reason: "store-unavailable",
      })
      expect(yield* Ref.get(siblingCompleted)).toBe(true)
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("a failed acquisition preserves the typed error and runs acquired finalizers once", () =>
    Effect.gen(function* () {
      let finalized = 0
      const failing: Layer.Layer<never, StorageBreach> = Layer.unwrap(
        Effect.addFinalizer(() =>
          Effect.sync(() => {
            finalized += 1
          }),
        ).pipe(Effect.andThen(Effect.fail(StorageBreach.make({ message: "deliberate storage failure" })))),
      )
      const error = yield* Effect.scoped(
        Layer.build(
          Runtime.layer({
            agents: { assistant: Agent.make({ name: "assistant" }) },
            revision: "partial-v1",
            services: modelLayer,
            storage: Layer.mergeAll(Layer.succeed(ObjectStore, makeObjectStorage().store), BunCrypto.layer, failing),
            namespace: { ...namespace, partition: "composition-partial" },
          }),
        ),
      ).pipe(Effect.flip)
      expect(error).toBeInstanceOf(StorageBreach)
      expect(finalized).toBe(1)
    }),
  )
})

declare const inferenceAssistant: Agent.Agent
declare const inferenceServices: Layer.Layer<
  Runtime.AgentServices<typeof inferenceAssistant>,
  ModelConfigError,
  ModelConfig
>
declare const inferenceStorage: Layer.Layer<
  ObjectStore | import("effect").Crypto.Crypto,
  StorageConfigError,
  StorageConfig
>
declare const inferenceOldServices: Layer.Layer<
  Runtime.AgentServices<typeof inferenceAssistant>,
  ModelConfigError,
  ModelConfig
>
const inferenceLive = () =>
  Runtime.layer({
    agents: { "inference-assistant": inferenceAssistant },
    revision: "inference-v2",
    services: inferenceServices,
    storage: inferenceStorage,
    namespace,
    loadRevision: (request) =>
      request.revision === "inference-v1"
        ? Effect.succeed({
            _tag: "Found" as const,
            definition: {
              agents: { "inference-assistant": inferenceAssistant },
              revision: "inference-v1",
              services: inferenceOldServices,
            },
          })
        : Effect.fail(DeploymentLookupError.make({ revision: request.revision })),
  })
const inferenceFailureProof = (
  value:
    | ModelConfigError
    | StorageConfigError
    | DeploymentLookupError
    | Runtime.RuntimeOptionsInvalid
    | Runtime.RevisionUnavailable
    | Runtime.RevisionMismatch
    | import("../../src/durability/internal/runtime.js").ActivationFailure,
): Layer.Error<ReturnType<typeof inferenceLive>> => value
const inferenceRequirementsProof = (
  value: ModelConfig | StorageConfig,
): Layer.Services<ReturnType<typeof inferenceLive>> => value
