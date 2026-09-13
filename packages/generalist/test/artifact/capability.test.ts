import { BunCrypto } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { Context, Effect, Exit, Fiber, Layer, Result, Scope, Stream } from "effect"
import { Approvals, BlobStore, Permissions } from "generalist"
import { Host } from "generalist/host"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { TestModel } from "generalist/testing"
import {
  Artifact,
  ArtifactCrdt,
  Artifacts,
  ArtifactStorageError,
  Yjs,
  layer as artifactLayer,
  type CrdtService,
} from "generalist/unstable/artifact"
import { managedToolHandlers } from "../../src/core/artifact.js"
import type { EditTool as SourceEditTool } from "../../src/unstable/artifact/document.js"
import { ObjectStore } from "../../src/durability/object-store.js"
import { makeObjectStorage, objectRuntimeLayer } from "../runtime/execution/object.js"

const storage = makeObjectStorage()
const runtime = objectRuntimeLayer(
  { addresses: [], scheduler: { pollInterval: "1 hour" }, schedulerMode: "poll" },
  storage,
).pipe(Layer.provide(ExecutableResolver.layerStatic([])))
const blobStore = BlobStore.layer({ environment: "test", tenant: "artifact" }).pipe(
  Layer.provide(Layer.merge(BunCrypto.layer, Layer.succeed(ObjectStore, storage.store))),
)
const artifacts = artifactLayer.pipe(Layer.provideMerge(runtime), Layer.provideMerge(blobStore))
const services = Layer.mergeAll(
  artifacts,
  Yjs.layer(),
  TestModel.layer([]),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

const countedCrdt = (crdt: CrdtService, count: { acquired: number; released: number }) =>
  Layer.effect(
    ArtifactCrdt,
    Effect.acquireRelease(
      Effect.sync(() => {
        count.acquired += 1
        return crdt
      }),
      () =>
        Effect.sync(() => {
          count.released += 1
        }),
    ),
  )

layer(services)("Artifact capability", (it) => {
  it.effect("serializes duplicate opens, preserves persisted CRDT identity, and releases scoped registrations", () =>
    Effect.gen(function* () {
      const attempts = yield* Effect.scoped(
        Effect.all(
          [
            Artifact.open("capability.md", { crdt: Yjs.layer(), initial: "draft" }).pipe(Effect.result),
            Artifact.open("capability.md", { crdt: Yjs.layer(), initial: "draft" }).pipe(Effect.result),
          ],
          { concurrency: 2 },
        ),
      )
      expect(attempts.filter(Result.isSuccess)).toHaveLength(1)
      expect(attempts.find(Result.isFailure)?.failure).toMatchObject({
        _tag: "generalist/artifact/ArtifactAlreadyOpen",
        artifact: "capability.md",
      })

      expect(
        yield* Effect.scoped(
          Artifact.open("capability.md", { crdt: Yjs.layer(), initial: "ignored" }).pipe(Effect.flatMap(Artifact.read)),
        ),
      ).toMatchObject({ artifact: "capability.md", version: 0, content: "draft" })

      const yjs = yield* ArtifactCrdt
      const mismatch = yield* Effect.scoped(
        Artifact.open("capability.md", {
          crdt: Layer.succeed(ArtifactCrdt, { ...yjs, id: "other-crdt" }),
        }),
      ).pipe(Effect.flip)
      expect(mismatch).toMatchObject({
        _tag: "generalist/artifact/ArtifactCrdtMismatch",
        artifact: "capability.md",
        expected: "yjs-v1",
        actual: "other-crdt",
      })
    }),
  )

  it.effect("closes document subscriptions with the document scope", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const document = yield* Artifact.open("capability-cleanup.md", {
        crdt: Yjs.layer(),
        initial: "draft",
      }).pipe(Effect.provideService(Scope.Scope, scope))
      const host = yield* Host.make({ revision: "local", agents: {} })
      const updates = yield* host.artifacts.subscribe(document.name)
      const subscriber = yield* Effect.forkChild(updates.pipe(Stream.runDrain))
      yield* Effect.yieldNow
      yield* Scope.close(scope, Exit.void)
      expect(Exit.isSuccess(yield* Fiber.await(subscriber))).toBe(true)
      expect(yield* host.artifacts.read(document.name).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/artifact/ArtifactNotFound",
        artifact: document.name,
      })
    }),
  )

  it.effect("keeps framework-owned Artifact handlers private to their original tool identities", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const document = yield* Artifact.open("capability-private-handlers.md", {
          crdt: Yjs.layer(),
          initial: "draft",
        })
        const copied = { ...document.editTool }
        const callerSupplied = { ...document.readTool }

        expect(managedToolHandlers(document.editTool)).toBeDefined()
        expect(managedToolHandlers(copied)).toBeUndefined()
        expect(managedToolHandlers(callerSupplied)).toBeUndefined()
        expect(Object.hasOwn(document.editTool, "handlers")).toBe(false)
        const handlersArePublic: "handlers" extends keyof SourceEditTool ? true : false = false
        expect(handlersArePublic).toBe(false)
      }),
    ),
  )

  it.effect("closes failed open CRDT scopes without closing sibling documents", () =>
    Effect.gen(function* () {
      const callerScope = yield* Scope.make()
      const openInCallerScope = <Value, Error, Requirements>(effect: Effect.Effect<Value, Error, Requirements>) =>
        effect.pipe(Effect.provideService(Scope.Scope, callerScope))
      const crdt = yield* ArtifactCrdt
      const siblingCount = { acquired: 0, released: 0 }
      const sibling = yield* openInCallerScope(
        Artifact.open("capability-scope-sibling.md", {
          crdt: countedCrdt(crdt, siblingCount),
          initial: "draft",
        }),
      )

      const duplicateOwnerCount = { acquired: 0, released: 0 }
      yield* openInCallerScope(
        Artifact.open("capability-scope-duplicate.md", {
          crdt: countedCrdt(crdt, duplicateOwnerCount),
          initial: "draft",
        }),
      )
      const duplicateCount = { acquired: 0, released: 0 }
      const duplicate = yield* openInCallerScope(
        Artifact.open("capability-scope-duplicate.md", { crdt: countedCrdt(crdt, duplicateCount) }),
      ).pipe(Effect.flip)
      expect(duplicate).toMatchObject({ _tag: "generalist/artifact/ArtifactAlreadyOpen" })
      expect(duplicateCount).toEqual({ acquired: 1, released: 1 })

      const mismatchOwnerCount = { acquired: 0, released: 0 }
      yield* openInCallerScope(
        Artifact.open("capability-scope-mismatch.md", {
          crdt: countedCrdt(crdt, mismatchOwnerCount),
          initial: "draft",
        }),
      )
      const mismatchCount = { acquired: 0, released: 0 }
      const mismatch = yield* openInCallerScope(
        Artifact.open("capability-scope-mismatch.md", {
          crdt: countedCrdt({ ...crdt, id: "capability-other-crdt" }, mismatchCount),
        }),
      ).pipe(Effect.flip)
      expect(mismatch).toMatchObject({ _tag: "generalist/artifact/ArtifactCrdtMismatch" })
      expect(mismatchCount).toEqual({ acquired: 1, released: 1 })

      const storageCount = { acquired: 0, released: 0 }
      const storageFailure = yield* openInCallerScope(
        Artifact.open("capability-scope-storage.md", {
          crdt: countedCrdt(
            {
              ...crdt,
              id: "capability-storage-crdt",
              empty: () =>
                Effect.fail(
                  ArtifactStorageError.make({
                    artifact: "capability-scope-storage.md",
                    operation: "initialize CRDT",
                    reason: "storage failed",
                  }),
                ),
            },
            storageCount,
          ),
        }),
      ).pipe(Effect.flip)
      expect(storageFailure).toMatchObject({ _tag: "generalist/artifact/ArtifactStorageError" })
      expect(storageCount).toEqual({ acquired: 1, released: 1 })

      expect(siblingCount).toEqual({ acquired: 1, released: 0 })
      expect(yield* Artifact.read(sibling)).toMatchObject({ content: "draft" })
      yield* Scope.close(callerScope, Exit.void)
      expect(siblingCount).toEqual({ acquired: 1, released: 1 })
      expect(duplicateOwnerCount).toEqual({ acquired: 1, released: 1 })
      expect(mismatchOwnerCount).toEqual({ acquired: 1, released: 1 })
    }),
  )

  it.effect("returns ArtifactStorageError when the Runtime has no Artifact backend binding", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const runtimeService = yield* Runtime.Runtime
        const blobs = yield* BlobStore.BlobStore
        const context = yield* Layer.build(
          Layer.fresh(artifactLayer).pipe(
            Layer.provide(
              Layer.mergeAll(
                Layer.succeed(Runtime.Runtime, { ...runtimeService }),
                Layer.succeed(BlobStore.BlobStore, blobs),
              ),
            ),
          ),
        )
        const unbound = Context.get(context, Artifacts)
        const failure = yield* unbound
          .open("capability-unbound-runtime.md", { crdt: Yjs.layer(), initial: "draft" })
          .pipe(Effect.flip)

        expect(failure).toMatchObject({
          _tag: "generalist/artifact/ArtifactStorageError",
          artifact: "capability-unbound-runtime.md",
          operation: "open artifact",
        })
      }),
    ),
  )
})
