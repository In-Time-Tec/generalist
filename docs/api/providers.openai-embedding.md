[**generalist**](./index)

***

[generalist](./index) / providers.openai-embedding

# providers.openai-embedding

## Interfaces

### Options

#### Properties

##### apiKey

> `readonly` **apiKey**: `Config`\<`Redacted`\<`string`\>\>

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"`\>

##### config?

> `readonly` `optional` **config?**: `Omit`\<\{\[`x`: `string`\]: `unknown`; \}, `"model"`\>

##### model

> `readonly` **model**: `string` & `object` \| `Model`

## Variables

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<`EmbeddingModel.EmbeddingModel`, `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<`EmbeddingModel.EmbeddingModel`, `Config.ConfigError`, `HttpClient.HttpClient`\>
