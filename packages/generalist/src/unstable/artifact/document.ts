import { Context, Effect, Encoding, Schema, Stream } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { BlobStore } from "../../blob-store/index.js"
import {
  ArtifactBaseStale,
  ArtifactError,
  ArtifactRegistry,
  ArtifactStorageError,
  artifactEditToolPrefix,
  artifactReadToolPrefix,
  EditResult,
  ReadResult,
  RangeOperation,
  Version,
  ManagedArtifactToolTypeId,
  type ArtifactCheckpoint,
  type ArtifactHead,
  type CrdtService,
  type HumanEdit,
  type ManagedArtifactTool,
  type RegisteredArtifact,
} from "../../core/artifact.js"
import { DriverInterpreter } from "../../core/durable/driver/interpreter.js"
import { LoopDriverState } from "../../core/durable/loop-driver-state.js"
import { ToolContext } from "../../core/tools/tool-context.js"
import { RunStore } from "../../runtime/run/store.js"

const toolSuffix = (name: string): string => Encoding.encodeBase64Url(name).replaceAll("=", "")

const storageError = <Cause>(artifact: string, operation: string, cause: Cause): ArtifactStorageError =>
  ArtifactStorageError.make({ artifact, operation, reason: String(cause) })

const normalizeError = <Error>(artifact: string, operation: string, error: Error): ArtifactError =>
  Schema.is(ArtifactError)(error) ? error : storageError(artifact, operation, error)

const mapStorageError = (artifact: string, operation: string) =>
  Effect.mapError(<Error>(error: Error) => normalizeError(artifact, operation, error))

const managedTool = <T extends Tool.Any>(value: T, handlers: Context.Context<never>): T & ManagedArtifactTool =>
  Object.assign(value, { [ManagedArtifactToolTypeId]: ManagedArtifactToolTypeId, handlers })

const readCheckpoint = (artifact: string) =>
  Effect.gen(function* () {
    const driver = yield* DriverInterpreter
    const checkpoint = yield* driver.checkpoint
    const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state)
    return state.artifacts?.[artifact]
  }).pipe(mapStorageError(artifact, "read Run checkpoint"))

interface Position extends ArtifactCheckpoint {
  readonly source?: ArtifactCheckpoint
}

const positionFor = (
  artifact: string,
  checkpoint: ArtifactCheckpoint,
  runId: string | undefined,
): Effect.Effect<Position, ArtifactError, RunStore> =>
  Effect.gen(function* () {
    if (runId === undefined) return { ...checkpoint } satisfies Position
    const store = yield* RunStore
    const forked = yield* store
      .artifactRunIsFork(runId)
      .pipe(Effect.catchTag("generalist/runtime/RunNotFound", () => Effect.succeed(false)))
    return forked && checkpoint.branch !== runId
      ? ({ version: checkpoint.version, branch: runId, source: checkpoint } satisfies Position)
      : ({ ...checkpoint } satisfies Position)
  }).pipe(mapStorageError(artifact, "resolve Run artifact branch"))

const loadBytes = (artifact: string, operation: string, head: ArtifactHead) =>
  Effect.gen(function* () {
    const blobs = yield* BlobStore
    return (yield* blobs.get(head.snapshot.sha256)).data
  }).pipe(mapStorageError(artifact, operation))

const putBytes = (artifact: string, bytes: Uint8Array) =>
  Effect.gen(function* () {
    const blobs = yield* BlobStore
    return yield* blobs.put({
      data: bytes,
      mediaType: "application/vnd.generalist.artifact-crdt",
      filename: `${artifact}.crdt`,
    })
  }).pipe(mapStorageError(artifact, "store CRDT snapshot"))

const maxCommitConflicts = 8

