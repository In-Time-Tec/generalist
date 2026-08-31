import { Entry, State, Refinement } from "../../src/instructions/index.js"
import { Result } from "effect"

export const scope: Entry.GuidanceScope = "thread:alpha"

export const at = (minute: number): Entry.GuidanceInstant => `2024-01-01T00:${String(minute).padStart(2, "0")}:00.000Z`

export const entryValue = (overrides: Partial<Entry.GuidanceEntryValue> = {}): Entry.GuidanceEntryValue => ({
  title: "title",
  content: "content",
  ...overrides,
})

export const entry = (
  input: {
    readonly id: string
    readonly kind: Entry.GuidanceKind
    readonly scope?: string
    readonly version?: number
  } & Partial<Entry.GuidanceEntryValue>,
): Entry.GuidanceEntry => {
  let value: Entry.GuidanceEntry = {
    id: input.id,
    kind: input.kind,
    scope: input.scope ?? scope,
    title: input.title ?? `title ${input.id}`,
    content: input.content ?? `content ${input.id}`,
    createdAt: at(0),
    updatedAt: at(0),
    version: input.version ?? 1,
  }
  if (input.path !== undefined) value = { ...value, path: input.path }
  if (input.reference !== undefined) value = { ...value, reference: input.reference }
  if (input.arguments !== undefined) value = { ...value, arguments: input.arguments }
  if (input.metadata !== undefined) value = { ...value, metadata: input.metadata }
  if (input.source !== undefined) value = { ...value, source: input.source }
  return value
}

export const proposal = (input: {
  readonly id?: string
  readonly at?: Entry.GuidanceInstant
  readonly baseSnapshot?: Entry.GuidanceSnapshotId
  readonly rationale?: string
  readonly source?: string
  readonly edits: ReadonlyArray<Entry.RefinementEdit>
}): Entry.RefinementProposal => {
  let value: Entry.RefinementProposal = {
    id: input.id ?? "proposal-1",
    at: input.at ?? at(1),
    edits: input.edits,
  }
  if (input.baseSnapshot !== undefined) value = { ...value, baseSnapshot: input.baseSnapshot }
  if (input.rationale !== undefined) value = { ...value, rationale: input.rationale }
  if (input.source !== undefined) value = { ...value, source: input.source }
  return value
}

export const create = (input: {
  readonly kind: Entry.GuidanceKind
  readonly id: string
  readonly value?: Partial<Entry.GuidanceEntryValue>
}): Entry.RefinementEdit => ({
  _tag: "Create",
  kind: input.kind,
  id: input.id,
  value: entryValue(input.value),
})

export const update = (input: {
  readonly kind: Entry.GuidanceKind
  readonly id: string
  readonly value?: Partial<Entry.GuidanceEntryValue>
  readonly baseVersion?: number
}): Entry.RefinementEdit => {
  const value: Entry.UpdateEdit = {
    _tag: "Update",
    kind: input.kind,
    id: input.id,
    value: entryValue(input.value),
  }
  return input.baseVersion === undefined ? value : { ...value, baseVersion: input.baseVersion }
}

export const remove = (input: {
  readonly kind: Entry.GuidanceKind
  readonly id: string
  readonly baseVersion?: number
}): Entry.RefinementEdit => {
  const value: Entry.DeleteEdit = {
    _tag: "Delete",
    kind: input.kind,
    id: input.id,
  }
  return input.baseVersion === undefined ? value : { ...value, baseVersion: input.baseVersion }
}

export const applied = (input: {
  readonly state: State.GuidanceState
  readonly proposal: Entry.RefinementProposal
  readonly options?: Refinement.ApplyOptions
}): Refinement.RefinementResult =>
  Result.getOrThrow(Refinement.applyTrusted(input.state, input.proposal, input.options ?? {}))

export const rejected = (input: {
  readonly state: State.GuidanceState
  readonly proposal: Entry.RefinementProposal
  readonly options?: Refinement.ApplyOptions
}): Refinement.RefinementRejected => {
  const result = Refinement.applyTrusted(input.state, input.proposal, input.options ?? {})
  if (Result.isSuccess(result)) throw new Error("expected a rejected proposal")
  return result.failure
}
