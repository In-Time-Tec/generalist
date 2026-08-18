import { Context, Effect, HashMap, Layer, Option, Ref, Schema } from "effect"
import { dual } from "effect/Function"
import { Prompt, Response, Tool } from "effect/unstable/ai"
import { CompactionCommit, Event as ModelTelemetryEvent } from "../model/model-telemetry.js"
/** @experimental Opaque session entry id. */
export type EntryId = string
/** @experimental Host-defined metadata carried by session entries. */
export type Metadata = Readonly<Record<string, unknown>>
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
export class SessionStoreError extends Schema.TaggedErrorClass<SessionStoreError>()("tenetkit/core/SessionStoreError", {
  message: Schema.String,
}) {}
/** @experimental Session append conflict with the active path or entry identity. */
export class SessionConflict extends Schema.TaggedErrorClass<SessionConflict>()("tenetkit/core/SessionConflict", {
  reason: Schema.Literals([
    "stale-leaf",
    "entry-id-reused",
    "checkpoint-id-reused",
    "checkpoint-not-on-active-path",
    "fenced",
  ]),
  message: Schema.String,
}) {}
type AppendOptionsBase = { readonly ownerToken?: string }
/** @experimental Expected active leaf for a store-assigned Session entry identity. */
export type GeneratedAppendOptions = AppendOptionsBase & {
  readonly id?: never
  readonly expectedLeafId?: EntryId | null
}
/** @experimental Exact identity and parent for an idempotent normal Session append. */
export type StableAppendOptions = AppendOptionsBase & { readonly id: EntryId; readonly expectedLeafId: EntryId | null }
/** @experimental Identity, expected active leaf, and host write-ownership token for a normal Session append. */
export type AppendOptions = GeneratedAppendOptions | StableAppendOptions
/** @experimental Exact idempotent projection. Atomically persist projection, telemetry, and commit; remote failure is ambiguous. */
export interface PreparedCheckpoint {
  readonly id: EntryId
  readonly parentId: EntryId | null
  readonly projectedHistory: Prompt.Prompt
  readonly telemetry: ReadonlyArray<ModelTelemetryEvent>
  readonly compactionCommit?: CompactionCommit
  readonly summary?: string
  readonly ownerToken?: string
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
/** @experimental */
export class SessionStore extends Context.Service<SessionStore, Interface>()(
  "tenetkit/core/context/session/SessionStore",
) {}
interface State {
  readonly entries: HashMap.HashMap<EntryId, Entry>
  readonly order: ReadonlyArray<EntryId>
  readonly leaf: EntryId | null
  readonly counter: number
}
type Success<A> = { readonly _tag: "Success"; readonly value: A }
type Failure = { readonly _tag: "Failure"; readonly error: SessionStoreError }
type Result<A> = Success<A> | Failure
const initialState: State = {
  entries: HashMap.empty(),
  order: [],
  leaf: null,
  counter: 0,
}

const success = <A>(value: A): Result<A> => ({ _tag: "Success", value })

const failure = (message: string): Result<never> => ({
  _tag: "Failure",
  error: SessionStoreError.make({ message }),
})

const effectFromResult = <A>(result: Result<A>): Effect.Effect<A, SessionStoreError> =>
  result._tag === "Failure" ? Effect.fail(result.error) : Effect.succeed(result.value)

const effectFromAppendResult = (
  result: Result<Entry> | SessionConflict,
): Effect.Effect<Entry, SessionStoreError | SessionConflict> =>
  result._tag === "tenetkit/core/SessionConflict" ? Effect.fail(result) : effectFromResult(result)

const entryFromInput = (input: AppendInput, id: EntryId, parentId: EntryId | null): Entry => {
  const base = {
    id,
    parentId,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  }

  switch (input._tag) {
    case "Message":
      return { ...base, _tag: "Message", message: input.message }
    case "ModelResponse":
      return { ...base, _tag: "ModelResponse", content: input.content }
    case "ToolCall":
      return { ...base, _tag: "ToolCall", part: input.part }
    case "ToolResult":
      return { ...base, _tag: "ToolResult", part: input.part }
    case "Memory":
      return { ...base, _tag: "Memory", items: input.items }
    case "Skill":
      return { ...base, _tag: "Skill", name: input.name, body: input.body }
    case "Steering":
      return { ...base, _tag: "Steering", message: input.message }
    case "Handoff":
      return {
        ...base,
        _tag: "Handoff",
        handoffId: input.handoffId,
        target: input.target,
        projectedHistory: input.projectedHistory,
      }
    case "BranchSummary":
      return { ...base, _tag: "BranchSummary", summary: input.summary }
  }
}

const pathFromState = (state: State, leaf: EntryId): Result<ReadonlyArray<Entry>> => {
  const entries: Array<Entry> = []
  let cursor: EntryId | null = leaf

  while (cursor !== null) {
    if (entries.length > state.order.length) return failure(`Session path for leaf ${leaf} contains a cycle`)
    const entry: Option.Option<Entry> = HashMap.get(state.entries, cursor)
    if (Option.isNone(entry)) return failure(`Session entry ${cursor} does not exist`)
    const value: Entry = entry.value
    entries.push(value)
    cursor = value.parentId
  }

  return success(entries.toReversed())
}

const entryPayloadEquivalence = Schema.toEquivalence(EntryPayload)

/** @experimental Canonical exact normal-entry equivalence, excluding the write-owner token. */
const appendMatches = (entry: Entry, input: AppendInput, parentId: EntryId | null): boolean =>
  entry.parentId === parentId &&
  entryPayloadEquivalence(entry as EntryPayload, entryFromInput(input, entry.id, parentId) as EntryPayload)

const appendState = (
  state: State,
  input: AppendInput,
  options?: AppendOptions,
): readonly [Result<Entry> | SessionConflict, State] => {
  if (options?.id !== undefined) {
    const existing = HashMap.get(state.entries, options.id)
    if (Option.isSome(existing)) {
      if (!appendMatches(existing.value, input, options.expectedLeafId)) {
        return [
          SessionConflict.make({
            reason: "entry-id-reused",
            message: `Session entry id ${options.id} was reused with different parent or content`,
          }),
          state,
        ]
      }
      const activePath = state.leaf === null ? success<ReadonlyArray<Entry>>([]) : pathFromState(state, state.leaf)
      if (activePath._tag === "Failure" || !activePath.value.some((active) => active.id === options.id)) {
        return [
          SessionConflict.make({
            reason: "stale-leaf",
            message: `Session entry id ${options.id} is not on the active path from ${String(state.leaf)}`,
          }),
          state,
        ]
      }
      return [success(existing.value), state]
    }
  }
  if (options?.expectedLeafId !== undefined && options.expectedLeafId !== state.leaf) {
    return [
      SessionConflict.make({
        reason: "stale-leaf",
        message: `Expected Session leaf ${String(options.expectedLeafId)} but found ${String(state.leaf)}`,
      }),
      state,
    ]
  }
  let generatedCounter = state.counter
  if (options?.id === undefined) {
    while (Option.isSome(HashMap.get(state.entries, String(generatedCounter)))) generatedCounter += 1
  }
  const id = options?.id ?? String(generatedCounter)
  const entry = entryFromInput(input, id, state.leaf)
  return [
    success(entry),
    {
      entries: HashMap.set(state.entries, id, entry),
      order: [...state.order, id],
      leaf: id,
      counter: options?.id === undefined ? generatedCounter + 1 : state.counter + 1,
    },
  ]
}

const promptEquivalence = Schema.toEquivalence(Prompt.Prompt)
const telemetryEquivalence = Schema.toEquivalence(Schema.Array(ModelTelemetryEvent))
const commitEquivalence = Schema.toEquivalence(CompactionCommit)

/** @experimental Canonical exact checkpoint equivalence, excluding the write-owner token. */
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

const appendCheckpointState = (
  state: State,
  prepared: PreparedCheckpoint,
): readonly [CheckpointAppend | SessionConflict, State] => {
  if (prepared.compactionCommit !== undefined && prepared.compactionCommit.checkpointId !== prepared.id) {
    return [
      SessionConflict.make({
        reason: "checkpoint-id-reused",
        message: `Compaction commit checkpoint id ${prepared.compactionCommit.checkpointId} does not match ${prepared.id}`,
      }),
      state,
    ]
  }
  const existing = HashMap.get(state.entries, prepared.id)
  if (Option.isSome(existing)) {
    const entry = existing.value
    if (entry._tag !== "Compaction" || !checkpointMatches(entry, prepared)) {
      return [
        SessionConflict.make({
          reason: "checkpoint-id-reused",
          message: `Session checkpoint id ${prepared.id} was reused with different content`,
        }),
        state,
      ]
    }
    const activePath = state.leaf === null ? success<ReadonlyArray<Entry>>([]) : pathFromState(state, state.leaf)
    if (activePath._tag === "Failure") {
      return [
        SessionConflict.make({ reason: "checkpoint-not-on-active-path", message: activePath.error.message }),
        state,
      ]
    }
    if (!activePath.value.some((active) => active.id === entry.id)) {
      return [
        SessionConflict.make({
          reason: "checkpoint-not-on-active-path",
          message: `Session checkpoint id ${prepared.id} is not on the active path`,
        }),
        state,
      ]
    }
    return [{ _tag: "AlreadyPresent", checkpoint: entry, leafId: state.leaf ?? entry.id }, state]
  }
  if (state.leaf !== prepared.parentId) {
    return [
      SessionConflict.make({
        reason: "stale-leaf",
        message: `Expected Session leaf ${String(prepared.parentId)} but found ${String(state.leaf)}`,
      }),
      state,
    ]
  }
  const checkpoint: CompactionEntry = {
    _tag: "Compaction",
    id: prepared.id,
    parentId: prepared.parentId,
    projectedHistory: prepared.projectedHistory,
    telemetry: prepared.telemetry,
    ...(prepared.compactionCommit === undefined ? {} : { compactionCommit: prepared.compactionCommit }),
    ...(prepared.summary === undefined ? {} : { summary: prepared.summary }),
  }
  return [
    { _tag: "Appended", checkpoint, leafId: checkpoint.id },
    {
      ...state,
      entries: HashMap.set(state.entries, checkpoint.id, checkpoint),
      order: [...state.order, checkpoint.id],
      leaf: checkpoint.id,
    },
  ]
}

const setLeafState = (state: State, id: EntryId | null): readonly [Result<void>, State] => {
  if (id !== null && Option.isNone(HashMap.get(state.entries, id)))
    return [failure(`Session entry ${id} does not exist`), state]
  return [success(undefined), { ...state, leaf: id }]
}

export {
  ContextInvalid,
  buildContext,
  buildMemoryContext,
  unresolvedToolCalls,
  validateContext,
} from "./session-projection.js"

/** @experimental Ref-backed non-durable session store. */
export const layerMemory: Layer.Layer<SessionStore> = Layer.effect(
  SessionStore,
  Ref.make(initialState).pipe(
    Effect.map((state) =>
      SessionStore.of({
        reserveEntryId: Ref.modify(state, (current) => {
          let counter = current.counter
          while (Option.isSome(HashMap.get(current.entries, String(counter)))) counter += 1
          return [String(counter), { ...current, counter: counter + 1 }]
        }),
        append: (entry, options) =>
          Ref.modify(state, (current) => appendState(current, entry, options)).pipe(
            Effect.flatMap(effectFromAppendResult),
          ),
        appendCheckpoint: (checkpoint) =>
          Ref.modify(state, (current) => appendCheckpointState(current, checkpoint)).pipe(
            Effect.flatMap((result) =>
              result._tag === "tenetkit/core/SessionConflict" ? Effect.fail(result) : Effect.succeed(result),
            ),
          ),
        path: (leaf) =>
          Ref.get(state).pipe(
            Effect.flatMap((current) =>
              leaf === undefined && current.leaf === null
                ? Effect.succeed([])
                : effectFromResult(pathFromState(current, leaf ?? current.leaf ?? "")),
            ),
          ),
        setLeaf: (id) =>
          Ref.modify(state, (current) => setLeafState(current, id)).pipe(Effect.flatMap(effectFromResult)),
        leaf: Ref.get(state).pipe(Effect.map((current) => current.leaf)),
      }),
    ),
  ),
)

/** @experimental */
export const layerTest = (implementation: Interface): Layer.Layer<SessionStore> =>
  Layer.succeed(SessionStore, SessionStore.of(implementation))
