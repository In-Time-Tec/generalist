import { Brand, Schema } from "effect"

const ID_MAX = 128
const TEXT_MAX = 512
const CONTENT_MAX = 65_536
const PATH_MAX = 1_024

/** @experimental Bounded identifier of one harness entry within its kind. */
export const HarnessId = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(ID_MAX),
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
)
/** @experimental */
export type HarnessId = typeof HarnessId.Type

/** @experimental Host-chosen store partition one entry belongs to. */
export const HarnessScope = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(ID_MAX),
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
)
/** @experimental */
export type HarnessScope = typeof HarnessScope.Type

/** @experimental The four continual-harness entry kinds. */
export const HarnessKind = Schema.Literals(["prompt", "memory", "skill", "subagent"])
/** @experimental */
export type HarnessKind = typeof HarnessKind.Type

/** @experimental Every harness kind in canonical order. */
export const kinds: ReadonlyArray<HarnessKind> = ["prompt", "memory", "skill", "subagent"]

/** @experimental Caller-supplied UTC ISO-8601 instant with millisecond precision. */
export const HarnessInstant = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/))
/** @experimental */
export type HarnessInstant = typeof HarnessInstant.Type

/** @experimental Revision counter of one entry. */
export const HarnessVersion = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
/** @experimental */
export type HarnessVersion = typeof HarnessVersion.Type

/** @experimental Content-addressed identity of one exact harness state. */
export const HarnessSnapshotId = Schema.String.check(Schema.isPattern(/^harness-snapshot:v1:sha256:[0-9a-f]{64}$/))
/** @experimental */
export type HarnessSnapshotId = typeof HarnessSnapshotId.Type

/** @experimental The authored value of one entry, independent of identity and revision. */
export const HarnessEntryValue = Schema.Struct({
  title: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(TEXT_MAX)),
  content: Schema.String.check(Schema.isMaxLength(CONTENT_MAX)),
  path: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(PATH_MAX))),
  reference: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(TEXT_MAX))),
  arguments: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  source: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(TEXT_MAX))),
})
/** @experimental */
export type HarnessEntryValue = typeof HarnessEntryValue.Type

/** @experimental The audit revision of one entry. */
export const HarnessRevision = Schema.Struct({
  createdAt: HarnessInstant,
  updatedAt: HarnessInstant,
  version: HarnessVersion,
})
/** @experimental */
export type HarnessRevision = typeof HarnessRevision.Type

/** @experimental One versioned continual-harness entry. */
export const HarnessEntry = Schema.Struct({
  id: HarnessId,
  kind: HarnessKind,
  scope: HarnessScope,
  ...HarnessEntryValue.fields,
  ...HarnessRevision.fields,
})
/** @experimental */
export type HarnessEntry = typeof HarnessEntry.Type

/** @experimental Project one entry back to its authored value. */
export const value = (entry: HarnessEntry): HarnessEntryValue => ({
  title: entry.title,
  content: entry.content,
  ...(entry.path === undefined ? {} : { path: entry.path }),
  ...(entry.reference === undefined ? {} : { reference: entry.reference }),
  ...(entry.arguments === undefined ? {} : { arguments: entry.arguments }),
  ...(entry.metadata === undefined ? {} : { metadata: entry.metadata }),
  ...(entry.source === undefined ? {} : { source: entry.source }),
})

/** @experimental Project one entry back to its audit revision. */
export const revision = (entry: HarnessEntry): HarnessRevision => ({
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
  version: entry.version,
})

/** @experimental Add one entry that must not already exist. A pinned revision reconstructs an exact prior entry. */
export const CreateEdit = Schema.TaggedStruct("Create", {
  kind: HarnessKind,
  id: HarnessId,
  value: HarnessEntryValue,
  revision: Schema.optionalKey(HarnessRevision),
})
/** @experimental */
export type CreateEdit = typeof CreateEdit.Type

