[**generalist**](./index)

***

[generalist](./index) / providers.openai

# providers.openai

## Interfaces

### ClientOptions

#### Extends

- [`Options`](#options)

#### Extended by

- [`DeterministicFallbackOptions`](#deterministicfallbackoptions)

#### Properties

##### apiKey

> `readonly` **apiKey**: `Config`\<`Redacted`\<`string`\>\>

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"`\>

##### config?

> `readonly` `optional` **config?**: `Config`

###### Inherited from

[`Options`](#options).[`config`](#config-2)

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`Options`](#options).[`metadata`](#metadata-2)

##### model

> `readonly` **model**: `string` & `object` \| `Model`

###### Inherited from

[`Options`](#options).[`model`](#model-2)

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`Options`](#options).[`registrationKey`](#registrationkey-2)

***

### DeterministicFallbackOptions

#### Extends

- [`ClientOptions`](#clientoptions)

#### Properties

##### apiKey

> `readonly` **apiKey**: `Config`\<`Redacted`\<`string`\>\>

###### Inherited from

[`ClientOptions`](#clientoptions).[`apiKey`](#apikey)

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"`\>

###### Inherited from

[`ClientOptions`](#clientoptions).[`clientConfig`](#clientconfig)

##### config?

> `readonly` `optional` **config?**: `Config`

###### Inherited from

[`ClientOptions`](#clientoptions).[`config`](#config)

##### fallbackModel

> `readonly` **fallbackModel**: `string`

##### fallbackProvider?

> `readonly` `optional` **fallbackProvider?**: `string`

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`ClientOptions`](#clientoptions).[`metadata`](#metadata)

##### model

> `readonly` **model**: `string` & `object` \| `Model`

###### Inherited from

[`ClientOptions`](#clientoptions).[`model`](#model)

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`ClientOptions`](#clientoptions).[`registrationKey`](#registrationkey)

***

### Options

#### Extends

- [`RegistrationOptions`](#registrationoptions).`Options`

#### Extended by

- [`ClientOptions`](#clientoptions)

#### Properties

##### config?

> `readonly` `optional` **config?**: `Config`

###### Inherited from

`ModelOptions.config`

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`RegistrationOptions`](#registrationoptions).[`metadata`](#metadata-3)

##### model

> `readonly` **model**: `string` & `object` \| `Model`

###### Inherited from

`ModelOptions.model`

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`RegistrationOptions`](#registrationoptions).[`registrationKey`](#registrationkey-3)

***

### RegistrationOptions

#### Extended by

- [`Options`](./providers.amazon-bedrock#options)
- [`Options`](./providers.anthropic#options)
- [`Options`](./providers.deterministic#options)
- [`Options`](#options)
- [`Options`](./providers.openai-chat-completions#options)
- [`Options`](./providers.openai-responses#options)
- [`Options`](./providers.openrouter#options)

#### Properties

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

## Type Aliases

### Config

> **Config** = `ModelConfig`

## Variables

### classifyFailure

> `const` **classifyFailure**: [`FailureClassifier`](./generalist/namespaces/ModelRegistry#failureclassifier)

***

### decodeConfig

> `const` **decodeConfig**: (`options`) => `Effect.Effect`\<[`Config`](#config-3), `Schema.SchemaError`\>

#### Parameters

##### options

`ConfigInput`

#### Returns

`Effect.Effect`\<[`Config`](#config-3), `Schema.SchemaError`\>

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

`Parameters`\<*typeof* `OpenAIClient.layerConfig`\>\[`0`\]

#### Returns

`Layer.Layer`\<`OpenAIClient.OpenAiClient`, `Config.ConfigError`, `HttpClient.HttpClient`\>

***

### layerModel

> `const` **layerModel**: (`input`) => `Model.Model`\<`"openai"`, `LanguageModel.LanguageModel`, `OpenAIClient.OpenAiClient`\>

Model layer over `OpenAiClient`; provide it to a run with `Effect.provide`.

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Model.Model`\<`"openai"`, `LanguageModel.LanguageModel`, `OpenAIClient.OpenAiClient`\>

***

### layerOrDeterministic

> `const` **layerOrDeterministic**: (`options`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

Selects OpenAI when its configured API key is present, otherwise the deterministic model.

#### Parameters

##### options

[`DeterministicFallbackOptions`](#deterministicfallbackoptions)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

### normalizeResponsesSSE

> `const` **normalizeResponsesSSE**: (`client`) => `HttpClient.HttpClient`

#### Parameters

##### client

`HttpClient.HttpClient`

#### Returns

`HttpClient.HttpClient`

***

### registration

> `const` **registration**: (`input`) => `Effect.Effect`\<[`Registration`](./generalist/namespaces/ModelRegistry#registration-1), `never`, `OpenAIClient.OpenAiClient`\>

Bare registration effect; the consumer provides the OpenAI client (see layerConfig).

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Effect.Effect`\<[`Registration`](./generalist/namespaces/ModelRegistry#registration-1), `never`, `OpenAIClient.OpenAiClient`\>

***

### toolJsonSchemaCompiler

> `const` **toolJsonSchemaCompiler**: [`ToolJsonSchemaCompiler`](./generalist/namespaces/ModelRegistry#tooljsonschemacompiler-1)
