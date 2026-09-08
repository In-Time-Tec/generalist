[**generalist**](../../index.md)

***

[generalist](../../index.md) / [generalist](../index.md) / ToolManifest

# ToolManifest

## Interfaces

<a id="pinnedtool"></a>

### PinnedTool

#### Properties

<a id="manifest"></a>

##### manifest

> `readonly` **manifest**: `object`

###### failure

> `readonly` **failure**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### input

> `readonly` **input**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### name

> `readonly` **name**: `string`

###### output

> `readonly` **output**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### policy?

> `readonly` `optional` **policy?**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### replay

> `readonly` **replay**: `"provider-idempotent"` \| `"never"`

###### tool

> `readonly` **tool**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### version

> `readonly` **version**: `"1"`

<a id="pin"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/tool-pin"`\>

## Type Aliases

<a id="toolmanifest"></a>

### ToolManifest

> **ToolManifest** = *typeof* `ToolManifest.Type`

## Variables

<a id="make"></a>

### make

> `const` **make**: (`input`) => [`PinnedTool`](#pinnedtool)

#### Parameters

##### input

`Omit`\<[`ToolManifest`](#toolmanifest), `"version"`\> & `object`

#### Returns

[`PinnedTool`](#pinnedtool)

***

<a id="toolmanifest-1"></a>

### ToolManifest

> `const` **ToolManifest**: `Schema.Struct`\<\{ `failure`: `Schema.brand`\<`Schema.String`, `"generalist/capability-pin"`\>; `input`: `Schema.brand`\<`Schema.String`, `"generalist/capability-pin"`\>; `name`: `Schema.String`; `output`: `Schema.brand`\<`Schema.String`, `"generalist/capability-pin"`\>; `policy`: `Schema.optionalKey`\<`Schema.brand`\<`Schema.String`, `"generalist/capability-pin"`\>\>; `replay`: `Schema.Literals`\<readonly \[`"never"`, `"provider-idempotent"`\]\>; `tool`: `Schema.brand`\<`Schema.String`, `"generalist/capability-pin"`\>; `version`: `Schema.Literal`\<`"1"`\>; \}\>
