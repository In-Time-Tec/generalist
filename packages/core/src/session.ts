import { Context, Effect, HashMap, Layer, Option, Ref, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
/** @experimental Opaque session entry id. */
export type EntryId = string

/** @experimental Host-defined metadata carried by session entries. */
export type Metadata = Readonly<Record<string, unknown>>

/** @experimental Common fields for session entries. */
export interface BaseEntry {
  readonly id: EntryId
  readonly parentId: EntryId | null
  readonly metadata?: Metadata
}

/** @experimental A verbatim conversation message. */
export interface MessageEntry extends BaseEntry {
  readonly _tag: "Message"
  readonly message: Prompt.Message
}

/** @experimental A compaction boundary for prompt projection. */
export interface CompactionEntry extends BaseEntry {
  readonly _tag: "Compaction"
  readonly summary: string
  readonly firstKeptEntryId: EntryId
}

/** @experimental A summary of an abandoned branch. */
export interface BranchSummaryEntry extends BaseEntry {
  readonly _tag: "BranchSummary"
  readonly summary: string
}

/** @experimental Closed union of session entries. */
export type Entry = MessageEntry | CompactionEntry | BranchSummaryEntry

/** @experimental Session entry input appended by a store implementation. */
export type AppendInput = Entry extends infer Item
  ? Item extends Entry
    ? Omit<Item, "id" | "parentId">
    : never
  : never

/** @experimental Session store operation failure. */
export class SessionStoreError extends Schema.TaggedErrorClass<SessionStoreError>()("@batonfx/core/SessionStoreError", {
  message: Schema.String,
}) {}

/** @experimental Session event-log service boundary. */
export interface Interface {
  readonly append: (entry: AppendInput) => Effect.Effect<Entry, SessionStoreError>
  readonly path: (leaf?: EntryId) => Effect.Effect<ReadonlyArray<Entry>, SessionStoreError>
  readonly setLeaf: (id: EntryId | null) => Effect.Effect<void, SessionStoreError>
  readonly leaf: Effect.Effect<EntryId | null>
}

/** @experimental */
export class SessionStore extends Context.Service<SessionStore, Interface>()("@batonfx/core/SessionStore") {}

interface State {
  readonly entries: HashMap.HashMap<EntryId, Entry>
  readonly order: ReadonlyArray<EntryId>
  readonly leaf: EntryId | null
  readonly counter: number
}

interface Success<A> {
  readonly _tag: "Success"
  readonly value: A
}

interface Failure {
  readonly _tag: "Failure"
  readonly error: SessionStoreError
}

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
  error: new SessionStoreError({ message }),
})

const effectFromResult = <A>(result: Result<A>): Effect.Effect<A, SessionStoreError> =>
  result._tag === "Failure" ? Effect.fail(result.error) : Effect.succeed(result.value)

const entryFromInput = (input: AppendInput, id: EntryId, parentId: EntryId | null): Entry => {
  const base = {
    id,
    parentId,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  }

  switch (input._tag) {
    case "Message":
      return { ...base, _tag: "Message", message: input.message }
    case "Compaction":
      return { ...base, _tag: "Compaction", summary: input.summary, firstKeptEntryId: input.firstKeptEntryId }
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

const validateCompaction = (state: State, input: AppendInput): Result<void> => {
  if (input._tag !== "Compaction") return success(undefined)
  if (state.leaf === null) return failure(`Session compaction keeps missing entry ${input.firstKeptEntryId}`)
  const path = pathFromState(state, state.leaf)
  if (path._tag === "Failure") return path
  if (!path.value.some((entry) => entry.id === input.firstKeptEntryId)) {
    return failure(`Session compaction keeps missing entry ${input.firstKeptEntryId}`)
  }
  return success(undefined)
}

const appendState = (state: State, input: AppendInput): readonly [Result<Entry>, State] => {
  const valid = validateCompaction(state, input)
  if (valid._tag === "Failure") return [valid, state]

  const id = String(state.counter)
  const entry = entryFromInput(input, id, state.leaf)
  return [
    success(entry),
    {
      entries: HashMap.set(state.entries, id, entry),
      order: [...state.order, id],
      leaf: id,
      counter: state.counter + 1,
    },
  ]
}

const setLeafState = (state: State, id: EntryId | null): readonly [Result<void>, State] => {
  if (id !== null && Option.isNone(HashMap.get(state.entries, id)))
    return [failure(`Session entry ${id} does not exist`), state]
  return [success(undefined), { ...state, leaf: id }]
}

const messageFromText = (role: "user" | "system", text: string): Prompt.Message =>
  role === "system"
    ? Prompt.makeMessage("system", { content: text })
    : Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

const checkpointMessage = (summary: string): Prompt.Message =>
  messageFromText("user", `<conversation-checkpoint>\n${summary}\n</conversation-checkpoint>`)

const branchSummaryMessage = (summary: string): Prompt.Message =>
  messageFromText("system", `<abandoned-branch-summary>\n${summary}\n</abandoned-branch-summary>`)

const projectedMessages = (path: ReadonlyArray<Entry>): ReadonlyArray<Prompt.Message> => {
  const compactionIndex = path.findLastIndex((entry) => entry._tag === "Compaction")
  const messages: Array<Prompt.Message> = []
  const keptIndex =
    compactionIndex === -1
      ? -1
      : path.findIndex((entry) => entry.id === (path[compactionIndex] as CompactionEntry).firstKeptEntryId)
  const entries = compactionIndex === -1 ? path : path.slice(keptIndex === -1 ? compactionIndex + 1 : keptIndex)

  if (compactionIndex !== -1) messages.push(checkpointMessage((path[compactionIndex] as CompactionEntry).summary))

  for (const entry of entries) {
    switch (entry._tag) {
      case "Message":
        messages.push(entry.message)
        break
      case "BranchSummary":
        messages.push(branchSummaryMessage(entry.summary))
        break
      case "Compaction":
        break
    }
  }

  return messages
}

/** @experimental Purely projects a root-to-leaf session path into model context. */
export const buildContext = (path: ReadonlyArray<Entry>): Prompt.Prompt => Prompt.fromMessages(projectedMessages(path))

/** @experimental Ref-backed non-durable session store. */
export const memoryLayer: Layer.Layer<SessionStore> = Layer.effect(
  SessionStore,
  Ref.make(initialState).pipe(
    Effect.map((state) =>
      SessionStore.of({
        append: (entry) =>
          Ref.modify(state, (current) => appendState(current, entry)).pipe(Effect.flatMap(effectFromResult)),
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
export const testLayer = (implementation: Interface): Layer.Layer<SessionStore> =>
  Layer.succeed(SessionStore, SessionStore.of(implementation))
