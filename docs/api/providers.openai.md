[**generalist**](./index)

***

[generalist](./index) / providers.openai

# providers.openai

## Interfaces

<a id="clientoptions"></a>

### ClientOptions

#### Extends

- [`Options`](#options)

#### Extended by

- [`DeterministicFallbackOptions`](#deterministicfallbackoptions)

#### Properties

<a id="apikey"></a>

##### apiKey

> `readonly` **apiKey**: `Config`\<`Redacted`\<`string`\>\>

<a id="clientconfig"></a>

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"`\>

<a id="config"></a>

##### config?

> `readonly` `optional` **config?**: `Config`

###### Inherited from

[`Options`](#options).[`config`](#config-2)

<a id="metadata"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`Options`](#options).[`metadata`](#metadata-2)

<a id="model"></a>

##### model

> `readonly` **model**: `string` & `object` \| `Model`

###### Inherited from

[`Options`](#options).[`model`](#model-2)

<a id="registrationkey"></a>

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`Options`](#options).[`registrationKey`](#registrationkey-2)

***

<a id="deterministicfallbackoptions"></a>

### DeterministicFallbackOptions

#### Extends

- [`ClientOptions`](#clientoptions)

#### Properties

<a id="apikey-1"></a>

##### apiKey

> `readonly` **apiKey**: `Config`\<`Redacted`\<`string`\>\>

###### Inherited from

[`ClientOptions`](#clientoptions).[`apiKey`](#apikey)

<a id="clientconfig-1"></a>

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"`\>

###### Inherited from

[`ClientOptions`](#clientoptions).[`clientConfig`](#clientconfig)

<a id="config-1"></a>

##### config?

> `readonly` `optional` **config?**: `Config`

###### Inherited from

[`ClientOptions`](#clientoptions).[`config`](#config)

<a id="fallbackmodel"></a>

##### fallbackModel

> `readonly` **fallbackModel**: `string`

<a id="fallbackprovider"></a>

##### fallbackProvider?

> `readonly` `optional` **fallbackProvider?**: `string`

<a id="metadata-1"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`ClientOptions`](#clientoptions).[`metadata`](#metadata)

<a id="model-1"></a>

##### model

> `readonly` **model**: `string` & `object` \| `Model`

###### Inherited from

[`ClientOptions`](#clientoptions).[`model`](#model)

<a id="registrationkey-1"></a>

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`ClientOptions`](#clientoptions).[`registrationKey`](#registrationkey)

***

<a id="options"></a>

### Options

#### Extends

- [`RegistrationOptions`](#registrationoptions).`Options`

#### Extended by

- [`ClientOptions`](#clientoptions)

#### Properties

<a id="config-2"></a>

##### config?

> `readonly` `optional` **config?**: `Config`

###### Inherited from

`ModelOptions.config`

<a id="metadata-2"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`RegistrationOptions`](#registrationoptions).[`metadata`](#metadata-3)

<a id="model-2"></a>

##### model

> `readonly` **model**: `string` & `object` \| `Model`

###### Inherited from

`ModelOptions.model`

<a id="registrationkey-2"></a>

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`RegistrationOptions`](#registrationoptions).[`registrationKey`](#registrationkey-3)

***

<a id="registrationoptions"></a>

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

<a id="metadata-3"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

<a id="registrationkey-3"></a>

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

## Type Aliases

<a id="config-3"></a>

### Config

> **Config** = `ModelConfig`

## Variables

<a id="classifyfailure"></a>

### classifyFailure

> `const` **classifyFailure**: [`FailureClassifier`](./generalist/namespaces/ModelRegistry#failureclassifier)

***

<a id="decodeconfig"></a>

### decodeConfig

> `const` **decodeConfig**: (`options`) => `Effect.Effect`\<[`Config`](#config-3), `Schema.SchemaError`\>

#### Parameters

##### options

`ConfigInput`

#### Returns

`Effect.Effect`\<[`Config`](#config-3), `Schema.SchemaError`\>

***

<a id="layer"></a>

### layer

> `const` **layer**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`ClientOptions`](#clientoptions)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

<a id="layerconfig"></a>

### layerConfig

> `const` **layerConfig**: (`options?`) => `Layer.Layer`\<`OpenAIClient.OpenAiClient`, `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### options?

`Parameters`\<*typeof* `OpenAIClient.layerConfig`\>\[`0`\]

#### Returns

`Layer.Layer`\<`OpenAIClient.OpenAiClient`, `Config.ConfigError`, `HttpClient.HttpClient`\>

***

<a id="layermodel"></a>

### layerModel

> `const` **layerModel**: (`input`) => `Model.Model`\<`"openai"`, `LanguageModel.LanguageModel`, `OpenAIClient.OpenAiClient`\>

Model layer over `OpenAiClient`; provide it to a run with `Effect.provide`.

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Model.Model`\<`"openai"`, `LanguageModel.LanguageModel`, `OpenAIClient.OpenAiClient`\>

***

<a id="layerordeterministic"></a>

### layerOrDeterministic

> `const` **layerOrDeterministic**: (`options`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

Selects OpenAI when its configured API key is present, otherwise the deterministic model.

#### Parameters

##### options

[`DeterministicFallbackOptions`](#deterministicfallbackoptions)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

<a id="normalizeresponsessse"></a>

### normalizeResponsesSSE

> `const` **normalizeResponsesSSE**: (`client`) => `HttpClient.HttpClient`

#### Parameters

##### client

`HttpClient.HttpClient`

#### Returns

`HttpClient.HttpClient`

***

<a id="registration"></a>

### registration

> `const` **registration**: (`input`) => `Effect.Effect`\<[`Registration`](./generalist/namespaces/ModelRegistry#registration-1), `never`, `OpenAIClient.OpenAiClient`\>

Bare registration effect; the consumer provides the OpenAI client (see layerConfig).

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Effect.Effect`\<[`Registration`](./generalist/namespaces/ModelRegistry#registration-1), `never`, `OpenAIClient.OpenAiClient`\>

***

<a id="tooljsonschemacompiler"></a>

### toolJsonSchemaCompiler

> `const` **toolJsonSchemaCompiler**: [`ToolJsonSchemaCompiler`](./generalist/namespaces/ModelRegistry#tooljsonschemacompiler-1)
