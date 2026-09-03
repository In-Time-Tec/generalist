[**generalist**](../../index)

***

[generalist](../../index) / [memory](../index) / SemanticRecall

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

> `const` **layer**: (`options?`) => `Layer.Layer`\<[`Memory`](../../generalist/namespaces/Memory#memory), `never`, [`VectorStore`](./VectorStore#vectorstore) \| `EmbeddingModel.EmbeddingModel`\>

#### Parameters

##### options?

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`Memory`](../../generalist/namespaces/Memory#memory), `never`, [`VectorStore`](./VectorStore#vectorstore) \| `EmbeddingModel.EmbeddingModel`\>

***

<a id="make"></a>

### make

> `const` **make**: (`options?`) => `Effect.Effect`\<[`Service`](../../generalist/namespaces/Memory#service), `never`, [`VectorStore`](./VectorStore#vectorstore) \| `EmbeddingModel.EmbeddingModel`\>

#### Parameters

##### options?

[`Options`](#options)

#### Returns

`Effect.Effect`\<[`Service`](../../generalist/namespaces/Memory#service), `never`, [`VectorStore`](./VectorStore#vectorstore) \| `EmbeddingModel.EmbeddingModel`\>
