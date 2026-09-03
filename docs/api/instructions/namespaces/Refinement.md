[**generalist**](../../index)

***

[generalist](../../index) / [instructions](../index) / Refinement

# Refinement

## Classes

<a id="refinementrejected"></a>

### RefinementRejected

One proposal was rejected and no state changed.

#### Extends

- `RefinementRejected_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new RefinementRejected**(...`args`): [`RefinementRejected`](#refinementrejected)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`RefinementRejected`](#refinementrejected)

###### Inherited from

`RefinementRejected_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RefinementRejected_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`RefinementRejected_base.message`

<a id="proposal"></a>

##### proposal

> `readonly` **proposal**: `string`

###### Inherited from

`RefinementRejected_base.proposal`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `"pinned-revision"` \| `"baseline-drift"` \| `"create-existing"` \| `"delete-missing"` \| `"duplicate-target"` \| `"kind-capacity"` \| `"rollback-not-newest"` \| `"update-missing"` \| `"version-drift"`

###### Inherited from

`RefinementRejected_base.reason`

<a id="target"></a>

##### target?

> `readonly` `optional` **target?**: `string`

###### Inherited from

`RefinementRejected_base.target`

## Interfaces

<a id="applyoptions"></a>

### ApplyOptions

Bounds enforced while one proposal is applied.

#### Properties

<a id="maxentriesperkind"></a>

##### maxEntriesPerKind?

> `readonly` `optional` **maxEntriesPerKind?**: `number`

<a id="maxrefinements"></a>

##### maxRefinements?

> `readonly` `optional` **maxRefinements?**: `number`

***

<a id="rollbackoptions"></a>

### RollbackOptions

Identity of the inverse proposal of one applied refinement.

#### Properties

<a id="at"></a>

##### at

> `readonly` **at**: `string`

<a id="id"></a>

##### id

> `readonly` **id**: `string`

<a id="rationale"></a>

##### rationale?

> `readonly` `optional` **rationale?**: `string`

<a id="source"></a>

##### source?

> `readonly` `optional` **source?**: `string`

## Type Aliases

<a id="refinementrejection"></a>

### RefinementRejection

> **RefinementRejection** = *typeof* `RefinementRejection.Type`

Why one proposal cannot be applied to one state.

***

<a id="refinementresult"></a>

### RefinementResult

> **RefinementResult** = *typeof* `RefinementResult.Type`

The next state and the durable record of one applied proposal.

## Variables

<a id="apply"></a>

### apply

