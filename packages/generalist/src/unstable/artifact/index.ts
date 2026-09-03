import { Context, Effect, Function, Layer, Schema, type Scope } from "effect"
import { BlobStore } from "../../blob-store/index.js"
import {
  ArtifactAlreadyOpen,
  ArtifactBaseStale,
  ArtifactCrdt,
  ArtifactCrdtMismatch,
  ArtifactError,
  ArtifactNotFound,
  ArtifactRangeInvalid,
  ArtifactRegistry,
  ArtifactStorageError,
  ArtifactSubscriberLagged,
  ArtifactUpdate,
  ArtifactVersionConflict,
  ArtifactVersionNotFound,
  AgentAttribution,
  Attribution,
  EditResult,
  HumanAttribution,
  RangeOperation,
  ReadResult,
  Version,
  type CrdtService,
} from "../../core/artifact.js"
import { RunStore } from "../../runtime/run/store.js"
import { make, type Document, type EditTool, type ReadTool } from "./document.js"
import { layer } from "./registry.js"
import { Yjs } from "./yjs.js"

export {
  ArtifactAlreadyOpen,
  ArtifactBaseStale,
  ArtifactCrdt,
  ArtifactCrdtMismatch,
  ArtifactError,
  ArtifactNotFound,
  ArtifactRangeInvalid,
  ArtifactStorageError,
  ArtifactSubscriberLagged,
  ArtifactUpdate,
  ArtifactVersionConflict,
  ArtifactVersionNotFound,
  AgentAttribution,
  Attribution,
  EditResult,
  HumanAttribution,
  RangeOperation,
  ReadResult,
  Version,
  Yjs,
  layer,
  type CrdtService,
  type Document,
  type EditTool,
  type ReadTool,
}

/** Configuration for opening one shared text artifact. @experimental */
export interface OpenOptions<Error, Requirements> {
  readonly crdt: Layer.Layer<ArtifactCrdt, Error, Requirements>
  readonly initial?: string
}

const storageError = (artifact: string, operation: string) =>
  Effect.mapError(<Error>(error: Error) =>
    Schema.is(ArtifactError)(error) ? error : ArtifactStorageError.make({ artifact, operation, reason: String(error) }),
  )

type OpenEffect<Error, Requirements> = Effect.Effect<
  Document,
  Error | ArtifactError,
  Requirements | Scope.Scope | ArtifactRegistry | RunStore | BlobStore
>

/** Open and register one shared text artifact, creating its main snapshot when absent. @experimental */
export const open: {
  <Error, Requirements>(options: OpenOptions<Error, Requirements>): (name: string) => OpenEffect<Error, Requirements>
  <Error, Requirements>(name: string, options: OpenOptions<Error, Requirements>): OpenEffect<Error, Requirements>
} = Function.dual(
  2,
  <Error, Requirements>(name: string, options: OpenOptions<Error, Requirements>): OpenEffect<Error, Requirements> =>
    Effect.gen(function* () {
      const crdtContext = yield* Layer.build(options.crdt)
      const crdt = Context.get(crdtContext, ArtifactCrdt)
      yield* Effect.gen(function* () {
        const initial = yield* crdt.empty(options.initial ?? "")
        const blobs = yield* BlobStore
        const snapshot = yield* blobs.put({
          data: initial,
          mediaType: "application/vnd.generalist.artifact-crdt",
          filename: `${name}.crdt`,
        })
        const store = yield* RunStore
        yield* store.ensureArtifact({ artifact: name, crdt: crdt.id, snapshot })
      }).pipe(storageError(name, "open artifact"))
      return yield* make({ name, crdt })
    }),
)

/** Read an open document's current main branch. @experimental */
export const read = (document: Document): Document["read"] => document.read

/** Model-facing range edit tool for an open document. @experimental */
export const tool = (document: Document): Document["editTool"] => document.editTool

/** Model-facing versioned read tool for an open document. @experimental */
export const readTool = (document: Document): Document["readTool"] => document.readTool

/** Unstable shared Artifact API. @experimental */
export const Artifact = {
  open,
  read,
  tool,
  readTool,
  layer,
  ArtifactCrdt,
  Version,
  RangeOperation,
  ReadResult,
  EditResult,
  ArtifactUpdate,
} as const
