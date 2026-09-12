import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Ref, Schema, Scope, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent } from "generalist"
import { ObjectStore } from "generalist/durability/object-store"
import { Runtime } from "generalist/runtime"
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
        ).pipe(Effect.map((context) => Context.get(context, Runtime.Runtime))),
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
      ).pipe(Effect.map((context) => Context.get(context, Runtime.Runtime)))
      const run = yield* runtime.start(assistant, "Say hi", { idempotencyKey: "exec-1" })
      expect(yield* run.await).toBe("done")
    }).pipe(Effect.scoped),
  )

  it("fails compilation when a declared Agent service is missing", () => {
    const assistant = Agent.make({ name: "assistant-unclosed" })
    const unclosed = Runtime.layer({
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
        const runtime = Context.get(context, Runtime.Runtime)
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
        const runtime = Context.get(context, Runtime.Runtime)
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
        const runtime = Context.get(context, Runtime.Runtime)
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
        const runtime = Context.get(context, Runtime.Runtime)
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
        const runtime = Context.get(context, Runtime.Runtime)
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
        const runtime = Context.get(context, Runtime.Runtime)
        const handle = yield* runtime.getRun(runId)
        return yield* handle.await
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
