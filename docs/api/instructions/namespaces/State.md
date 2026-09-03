[**generalist**](../../index)

***

[generalist](../../index) / [instructions](../index) / State

# State

## Type Aliases

<a id="guidanceentries"></a>

### GuidanceEntries

> **GuidanceEntries** = *typeof* `GuidanceEntries.Type`

Entries of one state grouped by kind and sorted by id.

***

<a id="guidancestate"></a>

### GuidanceState

> **GuidanceState** = *typeof* `GuidanceState.Type`

One complete versioned instruction state for one scope.

## Variables

<a id="allentries"></a>

### allEntries

> `const` **allEntries**: (`state`) => `ReadonlyArray`\<[`GuidanceEntry`](./Entry#guidanceentry)\>

Every entry of one state in canonical kind then id order.

#### Parameters

##### state

[`GuidanceState`](#guidancestate)

#### Returns

`ReadonlyArray`\<[`GuidanceEntry`](./Entry#guidanceentry)\>

***

<a id="empty"></a>

### empty

> `const` **empty**: (`scope`) => [`GuidanceState`](#guidancestate)

An empty state for one scope.

#### Parameters

##### scope

[`GuidanceScope`](./Entry#guidancescope)

#### Returns

[`GuidanceState`](#guidancestate)

***

<a id="findentry"></a>

### findEntry

> `const` **findEntry**: \{(`kind`, `id`): (`state`) => \{ `arguments?`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata?`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path?`: `Schema.optionalKey`\<`Schema.String`\>; `reference?`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source?`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \} \| `undefined`; (`state`, `kind`, `id`): \{ `arguments?`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata?`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path?`: `Schema.optionalKey`\<`Schema.String`\>; `reference?`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source?`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \} \| `undefined`; \}

The entry of one kind and id, when present.

#### Call Signature

> (`kind`, `id`): (`state`) => \{ `arguments?`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata?`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path?`: `Schema.optionalKey`\<`Schema.String`\>; `reference?`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source?`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \} \| `undefined`

##### Parameters

###### kind

`"prompt"` \| `"memory"` \| `"skill"` \| `"subagent"`

###### id

`string`

##### Returns

(`state`) => \{ `arguments?`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata?`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path?`: `Schema.optionalKey`\<`Schema.String`\>; `reference?`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source?`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \} \| `undefined`

#### Call Signature

> (`state`, `kind`, `id`): \{ `arguments?`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata?`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path?`: `Schema.optionalKey`\<`Schema.String`\>; `reference?`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source?`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \} \| `undefined`

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

###### kind

`"prompt"` \| `"memory"` \| `"skill"` \| `"subagent"`

###### id

`string`

##### Returns

\{ `arguments?`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata?`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path?`: `Schema.optionalKey`\<`Schema.String`\>; `reference?`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source?`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \} \| `undefined`

***

<a id="guidanceentries-1"></a>

### GuidanceEntries

> `const` **GuidanceEntries**: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>

Entries of one state grouped by kind and sorted by id.

***

<a id="guidancestate-1"></a>

### GuidanceState

> `const` **GuidanceState**: `Schema.Struct`\<\{ `entries`: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>; `refinements`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `edit`: `Schema.Union`\<readonly \[..., ..., ...\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `schemaVersion`: `Schema.Literal`\<`"1"`\>; `scope`: `Schema.String`; \}\>

One complete versioned instruction state for one scope.

***

<a id="make"></a>

### make

> `const` **make**: (`input`) => [`GuidanceState`](#guidancestate)

Build one state from unordered entries and refinements.

#### Parameters

##### input

###### entries?

`ReadonlyArray`\<[`GuidanceEntry`](./Entry#guidanceentry)\>

###### refinements?

`ReadonlyArray`\<[`RefinementEvent`](./Entry#refinementevent)\>

###### scope

[`GuidanceScope`](./Entry#guidancescope)

#### Returns

[`GuidanceState`](#guidancestate)

***

<a id="merge"></a>

### merge

> `const` **merge**: \{(`inner`): (`outer`) => `object`; (`outer`, `inner`): `object`; \}

Overlay one inner scope on one outer scope. An inner entry wins over an outer entry of the same
kind and id; every surviving entry keeps the scope that authored it.

#### Call Signature

> (`inner`): (`outer`) => `object`

##### Parameters

###### inner

###### entries

`Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>

###### refinements

`Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `edit`: `Schema.Union`\<readonly \[..., ..., ...\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>

###### schemaVersion

`Schema.Literal`\<`"1"`\>

###### scope

`Schema.String`

##### Returns

(`outer`) => `object`

#### Call Signature

> (`outer`, `inner`): `object`

##### Parameters

###### outer

###### entries

`Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>

###### refinements

`Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `edit`: `Schema.Union`\<readonly \[..., ..., ...\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>

###### schemaVersion

`Schema.Literal`\<`"1"`\>

###### scope

`Schema.String`

###### inner

###### entries

`Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>

###### refinements

`Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `edit`: `Schema.Union`\<readonly \[..., ..., ...\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>

###### schemaVersion

`Schema.Literal`\<`"1"`\>

###### scope

`Schema.String`

##### Returns

`object`

###### entries

> `readonly` **entries**: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>

###### refinements

> `readonly` **refinements**: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `edit`: `Schema.Union`\<readonly \[..., ..., ...\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>

###### schemaVersion

> `readonly` **schemaVersion**: `Schema.Literal`\<`"1"`\>

###### scope

> `readonly` **scope**: `Schema.String`

***

<a id="snapshotid"></a>

### snapshotId

> `const` **snapshotId**: (`state`) => [`GuidanceSnapshotId`](./Entry#guidancesnapshotid)

Content-addressed identity of one exact state, independent of refinement history.

#### Parameters

##### state

[`GuidanceState`](#guidancestate)

#### Returns

[`GuidanceSnapshotId`](./Entry#guidancesnapshotid)

***

<a id="withentries"></a>

### withEntries

> `const` **withEntries**: \{(`kind`, `entries`): (`state`) => `object`; (`state`, `kind`, `entries`): `object`; \}

Replace the entries of one kind, keeping canonical order.

#### Call Signature

> (`kind`, `entries`): (`state`) => `object`

##### Parameters

###### kind

`"prompt"` \| `"memory"` \| `"skill"` \| `"subagent"`

###### entries

readonly `object`[]

##### Returns

(`state`) => `object`

#### Call Signature

> (`state`, `kind`, `entries`): `object`

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

###### kind

`"prompt"` \| `"memory"` \| `"skill"` \| `"subagent"`

###### entries

readonly `object`[]

##### Returns

`object`

###### entries

> `readonly` **entries**: `Schema.Struct`\<\{ `memory`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `prompt`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `skill`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; `subagent`: `Schema.$Array`\<`Schema.Struct`\<\{ `arguments`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `content`: `Schema.String`; `createdAt`: `Schema.String`; `id`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"prompt"`, `"memory"`, `"skill"`, `"subagent"`\]\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; `reference`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; `title`: `Schema.String`; `updatedAt`: `Schema.String`; `version`: `Schema.Int`; \}\>\>; \}\>

###### refinements

> `readonly` **refinements**: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.String`; `applied`: `Schema.$Array`\<`Schema.Struct`\<\{ `after`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `before`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `arguments`: ...; `content`: ...; `createdAt`: ...; `id`: ...; `kind`: ...; `metadata`: ...; `path`: ...; `reference`: ...; `scope`: ...; `source`: ...; `title`: ...; `updatedAt`: ...; `version`: ...; \}\>\>; `edit`: `Schema.Union`\<readonly \[..., ..., ...\]\>; \}\>\>; `at`: `Schema.String`; `before`: `Schema.String`; `proposal`: `Schema.String`; `rationale`: `Schema.optionalKey`\<`Schema.String`\>; `scope`: `Schema.String`; `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>

###### schemaVersion

> `readonly` **schemaVersion**: `Schema.Literal`\<`"1"`\>

###### scope

> `readonly` **scope**: `Schema.String`
