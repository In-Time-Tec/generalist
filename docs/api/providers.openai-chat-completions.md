[**generalist**](./index)

***

[generalist](./index) / providers.openai-chat-completions

# providers.openai-chat-completions

## Interfaces

### ClientOptions

#### Extends

- [`Options`](#options)

#### Properties

##### apiKey?

> `readonly` `optional` **apiKey?**: `Config`\<`Redacted`\<`string`\>\>

##### baseUrl?

> `readonly` `optional` **baseUrl?**: `string`

##### classifyFailure?

> `readonly` `optional` **classifyFailure?**: [`FailureClassifier`](./generalist/namespaces/ModelRegistry#failureclassifier)

###### Inherited from

[`Options`](#options).[`classifyFailure`](#classifyfailure-1)

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"` \| `"apiUrl"`\>

##### config?

> `readonly` `optional` **config?**: [`Config`](#config-2)

###### Inherited from

[`Options`](#options).[`config`](#config-1)

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`Options`](#options).[`metadata`](#metadata-1)

##### model

> `readonly` **model**: `string`

###### Inherited from

[`Options`](#options).[`model`](#model-1)

##### provider?

> `readonly` `optional` **provider?**: `string`

###### Inherited from

[`Options`](#options).[`provider`](#provider-1)

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`Options`](#options).[`registrationKey`](#registrationkey-1)

***

### Options

#### Extends

- [`RegistrationOptions`](./providers.openai#registrationoptions)

#### Extended by

- [`ClientOptions`](#clientoptions)

#### Properties

##### classifyFailure?

> `readonly` `optional` **classifyFailure?**: [`FailureClassifier`](./generalist/namespaces/ModelRegistry#failureclassifier)

##### config?

> `readonly` `optional` **config?**: [`Config`](#config-2)

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`metadata`](./providers.openai#metadata-3)

##### model

> `readonly` **model**: `string`

##### provider?

> `readonly` `optional` **provider?**: `string`

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`registrationKey`](./providers.openai#registrationkey-3)

## Type Aliases

### Config

> **Config** = `Omit`\<*typeof* `OpenAILanguageModel.Config.Service`, `"model"`\>

## Variables

### decodeConfig

> `const` **decodeConfig**: (`options`) => `Effect.Effect`\<[`Config`](#config-2), `Schema.SchemaError`\>

#### Parameters

##### options

`ConfigInput`

#### Returns

`Effect.Effect`\<[`Config`](#config-2), `Schema.SchemaError`\>

***

### layer

> `const` **layer**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`ClientOptions`](#clientoptions)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

### layerConfig

> `const` **layerConfig**: (`options?`) => `Layer.Layer`\<`OpenAIClient.OpenAiClient`, `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### options?

###### apiKey?

`Config.Config`\<`Redacted.Redacted`\<`string`\> \| `undefined`\>

###### apiUrl?

`Config.Config`\<`string`\>

###### organizationId?

`Config.Config`\<`Redacted.Redacted`\<`string`\> \| `undefined`\>

###### projectId?

`Config.Config`\<`Redacted.Redacted`\<`string`\> \| `undefined`\>

###### transformClient?

(`client`) => `HttpClient.HttpClient`

#### Returns

`Layer.Layer`\<`OpenAIClient.OpenAiClient`, `Config.ConfigError`, `HttpClient.HttpClient`\>

***

### layerModel

> `const` **layerModel**: (`input`) => `Model.Model`\<`string`, `LanguageModel.LanguageModel`, `OpenAIClient.OpenAiClient`\>

Model layer over `OpenAiClient`; provide it to a run with `Effect.provide`.

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Model.Model`\<`string`, `LanguageModel.LanguageModel`, `OpenAIClient.OpenAiClient`\>

***

### toolJsonSchemaCompiler

> `const` **toolJsonSchemaCompiler**: [`ToolJsonSchemaCompiler`](./generalist/namespaces/ModelRegistry#tooljsonschemacompiler-1)
