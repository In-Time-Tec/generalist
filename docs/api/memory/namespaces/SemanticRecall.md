[**generalist**](../../index)

***

[generalist](../../index) / [memory](../index) / SemanticRecall

# SemanticRecall

## Interfaces

### Options

#### Properties

##### limit?

> `readonly` `optional` **limit?**: `number`

##### minScore?

> `readonly` `optional` **minScore?**: `number`

## Variables

### layer

> `const` **layer**: (`options?`) => `Layer.Layer`\<[`Memory`](../../generalist/namespaces/Memory#memory), `never`, [`VectorStore`](./VectorStore#vectorstore) \| `EmbeddingModel.EmbeddingModel`\>

#### Parameters

##### options?

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`Memory`](../../generalist/namespaces/Memory#memory), `never`, [`VectorStore`](./VectorStore#vectorstore) \| `EmbeddingModel.EmbeddingModel`\>

***

### make

> `const` **make**: (`options?`) => `Effect.Effect`\<[`Service`](../../generalist/namespaces/Memory#service), `never`, [`VectorStore`](./VectorStore#vectorstore) \| `EmbeddingModel.EmbeddingModel`\>

#### Parameters

##### options?

[`Options`](#options)

#### Returns

`Effect.Effect`\<[`Service`](../../generalist/namespaces/Memory#service), `never`, [`VectorStore`](./VectorStore#vectorstore) \| `EmbeddingModel.EmbeddingModel`\>
