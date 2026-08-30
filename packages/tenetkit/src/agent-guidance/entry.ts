import { Brand, Schema } from "effect"

const idLimit = 128
const textLimit = 512
const contentLimit = 65_536
const pathLimit = 1_024

/** @experimental Bounded identifier of one guidance entry within its kind. */
export const GuidanceId = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(idLimit),
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
)
/** @experimental */
export type GuidanceId = typeof GuidanceId.Type

/** @experimental Host-chosen store partition one entry belongs to. */
export const GuidanceScope = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(idLimit),
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
)
/** @experimental */
export type GuidanceScope = typeof GuidanceScope.Type

/** @experimental The four Agent Guidance entry kinds. */
export const GuidanceKind = Schema.Literals(["prompt", "memory", "skill", "subagent"])
/** @experimental */
export type GuidanceKind = typeof GuidanceKind.Type

/** @experimental Every guidance kind in canonical order. */
export const kinds: ReadonlyArray<GuidanceKind> = ["prompt", "memory", "skill", "subagent"]

/** @experimental Caller-supplied UTC ISO-8601 instant with millisecond precision. */
export const GuidanceInstant = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/))
/** @experimental */
export type GuidanceInstant = typeof GuidanceInstant.Type

/** @experimental Revision counter of one entry. */
export const GuidanceVersion = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
/** @experimental */
export type GuidanceVersion = typeof GuidanceVersion.Type

/** @experimental Content-addressed identity of one exact guidance state. */
export const GuidanceSnapshotId = Schema.String.check(Schema.isPattern(/^guidance-snapshot:v1:sha256:[0-9a-f]{64}$/))
/** @experimental */
export type GuidanceSnapshotId = typeof GuidanceSnapshotId.Type

/** @experimental The authored value of one entry, independent of identity and revision. */
export const GuidanceEntryValue = Schema.Struct({
  title: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(textLimit)),
  content: Schema.String.check(Schema.isMaxLength(contentLimit)),
  path: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(pathLimit))),
  reference: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(textLimit))),
  arguments: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  source: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(textLimit))),
})
/** @experimental */
export type GuidanceEntryValue = typeof GuidanceEntryValue.Type

/** @experimental The audit revision of one entry. */
export const GuidanceRevision = Schema.Struct({
  createdAt: GuidanceInstant,
  updatedAt: GuidanceInstant,
  version: GuidanceVersion,
})
/** @experimental */
export type GuidanceRevision = typeof GuidanceRevision.Type

/** @experimental One versioned Agent Guidance entry. */
export const GuidanceEntry = Schema.Struct({
  id: GuidanceId,
  kind: GuidanceKind,
  scope: GuidanceScope,
  ...GuidanceEntryValue.fields,
  ...GuidanceRevision.fields,
})
/** @experimental */
export type GuidanceEntry = typeof GuidanceEntry.Type

/** @experimental Project one entry back to its authored value. */
export const value = (entry: GuidanceEntry): GuidanceEntryValue => {
  let projected: GuidanceEntryValue = { title: entry.title, content: entry.content }
  if (entry.path !== undefined) projected = { ...projected, path: entry.path }
  if (entry.reference !== undefined) projected = { ...projected, reference: entry.reference }
  if (entry.arguments !== undefined) projected = { ...projected, arguments: entry.arguments }
  if (entry.metadata !== undefined) projected = { ...projected, metadata: entry.metadata }
  if (entry.source !== undefined) projected = { ...projected, source: entry.source }
  return projected
}

/** @experimental Project one entry back to its audit revision. */
export const revision = (entry: GuidanceEntry): GuidanceRevision => ({
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
  version: entry.version,
})

/** @experimental Add one entry that must not already exist. A pinned revision reconstructs an exact prior entry. */
export const CreateEdit = Schema.TaggedStruct("Create", {
  kind: GuidanceKind,
  id: GuidanceId,
  value: GuidanceEntryValue,
  revision: Schema.optionalKey(GuidanceRevision),
})
/** @experimental */
export type CreateEdit = typeof CreateEdit.Type

/** @experimental Replace the authored value of one existing entry. A pinned revision reconstructs an exact prior entry. */
export const UpdateEdit = Schema.TaggedStruct("Update", {
  kind: GuidanceKind,
  id: GuidanceId,
  value: GuidanceEntryValue,
  baseVersion: Schema.optionalKey(GuidanceVersion),
  revision: Schema.optionalKey(GuidanceRevision),
})
/** @experimental */
export type UpdateEdit = typeof UpdateEdit.Type

