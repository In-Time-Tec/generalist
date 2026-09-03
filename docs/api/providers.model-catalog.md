[**generalist**](./index)

***

[generalist](./index) / providers.model-catalog

# providers.model-catalog

## Classes

### ModelCatalog

#### Extends

- `ModelCatalog_base`

#### Constructors

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

### NotFound

#### Extends

- `NotFound_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`NotFound_base.hint`

##### model

> `readonly` **model**: `string`

###### Inherited from

`NotFound_base.model`

##### provider

> `readonly` **provider**: `string`

###### Inherited from

`NotFound_base.provider`

## Interfaces

### Metadata

#### Properties

##### contextWindow

> `readonly` **contextWindow**: `number`

##### logprobs

> `readonly` **logprobs**: `boolean`

Whether Generalist's provider adapter preserves output token log probabilities.

##### maxOutput

> `readonly` **maxOutput**: `number`

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

##### modalities?

> `readonly` `optional` **modalities?**: readonly (`"text"` \| `"image"` \| `"audio"`)[]

##### model

> `readonly` **model**: `string`

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

##### provider

> `readonly` **provider**: `string`

***

### Selection

#### Properties

##### model

> `readonly` **model**: `string`

##### provider

> `readonly` **provider**: `string`

***

### Service

#### Properties

##### contextWindow

> `readonly` **contextWindow**: (`selection`) => `Effect`\<`Option`\<`number`\>\>

###### Parameters

###### selection

[`Selection`](#selection)

###### Returns

`Effect`\<`Option`\<`number`\>\>

##### cost

> `readonly` **cost**: (`selection`, `usage`) => `Effect`\<`Option`\<`number`\>\>

###### Parameters

###### selection

[`Selection`](#selection)

###### usage

`Usage`

###### Returns

`Effect`\<`Option`\<`number`\>\>

##### find

> `readonly` **find**: (`selection`) => `Effect`\<[`Metadata`](#metadata) \| `undefined`\>

###### Parameters

###### selection

[`Selection`](#selection)

###### Returns

`Effect`\<[`Metadata`](#metadata) \| `undefined`\>

##### get

> `readonly` **get**: (`selection`) => `Effect`\<[`Metadata`](#metadata), [`NotFound`](#notfound)\>

###### Parameters

###### selection

[`Selection`](#selection)

###### Returns

`Effect`\<[`Metadata`](#metadata), [`NotFound`](#notfound)\>

##### list

> `readonly` **list**: `Effect`\<readonly [`Metadata`](#metadata)[]\>

## Type Aliases

### Usd

> **Usd** = *typeof* `Usd.Type`

Non-negative US dollars computed from catalog prices.

## Variables

### bundled

> `const` **bundled**: `ReadonlyArray`\<[`Metadata`](#metadata)\>

Hand-maintained static metadata snapshot.

***

### conservativeContextWindow

> `const` **conservativeContextWindow**: `32768` = `32768`

Conservative context window used when model metadata is unavailable.

***

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

### layer

> `const` **layer**: (`overrides?`) => `Layer.Layer`\<[`ModelCatalog`](#modelcatalog)\>

#### Parameters

##### overrides?

`ReadonlyArray`\<[`Metadata`](#metadata)\>

#### Returns

`Layer.Layer`\<[`ModelCatalog`](#modelcatalog)\>

***

### layerTest

> `const` **layerTest**: (`entries`) => `Layer.Layer`\<[`ModelCatalog`](#modelcatalog)\>

#### Parameters

##### entries

`ReadonlyArray`\<[`Metadata`](#metadata)\>

#### Returns

`Layer.Layer`\<[`ModelCatalog`](#modelcatalog)\>

***

### list

> `const` **list**: () => `Effect.Effect`\<readonly [`Metadata`](#metadata)[], `never`, [`ModelCatalog`](#modelcatalog)\>

#### Returns

`Effect.Effect`\<readonly [`Metadata`](#metadata)[], `never`, [`ModelCatalog`](#modelcatalog)\>

***

### Usd

> `const` **Usd**: `Schema.Finite`

Non-negative US dollars computed from catalog prices.
