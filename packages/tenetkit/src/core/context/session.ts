import { Context, Effect, Layer, Schema, type Scope } from "effect"
import { dual } from "effect/Function"
import { Prompt, Response, Tool } from "effect/unstable/ai"
import { CompactionCommit, Event as ModelTelemetryEvent } from "../model/telemetry/events.js"
/** @experimental Opaque session entry id. */
export type EntryId = string
/** @experimental Host-defined metadata carried by session entries. */
export type Metadata = Readonly<Record<string, typeof Schema.Unknown.Type>>
/** @experimental Common fields for session entries. */
export type BaseEntry = { readonly id: EntryId; readonly parentId: EntryId | null; readonly metadata?: Metadata }
/** @experimental A verbatim conversation message. */
export type MessageEntry = BaseEntry & { readonly _tag: "Message"; readonly message: Prompt.Message }
const ModelToolCall = Schema.Struct({
  type: Schema.Literal("tool-call"),
  id: Schema.String,
  name: Schema.String,
  params: Schema.Unknown,
  providerExecuted: Schema.Boolean,
  metadata: Response.ProviderMetadata,
})
const ModelUsage = Schema.Struct({
  inputTokens: Schema.Struct({
    uncached: Schema.optionalKey(Schema.UndefinedOr(Schema.Finite)),
    total: Schema.optionalKey(Schema.UndefinedOr(Schema.Finite)),
    cacheRead: Schema.optionalKey(Schema.UndefinedOr(Schema.Finite)),
    cacheWrite: Schema.optionalKey(Schema.UndefinedOr(Schema.Finite)),
  }),
  outputTokens: Schema.Struct({
    total: Schema.optionalKey(Schema.UndefinedOr(Schema.Finite)),
    text: Schema.optionalKey(Schema.UndefinedOr(Schema.Finite)),
    reasoning: Schema.optionalKey(Schema.UndefinedOr(Schema.Finite)),
  }),
})
const ModelFinishPart = Schema.Struct({
  ...Response.FinishPart.fields,
  usage: ModelUsage,
  response: Schema.optionalKey(Schema.UndefinedOr(Response.HttpResponseDetails)),
})
const ModelToolResult = Schema.Struct({
  type: Schema.Literal("tool-result"),
  id: Schema.String,
  name: Schema.String,
  isFailure: Schema.Boolean,
  result: Schema.Unknown,
  encodedResult: Schema.Unknown,
  providerExecuted: Schema.Boolean,
  preliminary: Schema.Boolean,
  metadata: Response.ProviderMetadata,
})
export const ModelResponseContent = Schema.Array(
  Schema.Union([
    Response.TextPart,
    Response.ReasoningPart,
    Response.ToolApprovalRequestPart,
    Response.FilePart,
    Response.DocumentSourcePart,
    Response.UrlSourcePart,
    Response.ResponseMetadataPart,
    ModelFinishPart,
    ModelToolCall,
    ModelToolResult,
  ]),
)
export type ModelResponseEntry = BaseEntry & {
  readonly _tag: "ModelResponse"
  readonly content: ReadonlyArray<Response.Part<Record<string, Tool.Any>>>
}
/** @experimental A model-requested tool call. */
export type ToolCallEntry = BaseEntry & { readonly _tag: "ToolCall"; readonly part: Prompt.ToolCallPart }
/** @experimental A tool execution result. */
export type ToolResultEntry = BaseEntry & { readonly _tag: "ToolResult"; readonly part: Prompt.ToolResultPart }
/** @experimental Recalled or persisted memory context. */
export type MemoryEntry = BaseEntry & { readonly _tag: "Memory"; readonly items: ReadonlyArray<string> }
/** @experimental An activated skill body. */
export type SkillEntry = BaseEntry & { readonly _tag: "Skill"; readonly name: string; readonly body: string }
/** @experimental Live steering input preserved as a prompt message. */
export type SteeringEntry = BaseEntry & { readonly _tag: "Steering"; readonly message: Prompt.Message }
/** @experimental A self-contained conversation projection imported by a durable handoff. */
export type HandoffEntry = BaseEntry & {
  readonly _tag: "Handoff"
  readonly handoffId: string
  readonly target: string
  readonly projectedHistory: Prompt.Prompt
}
/** @experimental An exact point-in-time compaction projection. */
export type CompactionEntry = BaseEntry & {
  readonly _tag: "Compaction"
  readonly projectedHistory: Prompt.Prompt
  readonly telemetry: ReadonlyArray<ModelTelemetryEvent>
  readonly compactionCommit?: CompactionCommit
  readonly summary?: string
}
/** @experimental A summary of an abandoned branch. */
export type BranchSummaryEntry = BaseEntry & { readonly _tag: "BranchSummary"; readonly summary: string }
/** @experimental Closed union of session entries. */
export type Entry =
  | MessageEntry
  | ModelResponseEntry
  | ToolCallEntry
  | ToolResultEntry
  | MemoryEntry
  | SkillEntry
  | SteeringEntry
  | HandoffEntry
  | CompactionEntry
  | BranchSummaryEntry
