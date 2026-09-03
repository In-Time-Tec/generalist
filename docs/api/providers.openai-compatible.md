[**generalist**](./index)

***

[generalist](./index) / providers.openai-compatible

# providers.openai-compatible

## Interfaces

### AzureOptions

#### Extends

- [`Options`](#options)

#### Properties

##### apiKey?

> `readonly` `optional` **apiKey?**: `Config`\<`Redacted`\<`string`\>\>

###### Inherited from

[`Options`](#options).[`apiKey`](#apikey-1)

##### baseUrl?

> `readonly` `optional` **baseUrl?**: `string`

###### Inherited from

[`ClientOptions`](./providers.openai-chat-completions#clientoptions).[`baseUrl`](./providers.openai-chat-completions#baseurl)

##### classifyFailure?

> `readonly` `optional` **classifyFailure?**: [`FailureClassifier`](./generalist/namespaces/ModelRegistry#failureclassifier)

###### Inherited from

[`Options`](./providers.openai-chat-completions#options).[`classifyFailure`](./providers.openai-chat-completions#classifyfailure-1)

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"` \| `"apiUrl"`\>

###### Inherited from

[`Options`](#options).[`clientConfig`](#clientconfig-1)

##### config?

> `readonly` `optional` **config?**: [`Config`](./providers.openai-chat-completions#config-2)

###### Inherited from

[`Options`](./providers.openai-chat-completions#options).[`config`](./providers.openai-chat-completions#config-1)

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`metadata`](./providers.openai#metadata-3)

##### model

> `readonly` **model**: `string`

###### Inherited from

[`Options`](./providers.openai-chat-completions#options).[`model`](./providers.openai-chat-completions#model-1)

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`registrationKey`](./providers.openai#registrationkey-3)

##### resource

> `readonly` **resource**: `string`

***

### Options

#### Extends

- `Omit`\<[`ClientOptions`](./providers.openai-chat-completions#clientoptions), `"provider"`\>

#### Extended by

- [`AzureOptions`](#azureoptions)

#### Properties

##### apiKey?

> `readonly` `optional` **apiKey?**: `Config`\<`Redacted`\<`string`\>\>

###### Overrides

[`ClientOptions`](./providers.openai-chat-completions#clientoptions).[`apiKey`](./providers.openai-chat-completions#apikey)

##### baseUrl?

> `readonly` `optional` **baseUrl?**: `string`

###### Inherited from

[`ClientOptions`](./providers.openai-chat-completions#clientoptions).[`baseUrl`](./providers.openai-chat-completions#baseurl)

##### classifyFailure?

> `readonly` `optional` **classifyFailure?**: [`FailureClassifier`](./generalist/namespaces/ModelRegistry#failureclassifier)

###### Inherited from

[`Options`](./providers.openai-chat-completions#options).[`classifyFailure`](./providers.openai-chat-completions#classifyfailure-1)

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"` \| `"apiUrl"`\>

###### Overrides

[`ClientOptions`](./providers.openai-chat-completions#clientoptions).[`clientConfig`](./providers.openai-chat-completions#clientconfig)

##### config?

> `readonly` `optional` **config?**: [`Config`](./providers.openai-chat-completions#config-2)

###### Inherited from

[`Options`](./providers.openai-chat-completions#options).[`config`](./providers.openai-chat-completions#config-1)

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`metadata`](./providers.openai#metadata-3)

##### model

> `readonly` **model**: `string`

###### Inherited from

[`Options`](./providers.openai-chat-completions#options).[`model`](./providers.openai-chat-completions#model-1)

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`registrationKey`](./providers.openai#registrationkey-3)

## Variables

### layerAzureOpenAI

> `const` **layerAzureOpenAI**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`AzureOptions`](#azureoptions)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

### layerDeepSeek

> `const` **layerDeepSeek**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

### layerGoogleAIStudio

> `const` **layerGoogleAIStudio**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

### layerGroq

> `const` **layerGroq**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

### layerMistral

> `const` **layerMistral**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

### layerOllama

> `const` **layerOllama**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

### layerXAI

> `const` **layerXAI**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>
