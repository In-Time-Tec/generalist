import { Context, Effect, Option, Schema, Stream } from "effect"
import type { Tool } from "effect/unstable/ai"
import { ActionableTaggedError, errorHint } from "./error-hint.js"
import { Ref as MediaRef } from "../media/ref.js"

/** Monotonic operation position within one artifact branch. @experimental */
export const Version = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
/** Monotonic operation position within one artifact branch. @experimental */
export type Version = typeof Version.Type

/** One text operation whose coordinates refer to the declared base version. @experimental */
export const RangeOperation = Schema.Union([
  Schema.TaggedStruct("Insert", {
    at: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    text: Schema.String,
  }),
  Schema.TaggedStruct("Delete", {
    from: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    to: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  Schema.TaggedStruct("Replace", {
    from: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    to: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    text: Schema.String,
  }),
])
/** One text operation whose coordinates refer to the declared base version. @experimental */
export type RangeOperation = typeof RangeOperation.Type

/** Identity recorded for an Agent-authored artifact operation. @experimental */
export const AgentAttribution = Schema.TaggedStruct("Agent", {
  actor: Schema.String.check(Schema.isNonEmpty()),
  runId: Schema.String.check(Schema.isNonEmpty()),
})
/** Identity recorded for a human-authored artifact operation. @experimental */
export const HumanAttribution = Schema.TaggedStruct("Human", {
  actor: Schema.String.check(Schema.isNonEmpty()),
})
/** Authorship retained with every shared artifact operation. @experimental */
export const Attribution = Schema.Union([AgentAttribution, HumanAttribution])
/** Authorship retained with every shared artifact operation. @experimental */
export type Attribution = typeof Attribution.Type
export type AgentAttribution = typeof AgentAttribution.Type
export type HumanAttribution = typeof HumanAttribution.Type

/** Model-visible artifact contents and the exact version read. @experimental */
export const ReadResult = Schema.Struct({
  artifact: Schema.String,
  version: Version,
  content: Schema.String,
  branch: Schema.optionalKey(Schema.String),
})
/** Model-visible artifact contents and the exact version read. @experimental */
export type ReadResult = typeof ReadResult.Type

/** Journaled result of one attributed artifact edit. @experimental */
export const EditResult = Schema.Struct({
  artifact: Schema.String,
  base: Version,
  result: Version,
  attribution: Attribution,
  branch: Schema.optionalKey(Schema.String),
})
/** Journaled result of one attributed artifact edit. @experimental */
export type EditResult = typeof EditResult.Type

/** Full operation-log entry delivered to CRDT peers. @experimental */
export const ArtifactUpdate = Schema.Struct({
  artifact: Schema.String,
  base: Version,
  result: Version,
  operation: RangeOperation,
  attribution: Attribution,
  update: Schema.Uint8ArrayFromBase64,
  snapshot: MediaRef,
  branch: Schema.optionalKey(Schema.String),
})
/** Full operation-log entry delivered to CRDT peers. @experimental */
export type ArtifactUpdate = typeof ArtifactUpdate.Type

/** CRDT snapshot at one branch version. @internal */
export const ArtifactHead = Schema.Struct({
  artifact: Schema.String,
  crdt: Schema.String,
  version: Version,
  snapshot: MediaRef,
  branch: Schema.optionalKey(Schema.String),
})
export type ArtifactHead = typeof ArtifactHead.Type

/** Source snapshot used when the first operation creates a fork branch. @internal */
export interface ArtifactBranchSource {
  readonly version: Version
  readonly snapshot: MediaRef
  readonly branch?: string
}

/** Compare-and-append request owned by a Runtime storage driver. @internal */
export interface ArtifactAppend {
  readonly artifact: string
  readonly crdt: string
  readonly expected: Version
  readonly base: Version
  readonly operation: RangeOperation
  readonly attribution: Attribution
  readonly update: Uint8Array
  readonly snapshot: MediaRef
  readonly branch?: string
  readonly source?: ArtifactBranchSource
}

/** Lazily create one Run-owned branch from the artifact position copied by fork. @internal */
export interface ArtifactFork {
  readonly artifact: string
  readonly crdt: string
  readonly branch: string
  readonly source: ArtifactBranchSource
}

/** One Run's last observed artifact position, copied by Runtime fork. @internal */
export const ArtifactCheckpoint = Schema.Struct({
  version: Version,
  branch: Schema.optionalKey(Schema.String),
})
export type ArtifactCheckpoint = typeof ArtifactCheckpoint.Type
export const ArtifactCheckpoints = Schema.Record(Schema.String, ArtifactCheckpoint)

/** Journal field proving the exact artifact version a model read. @internal */
export const ArtifactReadJournal = Schema.Struct({ artifact: Schema.String, ...ArtifactCheckpoint.fields })
export type ArtifactReadJournal = typeof ArtifactReadJournal.Type

/** @internal Stable prefixes used to recognize framework-managed Artifact tools in the journal. */
export const artifactReadToolPrefix = "artifact_read_"
export const artifactEditToolPrefix = "artifact_edit_"

/** @internal Extract Artifact checkpoint and Host fields from one successful managed tool result. */
export interface ArtifactEventFields {
  readonly artifactRead?: ArtifactReadJournal
  readonly artifactUpdated?: EditResult
}

export const artifactEventFields = (input: {
  readonly name: string
  readonly isFailure: boolean
  readonly result: unknown
}): ArtifactEventFields => {
  if (input.isFailure) return {}
  if (input.name.startsWith(artifactReadToolPrefix)) {
    const decoded = Schema.decodeUnknownOption(ReadResult)(input.result)
    return Option.isSome(decoded)
      ? {
          artifactRead: {
            artifact: decoded.value.artifact,
            version: decoded.value.version,
            ...(decoded.value.branch === undefined ? undefined : { branch: decoded.value.branch }),
          },
        }
      : {}
  }
  if (!input.name.startsWith(artifactEditToolPrefix)) return {}
  const decoded = Schema.decodeUnknownOption(EditResult)(input.result)
  return Option.isSome(decoded) ? { artifactUpdated: decoded.value } : {}
}

/** A requested artifact is not registered in this process or runtime store. */
export class ArtifactNotFound extends ActionableTaggedError<ArtifactNotFound>()(
  "generalist/artifact/ArtifactNotFound",
  {
    artifact: Schema.String,
    hint: errorHint("Open the artifact before reading, editing, or subscribing to it."),
  },
) {}

/** A requested historical version does not exist on the selected artifact branch. */
export class ArtifactVersionNotFound extends ActionableTaggedError<ArtifactVersionNotFound>()(
  "generalist/artifact/ArtifactVersionNotFound",
  {
    artifact: Schema.String,
    version: Version,
    branch: Schema.optionalKey(Schema.String),
    hint: errorHint("Read the artifact again and use a version returned by that branch."),
  },
) {}

/** The artifact head changed before an operation-log append committed. */
export class ArtifactVersionConflict extends ActionableTaggedError<ArtifactVersionConflict>()(
  "generalist/artifact/ArtifactVersionConflict",
  {
    artifact: Schema.String,
    expected: Version,
    actual: Version,
    branch: Schema.optionalKey(Schema.String),
    hint: errorHint("Reload the current head, merge the same base operation, and retry the append."),
  },
) {}

/** A model edit did not use the version recorded by its last artifact read. */
export class ArtifactBaseStale extends ActionableTaggedError<ArtifactBaseStale>()(
  "generalist/artifact/ArtifactBaseStale",
  {
    artifact: Schema.String,
    base: Version,
    expected: Schema.optionalKey(Version),
    hint: errorHint("Call the artifact read tool, then edit using exactly the returned version as base."),
  },
) {}

/** A range is outside the text at the operation's declared base version. */
export class ArtifactRangeInvalid extends ActionableTaggedError<ArtifactRangeInvalid>()(
  "generalist/artifact/ArtifactRangeInvalid",
  {
    artifact: Schema.String,
    length: Schema.Int,
    from: Schema.Int,
    to: Schema.Int,
    hint: errorHint("Read the artifact again and use a range within the returned content."),
  },
) {}

/** One artifact name was opened with two incompatible CRDT implementations. */
export class ArtifactCrdtMismatch extends ActionableTaggedError<ArtifactCrdtMismatch>()(
  "generalist/artifact/ArtifactCrdtMismatch",
  {
    artifact: Schema.String,
    expected: Schema.String,
    actual: Schema.String,
    hint: errorHint("Open every peer for this artifact with the same CRDT implementation."),
  },
) {}

/** An artifact name was registered twice in one process. */
export class ArtifactAlreadyOpen extends ActionableTaggedError<ArtifactAlreadyOpen>()(
  "generalist/artifact/ArtifactAlreadyOpen",
  {
    artifact: Schema.String,
    hint: errorHint("Reuse the existing Document value instead of opening the same artifact twice."),
  },
) {}

/** Artifact persistence or CRDT processing failed. */
export class ArtifactStorageError extends ActionableTaggedError<ArtifactStorageError>()(
  "generalist/artifact/ArtifactStorageError",
  {
    artifact: Schema.String,
    operation: Schema.String,
    reason: Schema.String,
    hint: errorHint("Check the runtime store and BlobStore, then retry only if the operation did not commit."),
  },
) {}

/** A bounded artifact subscriber could not keep up with committed updates. */
export class ArtifactSubscriberLagged extends ActionableTaggedError<ArtifactSubscriberLagged>()(
  "generalist/artifact/ArtifactSubscriberLagged",
  {
    artifact: Schema.String,
    lastDeliveredVersion: Version,
    branch: Schema.optionalKey(Schema.String),
    hint: errorHint("Reconnect with the last delivered version to replay the missing operations."),
  },
) {}

/** Failures exposed by shared artifact operations. @experimental */
export const ArtifactError = Schema.Union([
  ArtifactNotFound,
  ArtifactVersionNotFound,
  ArtifactVersionConflict,
  ArtifactBaseStale,
  ArtifactRangeInvalid,
  ArtifactCrdtMismatch,
  ArtifactAlreadyOpen,
  ArtifactStorageError,
  ArtifactSubscriberLagged,
])
/** Failures exposed by shared artifact operations. @experimental */
export type ArtifactError = typeof ArtifactError.Type

/** CRDT-independent result of applying one exact-base range operation. @internal */
export interface CrdtEdit {
  readonly snapshot: Uint8Array
  readonly update: Uint8Array
  readonly content: string
}

/** Text CRDT boundary implemented first by the optional Yjs peer. @experimental */
export interface CrdtService {
  readonly id: string
  readonly empty: (initial: string) => Effect.Effect<Uint8Array, ArtifactStorageError>
  readonly read: (snapshot: Uint8Array) => Effect.Effect<string, ArtifactStorageError>
  readonly edit: (input: {
    readonly artifact: string
    readonly base: Uint8Array
    readonly current: Uint8Array
    readonly operation: RangeOperation
  }) => Effect.Effect<CrdtEdit, ArtifactRangeInvalid | ArtifactStorageError>
  readonly apply: (snapshot: Uint8Array, update: Uint8Array) => Effect.Effect<Uint8Array, ArtifactStorageError>
}

/** CRDT implementation selected by `Artifact.open`. @experimental */
export class ArtifactCrdt extends Context.Service<ArtifactCrdt, CrdtService>()(
  "generalist/core/artifact/ArtifactCrdt",
) {}

/** Human edit accepted by Host and Server. @experimental */
export interface HumanEdit {
  readonly base: Version
  readonly operation: RangeOperation
  readonly attribution: HumanAttribution
}

/** Host-facing behavior retained for every open artifact. @internal */
export interface RegisteredArtifact {
  readonly name: string
  readonly read: Effect.Effect<ReadResult, ArtifactError>
  readonly edit: (input: HumanEdit) => Effect.Effect<EditResult, ArtifactError>
  readonly subscribe: (version?: Version) => Effect.Effect<Stream.Stream<ArtifactUpdate, ArtifactError>, ArtifactError>
  readonly readTool: Tool.Any
  readonly editTool: Tool.Any
}

export interface ArtifactRegistryService {
  readonly register: (artifact: RegisteredArtifact) => Effect.Effect<void, ArtifactAlreadyOpen>
  readonly get: (name: string) => Effect.Effect<RegisteredArtifact, ArtifactNotFound>
}

/** Process-scoped registry joining opened artifacts to Agent and Host surfaces. @internal */
export class ArtifactRegistry extends Context.Service<ArtifactRegistry, ArtifactRegistryService>()(
  "generalist/core/artifact/ArtifactRegistry",
) {}

/** @internal Marker for tool handlers supplied dynamically by ArtifactRegistry. */
export const ManagedArtifactToolTypeId = "generalist/artifact/ManagedArtifactTool" as const
/** @internal */
export interface ManagedArtifactTool {
  readonly [ManagedArtifactToolTypeId]: typeof ManagedArtifactToolTypeId
  readonly handlers: Context.Context<never>
}

/** @internal Resolve an open artifact's self-contained handler Context. */
export const managedToolHandlers = (tool: Tool.Any): Context.Context<never> | undefined =>
  ManagedArtifactToolTypeId in tool && "handlers" in tool && Context.isContext(tool.handlers)
    ? tool.handlers
    : undefined
