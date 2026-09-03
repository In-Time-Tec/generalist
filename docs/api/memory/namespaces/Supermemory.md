[**generalist**](../../index)

***

[generalist](../../index) / [memory](../index) / Supermemory

# Supermemory

## Classes

<a id="supermemoryerror"></a>

### SupermemoryError

Supermemory HTTP API failure.

#### Extends

- `SupermemoryError_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new SupermemoryError**(...`args`): [`SupermemoryError`](#supermemoryerror)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SupermemoryError`](#supermemoryerror)

###### Inherited from

`SupermemoryError_base.constructor`

#### Properties

<a id="body"></a>

##### body

> `readonly` **body**: `string`

###### Inherited from

`SupermemoryError_base.body`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SupermemoryError_base.hint`

<a id="status"></a>

##### status

> `readonly` **status**: `number`

###### Inherited from

`SupermemoryError_base.status`

## Interfaces

<a id="options"></a>

### Options

Hosted Supermemory configuration.

#### Properties

<a id="apikey"></a>

##### apiKey

> `readonly` **apiKey**: `Config`\<`Redacted`\<`string`\>\>

<a id="containertag"></a>

##### containerTag

> `readonly` **containerTag**: `string`

<a id="containertagforkey"></a>

##### containerTagForKey?

> `readonly` `optional` **containerTagForKey?**: (`key`) => `string`

###### Parameters

###### key

[`Key`](../../generalist/namespaces/Memory#key-1)

###### Returns

`string`

<a id="endpoint"></a>

##### endpoint?

> `readonly` `optional` **endpoint?**: `string`

<a id="limit"></a>

##### limit?

> `readonly` `optional` **limit?**: `number`

<a id="threshold"></a>

##### threshold?

> `readonly` `optional` **threshold?**: `number`

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`Memory`](../../generalist/namespaces/Memory#memory), `Config.ConfigError`, `HttpClient.HttpClient`\>

Hosted semantic Memory that uses Supermemory's embeddings and vector storage.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`Memory`](../../generalist/namespaces/Memory#memory), `Config.ConfigError`, `HttpClient.HttpClient`\>
