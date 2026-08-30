import { digest } from "../core/durable/pin.js"
import { Function, Schema } from "effect"
import { GuidanceEntry, GuidanceScope, GuidanceSnapshotId, RefinementEvent, kinds, type GuidanceKind } from "./entry.js"

/** @experimental Entries of one state grouped by kind and sorted by id. */
export const GuidanceEntries = Schema.Struct({
  prompt: Schema.Array(GuidanceEntry),
  memory: Schema.Array(GuidanceEntry),
  skill: Schema.Array(GuidanceEntry),
  subagent: Schema.Array(GuidanceEntry),
})
/** @experimental */
export type GuidanceEntries = typeof GuidanceEntries.Type

/** @experimental One complete Agent Guidance state for one scope. */
export const GuidanceState = Schema.Struct({
  schemaVersion: Schema.Literal("1"),
  scope: GuidanceScope,
  entries: GuidanceEntries,
  refinements: Schema.Array(RefinementEvent),
})
/** @experimental */
export type GuidanceState = typeof GuidanceState.Type

interface GroupedEntries {
  readonly prompt: Array<GuidanceEntry>
  readonly memory: Array<GuidanceEntry>
  readonly skill: Array<GuidanceEntry>
  readonly subagent: Array<GuidanceEntry>
}

const compareText = (left: string, right: string): number => {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

const sortEntries = (entries: ReadonlyArray<GuidanceEntry>): ReadonlyArray<GuidanceEntry> =>
  entries.toSorted((left, right) => compareText(left.id, right.id))

/** @experimental An empty state for one scope. */
export const empty = (scope: GuidanceScope): GuidanceState => ({
  schemaVersion: "1",
  scope,
  entries: { prompt: [], memory: [], skill: [], subagent: [] },
  refinements: [],
})

/** @experimental Build one state from unordered entries and refinements. */
export const make = (input: {
  readonly scope: GuidanceScope
  readonly entries?: ReadonlyArray<GuidanceEntry>
  readonly refinements?: ReadonlyArray<RefinementEvent>
}): GuidanceState => {
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
export const allEntries = (state: GuidanceState): ReadonlyArray<GuidanceEntry> =>
  kinds.flatMap((kind) => state.entries[kind])

/** @experimental The entry of one kind and id, when present. */
export const findEntry: {
  (kind: GuidanceKind, id: string): (state: GuidanceState) => GuidanceEntry | undefined
  (state: GuidanceState, kind: GuidanceKind, id: string): GuidanceEntry | undefined
} = Function.dual(3, (state: GuidanceState, kind: GuidanceKind, id: string): GuidanceEntry | undefined =>
  state.entries[kind].find((entry) => entry.id === id),
)

/** @experimental Replace the entries of one kind, keeping canonical order. */
export const withEntries: {
  (kind: GuidanceKind, entries: ReadonlyArray<GuidanceEntry>): (state: GuidanceState) => GuidanceState
  (state: GuidanceState, kind: GuidanceKind, entries: ReadonlyArray<GuidanceEntry>): GuidanceState
} = Function.dual(
  3,
  (state: GuidanceState, kind: GuidanceKind, entries: ReadonlyArray<GuidanceEntry>): GuidanceState => ({
    ...state,
    entries: { ...state.entries, [kind]: sortEntries(entries) },
  }),
)

const encodeEntries = Schema.encodeSync(GuidanceEntries)

/** @experimental Content-addressed identity of one exact state, independent of refinement history. */
export const snapshotId = (state: GuidanceState): GuidanceSnapshotId =>
  `guidance-snapshot:v1:sha256:${digest({
    schemaVersion: state.schemaVersion,
    scope: state.scope,
    entries: encodeEntries(state.entries),
  })}`
