import { digest } from "../core/durable/pin.js"
import { Function, Schema } from "effect"
import { GuidanceEntry, GuidanceScope, GuidanceSnapshotId, RefinementEvent, kinds, type GuidanceKind } from "./entry.js"

/** Entries of one state grouped by kind and sorted by id. */
export const GuidanceEntries = Schema.Struct({
  prompt: Schema.Array(GuidanceEntry),
  memory: Schema.Array(GuidanceEntry),
  skill: Schema.Array(GuidanceEntry),
  subagent: Schema.Array(GuidanceEntry),
})
export type GuidanceEntries = typeof GuidanceEntries.Type

/** One complete versioned instruction state for one scope. */
export const GuidanceState = Schema.Struct({
  schemaVersion: Schema.Literal("1"),
  scope: GuidanceScope,
  entries: GuidanceEntries,
  refinements: Schema.Array(RefinementEvent),
})
export type GuidanceState = typeof GuidanceState.Type

interface EntryGroups {
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

/** An empty state for one scope. */
export const empty = (scope: GuidanceScope): GuidanceState => ({
  schemaVersion: "1",
  scope,
  entries: { prompt: [], memory: [], skill: [], subagent: [] },
  refinements: [],
})

/** Build one state from unordered entries and refinements. */
export const make = (input: {
  readonly scope: GuidanceScope
  readonly entries?: ReadonlyArray<GuidanceEntry>
  readonly refinements?: ReadonlyArray<RefinementEvent>
}): GuidanceState => {
  const grouped: EntryGroups = {
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

/** Every entry of one state in canonical kind then id order. */
export const allEntries = (state: GuidanceState): ReadonlyArray<GuidanceEntry> =>
  kinds.flatMap((kind) => state.entries[kind])

/** The entry of one kind and id, when present. */
export const findEntry: {
  (kind: GuidanceKind, id: string): (state: GuidanceState) => GuidanceEntry | undefined
  (state: GuidanceState, kind: GuidanceKind, id: string): GuidanceEntry | undefined
} = Function.dual(3, (state: GuidanceState, kind: GuidanceKind, id: string): GuidanceEntry | undefined =>
  state.entries[kind].find((entry) => entry.id === id),
)

/** Replace the entries of one kind, keeping canonical order. */
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

/** Content-addressed identity of one exact state, independent of refinement history. */
export const snapshotId = (state: GuidanceState): GuidanceSnapshotId =>
  `guidance-snapshot:v1:sha256:${digest({
    schemaVersion: state.schemaVersion,
    scope: state.scope,
    entries: encodeEntries(state.entries),
  })}`

/**
 * Overlay one inner scope on one outer scope. An inner entry wins over an outer entry of the same
 * kind and id; every surviving entry keeps the scope that authored it.
 */
export const merge: {
  (inner: GuidanceState): (outer: GuidanceState) => GuidanceState
  (outer: GuidanceState, inner: GuidanceState): GuidanceState
} = Function.dual(2, (outer: GuidanceState, inner: GuidanceState): GuidanceState => {
  const entries: Array<GuidanceEntry> = []
  for (const kind of kinds) {
    const overridden = new Set(inner.entries[kind].map((entry) => entry.id))
    for (const entry of outer.entries[kind]) if (!overridden.has(entry.id)) entries.push(entry)
    for (const entry of inner.entries[kind]) entries.push(entry)
  }
  const refinements = [...outer.refinements, ...inner.refinements].toSorted(
    (left, right) =>
      compareText(left.at, right.at) ||
      compareText(left.scope, right.scope) ||
      compareText(left.proposal, right.proposal),
  )
  return make({ scope: inner.scope, entries, refinements })
})
