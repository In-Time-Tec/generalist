import { Brand, Schema } from "effect"

const idLimit = 128
const textLimit = 512
const contentLimit = 65_536
const pathLimit = 1_024

/** Bounded identifier of one guidance entry within its kind. */
export const GuidanceId = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(idLimit),
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
)
export type GuidanceId = typeof GuidanceId.Type

/** Host-chosen store partition one entry belongs to. */
export const GuidanceScope = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(idLimit),
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
)
export type GuidanceScope = typeof GuidanceScope.Type

/** The four versioned instruction entry kinds. */
export const GuidanceKind = Schema.Literals(["prompt", "memory", "skill", "subagent"])
export type GuidanceKind = typeof GuidanceKind.Type

/** Every guidance kind in canonical order. */
export const kinds: ReadonlyArray<GuidanceKind> = ["prompt", "memory", "skill", "subagent"]

/** Caller-supplied UTC ISO-8601 instant with millisecond precision. */
export const GuidanceInstant = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/))
export type GuidanceInstant = typeof GuidanceInstant.Type

/** Revision counter of one entry. */
export const GuidanceVersion = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
export type GuidanceVersion = typeof GuidanceVersion.Type

/** Content-addressed identity of one exact guidance state. */
export const GuidanceSnapshotId = Schema.String.check(Schema.isPattern(/^guidance-snapshot:v1:sha256:[0-9a-f]{64}$/))
export type GuidanceSnapshotId = typeof GuidanceSnapshotId.Type

/** The authored value of one entry, independent of identity and revision. */
export const GuidanceEntryValue = Schema.Struct({
  title: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(textLimit)),
  content: Schema.String.check(Schema.isMaxLength(contentLimit)),
  path: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(pathLimit))),
  reference: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(textLimit))),
  arguments: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  source: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(textLimit))),
})
export type GuidanceEntryValue = typeof GuidanceEntryValue.Type

/** The audit revision of one entry. */
export const GuidanceRevision = Schema.Struct({
  createdAt: GuidanceInstant,
  updatedAt: GuidanceInstant,
  version: GuidanceVersion,
})
export type GuidanceRevision = typeof GuidanceRevision.Type

/** One versioned instruction entry. */
export const GuidanceEntry = Schema.Struct({
  id: GuidanceId,
  kind: GuidanceKind,
  scope: GuidanceScope,
  ...GuidanceEntryValue.fields,
  ...GuidanceRevision.fields,
})
export type GuidanceEntry = typeof GuidanceEntry.Type

/** Project one entry back to its authored value. */
export const value = (entry: GuidanceEntry): GuidanceEntryValue => {
  let projected: GuidanceEntryValue = { title: entry.title, content: entry.content }
  if (entry.path !== undefined) projected = { ...projected, path: entry.path }
  if (entry.reference !== undefined) projected = { ...projected, reference: entry.reference }
  if (entry.arguments !== undefined) projected = { ...projected, arguments: entry.arguments }
  if (entry.metadata !== undefined) projected = { ...projected, metadata: entry.metadata }
  if (entry.source !== undefined) projected = { ...projected, source: entry.source }
  return projected
}

/** Project one entry back to its audit revision. */
export const revision = (entry: GuidanceEntry): GuidanceRevision => ({
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
  version: entry.version,
})

/** Add one entry that must not already exist. A pinned revision reconstructs an exact prior entry. */
export const CreateEdit = Schema.TaggedStruct("Create", {
  kind: GuidanceKind,
  id: GuidanceId,
  value: GuidanceEntryValue,
  revision: Schema.optionalKey(GuidanceRevision),
})
export type CreateEdit = typeof CreateEdit.Type

/** Replace the authored value of one existing entry. A pinned revision reconstructs an exact prior entry. */
export const UpdateEdit = Schema.TaggedStruct("Update", {
  kind: GuidanceKind,
  id: GuidanceId,
  value: GuidanceEntryValue,
  baseVersion: Schema.optionalKey(GuidanceVersion),
  revision: Schema.optionalKey(GuidanceRevision),
})
export type UpdateEdit = typeof UpdateEdit.Type

