[**generalist**](../../index)

***

[generalist](../../index) / [instructions](../index) / Overview

# Overview

## Interfaces

### OverviewOptions

Bounds every prompt overview must respect.

#### Properties

##### maxContentLength?

> `readonly` `optional` **maxContentLength?**: `number`

##### maxEntriesPerKind?

> `readonly` `optional` **maxEntriesPerKind?**: `number`

##### maxRefinements?

> `readonly` `optional` **maxRefinements?**: `number`

##### maxTitleLength?

> `readonly` `optional` **maxTitleLength?**: `number`

## Variables

### defaults

> `const` **defaults**: `object`

Default overview bounds.

#### Type Declaration

##### maxContentLength

> `readonly` **maxContentLength**: `240`

##### maxEntriesPerKind

> `readonly` **maxEntriesPerKind**: `8`

##### maxRefinements

> `readonly` **maxRefinements**: `5`

##### maxTitleLength

> `readonly` **maxTitleLength**: `80`

***

### format

> `const` **format**: \{(`options?`): (`state`) => `string`; (`state`, `options?`): `string`; \}

Render one deterministic, bounded prompt overview of a guidance state. Output size depends only on
the supplied bounds, never on how many entries or refinements the state holds.

#### Call Signature

> (`options?`): (`state`) => `string`

##### Parameters

###### options?

[`OverviewOptions`](#overviewoptions)

##### Returns

(`state`) => `string`

#### Call Signature

> (`state`, `options?`): `string`

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

###### options?

[`OverviewOptions`](#overviewoptions)

##### Returns

`string`
