[**generalist**](./index)

***

[generalist](./index) / providers.openai-responses

# providers.openai-responses

## Interfaces

<a id="clientoptions"></a>

### ClientOptions

#### Extends

- [`Options`](#options)

#### Properties

<a id="apikey"></a>

##### apiKey?

> `readonly` `optional` **apiKey?**: `Config`\<`Redacted`\<`string`\>\>

<a id="baseurl"></a>

##### baseUrl?

> `readonly` `optional` **baseUrl?**: `string`

<a id="classifyfailure"></a>

##### classifyFailure?

> `readonly` `optional` **classifyFailure?**: [`FailureClassifier`](./generalist/namespaces/ModelRegistry#failureclassifier)

###### Inherited from

[`Options`](#options).[`classifyFailure`](#classifyfailure-1)

<a id="clientconfig"></a>

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"` \| `"apiUrl"`\>

<a id="config"></a>

##### config?

> `readonly` `optional` **config?**: `Config`

###### Inherited from

[`Options`](#options).[`config`](#config-1)

<a id="metadata"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`Options`](#options).[`metadata`](#metadata-1)

<a id="model"></a>

##### model

> `readonly` **model**: `string`

###### Inherited from

[`Options`](#options).[`model`](#model-1)

<a id="provider"></a>

##### provider?

> `readonly` `optional` **provider?**: `string`

###### Inherited from

[`Options`](#options).[`provider`](#provider-1)

<a id="registrationkey"></a>

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`Options`](#options).[`registrationKey`](#registrationkey-1)

***

<a id="options"></a>

### Options

#### Extends

- [`RegistrationOptions`](./providers.openai#registrationoptions)

#### Extended by

- [`ClientOptions`](#clientoptions)

#### Properties

<a id="classifyfailure-1"></a>

##### classifyFailure?

> `readonly` `optional` **classifyFailure?**: [`FailureClassifier`](./generalist/namespaces/ModelRegistry#failureclassifier)

<a id="config-1"></a>

##### config?

> `readonly` `optional` **config?**: `Config`

<a id="metadata-1"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`metadata`](./providers.openai#metadata-3)

<a id="model-1"></a>

##### model

> `readonly` **model**: `string`

<a id="provider-1"></a>

##### provider?

> `readonly` `optional` **provider?**: `string`

<a id="registrationkey-1"></a>

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`registrationKey`](./providers.openai#registrationkey-3)

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`ClientOptions`](#clientoptions)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

<a id="layermodel"></a>

### layerModel

> `const` **layerModel**: (`input`) => `Model.Model`\<`string`, `LanguageModel.LanguageModel`, `OpenAIClient.OpenAiClient`\>

Model layer over `OpenAiClient`; provide it to a run with `Effect.provide`.

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Model.Model`\<`string`, `LanguageModel.LanguageModel`, `OpenAIClient.OpenAiClient`\>

## References

<a id="decodeconfig"></a>

### decodeConfig

Re-exports [decodeConfig](./providers.openai#decodeconfig)

***

<a id="layerconfig"></a>

### layerConfig

Re-exports [layerConfig](./providers.openai#layerconfig)

***

<a id="tooljsonschemacompiler"></a>

### toolJsonSchemaCompiler

Re-exports [toolJsonSchemaCompiler](./providers.openai#tooljsonschemacompiler)
