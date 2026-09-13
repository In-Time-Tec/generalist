import { Deferred, Effect, Encoding, Schema, Stream } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { DurabilityFailure } from "../../durability/errors.js"
import type { BlobStore } from "../../blob-store/index.js"
import {
  ArtifactBaseStale,
  ArtifactError,
  ArtifactStorageError,
  artifactEditToolPrefix,
  artifactReadToolPrefix,
  bindManagedArtifactTool,
  EditResult,
  ReadResult,
  RangeOperation,
  Version,
  type ArtifactAppendReceipt,
  type ArtifactCheckpoint,
  type ArtifactHead,
  type ArtifactRegistryService,
  type CrdtService,
  type HumanEdit,
  type ManagedArtifactTool,
  type RegisteredArtifact,
} from "../../core/artifact.js"
import { DriverInterpreter } from "../../core/durable/driver/interpreter.js"
import { LoopDriverState } from "../../core/durable/loop-driver-state.js"
import { ToolContext } from "../../core/tools/tool-context.js"
import type { Backend } from "../../runtime/artifact/export.js"

const toolSuffix = (name: string): string => Encoding.encodeBase64Url(name).replaceAll("=", "")

const storageError = <Cause>(artifact: string, operation: string, cause: Cause): ArtifactStorageError =>
  ArtifactStorageError.make({ artifact, operation, reason: String(cause) })

const normalizeError = <Error>(artifact: string, operation: string, error: Error): ArtifactError =>
  Schema.is(ArtifactError)(error) ? error : storageError(artifact, operation, error)

const mapStorageError = (artifact: string, operation: string) =>
  Effect.mapError(<Error>(error: Error) => normalizeError(artifact, operation, error))

interface DocumentServices {
  readonly backend: Backend
  readonly blobs: BlobStore["Service"]
  readonly registry: ArtifactRegistryService
}

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
  services: DocumentServices,
  artifact: string,
  checkpoint: ArtifactCheckpoint,
  runId: string | undefined,
): Effect.Effect<Position, ArtifactError> =>
  Effect.gen(function* () {
    if (runId === undefined) return { ...checkpoint } satisfies Position
    const forked = yield* services.backend
      .isFork(runId)
      .pipe(Effect.catchTag("generalist/runtime/RunNotFound", () => Effect.succeed(false)))
    return forked && checkpoint.branch !== runId
      ? ({ version: checkpoint.version, branch: runId, source: checkpoint } satisfies Position)
      : ({ ...checkpoint } satisfies Position)
  }).pipe(mapStorageError(artifact, "resolve Run artifact branch"))

const loadBytes = (services: DocumentServices, artifact: string, operation: string, head: ArtifactHead) =>
  Effect.gen(function* () {
    return (yield* services.blobs.get(head.snapshot.sha256)).data
  }).pipe(mapStorageError(artifact, operation))

const putBytes = (services: DocumentServices, artifact: string, bytes: Uint8Array) =>
  services.blobs
    .put({
      data: bytes,
      mediaType: "application/vnd.generalist.artifact-crdt",
      filename: `${artifact}.crdt`,
    })
    .pipe(mapStorageError(artifact, "store CRDT snapshot"))

const maxCommitConflicts = 8

