import { HarnessEntry, HarnessState, Refinement } from "../../src/harness/index"
import { Result } from "effect"

export const scope: HarnessEntry.HarnessScope = "thread:alpha"

export const at = (minute: number): HarnessEntry.HarnessInstant =>
  `2024-01-01T00:${String(minute).padStart(2, "0")}:00.000Z`

export const entryValue = (
  overrides: Partial<HarnessEntry.HarnessEntryValue> = {},
): HarnessEntry.HarnessEntryValue => ({ title: "title", content: "content", ...overrides })

export const entry = (
  input: {
    readonly id: string
    readonly kind: HarnessEntry.HarnessKind
    readonly scope?: string
    readonly version?: number
  } & Partial<HarnessEntry.HarnessEntryValue>,
): HarnessEntry.HarnessEntry => ({
  id: input.id,
  kind: input.kind,
  scope: input.scope ?? scope,
  title: input.title ?? `title ${input.id}`,
  content: input.content ?? `content ${input.id}`,
  ...(input.path === undefined ? {} : { path: input.path }),
  ...(input.reference === undefined ? {} : { reference: input.reference }),
  ...(input.arguments === undefined ? {} : { arguments: input.arguments }),
  ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  ...(input.source === undefined ? {} : { source: input.source }),
  createdAt: at(0),
  updatedAt: at(0),
  version: input.version ?? 1,
})

export const proposal = (input: {
  readonly id?: string
  readonly at?: HarnessEntry.HarnessInstant
  readonly baseSnapshot?: HarnessEntry.HarnessSnapshotId
  readonly rationale?: string
  readonly source?: string
  readonly edits: ReadonlyArray<HarnessEntry.RefinementEdit>
}): HarnessEntry.RefinementProposal => ({
  id: input.id ?? "proposal-1",
  at: input.at ?? at(1),
  ...(input.baseSnapshot === undefined ? {} : { baseSnapshot: input.baseSnapshot }),
  ...(input.rationale === undefined ? {} : { rationale: input.rationale }),
  ...(input.source === undefined ? {} : { source: input.source }),
  edits: input.edits,
})

export const create = (input: {
  readonly kind: HarnessEntry.HarnessKind
  readonly id: string
  readonly value?: Partial<HarnessEntry.HarnessEntryValue>
}): HarnessEntry.RefinementEdit => ({
  _tag: "Create",
  kind: input.kind,
  id: input.id,
  value: entryValue(input.value),
})

export const update = (input: {
  readonly kind: HarnessEntry.HarnessKind
  readonly id: string
  readonly value?: Partial<HarnessEntry.HarnessEntryValue>
  readonly baseVersion?: number
}): HarnessEntry.RefinementEdit => ({
  _tag: "Update",
  kind: input.kind,
  id: input.id,
  value: entryValue(input.value),
  ...(input.baseVersion === undefined ? {} : { baseVersion: input.baseVersion }),
})

export const remove = (input: {
  readonly kind: HarnessEntry.HarnessKind
  readonly id: string
  readonly baseVersion?: number
}): HarnessEntry.RefinementEdit => ({
  _tag: "Delete",
  kind: input.kind,
  id: input.id,
  ...(input.baseVersion === undefined ? {} : { baseVersion: input.baseVersion }),
})

export const applied = (input: {
  readonly state: HarnessState.HarnessState
  readonly proposal: HarnessEntry.RefinementProposal
  readonly options?: Refinement.ApplyOptions
}): Refinement.RefinementResult =>
  Result.getOrThrow(Refinement.applyTrustedProposal(input.state, input.proposal, input.options ?? {}))

export const rejected = (input: {
  readonly state: HarnessState.HarnessState
  readonly proposal: HarnessEntry.RefinementProposal
  readonly options?: Refinement.ApplyOptions
}): Refinement.RefinementRejected => {
  const result = Refinement.applyTrustedProposal(input.state, input.proposal, input.options ?? {})
  if (Result.isSuccess(result)) throw new Error("expected a rejected proposal")
  return result.failure
}
