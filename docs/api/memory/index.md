[**generalist**](../index)

***

[generalist](../index) / memory

# memory

## Namespaces

- [SemanticRecall](./namespaces/SemanticRecall)
- [Supermemory](./namespaces/Supermemory)
- [VectorStore](./namespaces/VectorStore)
- [WorkingMemory](./namespaces/WorkingMemory)

## Interfaces

<a id="options"></a>

### Options

#### Properties

<a id="semantic"></a>

##### semantic?

> `readonly` `optional` **semantic?**: [`Options`](./namespaces/SemanticRecall#options)

<a id="working"></a>

##### working?

> `readonly` `optional` **working?**: [`Options`](./namespaces/WorkingMemory#options)

***

<a id="pgvectoroptions"></a>

### PgVectorOptions

PostgreSQL pgvector storage configuration.

#### Properties

<a id="dimensions"></a>

##### dimensions

> `readonly` **dimensions**: `number`

<a id="table"></a>

##### table

> `readonly` **table**: `string`

## Type Aliases

<a id="workingrequirement"></a>

### WorkingRequirement

> **WorkingRequirement**\<`O`\> = `O` *extends* `object` ? \[`Extract`\<`W`, [`Options`](./namespaces/WorkingMemory#options)\>\] *extends* \[`never`\] ? `never` : [`SummaryRequirement`](./namespaces/WorkingMemory#summaryrequirement)\<`Extract`\<`W`, [`Options`](./namespaces/WorkingMemory#options)\>\> : `never`

**`Internal`**

The ambient LanguageModel is required only when working memory summarizes without an explicit model layer.

#### Type Parameters

##### O

`O`

## Variables

<a id="layerpgvector"></a>

### layerPgVector

> `const` **layerPgVector**: (`options`) => `Layer.Layer`\<[`VectorStore`](./namespaces/VectorStore#vectorstore), [`VectorStoreError`](./namespaces/VectorStore#vectorstoreerror), `SqlClient.SqlClient`\>

Persistent PostgreSQL vector store. Requires the `vector` extension.

#### Parameters

##### options

[`PgVectorOptions`](#pgvectoroptions)

#### Returns

`Layer.Layer`\<[`VectorStore`](./namespaces/VectorStore#vectorstore), [`VectorStoreError`](./namespaces/VectorStore#vectorstoreerror), `SqlClient.SqlClient`\>

## Functions

<a id="layer"></a>

### layer()

#### Call Signature

> **layer**(): `Layer`\<[`Memory`](../generalist/namespaces/Memory#memory), `never`, [`VectorStore`](./namespaces/VectorStore#vectorstore) \| `EmbeddingModel`\>

##### Returns

`Layer`\<[`Memory`](../generalist/namespaces/Memory#memory), `never`, [`VectorStore`](./namespaces/VectorStore#vectorstore) \| `EmbeddingModel`\>

#### Call Signature

> **layer**\<`O`\>(`options`): `Layer`\<[`Memory`](../generalist/namespaces/Memory#memory), `never`, [`VectorStore`](./namespaces/VectorStore#vectorstore) \| `EmbeddingModel` \| [`WorkingRequirement`](#workingrequirement)\<`O`\>\>

##### Type Parameters

###### O

`O` *extends* [`Options`](#options)

##### Parameters

###### options

`O`

##### Returns

`Layer`\<[`Memory`](../generalist/namespaces/Memory#memory), `never`, [`VectorStore`](./namespaces/VectorStore#vectorstore) \| `EmbeddingModel` \| [`WorkingRequirement`](#workingrequirement)\<`O`\>\>

## References

<a id="layersupermemory"></a>

### layerSupermemory

Renames and re-exports [layer](./namespaces/Supermemory#layer)

***

<a id="supermemoryerror"></a>

### SupermemoryError

Re-exports [SupermemoryError](./namespaces/Supermemory#supermemoryerror)

***

<a id="supermemoryoptions"></a>

### SupermemoryOptions

Renames and re-exports [Options](./namespaces/Supermemory#options)
