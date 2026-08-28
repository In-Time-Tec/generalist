import { Pins } from "../core/index.js"
import { Function, Schema } from "effect"
import { HarnessEntry, HarnessScope, HarnessSnapshotId, RefinementEvent, kinds, type HarnessKind } from "./entry.js"

/** @experimental Entries of one state grouped by kind and sorted by id. */
export const HarnessEntries = Schema.Struct({
  prompt: Schema.Array(HarnessEntry),
  memory: Schema.Array(HarnessEntry),
  skill: Schema.Array(HarnessEntry),
  subagent: Schema.Array(HarnessEntry),
})
/** @experimental */
export type HarnessEntries = typeof HarnessEntries.Type

/** @experimental One complete continual-harness state for one scope. */
export const HarnessState = Schema.Struct({
  schemaVersion: Schema.Literal("1"),
  scope: HarnessScope,
  entries: HarnessEntries,
  refinements: Schema.Array(RefinementEvent),
})
/** @experimental */
export type HarnessState = typeof HarnessState.Type

interface GroupedEntries {
  readonly prompt: Array<HarnessEntry>
  readonly memory: Array<HarnessEntry>
  readonly skill: Array<HarnessEntry>
  readonly subagent: Array<HarnessEntry>
}

const compareText = (left: string, right: string): number => {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

const sortEntries = (entries: ReadonlyArray<HarnessEntry>): ReadonlyArray<HarnessEntry> =>
  entries.toSorted((left, right) => compareText(left.id, right.id))

/** @experimental An empty state for one scope. */
export const empty = (scope: HarnessScope): HarnessState => ({
  schemaVersion: "1",
  scope,
  entries: { prompt: [], memory: [], skill: [], subagent: [] },
  refinements: [],
})

/** @experimental Build one state from unordered entries and refinements. */
export const make = (input: {
  readonly scope: HarnessScope
  readonly entries?: ReadonlyArray<HarnessEntry>
  readonly refinements?: ReadonlyArray<RefinementEvent>
}): HarnessState => {
  const grouped: GroupedEntries = {
    prompt: [],
    memory: [],
    skill: [],
    subagent: [],
  }
  for (const entry of input.entries ?? []) grouped[entry.kind].push(entry)
  return {
    schemaVersion: "1",
    scope: input.scope,
    entries: {
      prompt: sortEntries(grouped.prompt),
      memory: sortEntries(grouped.memory),
      skill: sortEntries(grouped.skill),
      subagent: sortEntries(grouped.subagent),
    },
    refinements: input.refinements ?? [],
  }
}

/** @experimental Every entry of one state in canonical kind then id order. */
export const allEntries = (state: HarnessState): ReadonlyArray<HarnessEntry> =>
  kinds.flatMap((kind) => state.entries[kind])

/** @experimental The entry of one kind and id, when present. */
export const findEntry: {
  (kind: HarnessKind, id: string): (state: HarnessState) => HarnessEntry | undefined
  (state: HarnessState, kind: HarnessKind, id: string): HarnessEntry | undefined
} = Function.dual(3, (state: HarnessState, kind: HarnessKind, id: string): HarnessEntry | undefined =>
  state.entries[kind].find((entry) => entry.id === id),
)

/** @experimental Replace the entries of one kind, keeping canonical order. */
export const withEntries: {
  (kind: HarnessKind, entries: ReadonlyArray<HarnessEntry>): (state: HarnessState) => HarnessState
  (state: HarnessState, kind: HarnessKind, entries: ReadonlyArray<HarnessEntry>): HarnessState
} = Function.dual(
  3,
  (state: HarnessState, kind: HarnessKind, entries: ReadonlyArray<HarnessEntry>): HarnessState => ({
    ...state,
    entries: { ...state.entries, [kind]: sortEntries(entries) },
  }),
)

const encodeEntries = Schema.encodeSync(HarnessEntries)

/** @experimental Content-addressed identity of one exact state, independent of refinement history. */
export const snapshotId = (state: HarnessState): HarnessSnapshotId =>
  `harness-snapshot:v1:sha256:${Pins.digest({
    schemaVersion: state.schemaVersion,
    scope: state.scope,
    entries: encodeEntries(state.entries),
  })}`
