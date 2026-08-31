import { Function } from "effect"
import { GuidanceEntry, GuidanceKind, kinds } from "./entry.js"
import { GuidanceState, snapshotId } from "./state.js"

/** @experimental Bounds every prompt overview must respect. */
export interface OverviewOptions {
  readonly maxEntriesPerKind?: number
  readonly maxContentLength?: number
  readonly maxTitleLength?: number
  readonly maxRefinements?: number
}

/** @experimental Default overview bounds. */
export const defaults = {
  maxEntriesPerKind: 8,
  maxContentLength: 240,
  maxTitleLength: 80,
  maxRefinements: 5,
} as const satisfies Required<OverviewOptions>

const applyLimits = (options: OverviewOptions): Required<OverviewOptions> => ({
  maxEntriesPerKind: Math.max(0, options.maxEntriesPerKind ?? defaults.maxEntriesPerKind),
  maxContentLength: Math.max(0, options.maxContentLength ?? defaults.maxContentLength),
  maxTitleLength: Math.max(0, options.maxTitleLength ?? defaults.maxTitleLength),
  maxRefinements: Math.max(0, options.maxRefinements ?? defaults.maxRefinements),
})

const clamp = (text: string, limit: number): string => {
  const collapsed = text.replace(/\s+/g, " ").trim()
  return collapsed.length <= limit ? collapsed : `${collapsed.slice(0, Math.max(0, limit - 1))}\u2026`
}

const compareText = (left: string, right: string): number => {
  if (left < right) return -1
  return left > right ? 1 : 0
}

const select = (entries: ReadonlyArray<GuidanceEntry>, limit: number): ReadonlyArray<GuidanceEntry> =>
  entries.toSorted((left, right) => compareText(left.id, right.id)).slice(0, limit)

const line = (entry: GuidanceEntry, limits: Required<OverviewOptions>): string => {
  const title = clamp(entry.title, limits.maxTitleLength)
  const content = clamp(entry.content, limits.maxContentLength)
  const reference = entry.reference === undefined ? "" : ` [${clamp(entry.reference, limits.maxTitleLength)}]`
  const suffix = content.length === 0 ? "" : ` \u2014 ${content}`
  return `- ${entry.id} (v${entry.version}, ${entry.scope})${reference}: ${title}${suffix}`
}

const section = (
  state: GuidanceState,
  kind: GuidanceKind,
  limits: Required<OverviewOptions>,
): ReadonlyArray<string> => {
  const all = state.entries[kind]
  const shown = select(all, limits.maxEntriesPerKind)
  const omitted = all.length - shown.length
  const header = `${kind}: ${all.length}${omitted > 0 ? ` (showing ${shown.length})` : ""}`
  return [header, ...shown.map((entry) => line(entry, limits))]
}

const refinementSection = (state: GuidanceState, limits: Required<OverviewOptions>): ReadonlyArray<string> => {
  const shown = state.refinements.slice(-limits.maxRefinements)
  const header = `recent refinements: ${state.refinements.length}${
    shown.length < state.refinements.length ? ` (showing ${shown.length})` : ""
  }`
  return [
    header,
    ...shown.map((event) => {
      const edits = event.applied.map((applied) => `${applied.edit._tag}:${applied.edit.kind}/${applied.edit.id}`)
      return `- ${event.at} ${event.proposal}: ${edits.join(", ")}`
    }),
  ]
}

/**
 * @experimental Render one deterministic, bounded prompt overview of a guidance state. Output size depends only on
 * the supplied bounds, never on how many entries or refinements the state holds.
 */
export const format: {
  (options?: OverviewOptions): (state: GuidanceState) => string
  (state: GuidanceState, options?: OverviewOptions): string
} = Function.dual(
  (args) => "schemaVersion" in args[0],
  (state: GuidanceState, options: OverviewOptions = {}): string => {
    const limits = applyLimits(options)
    return [
      `guidance ${snapshotId(state)} (scope ${state.scope})`,
      ...kinds.flatMap((kind) => ["", ...section(state, kind, limits)]),
      "",
      ...refinementSection(state, limits),
    ].join("\n")
  },
)
