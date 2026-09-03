[**generalist**](../../index)

***

[generalist](../../index) / [instructions](../index) / Snapshot

# Snapshot

## Classes

<a id="snapshotinvalid"></a>

### SnapshotInvalid

A pinned snapshot payload is not a valid guidance state.

#### Extends

- `SnapshotInvalid_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new SnapshotInvalid**(...`args`): [`SnapshotInvalid`](#snapshotinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SnapshotInvalid`](#snapshotinvalid)

###### Inherited from

`SnapshotInvalid_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SnapshotInvalid_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`SnapshotInvalid_base.message`

***

<a id="snapshotmismatch"></a>

### SnapshotMismatch

A pinned snapshot payload does not reconstruct the snapshot it claims.

#### Extends

- `SnapshotMismatch_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new SnapshotMismatch**(...`args`): [`SnapshotMismatch`](#snapshotmismatch)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SnapshotMismatch`](#snapshotmismatch)

###### Inherited from

`SnapshotMismatch_base.constructor`

#### Properties

<a id="actual"></a>

##### actual

> `readonly` **actual**: `string`

###### Inherited from

`SnapshotMismatch_base.actual`

<a id="expected"></a>

##### expected

> `readonly` **expected**: `string`

###### Inherited from

`SnapshotMismatch_base.expected`

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SnapshotMismatch_base.hint`

## Type Aliases

<a id="guidancesnapshot"></a>

### GuidanceSnapshot

> **GuidanceSnapshot** = *typeof* `GuidanceSnapshot.Type`

One content-addressed guidance snapshot and the payload that reconstructs it.

***

<a id="snapshotpayload"></a>

### SnapshotPayload

> **SnapshotPayload** = *typeof* `SnapshotPayload.Type`

The exact secret-free payload a durable host pins into an executable registration. Entries are the
complete state; refinement history is deliberately excluded because it is audit data, not executable identity.

## Variables

<a id="codec"></a>

### codec

> `const` **codec**: `"generalist/instructions/snapshot"` = `"generalist/instructions/snapshot"`

Codec name a durable host records alongside a pinned guidance snapshot.

***

<a id="decode"></a>

### decode

> `const` **decode**: \{(`payload`): (`id`) => `Effect`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<...\>; `before`: `Schema.optionalKey`\<...\>; `edit`: `Schema.Union`\<...\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}, [`SnapshotMismatch`](#snapshotmismatch) \| [`SnapshotInvalid`](#snapshotinvalid)\>; (`id`, `payload`): `Effect`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `edit`: `Schema.Union`\<readonly ...\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}, [`SnapshotMismatch`](#snapshotmismatch) \| [`SnapshotInvalid`](#snapshotinvalid)\>; \}

Reconstruct the exact state one pinned snapshot identifies.

#### Call Signature

> (`payload`): (`id`) => `Effect`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<...\>; `before`: `Schema.optionalKey`\<...\>; `edit`: `Schema.Union`\<...\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}, [`SnapshotMismatch`](#snapshotmismatch) \| [`SnapshotInvalid`](#snapshotinvalid)\>

##### Parameters

###### payload

###### entries

`Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>

###### schemaVersion

`Schema.Literal`\<`"1"`\>

###### scope

`Schema.String`

##### Returns

(`id`) => `Effect`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<...\>; `before`: `Schema.optionalKey`\<...\>; `edit`: `Schema.Union`\<...\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}, [`SnapshotMismatch`](#snapshotmismatch) \| [`SnapshotInvalid`](#snapshotinvalid)\>

#### Call Signature

> (`id`, `payload`): `Effect`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `edit`: `Schema.Union`\<readonly ...\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}, [`SnapshotMismatch`](#snapshotmismatch) \| [`SnapshotInvalid`](#snapshotinvalid)\>

##### Parameters

###### id

`string`

###### payload

###### entries

`Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>

###### schemaVersion

`Schema.Literal`\<`"1"`\>

###### scope

`Schema.String`

##### Returns

`Effect`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<..., ..., ..., ...\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `edit`: `Schema.Union`\<readonly ...\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}, [`SnapshotMismatch`](#snapshotmismatch) \| [`SnapshotInvalid`](#snapshotinvalid)\>

***

<a id="encode"></a>

### encode

> `const` **encode**: (`state`) => *typeof* `SnapshotPayload.Encoded`

Encode one snapshot payload as the closed JSON a registration carries.

#### Parameters

##### state

[`GuidanceState`](./State#guidancestate)

#### Returns

*typeof* `SnapshotPayload.Encoded`

***

<a id="guidancesnapshot-1"></a>

### GuidanceSnapshot

> `const` **GuidanceSnapshot**: `Schema.Struct`\<\{ `id`: `Schema.String`; `payload`: `Schema.Struct`\<\{ `entries`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>; \}\>

One content-addressed guidance snapshot and the payload that reconstructs it.

***

<a id="make"></a>

### make

> `const` **make**: (`state`) => [`GuidanceSnapshot`](#guidancesnapshot)

Pin one exact state as a content-addressed snapshot.

#### Parameters

##### state

[`GuidanceState`](./State#guidancestate)

#### Returns

[`GuidanceSnapshot`](#guidancesnapshot)

***

<a id="snapshotpayload-1"></a>

### SnapshotPayload

> `const` **SnapshotPayload**: `Schema.Struct`\<\{ `entries`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>

The exact secret-free payload a durable host pins into an executable registration. Entries are the
complete state; refinement history is deliberately excluded because it is audit data, not executable identity.

***

<a id="version"></a>

### version

> `const` **version**: `"1"` = `"1"`

Payload version a durable host records alongside a pinned guidance snapshot.
