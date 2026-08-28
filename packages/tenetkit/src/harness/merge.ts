import { Function } from "effect"
import { HarnessEntry, kinds } from "./entry.js"
import { HarnessState, make } from "./state.js"

const compareText = (left: string, right: string): number => {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/**
 * @experimental Overlay one inner scope on one outer scope. An inner entry wins over an outer entry of the same
 * kind and id; every surviving entry keeps the scope that authored it.
 */
export const mergeStates: {
  (inner: HarnessState): (outer: HarnessState) => HarnessState
  (outer: HarnessState, inner: HarnessState): HarnessState
} = Function.dual(2, (outer: HarnessState, inner: HarnessState): HarnessState => {
  const entries: Array<HarnessEntry> = []
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