/** Remove one existing entry. */
export const DeleteEdit = Schema.TaggedStruct("Delete", {
  kind: GuidanceKind,
  id: GuidanceId,
  baseVersion: Schema.optionalKey(GuidanceVersion),
})
export type DeleteEdit = typeof DeleteEdit.Type

/** One requested change to the guidance. */
export const RefinementEdit = Schema.Union([CreateEdit, UpdateEdit, DeleteEdit])
export type RefinementEdit = typeof RefinementEdit.Type

/**
 * One create edit an untrusted author may request. `revision` is absent from the contract, so
 * untrusted input cannot choose an entry's createdAt, updatedAt, or version.
 */
export const AuthoredCreateEdit = Schema.TaggedStruct("Create", {
  kind: GuidanceKind,
  id: GuidanceId,
  value: GuidanceEntryValue,
})
export type AuthoredCreateEdit = typeof AuthoredCreateEdit.Type

/** One update edit an untrusted author may request, without any pinned revision. */
export const AuthoredUpdateEdit = Schema.TaggedStruct("Update", {
  kind: GuidanceKind,
  id: GuidanceId,
  value: GuidanceEntryValue,
  baseVersion: Schema.optionalKey(GuidanceVersion),
})
export type AuthoredUpdateEdit = typeof AuthoredUpdateEdit.Type

/** One change an untrusted author may request. */
export const AuthoredEdit = Schema.Union([AuthoredCreateEdit, AuthoredUpdateEdit, DeleteEdit])
export type AuthoredEdit = typeof AuthoredEdit.Type

const proposalFields = {
  id: GuidanceId,
  at: GuidanceInstant,
  rationale: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(contentLimit))),
  source: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(textLimit))),
  baseSnapshot: Schema.optionalKey(GuidanceSnapshotId),
}

/** An atomic set of requested changes with optional baseline pinning. */
export const RefinementProposal = Schema.Struct({
  ...proposalFields,
  rollbackOf: Schema.optionalKey(GuidanceId),
  edits: Schema.Array(RefinementEdit).check(Schema.isNonEmpty()),
})
export type RefinementProposal = typeof RefinementProposal.Type

/**
 * A proposal whose edits cannot carry a pinned revision. This is the only shape an untrusted author
 * may express, so a model-originated proposal can never forge an entry's audit trail.
 */
export const AuthoredProposal = Schema.Struct({
  ...proposalFields,
  edits: Schema.Array(AuthoredEdit).check(Schema.isNonEmpty()),
})
export type AuthoredProposal = typeof AuthoredProposal.Type

/**
 * One proposal that has passed untrusted authorship, carried as an opaque value.
 *
 * The brand is unforgeable by construction: `Authorship.author` is the only thing that mints it, so the
 * apply seam can distinguish "an author asked for this" from "a caller assembled a proposal shape" at the type
 * level. Structural typing cannot make that distinction, because an edit carrying a `revision` is still
 * assignable to an authored edit.
 */
export type AuthoredRefinementProposal = Brand.Branded<
  AuthoredProposal,
  "generalist/instructions/AuthoredRefinementProposal"
>

/** One applied change with its exact before and after entries. */
export const AppliedRefinementEdit = Schema.Struct({
  edit: RefinementEdit,
  before: Schema.optionalKey(GuidanceEntry),
  after: Schema.optionalKey(GuidanceEntry),
})
export type AppliedRefinementEdit = typeof AppliedRefinementEdit.Type

/** The durable record of one applied proposal. */
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
export type RefinementEvent = typeof RefinementEvent.Type

/** Exact identity of one edit target within a state. */
export const editKey = (edit: RefinementEdit): string => `${edit.kind}/${edit.id}`
