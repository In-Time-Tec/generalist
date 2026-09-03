import { Effect, Layer, SynchronizedRef } from "effect"
import {
  ArtifactAlreadyOpen,
  ArtifactNotFound,
  ArtifactRegistry,
  type ArtifactRegistryService,
  type RegisteredArtifact,
} from "../../core/artifact.js"

interface RegistryState {
  readonly artifacts: ReadonlyMap<string, RegisteredArtifact>
}

const make = Effect.gen(function* () {
  const state = yield* SynchronizedRef.make<RegistryState>({ artifacts: new Map() })
  return ArtifactRegistry.of({
    register: (artifact) =>
      SynchronizedRef.updateEffect(state, (current) => {
        if (current.artifacts.has(artifact.name)) {
          return Effect.fail(ArtifactAlreadyOpen.make({ artifact: artifact.name }))
        }
        return Effect.succeed({
          artifacts: new Map(current.artifacts).set(artifact.name, artifact),
        })
      }),
    get: (name) =>
      SynchronizedRef.get(state).pipe(
        Effect.flatMap((current) => {
          const artifact = current.artifacts.get(name)
          return artifact === undefined
            ? Effect.fail(ArtifactNotFound.make({ artifact: name }))
            : Effect.succeed(artifact)
        }),
      ),
  } satisfies ArtifactRegistryService)
})

/** Process-scoped registry for open Artifact documents and their model tool handlers. @experimental */
export const layer: Layer.Layer<ArtifactRegistry> = Layer.effect(ArtifactRegistry, make)
