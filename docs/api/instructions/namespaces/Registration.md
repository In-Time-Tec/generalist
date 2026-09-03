[**generalist**](../../index)

***

[generalist](../../index) / [instructions](../index) / Registration

# Registration

## Interfaces

<a id="pinnedregistration"></a>

### PinnedRegistration

One named capability and the exact secret-free payload that reconstructs its pinned snapshot.

#### Properties

<a id="capability"></a>

##### capability

> `readonly` **capability**: [`NamedCapability`](../../generalist/namespaces/AgentManifest#namedcapability)

<a id="id"></a>

##### id

> `readonly` **id**: `string`

<a id="payload"></a>

##### payload

> `readonly` **payload**: `object`

###### entries

> `readonly` **entries**: readonly `object`[]

###### schemaVersion

> `readonly` **schemaVersion**: `"1"`

###### scope

> `readonly` **scope**: `string`

## Variables

<a id="make"></a>

### make

> `const` **make**: \{(`name`): (`state`) => [`PinnedRegistration`](#pinnedregistration); (`state`, `name`): [`PinnedRegistration`](#pinnedregistration); \}

Pin one exact guidance state as a named capability of an Agent manifest and the registration payload
a durable host must supply for every Execution of that manifest.

#### Call Signature

> (`name`): (`state`) => [`PinnedRegistration`](#pinnedregistration)

##### Parameters

###### name

`string`

##### Returns

(`state`) => [`PinnedRegistration`](#pinnedregistration)

#### Call Signature

> (`state`, `name`): [`PinnedRegistration`](#pinnedregistration)

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

###### name

`string`

##### Returns

[`PinnedRegistration`](#pinnedregistration)
