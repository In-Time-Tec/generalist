[**generalist**](../index.md)

***

[generalist](../index.md) / memory

# memory

## Namespaces

- [SemanticRecall](./namespaces/SemanticRecall.md)
- [Supermemory](./namespaces/Supermemory.md)
- [VectorStore](./namespaces/VectorStore.md)
- [WorkingMemory](./namespaces/WorkingMemory.md)

## Interfaces

<a id="options"></a>

### Options

#### Properties

<a id="semantic"></a>

##### semantic?

> `readonly` `optional` **semantic?**: [`Options`](./namespaces/SemanticRecall.md#options)

<a id="working"></a>

##### working?

> `readonly` `optional` **working?**: [`Options`](./namespaces/WorkingMemory.md#options)

## Type Aliases

<a id="workingrequirement"></a>

### WorkingRequirement

> **WorkingRequirement**\<`O`\> = `O` *extends* `object` ? \[`Extract`\<`W`, [`Options`](./namespaces/WorkingMemory.md#options)\>\] *extends* \[`never`\] ? `never` : [`SummaryRequirement`](./namespaces/WorkingMemory.md#summaryrequirement)\<`Extract`\<`W`, [`Options`](./namespaces/WorkingMemory.md#options)\>\> : `never`

**`Internal`**

The ambient LanguageModel is required only when working memory summarizes without an explicit model layer.

#### Type Parameters

##### O

`O`

## Functions

<a id="layer"></a>

### layer()

#### Call Signature

> **layer**(): `Layer`\<[`Memory`](../generalist/namespaces/Memory.md#memory), `never`, [`VectorStore`](./namespaces/VectorStore.md#vectorstore) \| `EmbeddingModel`\>

##### Returns

`Layer`\<[`Memory`](../generalist/namespaces/Memory.md#memory), `never`, [`VectorStore`](./namespaces/VectorStore.md#vectorstore) \| `EmbeddingModel`\>

#### Call Signature

> **layer**\<`O`\>(`options`): `Layer`\<[`Memory`](../generalist/namespaces/Memory.md#memory), `never`, [`VectorStore`](./namespaces/VectorStore.md#vectorstore) \| `EmbeddingModel` \| [`WorkingRequirement`](#workingrequirement)\<`O`\>\>

##### Type Parameters

###### O

`O` *extends* [`Options`](#options)

##### Parameters

###### options

`O`

##### Returns

`Layer`\<[`Memory`](../generalist/namespaces/Memory.md#memory), `never`, [`VectorStore`](./namespaces/VectorStore.md#vectorstore) \| `EmbeddingModel` \| [`WorkingRequirement`](#workingrequirement)\<`O`\>\>

## References

<a id="layersupermemory"></a>

### layerSupermemory

Renames and re-exports [layer](./namespaces/Supermemory.md#layer)

***

<a id="supermemoryerror"></a>

### SupermemoryError

Re-exports [SupermemoryError](./namespaces/Supermemory.md#supermemoryerror)

***

<a id="supermemoryoptions"></a>

### SupermemoryOptions

Renames and re-exports [Options](./namespaces/Supermemory.md#options)
