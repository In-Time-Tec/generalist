[**generalist**](../../index)

***

[generalist](../../index) / [memory](../index) / Supermemory

# Supermemory

## Classes

### SupermemoryError

Supermemory HTTP API failure.

#### Extends

- `SupermemoryError_base`

#### Constructors

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

##### body

> `readonly` **body**: `string`

###### Inherited from

`SupermemoryError_base.body`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SupermemoryError_base.hint`

##### status

> `readonly` **status**: `number`

###### Inherited from

`SupermemoryError_base.status`

## Interfaces

### Options

Hosted Supermemory configuration.

#### Properties

##### apiKey

> `readonly` **apiKey**: `Config`\<`Redacted`\<`string`\>\>

##### containerTag

> `readonly` **containerTag**: `string`

##### containerTagForKey?

> `readonly` `optional` **containerTagForKey?**: (`key`) => `string`

###### Parameters

###### key

[`Key`](../../generalist/namespaces/Memory#key-1)

###### Returns

`string`

##### endpoint?

> `readonly` `optional` **endpoint?**: `string`

##### limit?

> `readonly` `optional` **limit?**: `number`

##### threshold?

> `readonly` `optional` **threshold?**: `number`

## Variables

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`Memory`](../../generalist/namespaces/Memory#memory), `Config.ConfigError`, `HttpClient.HttpClient`\>

Hosted semantic Memory that uses Supermemory's embeddings and vector storage.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`Memory`](../../generalist/namespaces/Memory#memory), `Config.ConfigError`, `HttpClient.HttpClient`\>
