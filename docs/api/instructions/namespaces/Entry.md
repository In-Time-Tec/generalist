[**generalist**](../../index)

***

[generalist](../../index) / [instructions](../index) / Entry

# Entry

## Type Aliases

<a id="appliedrefinementedit"></a>

### AppliedRefinementEdit

> **AppliedRefinementEdit** = *typeof* `AppliedRefinementEdit.Type`

One applied change with its exact before and after entries.

***

<a id="authoredcreateedit"></a>

### AuthoredCreateEdit

> **AuthoredCreateEdit** = *typeof* `AuthoredCreateEdit.Type`

One create edit an untrusted author may request. `revision` is absent from the contract, so
untrusted input cannot choose an entry's createdAt, updatedAt, or version.

***

<a id="authorededit"></a>

### AuthoredEdit

> **AuthoredEdit** = *typeof* `AuthoredEdit.Type`

One change an untrusted author may request.

***

<a id="authoredproposal"></a>

### AuthoredProposal

> **AuthoredProposal** = *typeof* `AuthoredProposal.Type`

A proposal whose edits cannot carry a pinned revision. This is the only shape an untrusted author
may express, so a model-originated proposal can never forge an entry's audit trail.

***

<a id="authoredrefinementproposal"></a>

### AuthoredRefinementProposal

> **AuthoredRefinementProposal** = `Brand.Branded`\<[`AuthoredProposal`](#authoredproposal), `"generalist/instructions/AuthoredRefinementProposal"`\>

One proposal that has passed untrusted authorship, carried as an opaque value.

The brand is unforgeable by construction: `Authorship.author` is the only thing that mints it, so the
apply seam can distinguish "an author asked for this" from "a caller assembled a proposal shape" at the type
level. Structural typing cannot make that distinction, because an edit carrying a `revision` is still
assignable to an authored edit.

***

<a id="authoredupdateedit"></a>

### AuthoredUpdateEdit

> **AuthoredUpdateEdit** = *typeof* `AuthoredUpdateEdit.Type`

One update edit an untrusted author may request, without any pinned revision.

***

<a id="createedit"></a>

### CreateEdit

> **CreateEdit** = *typeof* `CreateEdit.Type`

Add one entry that must not already exist. A pinned revision reconstructs an exact prior entry.

***

<a id="deleteedit"></a>

### DeleteEdit

> **DeleteEdit** = *typeof* `DeleteEdit.Type`

Remove one existing entry.

***

<a id="guidanceentry"></a>

### GuidanceEntry

> **GuidanceEntry** = *typeof* `GuidanceEntry.Type`

One versioned instruction entry.

***

<a id="guidanceentryvalue"></a>

### GuidanceEntryValue

> **GuidanceEntryValue** = *typeof* `GuidanceEntryValue.Type`

The authored value of one entry, independent of identity and revision.

***

<a id="guidanceid"></a>

### GuidanceId

> **GuidanceId** = *typeof* `GuidanceId.Type`

Bounded identifier of one guidance entry within its kind.

***

<a id="guidanceinstant"></a>

### GuidanceInstant

> **GuidanceInstant** = *typeof* `GuidanceInstant.Type`

Caller-supplied UTC ISO-8601 instant with millisecond precision.

***

<a id="guidancekind"></a>

### GuidanceKind

> **GuidanceKind** = *typeof* `GuidanceKind.Type`

The four versioned instruction entry kinds.

***

<a id="guidancerevision"></a>

### GuidanceRevision

> **GuidanceRevision** = *typeof* `GuidanceRevision.Type`

The audit revision of one entry.

***

<a id="guidancescope"></a>

### GuidanceScope

> **GuidanceScope** = *typeof* `GuidanceScope.Type`

Host-chosen store partition one entry belongs to.

***

<a id="guidancesnapshotid"></a>

### GuidanceSnapshotId

> **GuidanceSnapshotId** = *typeof* `GuidanceSnapshotId.Type`

Content-addressed identity of one exact guidance state.

***

<a id="guidanceversion"></a>

### GuidanceVersion

> **GuidanceVersion** = *typeof* `GuidanceVersion.Type`

Revision counter of one entry.

***

<a id="refinementedit"></a>

### RefinementEdit

> **RefinementEdit** = *typeof* `RefinementEdit.Type`

One requested change to the guidance.

***

<a id="refinementevent"></a>

### RefinementEvent

> **RefinementEvent** = *typeof* `RefinementEvent.Type`

The durable record of one applied proposal.

***

<a id="refinementproposal"></a>

### RefinementProposal

> **RefinementProposal** = *typeof* `RefinementProposal.Type`

An atomic set of requested changes with optional baseline pinning.

***

<a id="updateedit"></a>

### UpdateEdit

> **UpdateEdit** = *typeof* `UpdateEdit.Type`

Replace the authored value of one existing entry. A pinned revision reconstructs an exact prior entry.

## Variables

<a id="appliedrefinementedit-1"></a>

### AppliedRefinementEdit

> `const` **AppliedRefinementEdit**: `Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `edit`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; \}\>\]\>; \}\>

One applied change with its exact before and after entries.

***

<a id="authoredcreateedit-1"></a>

### AuthoredCreateEdit

> `const` **AuthoredCreateEdit**: `Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>

One create edit an untrusted author may request. `revision` is absent from the contract, so
untrusted input cannot choose an entry's createdAt, updatedAt, or version.

***

<a id="authorededit-1"></a>

### AuthoredEdit

> `const` **AuthoredEdit**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; \}\>\]\>