const ensurePosition = (artifact: string, crdt: CrdtService, position: Position) =>
  Effect.gen(function* () {
    const store = yield* RunStore
    if (position.source === undefined || position.branch === undefined) {
      return yield* store.artifactSnapshot({
        artifact,
        version: position.version,
        ...(position.branch === undefined ? undefined : { branch: position.branch }),
      })
    }
    const source = yield* store.artifactSnapshot({
      artifact,
      version: position.source.version,
      ...(position.source.branch === undefined ? undefined : { branch: position.source.branch }),
    })
    return yield* store.forkArtifact({
      artifact,
      crdt: crdt.id,
      branch: position.branch,
      source: {
        version: source.version,
        snapshot: source.snapshot,
        ...(source.branch === undefined ? undefined : { branch: source.branch }),
      },
    })
  }).pipe(mapStorageError(artifact, "open Run artifact branch"))

const readHead = (artifact: string, crdt: CrdtService, branch?: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const head = yield* store.artifactHead({ artifact, ...(branch === undefined ? undefined : { branch }) })
    const content = yield* crdt.read(yield* loadBytes(artifact, "load current snapshot", head))
    return {
      artifact,
      version: head.version,
      content,
      ...(head.branch === undefined ? undefined : { branch: head.branch }),
    } satisfies ReadResult
  }).pipe(mapStorageError(artifact, "read artifact"))

const readForAgent = (artifact: string, crdt: CrdtService) =>
  Effect.gen(function* () {
    const context = yield* ToolContext
    const checkpoint = yield* readCheckpoint(artifact)
    if (checkpoint === undefined) return yield* readHead(artifact, crdt)
    const position = yield* positionFor(artifact, checkpoint, context.runId)
    if (position.source === undefined) return yield* readHead(artifact, crdt, position.branch)
    const head = yield* ensurePosition(artifact, crdt, position)
    return yield* readHead(artifact, crdt, head.branch)
  })

const commit = (
  input: {
    readonly artifact: string
    readonly crdt: CrdtService
    readonly position: Position
    readonly operation: RangeOperation
    readonly attribution: EditResult["attribution"]
  },
  conflicts = 0,
): Effect.Effect<EditResult, ArtifactError, RunStore | BlobStore> =>
  Effect.suspend(() =>
    Effect.gen(function* () {
      const store = yield* RunStore
      const baseHead = yield* ensurePosition(input.artifact, input.crdt, input.position)
      const current = yield* store.artifactHead({
        artifact: input.artifact,
        ...(baseHead.branch === undefined ? undefined : { branch: baseHead.branch }),
      })
      const [baseBytes, currentBytes] = yield* Effect.all([
        loadBytes(input.artifact, "load edit base", baseHead),
        loadBytes(input.artifact, "load current snapshot", current),
      ])
      const edited = yield* input.crdt.edit({
        artifact: input.artifact,
        base: baseBytes,
        current: currentBytes,
        operation: input.operation,
      })
      const snapshot = yield* putBytes(input.artifact, edited.snapshot)
      const update = yield* store.appendArtifact({
        artifact: input.artifact,
        crdt: input.crdt.id,
        expected: current.version,
        base: input.position.version,
        operation: input.operation,
        attribution: input.attribution,
        update: edited.update,
        snapshot,
        ...(current.branch === undefined ? undefined : { branch: current.branch }),
      })
      return {
        artifact: input.artifact,
        base: input.position.version,
        result: update.result,
        attribution: input.attribution,
        ...(update.branch === undefined ? undefined : { branch: update.branch }),
      }
    }).pipe(
      Effect.catchTag("generalist/artifact/ArtifactVersionConflict", (error) =>
        conflicts >= maxCommitConflicts ? error : commit(input, conflicts + 1),
      ),
      mapStorageError(input.artifact, "edit artifact"),
    ),
  )

const editForAgent = (artifact: string, crdt: CrdtService, input: { base: Version; operation: RangeOperation }) =>
  Effect.gen(function* () {
    const context = yield* ToolContext
    const checkpoint = yield* readCheckpoint(artifact)
    if (checkpoint === undefined || input.base !== checkpoint.version) {
      return yield* ArtifactBaseStale.make({
        artifact,
        base: input.base,
        ...(checkpoint === undefined ? undefined : { expected: checkpoint.version }),
      })
    }
    const position = yield* positionFor(artifact, checkpoint, context.runId)
    return yield* commit({
      artifact,
      crdt,
      position,
      operation: input.operation,
      attribution: {
        _tag: "Agent",
        actor: context.agentName ?? "agent",
        runId: context.runId ?? context.sessionId,
      },
    })
  })

