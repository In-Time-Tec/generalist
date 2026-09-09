/* oxlint-disable effecttsgo/strict-effect-provide -- This persistence test owns two fresh Layer scopes. */
import { BunCrypto } from "@effect/platform-bun"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { Approvals, BlobStore, Permissions } from "generalist"
import { Host } from "generalist/host"
import { ExecutableResolver } from "generalist/runtime"
import { TestModel } from "generalist/testing"
import { Artifact, Yjs, layer as artifactLayer } from "generalist/unstable/artifact"
import { ObjectStore } from "../../src/durability/object-store.js"
import { makeObjectStorage, objectRuntimeLayer } from "../runtime/execution/object.js"

const storage = makeObjectStorage()
const services = () => {
  const blobStore = Layer.unwrap(
    Effect.gen(function* () {
      const client = yield* storage.connect
      return BlobStore.layer({ environment: "test", tenant: "artifact" }).pipe(
        Layer.provide(Layer.merge(BunCrypto.layer, Layer.succeed(ObjectStore, client.store))),
      )
    }),
  )
  return Layer.mergeAll(
    objectRuntimeLayer({ addresses: [], scheduler: { pollInterval: "1 hour" }, schedulerMode: "poll" }, storage).pipe(
      Layer.provide(ExecutableResolver.layerStatic([])),
    ),
    blobStore,
    artifactLayer,
    TestModel.layer([]),
    Permissions.layerAllowAll,
    Approvals.layerAutoApprove,
  )
}

const withServices = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.scoped(Layer.build(services()).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))))

it.effect("reopens BlobStore snapshots and the Runtime operation log", () =>
  Effect.gen(function* () {
    yield* withServices(
      Effect.gen(function* () {
        const document = yield* Artifact.open("persistent.md", { crdt: Yjs.layer(), initial: "saved" })
        const host = yield* Host.make({ revision: "local", agents: {} })
        yield* host.artifacts.edit(document.name, {
          commandId: "human:persistence",
          base: 0,
          operation: { _tag: "Insert", at: 5, text: " state" },
          attribution: { _tag: "Human", actor: "alice" },
        })
      }),
    )

    yield* withServices(
      Effect.gen(function* () {
        const document = yield* Artifact.open("persistent.md", { crdt: Yjs.layer(), initial: "ignored" })
        const host = yield* Host.make({ revision: "local", agents: {} })
        expect(yield* Artifact.read(document)).toMatchObject({ version: 1, content: "saved state" })
        const updates = yield* host.artifacts.subscribe(document.name)
        expect(Array.from(yield* updates.pipe(Stream.take(1), Stream.runCollect))).toMatchObject([
          { base: 0, result: 1, attribution: { _tag: "Human", actor: "alice" } },
        ])
      }),
    )
  }),
)
