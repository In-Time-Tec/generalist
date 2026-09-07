/* oxlint-disable effecttsgo/strict-effect-provide -- These regressions reopen fresh object-backed host scopes. */
import { BunCrypto } from "@effect/platform-bun"
import { expect, it, layer } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer } from "effect"
import { Approvals, BlobStore, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, RunStore } from "generalist/runtime"
import { TestModel } from "generalist/testing"
import {
  Artifact,
  ArtifactCrdt,
  Yjs,
  layer as artifactLayer,
  type CrdtService,
} from "generalist/unstable/artifact"
import { ObjectStore } from "../../src/durability/object-store.js"
import { makeObjectStorage, objectRuntimeLayer } from "../runtime/execution/object.js"
import type { Client } from "../../src/testing/durability/index.js"

const memoryStorage = makeObjectStorage()
const runtime = objectRuntimeLayer({
  addresses: [],
  scheduler: { pollInterval: "1 hour" },
  schedulerMode: "poll",
}, memoryStorage).pipe(Layer.provide(ExecutableResolver.layerStatic([])))
const services = Layer.mergeAll(
  runtime,
  BlobStore.layer({ environment: "test", tenant: "artifact" }).pipe(
    Layer.provide(Layer.merge(BunCrypto.layer, Layer.succeed(ObjectStore, memoryStorage.store))),
  ),
  artifactLayer,
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  TestModel.layer([]),
  Yjs.layer(),
)

const objectServices = (client: Client) => Layer.mergeAll(
  objectRuntimeLayer(
    { addresses: [], scheduler: { pollInterval: "1 hour" }, schedulerMode: "poll" },
    client,
    false,
  ).pipe(Layer.provide(ExecutableResolver.layerStatic([]))),
  BlobStore.layer({ environment: "test", tenant: "artifact" }).pipe(
    Layer.provide(Layer.merge(BunCrypto.layer, Layer.succeed(ObjectStore, client.store))),
  ),
  artifactLayer,
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  TestModel.layer([]),
)

const provideObject = <A, E, R>(client: Client, effect: Effect.Effect<A, E, R>) =>
  Effect.scoped(Layer.build(objectServices(client)).pipe(
    Effect.flatMap((context) => effect.pipe(Effect.provideContext(context))),
  ))

const edit = (commandId: string, base: number, text: string) => ({
  commandId,
  base,
  operation: { _tag: "Insert" as const, at: 5, text },
  attribution: { _tag: "Human" as const, actor: "alice" },
})

layer(services)("Artifact public retries", (it) => {
  it.effect("returns the original public HumanEdit receipt on an exact retry without recomputing", () =>
    Effect.gen(function* () {
      const original = yield* ArtifactCrdt
      let edits = 0
      const counted: CrdtService = {
        ...original,
        edit: (input: Parameters<CrdtService["edit"]>[0]) =>
          Effect.sync(() => {
            edits += 1
          }).pipe(Effect.andThen(original.edit(input))),
      }
      const document = yield* Artifact.open("retry-exact.md", {
        crdt: Layer.succeed(ArtifactCrdt, counted),
        initial: "draft",
      })
      const host = yield* Generalist.create({ agents: [] })
      const input = edit("human:retry-exact", 0, "!")
      const first = yield* host.artifacts.edit(document.name, input)
      const second = yield* host.artifacts.edit(document.name, input)
      expect(second).toEqual(first)
      expect(edits).toBe(1)
      expect(yield* Artifact.read(document)).toMatchObject({ version: 1, content: "draft!" })
    }),
  )

  it.effect("rejects divergent logical input under a reused HumanEdit commandId", () =>
    Effect.gen(function* () {
      const document = yield* Artifact.open("retry-divergent.md", { crdt: Yjs.layer(), initial: "draft" })
      const host = yield* Generalist.create({ agents: [] })
      const first = edit("human:retry-divergent", 0, "!")
      yield* host.artifacts.edit(document.name, first)
      const failure = yield* host.artifacts.edit(document.name, edit(first.commandId, 0, "?")).pipe(Effect.flip)
      expect(failure).toMatchObject({
        _tag: "generalist/artifact/ArtifactStorageError",
        operation: "reconcile artifact edit",
      })
      expect(yield* Artifact.read(document)).toMatchObject({ version: 1, content: "draft!" })
    }),
  )

  it.effect("reconciles concurrent same-ID HumanEdits without duplicate content", () =>
    Effect.gen(function* () {
      const original = yield* ArtifactCrdt
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      let waiting = 0
      const gated: CrdtService = {
        ...original,
        edit: (input: Parameters<CrdtService["edit"]>[0]) =>
          Effect.gen(function* () {
            waiting += 1
            if (waiting === 2) yield* Deferred.succeed(entered, undefined)
            yield* Deferred.await(entered)
            yield* Deferred.await(release)
            return yield* original.edit(input)
          }),
      }
      const document = yield* Artifact.open("retry-concurrent.md", {
        crdt: Layer.succeed(ArtifactCrdt, gated),
        initial: "draft",
      })
      const host = yield* Generalist.create({ agents: [] })
      const input = edit("human:retry-concurrent", 0, "!")
      const first = yield* Effect.forkChild(host.artifacts.edit(document.name, input))
      const second = yield* Effect.forkChild(host.artifacts.edit(document.name, input))
      yield* Deferred.await(entered)
      yield* Deferred.succeed(release, undefined)
      const results = [yield* Fiber.join(first), yield* Fiber.join(second)]
      expect(results[0]).toEqual(results[1])
      expect(yield* Artifact.read(document)).toMatchObject({ version: 1, content: "draft!" })
    }),
  )

  it.effect("reconciles distinct concurrent HumanEdits without lost updates", () =>
    Effect.gen(function* () {
      const document = yield* Artifact.open("retry-distinct.md", { crdt: Yjs.layer(), initial: "draft" })
      const host = yield* Generalist.create({ agents: [] })
      const first = yield* Effect.forkChild(host.artifacts.edit(document.name, edit("human:retry-a", 0, "A")))
      const second = yield* Effect.forkChild(host.artifacts.edit(document.name, edit("human:retry-b", 0, "B")))
      const results = [yield* Fiber.join(first), yield* Fiber.join(second)]
      expect(results.map((result) => result.result).toSorted()).toEqual([1, 2])
      expect(yield* Artifact.read(document)).toMatchObject({ version: 2 })
      const content = (yield* Artifact.read(document)).content
      expect(content).toContain("A")
      expect(content).toContain("B")
    }),
  )

  it.effect("does not mutate Artifact state during read-only inspection", () =>
    Effect.gen(function* () {
      const document = yield* Artifact.open("retry-read.md", { crdt: Yjs.layer(), initial: "draft" })
      const store = yield* RunStore.RunStore
      const before = yield* store.artifactHead({ artifact: document.name })
      expect(yield* Artifact.read(document)).toMatchObject({ version: 0, content: "draft" })
      const after = yield* store.artifactHead({ artifact: document.name })
      expect(after).toEqual(before)
    }),
  )
})

