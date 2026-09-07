[**generalist**](../../index.md)

***

[generalist](../../index.md) / [memory](../index.md) / SemanticRecall

# SemanticRecall

## Interfaces

<a id="options"></a>

### Options

#### Properties

<a id="limit"></a>

##### limit?

> `readonly` `optional` **limit?**: `number`

<a id="minscore"></a>

##### minScore?

> `readonly` `optional` **minScore?**: `number`

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options?`) => `Layer.Layer`\<[`Memory`](../../generalist/namespaces/Memory.md#memory), `never`, [`VectorStore`](./VectorStore.md#vectorstore) \| `EmbeddingModel.EmbeddingModel`\>

#### Parameters

##### options?

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`Memory`](../../generalist/namespaces/Memory.md#memory), `never`, [`VectorStore`](./VectorStore.md#vectorstore) \| `EmbeddingModel.EmbeddingModel`\>

***

<a id="make"></a>

### make

> `const` **make**: (`options?`) => `Effect.Effect`\<[`Service`](../../generalist/namespaces/Memory.md#service), `never`, [`VectorStore`](./VectorStore.md#vectorstore) \| `EmbeddingModel.EmbeddingModel`\>

#### Parameters

##### options?

[`Options`](#options)

#### Returns

`Effect.Effect`\<[`Service`](../../generalist/namespaces/Memory.md#service), `never`, [`VectorStore`](./VectorStore.md#vectorstore) \| `EmbeddingModel.EmbeddingModel`\>
