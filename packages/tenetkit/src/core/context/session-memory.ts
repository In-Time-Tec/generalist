import { Effect, HashMap, Layer, Option, Ref, Schema, Semaphore, SynchronizedRef } from "effect"
import {
  type AppendInput,
  type AppendOptions,
  type BaseEntry,
  type CheckpointAppend,
  type CompactionEntry,
  type Entry,
  type EntryId,
  EntryPayload,
  type SessionStore,
  type PreparedCheckpoint,
  SessionConflict,
  SessionDirectory,
  SessionStoreError,
  type StableAppendOptions,
  checkpointMatches,
} from "./session.js"

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
  const base: BaseEntry = input.metadata === undefined ? { id, parentId } : { id, parentId, metadata: input.metadata }

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

const appendMatches = (entry: Entry, input: AppendInput, parentId: EntryId | null): boolean =>
  entry.parentId === parentId && entryPayloadEquivalence(entry, entryFromInput(input, entry.id, parentId))

const existingAppend = (
  state: State,
  input: AppendInput,
  options: StableAppendOptions,
  existing: Entry,
): Result<Entry> | SessionConflict => {
  if (!appendMatches(existing, input, options.expectedLeafId)) {
    return SessionConflict.make({
      reason: "entry-id-reused",
      message: `Session entry id ${options.id} was reused with different parent or content`,
    })
  }
  const activePath = state.leaf === null ? success<ReadonlyArray<Entry>>([]) : pathFromState(state, state.leaf)
  if (activePath._tag === "Failure" || !activePath.value.some((active) => active.id === options.id)) {
    return SessionConflict.make({
      reason: "stale-leaf",
      message: `Session entry id ${options.id} is not on the active path from ${String(state.leaf)}`,
    })
  }
  return success(existing)
}

const appendState = (
  state: State,
  input: AppendInput,
  options?: AppendOptions,
): readonly [Result<Entry> | SessionConflict, State] => {
  if (options?.id !== undefined) {
    const existing = HashMap.get(state.entries, options.id)
    if (Option.isSome(existing)) return [existingAppend(state, input, options, existing.value), state]
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
  const checkpointBase: Omit<CompactionEntry, "compactionCommit" | "summary"> = {
    _tag: "Compaction",
    id: prepared.id,
    parentId: prepared.parentId,
    projectedHistory: prepared.projectedHistory,
    telemetry: prepared.telemetry,
  }
  const withCommit: CompactionEntry =
    prepared.compactionCommit === undefined
      ? checkpointBase
      : { ...checkpointBase, compactionCommit: prepared.compactionCommit }
  const checkpoint: CompactionEntry =
    prepared.summary === undefined ? withCommit : { ...withCommit, summary: prepared.summary }
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

const makeStore: Effect.Effect<SessionStore> = Ref.make(initialState).pipe(
  Effect.map((state) => ({
    reserveEntryId: Ref.modify(state, (current) => {
      let counter = current.counter
      while (Option.isSome(HashMap.get(current.entries, String(counter)))) counter += 1
      return [String(counter), { ...current, counter: counter + 1 }]
    }),
    append: (entry, options) =>
      Ref.modify(state, (current) => appendState(current, entry, options)).pipe(Effect.flatMap(effectFromAppendResult)),
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
    setLeaf: (id) => Ref.modify(state, (current) => setLeafState(current, id)).pipe(Effect.flatMap(effectFromResult)),
    leaf: Ref.get(state).pipe(Effect.map((current) => current.leaf)),
  })),
)

interface Cell {
  readonly store: SessionStore
  readonly semaphore: Semaphore.Semaphore
}

const makeCell: Effect.Effect<Cell> = Effect.all({ store: makeStore, semaphore: Semaphore.make(1) })

/** @experimental Ref-backed non-durable Session directory with one linear lane per Session ID. */
export const layerMemory: Layer.Layer<SessionDirectory> = Layer.effect(
  SessionDirectory,
  SynchronizedRef.make<ReadonlyMap<string, Cell>>(new Map()).pipe(
    Effect.map((cells) =>
      SessionDirectory.of({
        acquire: (sessionId) =>
          Effect.gen(function* () {
            const cell = yield* SynchronizedRef.modifyEffect(cells, (current) => {
              const existing = current.get(sessionId)
              if (existing !== undefined) return Effect.succeed([existing, current] as const)
              return makeCell.pipe(
                Effect.map((created) => {
                  const next = new Map(current)
                  next.set(sessionId, created)
                  return [created, next] as const
                }),
              )
            })
            yield* Effect.acquireRelease(cell.semaphore.take(1), () => cell.semaphore.release(1), {
              interruptible: true,
            })
            return cell.store
          }),
      }),
    ),
  ),
)
