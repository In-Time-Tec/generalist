[**generalist**](./index)

***

[generalist](./index) / providers.model-catalog

# providers.model-catalog

## Classes

<a id="modelcatalog"></a>

### ModelCatalog

#### Extends

- `ModelCatalog_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new ModelCatalog**(`_`): [`ModelCatalog`](#modelcatalog)

###### Parameters

###### \_

`never`

###### Returns

[`ModelCatalog`](#modelcatalog)

###### Inherited from

`ModelCatalog_base.constructor`

***

<a id="notfound"></a>

### NotFound

#### Extends

- `NotFound_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new NotFound**(...`args`): [`NotFound`](#notfound)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`NotFound`](#notfound)

###### Inherited from

`NotFound_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`NotFound_base.hint`

<a id="model"></a>

##### model

> `readonly` **model**: `string`

###### Inherited from

`NotFound_base.model`

<a id="provider"></a>

##### provider

> `readonly` **provider**: `string`

###### Inherited from

`NotFound_base.provider`

## Interfaces

<a id="metadata"></a>

### Metadata

#### Properties

<a id="contextwindow"></a>

##### contextWindow

> `readonly` **contextWindow**: `number`

<a id="logprobs"></a>

##### logprobs

> `readonly` **logprobs**: `boolean`

Whether Generalist's provider adapter preserves output token log probabilities.

<a id="maxoutput"></a>

##### maxOutput

> `readonly` **maxOutput**: `number`

<a id="media"></a>

##### media?

> `readonly` `optional` **media?**: `object`

**`Experimental`**

Provider media capabilities and preferred reference resolution.

###### input

> `readonly` **input**: readonly (`"image"` \| `"audio"` \| `"video"` \| `"pdf"`)[]

###### output?

> `readonly` `optional` **output?**: readonly (`"image"` \| `"audio"` \| `"video"` \| `"pdf"`)[]

###### preferredInput

> `readonly` **preferredInput**: `"bytes"` \| `"url"`

<a id="modalities"></a>

##### modalities?

> `readonly` `optional` **modalities?**: readonly (`"text"` \| `"image"` \| `"audio"`)[]

<a id="model-1"></a>

##### model

> `readonly` **model**: `string`

<a id="pricing"></a>

##### pricing?

> `readonly` `optional` **pricing?**: `object`

###### cacheReadPerMTok?

> `readonly` `optional` **cacheReadPerMTok?**: `number`

###### cacheWritePerMTok?

> `readonly` `optional` **cacheWritePerMTok?**: `number`

###### inputPerMTok?

> `readonly` `optional` **inputPerMTok?**: `number`

###### outputPerMTok?

> `readonly` `optional` **outputPerMTok?**: `number`

<a id="provider-1"></a>

##### provider

> `readonly` **provider**: `string`

***

<a id="selection"></a>

### Selection

#### Properties

<a id="model-2"></a>

##### model

> `readonly` **model**: `string`

<a id="provider-2"></a>

##### provider

> `readonly` **provider**: `string`

***

<a id="service"></a>

### Service

#### Properties

<a id="contextwindow-1"></a>

##### contextWindow

> `readonly` **contextWindow**: (`selection`) => `Effect`\<`Option`\<`number`\>\>

###### Parameters

###### selection

[`Selection`](#selection)

###### Returns

`Effect`\<`Option`\<`number`\>\>

<a id="cost"></a>

##### cost

> `readonly` **cost**: (`selection`, `usage`) => `Effect`\<`Option`\<`number`\>\>

###### Parameters

###### selection

[`Selection`](#selection)

###### usage

`Usage`

###### Returns

`Effect`\<`Option`\<`number`\>\>

<a id="find"></a>

##### find

> `readonly` **find**: (`selection`) => `Effect`\<[`Metadata`](#metadata) \| `undefined`\>

###### Parameters

###### selection

[`Selection`](#selection)

###### Returns

`Effect`\<[`Metadata`](#metadata) \| `undefined`\>

<a id="get"></a>

##### get

> `readonly` **get**: (`selection`) => `Effect`\<[`Metadata`](#metadata), [`NotFound`](#notfound)\>

###### Parameters

###### selection

[`Selection`](#selection)

###### Returns

`Effect`\<[`Metadata`](#metadata), [`NotFound`](#notfound)\>

<a id="list"></a>

##### list

> `readonly` **list**: `Effect`\<readonly [`Metadata`](#metadata)[]\>

## Type Aliases

<a id="usd"></a>

### Usd

> **Usd** = *typeof* `Usd.Type`

Non-negative US dollars computed from catalog prices.

## Variables

<a id="bundled"></a>

### bundled

> `const` **bundled**: `ReadonlyArray`\<[`Metadata`](#metadata)\>

Hand-maintained static metadata snapshot.

***

<a id="conservativecontextwindow"></a>

### conservativeContextWindow

> `const` **conservativeContextWindow**: `32768` = `32768`

Conservative context window used when model metadata is unavailable.

***

<a id="contextwindow-2"></a>

### contextWindow

> `const` **contextWindow**: (`selection`) => `Effect.Effect`\<`Option.Option`\<`number`\>, `never`, `never`\>

Resolve a model context window from the provided catalog or bundled snapshot.

#### Parameters

##### selection

###### model

`string`

###### provider

`string`

#### Returns

`Effect.Effect`\<`Option.Option`\<`number`\>, `never`, `never`\>

***

<a id="cost-1"></a>

### cost

> `const` **cost**: (`selection`, `usage`) => `Effect.Effect`\<`Option.Option`\<`number`\>, `never`, `never`\>

Compute catalog cost, using the bundled snapshot when no catalog service is provided.

#### Parameters

##### selection

[`Selection`](#selection)

##### usage

`Response.Usage`

#### Returns

`Effect.Effect`\<`Option.Option`\<`number`\>, `never`, `never`\>

***

<a id="find-1"></a>

### find

> `const` **find**: (`selection`) => `Effect.Effect`\<[`Metadata`](#metadata) \| `undefined`, `never`, [`ModelCatalog`](#modelcatalog)\>

#### Parameters

##### selection

###### model

`string`

###### provider

`string`

#### Returns

`Effect.Effect`\<[`Metadata`](#metadata) \| `undefined`, `never`, [`ModelCatalog`](#modelcatalog)\>

***

<a id="get-1"></a>

### get

> `const` **get**: (`selection`) => `Effect.Effect`\<[`Metadata`](#metadata), [`NotFound`](#notfound), [`ModelCatalog`](#modelcatalog)\>

#### Parameters

##### selection

###### model

`string`

###### provider

`string`

#### Returns

`Effect.Effect`\<[`Metadata`](#metadata), [`NotFound`](#notfound), [`ModelCatalog`](#modelcatalog)\>

***

<a id="layer"></a>

### layer

> `const` **layer**: (`overrides?`) => `Layer.Layer`\<[`ModelCatalog`](#modelcatalog)\>

#### Parameters

##### overrides?

`ReadonlyArray`\<[`Metadata`](#metadata)\>

#### Returns

`Layer.Layer`\<[`ModelCatalog`](#modelcatalog)\>

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`entries`) => `Layer.Layer`\<[`ModelCatalog`](#modelcatalog)\>

#### Parameters

##### entries

`ReadonlyArray`\<[`Metadata`](#metadata)\>

#### Returns

`Layer.Layer`\<[`ModelCatalog`](#modelcatalog)\>

***

<a id="list-1"></a>

### list

> `const` **list**: () => `Effect.Effect`\<readonly [`Metadata`](#metadata)[], `never`, [`ModelCatalog`](#modelcatalog)\>

#### Returns

`Effect.Effect`\<readonly [`Metadata`](#metadata)[], `never`, [`ModelCatalog`](#modelcatalog)\>

***

<a id="usd-1"></a>

### Usd

> `const` **Usd**: `Schema.Finite`

Non-negative US dollars computed from catalog prices.
