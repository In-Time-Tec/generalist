import { Context, Effect, Layer, type Scope } from "effect"
import { ArtifactCrdt, type ArtifactError } from "../../core/artifact.js"
import type { Document } from "./document.js"

/** Configuration for opening one shared text artifact. @experimental */
export interface OpenOptions<Error, Requirements> {
  readonly crdt: Layer.Layer<ArtifactCrdt, Error, Requirements>
  readonly initial?: string
}

/** Artifact operations supplied by one concrete Runtime and BlobStore pair. @experimental */
export interface Service {
  readonly open: <Error, Requirements>(
    name: string,
    options: OpenOptions<Error, Requirements>,
  ) => Effect.Effect<Document, Error | ArtifactError, Requirements | Scope.Scope>
}

/** Process-scoped Artifact capability. @experimental */
// oxlint-disable-next-line effecttsgo/deterministic-keys -- The public service key is specified by the Artifact capability contract.
export class Artifacts extends Context.Service<Artifacts, Service>()("generalist/unstable/artifact/Artifacts") {}