const reopenStorage = makeObjectStorage()
const concurrentOpenStorage = makeObjectStorage()
const lostAckStorage = makeObjectStorage()
const genesisKey = "environments/test/v1/tenants/runtime/partitions/conformance/commits/00000000000000000000.json"
const commitKey = "environments/test/v1/tenants/runtime/partitions/conformance/commits/00000000000000000001.json"

it.effect("reconciles a successful HumanEdit after fresh Layer reopen", () =>
  Effect.gen(function* () {
    const firstClient = yield* reopenStorage.connect
    const first = yield* provideObject(firstClient, Effect.gen(function* () {
      const document = yield* Artifact.open("retry-reopen.md", { crdt: Yjs.layer(), initial: "draft" })
      const host = yield* Generalist.create({ agents: [] })
      return yield* host.artifacts.edit(document.name, edit("human:retry-reopen", 0, "!"))
    }))
    const secondClient = yield* reopenStorage.connect
    const second = yield* provideObject(secondClient, Effect.gen(function* () {
      const document = yield* Artifact.open("retry-reopen.md", { crdt: Yjs.layer(), initial: "ignored" })
      const host = yield* Generalist.create({ agents: [] })
      const result = yield* host.artifacts.edit(document.name, edit("human:retry-reopen", 0, "!"))
      expect(yield* Artifact.read(document)).toMatchObject({ version: 1, content: "draft!" })
      return result
    }))
    expect(second).toEqual(first)
  })
)
it.effect("reconciles concurrent public opens with nondeterministic initial snapshots", () =>
  Effect.gen(function* () {
    const firstClient = yield* concurrentOpenStorage.connect
    const secondClient = yield* concurrentOpenStorage.connect
    const firstPause = yield* firstClient.faults.pauseNextCreate(genesisKey)
    const secondPause = yield* secondClient.faults.pauseNextCreate(genesisKey)
    const first = yield* Effect.forkChild(provideObject(firstClient, Effect.gen(function* () {
      const document = yield* Artifact.open("retry-open-race.md", { crdt: Yjs.layer(), initial: "draft" })
      return yield* Artifact.read(document)
    })))
    yield* firstPause.entered
    const second = yield* Effect.forkChild(provideObject(secondClient, Effect.gen(function* () {
      const document = yield* Artifact.open("retry-open-race.md", { crdt: Yjs.layer(), initial: "draft" })
      return yield* Artifact.read(document)
    })))
    yield* secondPause.entered
    yield* firstPause.release
    yield* secondPause.release
    const reads = [yield* Fiber.join(first), yield* Fiber.join(second)]
    expect(reads[0]).toEqual(reads[1])
    expect(reads[0]).toMatchObject({ artifact: "retry-open-race.md", version: 0, content: "draft" })
  })
)

it.effect("reconciles a successful HumanEdit after lost acknowledgement", () =>
  Effect.gen(function* () {
    const firstClient = yield* lostAckStorage.connect
    const failed = yield* provideObject(firstClient, Effect.gen(function* () {
      const document = yield* Artifact.open("retry-lost-ack.md", { crdt: Yjs.layer(), initial: "draft" })
      const host = yield* Generalist.create({ agents: [] })
      yield* firstClient.faults.failNextCreate({ key: commitKey, phase: "after" })
      yield* firstClient.faults.failNextRead({ key: commitKey })
      return yield* host.artifacts.edit(
        document.name,
        edit("human:retry-lost-ack", 0, "!"),
      ).pipe(Effect.flip)
    }))
    expect(failed).toMatchObject({ _tag: "generalist/artifact/ArtifactStorageError" })

    const secondClient = yield* lostAckStorage.connect
    const result = yield* provideObject(secondClient, Effect.gen(function* () {
      const document = yield* Artifact.open("retry-lost-ack.md", { crdt: Yjs.layer(), initial: "ignored" })
      const host = yield* Generalist.create({ agents: [] })
      const retry = yield* host.artifacts.edit(document.name, edit("human:retry-lost-ack", 0, "!"))
      expect(yield* Artifact.read(document)).toMatchObject({ version: 1, content: "draft!" })
      return retry
    }))
    expect(result).toMatchObject({ artifact: "retry-lost-ack.md", base: 0, result: 1 })
  })
)
