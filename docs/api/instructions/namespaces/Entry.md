[**generalist**](../../index)

***

[generalist](../../index) / [instructions](../index) / Entry

# Entry

## Type Aliases

### AppliedRefinementEdit

> **AppliedRefinementEdit** = *typeof* `AppliedRefinementEdit.Type`

One applied change with its exact before and after entries.

***

### AuthoredCreateEdit

> **AuthoredCreateEdit** = *typeof* `AuthoredCreateEdit.Type`

One create edit an untrusted author may request. `revision` is absent from the contract, so
untrusted input cannot choose an entry's createdAt, updatedAt, or version.

***

### AuthoredEdit

> **AuthoredEdit** = *typeof* `AuthoredEdit.Type`

One change an untrusted author may request.

***

### AuthoredProposal

> **AuthoredProposal** = *typeof* `AuthoredProposal.Type`

A proposal whose edits cannot carry a pinned revision. This is the only shape an untrusted author
may express, so a model-originated proposal can never forge an entry's audit trail.

***

### AuthoredRefinementProposal

> **AuthoredRefinementProposal** = `Brand.Branded`\<[`AuthoredProposal`](#authoredproposal), `"generalist/instructions/AuthoredRefinementProposal"`\>

One proposal that has passed untrusted authorship, carried as an opaque value.

The brand is unforgeable by construction: `Authorship.author` is the only thing that mints it, so the
apply seam can distinguish "an author asked for this" from "a caller assembled a proposal shape" at the type
level. Structural typing cannot make that distinction, because an edit carrying a `revision` is still
assignable to an authored edit.

***

### AuthoredUpdateEdit

> **AuthoredUpdateEdit** = *typeof* `AuthoredUpdateEdit.Type`

One update edit an untrusted author may request, without any pinned revision.

***

### CreateEdit

> **CreateEdit** = *typeof* `CreateEdit.Type`

Add one entry that must not already exist. A pinned revision reconstructs an exact prior entry.

***

### DeleteEdit

> **DeleteEdit** = *typeof* `DeleteEdit.Type`

Remove one existing entry.

***

### GuidanceEntry

> **GuidanceEntry** = *typeof* `GuidanceEntry.Type`

One versioned instruction entry.

***

### GuidanceEntryValue

> **GuidanceEntryValue** = *typeof* `GuidanceEntryValue.Type`

The authored value of one entry, independent of identity and revision.

***

### GuidanceId

> **GuidanceId** = *typeof* `GuidanceId.Type`

Bounded identifier of one guidance entry within its kind.

***

### GuidanceInstant

> **GuidanceInstant** = *typeof* `GuidanceInstant.Type`

Caller-supplied UTC ISO-8601 instant with millisecond precision.

***

### GuidanceKind

> **GuidanceKind** = *typeof* `GuidanceKind.Type`

The four versioned instruction entry kinds.

***

### GuidanceRevision

> **GuidanceRevision** = *typeof* `GuidanceRevision.Type`

The audit revision of one entry.

***

### GuidanceScope

> **GuidanceScope** = *typeof* `GuidanceScope.Type`

Host-chosen store partition one entry belongs to.

***

### GuidanceSnapshotId

> **GuidanceSnapshotId** = *typeof* `GuidanceSnapshotId.Type`

Content-addressed identity of one exact guidance state.

***

### GuidanceVersion

> **GuidanceVersion** = *typeof* `GuidanceVersion.Type`

Revision counter of one entry.

***

### RefinementEdit

> **RefinementEdit** = *typeof* `RefinementEdit.Type`

One requested change to the guidance.

***

### RefinementEvent

> **RefinementEvent** = *typeof* `RefinementEvent.Type`

The durable record of one applied proposal.

***

### RefinementProposal

> **RefinementProposal** = *typeof* `RefinementProposal.Type`

An atomic set of requested changes with optional baseline pinning.

***

### UpdateEdit

> **UpdateEdit** = *typeof* `UpdateEdit.Type`

Replace the authored value of one existing entry. A pinned revision reconstructs an exact prior entry.

## Variables

### AppliedRefinementEdit

> `const` **AppliedRefinementEdit**: `Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `edit`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; \}\>\]\>; \}\>

One applied change with its exact before and after entries.

***

### AuthoredCreateEdit

> `const` **AuthoredCreateEdit**: `Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>

One create edit an untrusted author may request. `revision` is absent from the contract, so
untrusted input cannot choose an entry's createdAt, updatedAt, or version.

***

### AuthoredEdit

> `const` **AuthoredEdit**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; \}\>\]\>