> `const` **apply**: \{(`proposal`, `options?`): (`state`) => `Result`\<\{ `event`: `Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `edit`: `Schema.Union`\<readonly ...\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `state`: `Schema.Struct`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<...\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>; \}, [`RefinementRejected`](#refinementrejected)\>; (`state`, `proposal`, `options?`): `Result`\<\{ `event`: `Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `edit`: `Schema.Union`\<readonly \[..., ..., ...\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `state`: `Schema.Struct`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: ...; `before`: ...; `edit`: ...; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>; \}, [`RefinementRejected`](#refinementrejected)\>; \}

Apply one authored proposal atomically, recording before and after entries for every edit.

The brand is a compile-time discriminator; the runtime authorization boundary is the pinned-revision check below.
A host that mounts this behind an `unknown` boundary gets that check even when a cast erased the brand. Revision
stays the engine's: a create lands at version 1 and an update bumps the entry it replaces.

#### Call Signature

> (`proposal`, `options?`): (`state`) => `Result`\<\{ `event`: `Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `edit`: `Schema.Union`\<readonly ...\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `state`: `Schema.Struct`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<...\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>; \}, [`RefinementRejected`](#refinementrejected)\>

##### Parameters

###### proposal

[`AuthoredRefinementProposal`](./Entry#authoredrefinementproposal)

###### options?

[`ApplyOptions`](#applyoptions)

##### Returns

(`state`) => `Result`\<\{ `event`: `Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `edit`: `Schema.Union`\<readonly ...\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `state`: `Schema.Struct`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<...\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>; \}, [`RefinementRejected`](#refinementrejected)\>

#### Call Signature

> (`state`, `proposal`, `options?`): `Result`\<\{ `event`: `Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `edit`: `Schema.Union`\<readonly \[..., ..., ...\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `state`: `Schema.Struct`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: ...; `before`: ...; `edit`: ...; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>; \}, [`RefinementRejected`](#refinementrejected)\>

##### Parameters

###### state

###### entries

`Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>

###### refinements

`Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `edit`: `Schema.Union`\<readonly \[..., ..., ...\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>

###### schemaVersion

`Schema.Literal`\<`"1"`\>

###### scope

`Schema.String`

###### proposal

[`AuthoredRefinementProposal`](./Entry#authoredrefinementproposal)

###### options?

[`ApplyOptions`](#applyoptions)

##### Returns

`Result`\<\{ `event`: `Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `edit`: `Schema.Union`\<readonly \[..., ..., ...\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `state`: `Schema.Struct`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: ...; `before`: ...; `edit`: ...; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>; \}, [`RefinementRejected`](#refinementrejected)\>

***

<a id="applytrusted"></a>

### applyTrusted

> `const` **applyTrusted**: \{(`proposal`, `options?`): (`state`) => `Result`\<\{ `event`: `Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `edit`: `Schema.Union`\<readonly ...\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `state`: `Schema.Struct`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<...\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>; \}, [`RefinementRejected`](#refinementrejected)\>; (`state`, `proposal`, `options?`): `Result`\<\{ `event`: `Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `edit`: `Schema.Union`\<readonly \[..., ..., ...\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `state`: `Schema.Struct`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: ...; `before`: ...; `edit`: ...; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>; \}, [`RefinementRejected`](#refinementrejected)\>; \}

Apply one proposal that may pin an exact revision, recording before and after entries for every edit.

This is the trusted route: a pinned `revision` chooses an entry's `createdAt`, `updatedAt`, and `version` outright.
Only a host that already owns the audit trail may use it, which is why rollback and restore name it explicitly while
every ordinary refinement goes through `apply`.

#### Call Signature

> (`proposal`, `options?`): (`state`) => `Result`\<\{ `event`: `Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `edit`: `Schema.Union`\<readonly ...\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `state`: `Schema.Struct`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<...\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>; \}, [`RefinementRejected`](#refinementrejected)\>

##### Parameters

###### proposal

###### at

`Schema.String`

###### baseSnapshot?

`Schema.optionalKey`\<`Schema.String`\>

###### edits

`Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; \}\>\]\>\>

###### id

`Schema.String`

###### rationale?

`Schema.optionalKey`\<`Schema.String`\>

###### rollbackOf?

`Schema.optionalKey`\<`Schema.String`\>

###### source?

`Schema.optionalKey`\<`Schema.String`\>

###### options?

[`ApplyOptions`](#applyoptions)

##### Returns

(`state`) => `Result`\<\{ `event`: `Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; `edit`: `Schema.Union`\<readonly ...\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `state`: `Schema.Struct`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<...\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>; \}, [`RefinementRejected`](#refinementrejected)\>

#### Call Signature

> (`state`, `proposal`, `options?`): `Result`\<\{ `event`: `Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `edit`: `Schema.Union`\<readonly \[..., ..., ...\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `state`: `Schema.Struct`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: ...; `before`: ...; `edit`: ...; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>; \}, [`RefinementRejected`](#refinementrejected)\>

##### Parameters

###### state

###### entries

`Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>

###### refinements

`Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `edit`: `Schema.Union`\<readonly \[..., ..., ...\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>

###### schemaVersion

`Schema.Literal`\<`"1"`\>

###### scope

`Schema.String`

###### proposal

###### at

`Schema.String`

###### baseSnapshot?

`Schema.optionalKey`\<`Schema.String`\>

###### edits

`Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; \}\>\]\>\>

###### id

`Schema.String`

###### rationale?

`Schema.optionalKey`\<`Schema.String`\>

###### rollbackOf?

`Schema.optionalKey`\<`Schema.String`\>

###### source?

`Schema.optionalKey`\<`Schema.String`\>

###### options?

[`ApplyOptions`](#applyoptions)

##### Returns

`Result`\<\{ `event`: `Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `edit`: `Schema.Union`\<readonly \[..., ..., ...\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `state`: `Schema.Struct`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: ...; `before`: ...; `edit`: ...; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>; \}, [`RefinementRejected`](#refinementrejected)\>

***

<a id="isauthored"></a>

### isAuthored

> `const` **isAuthored**: (`proposal`) => `boolean`

Whether every edit of one proposal leaves its revision to the engine.

#### Parameters

##### proposal

[`RefinementProposal`](./Entry#refinementproposal)

#### Returns

`boolean`

***

<a id="makerollback"></a>

### makeRollback

> `const` **makeRollback**: \{(`options`): (`result`) => `object`; (`result`, `options`): `object`; \}

Build the proposal that restores the exact entries one refinement replaced.

#### Call Signature

> (`options`): (`result`) => `object`

##### Parameters

###### options

[`RollbackOptions`](#rollbackoptions)

##### Returns

(`result`) => `object`

#### Call Signature

> (`result`, `options`): `object`

##### Parameters

###### result

###### event

`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `edit`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

###### state

`Schema.Struct`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<...\>; `before`: `Schema.optionalKey`\<...\>; `edit`: `Schema.Union`\<...\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>

###### options

[`RollbackOptions`](#rollbackoptions)

##### Returns

`object`

###### at

> `readonly` **at**: `Schema.String`

###### baseSnapshot?

> `readonly` `optional` **baseSnapshot?**: `Schema.optionalKey`\<`Schema.String`\>

###### edits

> `readonly` **edits**: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Create"`, \{ `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Update"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; `revision`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `createdAt`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `value`: `Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Delete"`, \{ `baseVersion`: `Schema.optionalKey`\<`Schema.Int`\>; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ..., ...\]\>; \}\>\]\>\>

###### id

> `readonly` **id**: `Schema.String`

###### rationale?

> `readonly` `optional` **rationale?**: `Schema.optionalKey`\<`Schema.String`\>

###### rollbackOf?

> `readonly` `optional` **rollbackOf?**: `Schema.optionalKey`\<`Schema.String`\>

###### source?

> `readonly` `optional` **source?**: `Schema.optionalKey`\<`Schema.String`\>

***

<a id="refinementrejection-1"></a>

### RefinementRejection

> `const` **RefinementRejection**: `Schema.Literals`\<readonly \[`"baseline-drift"`, `"create-existing"`, `"delete-missing"`, `"duplicate-target"`, `"kind-capacity"`, `"pinned-revision"`, `"rollback-not-newest"`, `"update-missing"`, `"version-drift"`\]\>

Why one proposal cannot be applied to one state.

***

<a id="refinementresult-1"></a>

### RefinementResult

> `const` **RefinementResult**: `Schema.Struct`\<\{ `event`: `Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<...\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `metadata`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; `reference`: `Schema.optionalKey`\<...\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<...\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `edit`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `state`: `Schema.Struct`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<..., ...\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<...\>; `before`: `Schema.optionalKey`\<...\>; `edit`: `Schema.Union`\<...\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>; \}\>

The next state and the durable record of one applied proposal.

***

<a id="rollbacktarget"></a>

### rollbackTarget

> `const` **rollbackTarget**: (`result`) => [`GuidanceSnapshotId`](./Entry#guidancesnapshotid)

The exact snapshot one rollback proposal restores.

#### Parameters

##### result

[`RefinementResult`](#refinementresult)

#### Returns

[`GuidanceSnapshotId`](./Entry#guidancesnapshotid)
