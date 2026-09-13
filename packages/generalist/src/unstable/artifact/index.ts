import { Context, Effect, Exit, Function, Layer, Schema, Semaphore, Scope } from "effect"
import { BlobStore } from "../../blob-store/index.js"
import {
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
  type ArtifactRegistryService,
  type CrdtService,
} from "../../core/artifact.js"
import { Runtime } from "../../runtime/service.js"
import { get as getRuntimeArtifacts, type Backend } from "../../runtime/artifact/export.js"
import { make, type Document, type EditTool, type ReadTool } from "./document.js"
import { bind as bindRegistry, make as makeRegistry } from "./registry.js"
import { Artifacts, type OpenOptions, type Service } from "./service.js"
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
  Artifacts,
  type CrdtService,
  type Document,
  type EditTool,
  type OpenOptions,
  type ReadTool,
  type Service,
}

interface OpenDependencies {
  readonly backend: Backend
  readonly blobs: BlobStore["Service"]
  readonly registry: ArtifactRegistryService
}

const storageError = (artifact: string, operation: string) =>
  Effect.mapError(<Error>(error: Error) =>
    Schema.is(ArtifactError)(error) ? error : ArtifactStorageError.make({ artifact, operation, reason: String(error) }),
  )

const initialize = (input: {
  readonly name: string
  readonly crdt: CrdtService
  readonly initial: string | undefined
  readonly dependencies: OpenDependencies
}): Effect.Effect<void, ArtifactError> =>
  Effect.gen(function* () {
    const existing = yield* input.dependencies.backend
      .head({ artifact: input.name })
      .pipe(Effect.catchTag("generalist/artifact/ArtifactNotFound", () => Effect.void))
    if (existing !== undefined) {
      if (existing.crdt !== input.crdt.id) {
        return yield* ArtifactCrdtMismatch.make({
          artifact: input.name,
          expected: existing.crdt,
          actual: input.crdt.id,
        })
      }
      return
    }
    const initial = yield* input.crdt.empty(input.initial ?? "")
    const snapshot = yield* input.dependencies.blobs.put({
      data: initial,
      mediaType: "application/vnd.generalist.artifact-crdt",
      filename: `${input.name}.crdt`,
    })
    yield* input.dependencies.backend.ensure({ artifact: input.name, crdt: input.crdt.id, snapshot }).pipe(
      Effect.catchTag("generalist/durability/DurabilityFailure", (error) =>
        error.reason === "input-conflict"
          ? Effect.gen(function* () {
              const committed = yield* input.dependencies.backend.head({ artifact: input.name })
              if (committed.crdt !== input.crdt.id) {
                return yield* ArtifactCrdtMismatch.make({
                  artifact: input.name,
                  expected: committed.crdt,
                  actual: input.crdt.id,
                })
              }
            })
          : Effect.fail(error),
      ),
    )
  }).pipe(storageError(input.name, "open artifact"))

const openWith = <Error, Requirements>(
  dependencies: OpenDependencies,
  name: string,
  options: OpenOptions<Error, Requirements>,
): Effect.Effect<Document, Error | ArtifactError, Requirements | Scope.Scope> =>
  Effect.gen(function* () {
    const scope = yield* Scope.make()
    yield* Effect.addFinalizer((exit) => Scope.close(scope, exit))
    return yield* Effect.gen(function* () {
      const crdtContext = yield* Layer.build(options.crdt)
      const crdt = Context.get(crdtContext, ArtifactCrdt)
      yield* initialize({ name, crdt, initial: options.initial, dependencies })
      return yield* make({ name, crdt, services: dependencies })
    }).pipe(
      Scope.provide(scope),
      Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void)),
    )
  })

const makeService = Effect.gen(function* () {
  const runtime = yield* Runtime
  const blobs = yield* BlobStore
  const backend = getRuntimeArtifacts(runtime)
  const registry = yield* makeRegistry
  const lock = yield* Semaphore.make(1)
  const dependencies = backend === undefined ? undefined : { backend, blobs, registry }
  const service = Artifacts.of({
    open: (name, options) =>
      dependencies === undefined
        ? Effect.fail(
            ArtifactStorageError.make({
              artifact: name,
              operation: "open artifact",
              reason: "Runtime has no Artifact persistence capability",
            }),
          )
        : lock.withPermit(openWith(dependencies, name, options)),
  } satisfies Service)
  bindRegistry(service, registry)
  return service
})

/** Build the Artifact capability from an already-ready Runtime and BlobStore. @experimental */
export const layer: Layer.Layer<Artifacts, never, Runtime | BlobStore> = Layer.effect(Artifacts, makeService)

type OpenEffect<Error, Requirements> = Effect.Effect<
  Document,
  Error | ArtifactError,
  Requirements | Scope.Scope | Artifacts
>

/** Open and register one shared text artifact, creating its main snapshot when absent. @experimental */
export const open: {
  <Error, Requirements>(options: OpenOptions<Error, Requirements>): (name: string) => OpenEffect<Error, Requirements>
  <Error, Requirements>(name: string, options: OpenOptions<Error, Requirements>): OpenEffect<Error, Requirements>
} = Function.dual(
  2,
  <Error, Requirements>(name: string, options: OpenOptions<Error, Requirements>): OpenEffect<Error, Requirements> =>
    Effect.flatMap(Artifacts, (artifacts) => artifacts.open(name, options)),
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