/** @experimental Remove one existing entry. */
export const DeleteEdit = Schema.TaggedStruct("Delete", {
  kind: GuidanceKind,
  id: GuidanceId,
  baseVersion: Schema.optionalKey(GuidanceVersion),
})
/** @experimental */
export type DeleteEdit = typeof DeleteEdit.Type

/** @experimental One requested change to the guidance. */
export const RefinementEdit = Schema.Union([CreateEdit, UpdateEdit, DeleteEdit])
/** @experimental */
export type RefinementEdit = typeof RefinementEdit.Type

/**
 * @experimental One create edit an untrusted author may request. `revision` is absent from the contract, so
 * untrusted input cannot choose an entry's createdAt, updatedAt, or version.
 */
export const AuthoredCreateEdit = Schema.TaggedStruct("Create", {
  kind: GuidanceKind,
  id: GuidanceId,
  value: GuidanceEntryValue,
})
/** @experimental */
export type AuthoredCreateEdit = typeof AuthoredCreateEdit.Type

/** @experimental One update edit an untrusted author may request, without any pinned revision. */
export const AuthoredUpdateEdit = Schema.TaggedStruct("Update", {
  kind: GuidanceKind,
  id: GuidanceId,
  value: GuidanceEntryValue,
  baseVersion: Schema.optionalKey(GuidanceVersion),
})
/** @experimental */
export type AuthoredUpdateEdit = typeof AuthoredUpdateEdit.Type

/** @experimental One change an untrusted author may request. */
export const AuthoredEdit = Schema.Union([AuthoredCreateEdit, AuthoredUpdateEdit, DeleteEdit])
/** @experimental */
export type AuthoredEdit = typeof AuthoredEdit.Type

const proposalFields = {
  id: GuidanceId,
  at: GuidanceInstant,
  rationale: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(contentLimit))),
  source: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(textLimit))),
  baseSnapshot: Schema.optionalKey(GuidanceSnapshotId),
}

/** @experimental An atomic set of requested changes with optional baseline pinning. */
export const RefinementProposal = Schema.Struct({
  ...proposalFields,
  rollbackOf: Schema.optionalKey(GuidanceId),
  edits: Schema.Array(RefinementEdit).check(Schema.isNonEmpty()),
})
/** @experimental */
export type RefinementProposal = typeof RefinementProposal.Type

/**
 * @experimental A proposal whose edits cannot carry a pinned revision. This is the only shape an untrusted author
 * may express, so a model-originated proposal can never forge an entry's audit trail.
 */
export const AuthoredProposal = Schema.Struct({
  ...proposalFields,
  edits: Schema.Array(AuthoredEdit).check(Schema.isNonEmpty()),
})
/** @experimental */
export type AuthoredProposal = typeof AuthoredProposal.Type

/**
 * @experimental One proposal that has passed untrusted authorship, carried as an opaque value.
 *
 * The brand is unforgeable by construction: `Authorship.author` is the only thing that mints it, so the
 * apply seam can distinguish "an author asked for this" from "a caller assembled a proposal shape" at the type
 * level. Structural typing cannot make that distinction, because an edit carrying a `revision` is still
 * assignable to an authored edit.
 */
export type AuthoredRefinementProposal = Brand.Branded<
  AuthoredProposal,
  "tenetkit/agent-guidance/AuthoredRefinementProposal"
>

/** @experimental One applied change with its exact before and after entries. */
export const AppliedRefinementEdit = Schema.Struct({
  edit: RefinementEdit,
  before: Schema.optionalKey(GuidanceEntry),
  after: Schema.optionalKey(GuidanceEntry),
})
/** @experimental */
export type AppliedRefinementEdit = typeof AppliedRefinementEdit.Type

/** @experimental The durable record of one applied proposal. */
export const RefinementEvent = Schema.Struct({
  proposal: GuidanceId,
  at: GuidanceInstant,
  scope: GuidanceScope,
  rationale: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(contentLimit))),
  source: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(textLimit))),
  before: GuidanceSnapshotId,
  after: GuidanceSnapshotId,
  applied: Schema.Array(AppliedRefinementEdit).check(Schema.isNonEmpty()),
})
/** @experimental */
export type RefinementEvent = typeof RefinementEvent.Type

/** @experimental Exact identity of one edit target within a state. */
export const editKey = (edit: RefinementEdit): string => `${edit.kind}/${edit.id}`
