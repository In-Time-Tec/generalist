import { Effect, SynchronizedRef } from "effect"
import {
  ArtifactAlreadyOpen,
  ArtifactNotFound,
  type ArtifactRegistryService,
  type RegisteredArtifact,
} from "../../core/artifact.js"
import type { Service as ArtifactService } from "./service.js"

interface RegistryState {
  readonly artifacts: ReadonlyMap<string, RegisteredArtifact>
}

const bindings = new WeakMap<ArtifactService, ArtifactRegistryService>()

/** @internal Construct the process-local registry held by one Artifacts capability. */
export const make = Effect.gen(function* () {
  const state = yield* SynchronizedRef.make<RegistryState>({ artifacts: new Map() })
  return {
    register: (artifact) =>
      SynchronizedRef.updateEffect(state, (current) => {
        if (current.artifacts.has(artifact.name)) {
          return Effect.fail(ArtifactAlreadyOpen.make({ artifact: artifact.name }))
        }
        return Effect.succeed({
          artifacts: new Map(current.artifacts).set(artifact.name, artifact),
        })
      }),
    unregister: (artifact) =>
      SynchronizedRef.update(state, (current) => {
        if (current.artifacts.get(artifact.name) !== artifact) return current
        const artifacts = new Map(current.artifacts)
        artifacts.delete(artifact.name)
        return { artifacts }
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
  } satisfies ArtifactRegistryService
})

/** @internal Bind one Artifacts service to its private process-local registry. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- Internal capability binding receives two direct ownership values.
export const bind = (artifacts: ArtifactService, registry: ArtifactRegistryService): void => {
  bindings.set(artifacts, registry)
}

/** @internal Resolve one open Artifact document for the Host facade. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- Internal Host lookup receives the capability and artifact name together.
export const get = (artifacts: ArtifactService, name: string) => {
  const registry = bindings.get(artifacts)
  return registry === undefined ? Effect.fail(ArtifactNotFound.make({ artifact: name })) : registry.get(name)
}
