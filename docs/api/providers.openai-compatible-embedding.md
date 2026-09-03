[**generalist**](./index)

***

[generalist](./index) / providers.openai-compatible-embedding

# providers.openai-compatible-embedding

## Interfaces

### Input

#### Properties

##### apiKey?

> `readonly` `optional` **apiKey?**: `Config`\<`Redacted`\<`string`\>\>

##### baseUrl

> `readonly` **baseUrl**: `string`

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"` \| `"apiUrl"`\>

##### config?

> `readonly` `optional` **config?**: `Omit`\<`object` & `object`, `"model"`\>

##### model

> `readonly` **model**: `string`

## Variables

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<`EmbeddingModel.EmbeddingModel`, `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### options

[`Input`](#input)

#### Returns

`Layer.Layer`\<`EmbeddingModel.EmbeddingModel`, `Config.ConfigError`, `HttpClient.HttpClient`\>
