import { expect, it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import type { Ref as MediaRef } from "../../../media/ref.js"
import type { Options, Services } from "../contract.js"

type Provide<LayerError> = <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>

const snapshot = (value: number): MediaRef => ({
  sha256: value.toString(16).padStart(64, "0"),
  mediaType: "application/vnd.generalist.artifact-crdt",
  bytes: 1,
})

/** Register the shared Artifact head, operation-log, subscription, and branch contract. */
export const registerArtifacts = <LayerError, ClaimsLayerError>(input: {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly provide: Provide<LayerError>
}): void => {
  const { options, provide } = input

  it.effect("orders Artifact operations, replays without a gap, and isolates branches", () =>
    provide((services) =>
      Effect.scoped(
        Effect.gen(function* () {
          const artifact = `conformance:${options.name}:artifact`
          const initial = snapshot(0)
          expect(yield* services.store.ensureArtifact({ artifact, crdt: "test-v1", snapshot: initial })).toMatchObject({
            artifact,
            version: 0,
            snapshot: initial,
          })

          const first = yield* services.store.appendArtifact({
            artifact,
            crdt: "test-v1",
            expected: 0,
            base: 0,
            operation: { _tag: "Insert", at: 0, text: "human" },
            attribution: { _tag: "Human", actor: "alice" },
            update: Uint8Array.of(1),
            snapshot: snapshot(1),
          })
          const followed = yield* services.store
            .artifactUpdates({ artifact, version: 0 })
            .pipe(Stream.take(2), Stream.runCollect, Effect.forkScoped)
          yield* Effect.yieldNow
          const second = yield* services.store.appendArtifact({
            artifact,
            crdt: "test-v1",
            expected: 1,
            base: 0,
            operation: { _tag: "Insert", at: 0, text: "agent" },
            attribution: { _tag: "Agent", actor: "writer", runId: "run:artifact" },
            update: Uint8Array.of(2),
            snapshot: snapshot(2),
          })
          expect(Array.from(yield* Fiber.join(followed))).toMatchObject([
            { result: 1, attribution: { _tag: "Human", actor: "alice" } },
            { result: 2, attribution: { _tag: "Agent", actor: "writer" } },
          ])
          expect(yield* services.store.artifactSnapshot({ artifact, version: 0 })).toMatchObject({ snapshot: initial })
          expect(yield* services.store.artifactSnapshot({ artifact, version: 1 })).toMatchObject({
            snapshot: first.snapshot,
          })

          const conflict = yield* services.store
            .appendArtifact({
              artifact,
              crdt: "test-v1",
              expected: 1,
              base: 1,
              operation: { _tag: "Insert", at: 0, text: "stale" },
              attribution: { _tag: "Human", actor: "bob" },
              update: Uint8Array.of(3),
              snapshot: snapshot(3),
            })
            .pipe(Effect.flip)
          expect(conflict).toMatchObject({
            _tag: "generalist/artifact/ArtifactVersionConflict",
            expected: 1,
            actual: 2,
          })

          const branch = `${artifact}:branch`
          yield* services.store.forkArtifact({
            artifact,
            crdt: "test-v1",
            branch,
            source: { version: 1, snapshot: first.snapshot },
          })
          yield* services.store.appendArtifact({
            artifact,
            crdt: "test-v1",
            branch,
            expected: 1,
            base: 1,
            operation: { _tag: "Insert", at: 0, text: "branch" },
            attribution: { _tag: "Agent", actor: "writer", runId: "run:branch" },
            update: Uint8Array.of(4),
            snapshot: snapshot(4),
          })
          expect(yield* services.store.artifactHead({ artifact })).toMatchObject({ version: second.result })
          expect(yield* services.store.artifactHead({ artifact, branch })).toMatchObject({ version: 2, branch })
        }),
      ),
    ),
  )
}
