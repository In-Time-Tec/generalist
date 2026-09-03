[**generalist**](./index)

***

[generalist](./index) / providers.openai-compatible-embedding

# providers.openai-compatible-embedding

## Interfaces

<a id="input"></a>

### Input

#### Properties

<a id="apikey"></a>

##### apiKey?

> `readonly` `optional` **apiKey?**: `Config`\<`Redacted`\<`string`\>\>

<a id="baseurl"></a>

##### baseUrl

> `readonly` **baseUrl**: `string`

<a id="clientconfig"></a>

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"` \| `"apiUrl"`\>

<a id="config"></a>

##### config?

> `readonly` `optional` **config?**: `Omit`\<`object` & `object`, `"model"`\>

<a id="model"></a>

##### model

> `readonly` **model**: `string`

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<`EmbeddingModel.EmbeddingModel`, `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### options

[`Input`](#input)

#### Returns

`Layer.Layer`\<`EmbeddingModel.EmbeddingModel`, `Config.ConfigError`, `HttpClient.HttpClient`\>