One change an untrusted author may request.

***

### AuthoredProposal

> `const` **AuthoredProposal**: `Schema.Struct`\<\{ `at`: `Schema.String`; `baseSnapshot`: `Schema.optionalKey`\<`Schema.String`\>; `edits`: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; \}\>\]\>\>; `id`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

A proposal whose edits cannot carry a pinned revision. This is the only shape an untrusted author
may express, so a model-originated proposal can never forge an entry's audit trail.

***

### AuthoredUpdateEdit

> `const` **AuthoredUpdateEdit**: `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>

One update edit an untrusted author may request, without any pinned revision.

***

### CreateEdit

> `const` **CreateEdit**: `Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>

Add one entry that must not already exist. A pinned revision reconstructs an exact prior entry.

***

### DeleteEdit

> `const` **DeleteEdit**: `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; \}\>

Remove one existing entry.

***

### editKey

> `const` **editKey**: (`edit`) => `string`

Exact identity of one edit target within a state.

#### Parameters

##### edit

[`RefinementEdit`](#refinementedit)

#### Returns

`string`

***

### GuidanceEntry

> `const` **GuidanceEntry**: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>

One versioned instruction entry.

***

### GuidanceEntryValue

> `const` **GuidanceEntryValue**: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>

The authored value of one entry, independent of identity and revision.

***

### GuidanceId

> `const` **GuidanceId**: `Schema.String`

Bounded identifier of one guidance entry within its kind.

***

### GuidanceInstant

> `const` **GuidanceInstant**: `Schema.String`

Caller-supplied UTC ISO-8601 instant with millisecond precision.

***

### GuidanceKind

> `const` **GuidanceKind**: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>

The four versioned instruction entry kinds.

***

### GuidanceRevision

> `const` **GuidanceRevision**: `Schema.Struct`\<\{ `createdAt`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>

The audit revision of one entry.

***

### GuidanceScope

> `const` **GuidanceScope**: `Schema.String`

Host-chosen store partition one entry belongs to.

***

### GuidanceSnapshotId

> `const` **GuidanceSnapshotId**: `Schema.String`

Content-addressed identity of one exact guidance state.

***

### GuidanceVersion

> `const` **GuidanceVersion**: `Schema.Int`

Revision counter of one entry.

***

### kinds

> `const` **kinds**: `ReadonlyArray`\<[`GuidanceKind`](#guidancekind)\>

Every guidance kind in canonical order.

***

### RefinementEdit

> `const` **RefinementEdit**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; \}\>\]\>

One requested change to the guidance.

***

### RefinementEvent

> `const` **RefinementEvent**: `Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `edit`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `revision`: `Schema.optionalKey`\<...\>; `value`: `Schema.Struct`\<...\>; \}\>, `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<...\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `revision`: `Schema.optionalKey`\<...\>; `value`: `Schema.Struct`\<...\>; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<...\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; \}\>\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

The durable record of one applied proposal.

***

### RefinementProposal

> `const` **RefinementProposal**: `Schema.Struct`\<\{ `at`: `Schema.String`; `baseSnapshot`: `Schema.optionalKey`\<`Schema.String`\>; `edits`: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; \}\>\]\>\>; `id`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `rollbackOf`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

An atomic set of requested changes with optional baseline pinning.

***

### revision

> `const` **revision**: (`entry`) => [`GuidanceRevision`](#guidancerevision)

Project one entry back to its audit revision.

#### Parameters

##### entry

[`GuidanceEntry`](#guidanceentry)

#### Returns

[`GuidanceRevision`](#guidancerevision)

***

### UpdateEdit

> `const` **UpdateEdit**: `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>

Replace the authored value of one existing entry. A pinned revision reconstructs an exact prior entry.

***

### value

> `const` **value**: (`entry`) => [`GuidanceEntryValue`](#guidanceentryvalue)

Project one entry back to its authored value.

#### Parameters

##### entry

[`GuidanceEntry`](#guidanceentry)

#### Returns

[`GuidanceEntryValue`](#guidanceentryvalue)
