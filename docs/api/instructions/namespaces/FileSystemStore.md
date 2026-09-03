[**generalist**](../../index)

***

[generalist](../../index) / [instructions](../index) / FileSystemStore

# FileSystemStore

## Interfaces

### Options

Where one scope's state is stored. The host owns every location decision.

#### Properties

##### path

> `readonly` **path**: (`scope`) => `string`

###### Parameters

###### scope

`string`

###### Returns

`string`

## Variables

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`Store`](./Store#store), `never`, `FileSystem.FileSystem` \| `Path.Path`\>

One durable filesystem-backed guidance store.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`Store`](./Store#store), `never`, `FileSystem.FileSystem` \| `Path.Path`\>

***

### make

> `const` **make**: (`options`) => `Effect.Effect`\<[`Service`](./Store#service), `never`, `FileSystem.FileSystem` \| `Path.Path`\>

Build one durable store over the Effect filesystem. Writes are owner-only and land through a
same-directory temporary file plus rename, so a reader never observes a partial state. A corrupt file fails typed
instead of resetting the scope, and concurrent saves of one scope are serialized.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Effect.Effect`\<[`Service`](./Store#service), `never`, `FileSystem.FileSystem` \| `Path.Path`\>
