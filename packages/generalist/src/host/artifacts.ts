import { Context, Effect, Option, Stream } from "effect"
import {
  ArtifactNotFound,
  type ArtifactError,
  type ArtifactUpdate,
  type EditResult,
  type HumanEdit,
  type ReadResult,
  type Version,
} from "../core/artifact.js"

interface ArtifactService {
  readonly get: (name: string) => Effect.Effect<import("../core/artifact.js").RegisteredArtifact, ArtifactError>
}

/** Internal view of the optional Artifact capability used by the stable Host facade. */
export class ArtifactCapability extends Context.Service<ArtifactCapability, ArtifactService>()(
  "generalist/host/artifacts/ArtifactCapability",
) {}

export interface Artifacts {
  readonly read: (name: string) => Effect.Effect<ReadResult, ArtifactError>
  readonly edit: (name: string, input: HumanEdit) => Effect.Effect<EditResult, ArtifactError>
  readonly subscribe: (
    name: string,
    version?: Version,
  ) => Effect.Effect<Stream.Stream<ArtifactUpdate, ArtifactError>, ArtifactError>
}

const get = (artifacts: Option.Option<ArtifactService>, name: string) =>
  Option.isNone(artifacts) ? Effect.fail(ArtifactNotFound.make({ artifact: name })) : artifacts.value.get(name)

export const make = (artifacts: Option.Option<ArtifactService>): Artifacts => ({
  read: (name) => get(artifacts, name).pipe(Effect.flatMap((artifact) => artifact.read)),
  edit: (name, input) => get(artifacts, name).pipe(Effect.flatMap((artifact) => artifact.edit(input))),
  subscribe: (name, version) => get(artifacts, name).pipe(Effect.flatMap((artifact) => artifact.subscribe(version))),
})