type AppendEntryInput<Item extends Entry> = Item extends CompactionEntry ? never : Omit<Item, "id" | "parentId">
/** @experimental Session entry input appended by a store implementation. */
export type AppendInput = AppendEntryInput<Entry>
const payloadMetadata = {
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
}
/**
 * @experimental Durable wire form of a Session entry.
 *
 * Session is the authority for model-facing history, so a store that persists entries needs one
 * shared encoding rather than each backend inventing its own. Entry ids and parent links are stored
 * as columns by the owning store; only the tag-specific payload is encoded here.
 */
export const EntryPayload = Schema.Union([
  Schema.TaggedStruct("Message", { message: Prompt.Message, ...payloadMetadata }),
  Schema.TaggedStruct("ModelResponse", { content: ModelResponseContent, ...payloadMetadata }),
  Schema.TaggedStruct("ToolCall", { part: Prompt.ToolCallPart, ...payloadMetadata }),
  Schema.TaggedStruct("ToolResult", { part: Prompt.ToolResultPart, ...payloadMetadata }),
  Schema.TaggedStruct("Memory", { items: Schema.Array(Schema.String), ...payloadMetadata }),
  Schema.TaggedStruct("Skill", { name: Schema.String, body: Schema.String, ...payloadMetadata }),
  Schema.TaggedStruct("Steering", { message: Prompt.Message, ...payloadMetadata }),
  Schema.TaggedStruct("Handoff", {
    handoffId: Schema.String,
    target: Schema.String,
    projectedHistory: Prompt.Prompt,
    ...payloadMetadata,
  }),
  Schema.TaggedStruct("Compaction", {
    projectedHistory: Prompt.Prompt,
    telemetry: Schema.Array(ModelTelemetryEvent),
    compactionCommit: Schema.optionalKey(CompactionCommit),
    summary: Schema.optionalKey(Schema.String),
    ...payloadMetadata,
  }),
  Schema.TaggedStruct("BranchSummary", { summary: Schema.String, ...payloadMetadata }),
])
/** @experimental */
export type EntryPayload = typeof EntryPayload.Type
/** @experimental Session store operation failure. */
export class SessionStoreError extends Schema.TaggedError<SessionStoreError>()("tenetkit/core/SessionStoreError", {
  message: Schema.String,
}) {}
/** @experimental Session append conflict with the active path or entry identity. */
export class SessionConflict extends Schema.TaggedError<SessionConflict>()("tenetkit/core/SessionConflict", {
  reason: Schema.Literals(["stale-leaf", "entry-id-reused", "checkpoint-id-reused", "checkpoint-not-on-active-path"]),
  message: Schema.String,
}) {}
/** @experimental Expected active leaf for a store-assigned Session entry identity. */
export type GeneratedAppendOptions = {
  readonly id?: never
  readonly expectedLeafId?: EntryId | null
}
/** @experimental Exact identity and parent for an idempotent normal Session append. */
export type StableAppendOptions = { readonly id: EntryId; readonly expectedLeafId: EntryId | null }
/** @experimental Identity and expected active leaf for a normal Session append. */
export type AppendOptions = GeneratedAppendOptions | StableAppendOptions
/** @experimental Exact idempotent projection. Atomically persist projection, telemetry, and commit; remote failure is ambiguous. */
export interface PreparedCheckpoint {
  readonly id: EntryId
  readonly parentId: EntryId | null
  readonly projectedHistory: Prompt.Prompt
  readonly telemetry: ReadonlyArray<ModelTelemetryEvent>
  readonly compactionCommit?: CompactionCommit
  readonly summary?: string
}
/** @experimental Authoritative result of an idempotent checkpoint append. */
export interface CheckpointAppend {
  readonly _tag: "Appended" | "AlreadyPresent"
  readonly checkpoint: CompactionEntry
  readonly leafId: EntryId
}
/** @experimental Session event-log service boundary. */
export interface Interface {
  readonly reserveEntryId: Effect.Effect<EntryId, SessionStoreError>
  readonly append: (
    entry: AppendInput,
    options?: AppendOptions,
  ) => Effect.Effect<Entry, SessionStoreError | SessionConflict>
  /** @experimental Atomically persists projection, telemetry, and commit. Remote failure is ambiguous; retry exactly. */
  readonly appendCheckpoint: (
    checkpoint: PreparedCheckpoint,
  ) => Effect.Effect<CheckpointAppend, SessionStoreError | SessionConflict>
  readonly path: (leaf?: EntryId) => Effect.Effect<ReadonlyArray<Entry>, SessionStoreError>
  readonly setLeaf: (id: EntryId | null) => Effect.Effect<void, SessionStoreError>
  readonly leaf: Effect.Effect<EntryId | null>
}
/** @experimental Keyed Session storage and same-Session Run admission. */
export interface DirectoryInterface {
  readonly acquire: (sessionId: string) => Effect.Effect<Interface, SessionStoreError, Scope.Scope>
}
/** @experimental */
export class SessionDirectory extends Context.Service<SessionDirectory, DirectoryInterface>()(
  "tenetkit/core/context/session/SessionDirectory",
) {}