const editForHuman = (artifact: string, crdt: CrdtService, input: HumanEdit) =>
  commit({
    artifact,
    crdt,
    position: { version: input.base },
    operation: input.operation,
    attribution: input.attribution,
  })

const ReadParameters = Schema.Struct({})
const EditParameters = Schema.Struct({ base: Version, operation: RangeOperation })

/** Model-facing tool that journals one exact artifact version read. @experimental */
export type ReadTool = Tool.Tool<
  `artifact_read_${string}`,
  {
    readonly parameters: typeof ReadParameters
    readonly success: typeof ReadResult
    readonly failure: typeof ArtifactError
    readonly failureMode: "return"
  },
  DriverInterpreter | ToolContext
> &
  ManagedArtifactTool

/** Model-facing exact-base text edit tool. @experimental */
export type EditTool = Tool.Tool<
  `artifact_edit_${string}`,
  {
    readonly parameters: typeof EditParameters
    readonly success: typeof EditResult
    readonly failure: typeof ArtifactError
    readonly failureMode: "return"
  },
  DriverInterpreter | ToolContext
> &
  ManagedArtifactTool

export interface Document {
  readonly name: string
  readonly read: Effect.Effect<ReadResult, ArtifactError>
  readonly editTool: EditTool
  readonly readTool: ReadTool
}

export const make = (options: { readonly name: string; readonly crdt: CrdtService }) =>
  Effect.gen(function* () {
    const { name, crdt } = options
    const services = yield* Effect.context<RunStore | BlobStore>()
    const suffix = toolSuffix(name)
    const rawReadTool = Tool.make(`${artifactReadToolPrefix}${suffix}`, {
      description: `Read the current ${name} artifact and its exact version before editing it.`,
      parameters: ReadParameters,
      success: ReadResult,
      failure: ArtifactError,
      failureMode: "return",
      dependencies: [DriverInterpreter, ToolContext],
    })
    const rawEditTool = Tool.make(`${artifactEditToolPrefix}${suffix}`, {
      description: `Edit ${name} by an insert, delete, or replace range against the version returned by its read tool.`,
      parameters: EditParameters,
      success: EditResult,
      failure: ArtifactError,
      failureMode: "return",
      dependencies: [DriverInterpreter, ToolContext],
    })
    const toolkit = Toolkit.make(rawReadTool, rawEditTool)
    /* oxlint-disable typescript/no-unsafe-type-assertion -- SAFETY: the computed keys are the exact two tools in this toolkit; their handlers use their declared schemas. */
    const handlerDefinitions = {
      [rawReadTool.name]: () => readForAgent(name, crdt),
      [rawEditTool.name]: (edit: { base: Version; operation: RangeOperation }) => editForAgent(name, crdt, edit),
    } as Toolkit.HandlersFrom<typeof toolkit.tools>
    /* oxlint-enable typescript/no-unsafe-type-assertion */
    const handlers = yield* toolkit.toHandlers(handlerDefinitions)
    const readTool = managedTool(rawReadTool, handlers)
    const editTool = managedTool(rawEditTool, handlers)
    const read = readHead(name, crdt).pipe(Effect.provide(services))
    const registered: RegisteredArtifact = {
      name,
      read,
      edit: (edit) => editForHuman(name, crdt, edit).pipe(Effect.provide(services)),
      subscribe: (version = 0) =>
        Effect.gen(function* () {
          const store = yield* RunStore
          return store
            .artifactUpdates({ artifact: name, version })
            .pipe(Stream.mapError((error) => normalizeError(name, "subscribe to artifact", error)))
        }).pipe(Effect.provide(services)),
      readTool,
      editTool,
    }
    const registry = yield* ArtifactRegistry
    yield* registry.register(registered)
    return { name, read, readTool, editTool } satisfies Document
  })