One change an untrusted author may request.

***

<a id="authoredproposal-1"></a>

### AuthoredProposal

> `const` **AuthoredProposal**: `Schema.Struct`\<\{ `at`: `Schema.String`; `baseSnapshot`: `Schema.optionalKey`\<`Schema.String`\>; `edits`: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; \}\>\]\>\>; `id`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

A proposal whose edits cannot carry a pinned revision. This is the only shape an untrusted author
may express, so a model-originated proposal can never forge an entry's audit trail.

***

<a id="authoredupdateedit-1"></a>

### AuthoredUpdateEdit

> `const` **AuthoredUpdateEdit**: `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>

One update edit an untrusted author may request, without any pinned revision.

***

<a id="createedit-1"></a>

### CreateEdit

> `const` **CreateEdit**: `Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>

Add one entry that must not already exist. A pinned revision reconstructs an exact prior entry.

***

<a id="deleteedit-1"></a>

### DeleteEdit

> `const` **DeleteEdit**: `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; \}\>

Remove one existing entry.

***

<a id="editkey"></a>

### editKey

> `const` **editKey**: (`edit`) => `string`

Exact identity of one edit target within a state.

#### Parameters

##### edit

[`RefinementEdit`](#refinementedit)

#### Returns

`string`

***

<a id="guidanceentry-1"></a>

### GuidanceEntry

> `const` **GuidanceEntry**: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>

One versioned instruction entry.

***

<a id="guidanceentryvalue-1"></a>

### GuidanceEntryValue

> `const` **GuidanceEntryValue**: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>

The authored value of one entry, independent of identity and revision.

***

<a id="guidanceid-1"></a>

### GuidanceId

> `const` **GuidanceId**: `Schema.String`

Bounded identifier of one guidance entry within its kind.

***

<a id="guidanceinstant-1"></a>

### GuidanceInstant

> `const` **GuidanceInstant**: `Schema.String`

Caller-supplied UTC ISO-8601 instant with millisecond precision.

***

<a id="guidancekind-1"></a>

### GuidanceKind

> `const` **GuidanceKind**: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>

The four versioned instruction entry kinds.

***

<a id="guidancerevision-1"></a>

### GuidanceRevision

> `const` **GuidanceRevision**: `Schema.Struct`\<\{ `createdAt`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>

The audit revision of one entry.

***

<a id="guidancescope-1"></a>

### GuidanceScope

> `const` **GuidanceScope**: `Schema.String`

Host-chosen store partition one entry belongs to.

***

<a id="guidancesnapshotid-1"></a>

### GuidanceSnapshotId

> `const` **GuidanceSnapshotId**: `Schema.String`

Content-addressed identity of one exact guidance state.

***

<a id="guidanceversion-1"></a>

### GuidanceVersion

> `const` **GuidanceVersion**: `Schema.Int`

Revision counter of one entry.

***

<a id="kinds"></a>

### kinds

> `const` **kinds**: `ReadonlyArray`\<[`GuidanceKind`](#guidancekind)\>

Every guidance kind in canonical order.

***

<a id="refinementedit-1"></a>

### RefinementEdit

> `const` **RefinementEdit**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; \}\>\]\>

One requested change to the guidance.

***

<a id="refinementevent-1"></a>

### RefinementEvent

> `const` **RefinementEvent**: `Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `edit`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `revision`: `Schema.optionalKey`\<...\>; `value`: `Schema.Struct`\<...\>; \}\>, `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<...\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `revision`: `Schema.optionalKey`\<...\>; `value`: `Schema.Struct`\<...\>; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<...\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; \}\>\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

The durable record of one applied proposal.

***

<a id="refinementproposal-1"></a>

### RefinementProposal

> `const` **RefinementProposal**: `Schema.Struct`\<\{ `at`: `Schema.String`; `baseSnapshot`: `Schema.optionalKey`\<`Schema.String`\>; `edits`: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; \}\>\]\>\>; `id`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `rollbackOf`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

An atomic set of requested changes with optional baseline pinning.

***

<a id="revision"></a>

### revision

> `const` **revision**: (`entry`) => [`GuidanceRevision`](#guidancerevision)

Project one entry back to its audit revision.

#### Parameters

##### entry

[`GuidanceEntry`](#guidanceentry)

#### Returns

[`GuidanceRevision`](#guidancerevision)

***

<a id="updateedit-1"></a>

### UpdateEdit

> `const` **UpdateEdit**: `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; \}\>; \}\>

Replace the authored value of one existing entry. A pinned revision reconstructs an exact prior entry.

***

<a id="value"></a>

### value

> `const` **value**: (`entry`) => [`GuidanceEntryValue`](#guidanceentryvalue)

Project one entry back to its authored value.

#### Parameters

##### entry

[`GuidanceEntry`](#guidanceentry)

#### Returns

[`GuidanceEntryValue`](#guidanceentryvalue)
