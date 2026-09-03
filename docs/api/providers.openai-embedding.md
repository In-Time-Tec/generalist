[**generalist**](./index)

***

[generalist](./index) / providers.openai-embedding

# providers.openai-embedding

## Interfaces

<a id="options"></a>

### Options

#### Properties

<a id="apikey"></a>

##### apiKey

> `readonly` **apiKey**: `Config`\<`Redacted`\<`string`\>\>

<a id="clientconfig"></a>

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"`\>

<a id="config"></a>

##### config?

> `readonly` `optional` **config?**: `Omit`\<\{\[`x`: `string`\]: `unknown`; \}, `"model"`\>

<a id="model"></a>

##### model

> `readonly` **model**: `string` & `object` \| `Model`

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<`EmbeddingModel.EmbeddingModel`, `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<`EmbeddingModel.EmbeddingModel`, `Config.ConfigError`, `HttpClient.HttpClient`\>