/** @experimental Acquire one exact Session store for the current Scope. */
export const acquire = (
  sessionId: string,
): Effect.Effect<Interface, SessionStoreError, SessionDirectory | Scope.Scope> =>
  SessionDirectory.pipe(Effect.flatMap((directory) => directory.acquire(sessionId)))

const promptEquivalence = Schema.toEquivalence(Prompt.Prompt)
const telemetryEquivalence = Schema.toEquivalence(Schema.Array(ModelTelemetryEvent))
const commitEquivalence = Schema.toEquivalence(CompactionCommit)

/** @experimental Canonical exact checkpoint equivalence. */
export const checkpointMatches: {
  (prepared: PreparedCheckpoint): (entry: CompactionEntry) => boolean
  (entry: CompactionEntry, prepared: PreparedCheckpoint): boolean
} = dual(
  2,
  (entry: CompactionEntry, prepared: PreparedCheckpoint): boolean =>
    entry.id === prepared.id &&
    entry.parentId === prepared.parentId &&
    entry.summary === prepared.summary &&
    promptEquivalence(entry.projectedHistory, prepared.projectedHistory) &&
    telemetryEquivalence(entry.telemetry, prepared.telemetry) &&
    (entry.compactionCommit === undefined
      ? prepared.compactionCommit === undefined
      : prepared.compactionCommit !== undefined &&
        commitEquivalence(entry.compactionCommit, prepared.compactionCommit)),
)

export {
  ContextInvalid,
  buildContext,
  buildMemoryContext,
  unresolvedToolCalls,
  validateContext,
} from "./session-projection.js"

/** @experimental */
export const layerTest = (implementation: DirectoryInterface): Layer.Layer<SessionDirectory> =>
  Layer.succeed(SessionDirectory, SessionDirectory.of(implementation))