const ensurePosition = (services: DocumentServices, artifact: string, crdt: CrdtService, position: Position) =>
  Effect.gen(function* () {
    if (position.source === undefined || position.branch === undefined) {
      return yield* services.backend.snapshot({
        artifact,
        version: position.version,
        ...(position.branch === undefined ? undefined : { branch: position.branch }),
      })
    }
    const source = yield* services.backend.snapshot({
      artifact,
      version: position.source.version,
      ...(position.source.branch === undefined ? undefined : { branch: position.source.branch }),
    })
    return yield* services.backend.fork({
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

const readHead = (services: DocumentServices, artifact: string, crdt: CrdtService, branch?: string) =>
  Effect.gen(function* () {
    const head = yield* services.backend.head({ artifact, ...(branch === undefined ? undefined : { branch }) })
    const content = yield* crdt.read(yield* loadBytes(services, artifact, "load current snapshot", head))
    return {
      artifact,
      version: head.version,
      content,
      ...(head.branch === undefined ? undefined : { branch: head.branch }),
    } satisfies ReadResult
  }).pipe(mapStorageError(artifact, "read artifact"))

const readForAgent = (services: DocumentServices, artifact: string, crdt: CrdtService) =>
  Effect.gen(function* () {
    const context = yield* ToolContext
    const checkpoint = yield* readCheckpoint(artifact)
    if (checkpoint === undefined) return yield* readHead(services, artifact, crdt)
    const position = yield* positionFor(services, artifact, checkpoint, context.runId)
    if (position.source === undefined) return yield* readHead(services, artifact, crdt, position.branch)
    const head = yield* ensurePosition(services, artifact, crdt, position)
    return yield* readHead(services, artifact, crdt, head.branch)
  })

const sameOperation = (left: RangeOperation, right: RangeOperation): boolean => {
  if (left._tag !== right._tag) return false
  switch (left._tag) {
    case "Insert":
      return right._tag === "Insert" && left.at === right.at && left.text === right.text
    case "Delete":
      return right._tag === "Delete" && left.from === right.from && left.to === right.to
    case "Replace":
      return right._tag === "Replace" && left.from === right.from && left.to === right.to && left.text === right.text
  }
}

const sameAttribution = (left: EditResult["attribution"], right: EditResult["attribution"]): boolean => {
  if (left._tag !== right._tag) return false
  return left._tag === "Agent"
    ? right._tag === "Agent" && left.actor === right.actor && left.runId === right.runId
    : right._tag === "Human" && left.actor === right.actor
}

interface CommitInput {
  readonly artifact: string
  readonly crdt: CrdtService
  readonly position: Position
  readonly commandId: string
  readonly operation: RangeOperation
  readonly attribution: EditResult["attribution"]
}

const receiptResult = (receipt: ArtifactAppendReceipt): EditResult => {
  const update = receipt.update
  return {
    artifact: update.artifact,
    base: update.base,
    result: update.result,
    attribution: update.attribution,
    ...(update.branch === undefined ? undefined : { branch: update.branch }),
  }
}

const matchesLogicalEdit = (input: CommitInput, receipt: ArtifactAppendReceipt): boolean => {
  const update = receipt.update
  return (
    receipt.commandId === input.commandId &&
    receipt.crdt === input.crdt.id &&
    update.artifact === input.artifact &&
    update.branch === input.position.branch &&
    update.base === input.position.version &&
    sameOperation(update.operation, input.operation) &&
    sameAttribution(update.attribution, input.attribution)
  )
}

const reconcileReceipt = (input: CommitInput, receipt: ArtifactAppendReceipt) =>
  matchesLogicalEdit(input, receipt)
    ? Effect.succeed(receiptResult(receipt))
    : Effect.fail(
        ArtifactStorageError.make({
          artifact: input.artifact,
          operation: "reconcile artifact edit",
          reason: "The command identity already committed with different logical input",
        }),
      )

const receiptLookupInput = (input: CommitInput) => ({
  artifact: input.artifact,
  commandId: input.commandId,
  ...(input.position.branch === undefined ? undefined : { branch: input.position.branch }),
})

const commit = (
  services: DocumentServices,
  input: CommitInput,
  conflicts = 0,
): Effect.Effect<EditResult, ArtifactError> =>
  Effect.suspend(() =>
    Effect.gen(function* () {
      const prior = yield* services.backend.receipt(receiptLookupInput(input))
      if (prior !== undefined) return yield* reconcileReceipt(input, prior)
      const baseHead = yield* ensurePosition(services, input.artifact, input.crdt, input.position)
      const current = yield* services.backend.head({
        artifact: input.artifact,
        ...(baseHead.branch === undefined ? undefined : { branch: baseHead.branch }),
      })
      const [baseBytes, currentBytes] = yield* Effect.all([
        loadBytes(services, input.artifact, "load edit base", baseHead),
        loadBytes(services, input.artifact, "load current snapshot", current),
      ])
      const edited = yield* input.crdt.edit({
        artifact: input.artifact,
        base: baseBytes,
        current: currentBytes,
        operation: input.operation,
      })
      const snapshot = yield* putBytes(services, input.artifact, edited.snapshot)
      const update = yield* services.backend.append({
        artifact: input.artifact,
        commandId: input.commandId,
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
        conflicts >= maxCommitConflicts ? error : commit(services, input, conflicts + 1),
      ),
      Effect.catchIf(Schema.is(DurabilityFailure), (error) =>
        error.reason === "input-conflict"
          ? Effect.gen(function* () {
              const prior = yield* services.backend.receipt(receiptLookupInput(input))
              if (prior === undefined) return yield* error
              return yield* reconcileReceipt(input, prior)
            })
          : Effect.fail(error),
      ),
      mapStorageError(input.artifact, "edit artifact"),
    ),
  )

const editForAgent = (
  services: DocumentServices,
  artifact: string,
  crdt: CrdtService,
  input: { base: Version; operation: RangeOperation },
) =>
  Effect.gen(function* () {
    const context = yield* ToolContext
    const commandId = context.operationKey
    if (commandId === undefined || commandId.length === 0) {
      return yield* ArtifactStorageError.make({
        artifact,
        operation: "resolve artifact edit identity",
        reason: "ToolContext.operationKey is required for managed Artifact edits",
      })
    }
    const checkpoint = yield* readCheckpoint(artifact)
    if (checkpoint === undefined || input.base !== checkpoint.version) {
      return yield* ArtifactBaseStale.make({
        artifact,
        base: input.base,
        ...(checkpoint === undefined ? undefined : { expected: checkpoint.version }),
      })
    }
    const position = yield* positionFor(services, artifact, checkpoint, context.runId)
    return yield* commit(services, {
      artifact,
      crdt,
      position,
      commandId,
      operation: input.operation,
      attribution: {
        _tag: "Agent",
        actor: context.agentName ?? "agent",
        runId: context.runId ?? context.sessionId,
      },
    })
  })

const editForHuman = (services: DocumentServices, artifact: string, crdt: CrdtService, input: HumanEdit) =>
  commit(services, {
    artifact,
    crdt,
    position: { version: input.base },
    commandId: input.commandId,
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

export const make = (options: {
  readonly name: string
  readonly crdt: CrdtService
  readonly services: DocumentServices
}) =>
  Effect.gen(function* () {
    const { name, crdt, services } = options
    const closed = yield* Deferred.make<void>()
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
      [rawReadTool.name]: () => readForAgent(services, name, crdt),
      [rawEditTool.name]: (edit: { base: Version; operation: RangeOperation }) =>
        editForAgent(services, name, crdt, edit),
    } as Toolkit.HandlersFrom<typeof toolkit.tools>
    /* oxlint-enable typescript/no-unsafe-type-assertion */
    const handlers = yield* toolkit.toHandlers(handlerDefinitions)
    const readTool = bindManagedArtifactTool(rawReadTool, handlers)
    const editTool = bindManagedArtifactTool(rawEditTool, handlers)
    const read = readHead(services, name, crdt)
    const registered: RegisteredArtifact = {
      name,
      read,
      edit: (edit) => editForHuman(services, name, crdt, edit),
      subscribe: (version = 0) =>
        Effect.succeed(
          Stream.interruptWhen(
            services.backend
              .updates({ artifact: name, version })
              .pipe(Stream.mapError((error) => normalizeError(name, "subscribe to artifact", error))),
            Deferred.await(closed),
          ),
        ),
      readTool,
      editTool,
    }
    yield* services.registry.register(registered)
    yield* Effect.addFinalizer(() =>
      Deferred.succeed(closed, undefined).pipe(Effect.andThen(services.registry.unregister(registered)), Effect.asVoid),
    )
    return { name, read, readTool, editTool } satisfies Document
  })