/** @experimental Replace the authored value of one existing entry. A pinned revision reconstructs an exact prior entry. */
export const UpdateEdit = Schema.TaggedStruct("Update", {
  kind: HarnessKind,
  id: HarnessId,
  value: HarnessEntryValue,
  baseVersion: Schema.optionalKey(HarnessVersion),
  revision: Schema.optionalKey(HarnessRevision),
})
/** @experimental */
export type UpdateEdit = typeof UpdateEdit.Type

/** @experimental Remove one existing entry. */
export const DeleteEdit = Schema.TaggedStruct("Delete", {
  kind: HarnessKind,
  id: HarnessId,
  baseVersion: Schema.optionalKey(HarnessVersion),
})
/** @experimental */
export type DeleteEdit = typeof DeleteEdit.Type

/** @experimental One requested change to the harness. */
export const RefinementEdit = Schema.Union([CreateEdit, UpdateEdit, DeleteEdit])
/** @experimental */
export type RefinementEdit = typeof RefinementEdit.Type

/**
 * @experimental One create edit an untrusted author may request. `revision` is absent from the contract, so
 * untrusted input cannot choose an entry's createdAt, updatedAt, or version.
 */
export const AuthoredCreateEdit = Schema.TaggedStruct("Create", {
  kind: HarnessKind,
  id: HarnessId,
  value: HarnessEntryValue,
})
/** @experimental */
export type AuthoredCreateEdit = typeof AuthoredCreateEdit.Type

/** @experimental One update edit an untrusted author may request, without any pinned revision. */
export const AuthoredUpdateEdit = Schema.TaggedStruct("Update", {
  kind: HarnessKind,
  id: HarnessId,
  value: HarnessEntryValue,
  baseVersion: Schema.optionalKey(HarnessVersion),
})
/** @experimental */
export type AuthoredUpdateEdit = typeof AuthoredUpdateEdit.Type

/** @experimental One change an untrusted author may request. */
export const AuthoredEdit = Schema.Union([AuthoredCreateEdit, AuthoredUpdateEdit, DeleteEdit])
/** @experimental */
export type AuthoredEdit = typeof AuthoredEdit.Type

const proposalFields = {
  id: HarnessId,
  at: HarnessInstant,
  rationale: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(CONTENT_MAX))),
  source: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(TEXT_MAX))),
  baseSnapshot: Schema.optionalKey(HarnessSnapshotId),
}

/** @experimental An atomic set of requested changes with optional baseline pinning. */
export const RefinementProposal = Schema.Struct({
  ...proposalFields,
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
 * The brand is unforgeable by construction: `Authorship.authorProposal` is the only thing that mints it, so the
 * apply seam can distinguish "an author asked for this" from "a caller assembled a proposal shape" at the type
 * level. Structural typing cannot make that distinction, because an edit carrying a `revision` is still
 * assignable to an authored edit.
 */
export type AuthoredRefinementProposal = Brand.Branded<AuthoredProposal, "@batonfx/harness/AuthoredRefinementProposal">

/** @experimental One applied change with its exact before and after entries. */
export const AppliedRefinementEdit = Schema.Struct({
  edit: RefinementEdit,
  before: Schema.optionalKey(HarnessEntry),
  after: Schema.optionalKey(HarnessEntry),
})
/** @experimental */
export type AppliedRefinementEdit = typeof AppliedRefinementEdit.Type

/** @experimental The durable record of one applied proposal. */
export const RefinementEvent = Schema.Struct({
  proposal: HarnessId,
  at: HarnessInstant,
  scope: HarnessScope,
  rationale: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(CONTENT_MAX))),
  source: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(TEXT_MAX))),
  before: HarnessSnapshotId,
  after: HarnessSnapshotId,
  applied: Schema.Array(AppliedRefinementEdit).check(Schema.isNonEmpty()),
})
/** @experimental */
export type RefinementEvent = typeof RefinementEvent.Type

/** @experimental Exact identity of one edit target within a state. */
export const editKey = (edit: RefinementEdit): string => `${edit.kind}/${edit.id}`
