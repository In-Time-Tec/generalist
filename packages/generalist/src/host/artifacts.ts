import { Effect, Option, Stream } from "effect"
import {
  ArtifactNotFound,
  ArtifactRegistry,
  type ArtifactError,
  type ArtifactUpdate,
  type EditResult,
  type HumanEdit,
  type ReadResult,
  type Version,
} from "../core/artifact.js"

export interface Artifacts {
  readonly read: (name: string) => Effect.Effect<ReadResult, ArtifactError>
  readonly edit: (name: string, input: HumanEdit) => Effect.Effect<EditResult, ArtifactError>
  readonly subscribe: (
    name: string,
    version?: Version,
  ) => Effect.Effect<Stream.Stream<ArtifactUpdate, ArtifactError>, ArtifactError>
}

const get = (registry: Option.Option<ArtifactRegistry["Service"]>, name: string) =>
  Option.isNone(registry) ? Effect.fail(ArtifactNotFound.make({ artifact: name })) : registry.value.get(name)

export const make = (registry: Option.Option<ArtifactRegistry["Service"]>): Artifacts => ({
  read: (name) => get(registry, name).pipe(Effect.flatMap((artifact) => artifact.read)),
  edit: (name, input) => get(registry, name).pipe(Effect.flatMap((artifact) => artifact.edit(input))),
  subscribe: (name, version) => get(registry, name).pipe(Effect.flatMap((artifact) => artifact.subscribe(version))),
})
