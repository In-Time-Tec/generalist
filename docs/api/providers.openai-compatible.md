[**generalist**](./index)

***

[generalist](./index) / providers.openai-compatible

# providers.openai-compatible

## Interfaces

<a id="azureoptions"></a>

### AzureOptions

#### Extends

- [`Options`](#options)

#### Properties

<a id="apikey"></a>

##### apiKey?

> `readonly` `optional` **apiKey?**: `Config`\<`Redacted`\<`string`\>\>

###### Inherited from

[`Options`](#options).[`apiKey`](#apikey-1)

<a id="baseurl"></a>

##### baseUrl?

> `readonly` `optional` **baseUrl?**: `string`

###### Inherited from

[`ClientOptions`](./providers.openai-chat-completions#clientoptions).[`baseUrl`](./providers.openai-chat-completions#baseurl)

<a id="classifyfailure"></a>

##### classifyFailure?

> `readonly` `optional` **classifyFailure?**: [`FailureClassifier`](./generalist/namespaces/ModelRegistry#failureclassifier)

###### Inherited from

[`Options`](./providers.openai-chat-completions#options).[`classifyFailure`](./providers.openai-chat-completions#classifyfailure-1)

<a id="clientconfig"></a>

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"` \| `"apiUrl"`\>

###### Inherited from

[`Options`](#options).[`clientConfig`](#clientconfig-1)

<a id="config"></a>

##### config?

> `readonly` `optional` **config?**: [`Config`](./providers.openai-chat-completions#config-2)

###### Inherited from

[`Options`](./providers.openai-chat-completions#options).[`config`](./providers.openai-chat-completions#config-1)

<a id="metadata"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`metadata`](./providers.openai#metadata-3)

<a id="model"></a>

##### model

> `readonly` **model**: `string`

###### Inherited from

[`Options`](./providers.openai-chat-completions#options).[`model`](./providers.openai-chat-completions#model-1)

<a id="registrationkey"></a>

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`registrationKey`](./providers.openai#registrationkey-3)

<a id="resource"></a>

##### resource

> `readonly` **resource**: `string`

***

<a id="options"></a>

### Options

#### Extends

- `Omit`\<[`ClientOptions`](./providers.openai-chat-completions#clientoptions), `"provider"`\>

#### Extended by

- [`AzureOptions`](#azureoptions)

#### Properties

<a id="apikey-1"></a>

##### apiKey?

> `readonly` `optional` **apiKey?**: `Config`\<`Redacted`\<`string`\>\>

###### Overrides

[`ClientOptions`](./providers.openai-chat-completions#clientoptions).[`apiKey`](./providers.openai-chat-completions#apikey)

<a id="baseurl-1"></a>

##### baseUrl?

> `readonly` `optional` **baseUrl?**: `string`

###### Inherited from

[`ClientOptions`](./providers.openai-chat-completions#clientoptions).[`baseUrl`](./providers.openai-chat-completions#baseurl)

<a id="classifyfailure-1"></a>

##### classifyFailure?

> `readonly` `optional` **classifyFailure?**: [`FailureClassifier`](./generalist/namespaces/ModelRegistry#failureclassifier)

###### Inherited from

[`Options`](./providers.openai-chat-completions#options).[`classifyFailure`](./providers.openai-chat-completions#classifyfailure-1)

<a id="clientconfig-1"></a>

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"` \| `"apiUrl"`\>

###### Overrides

[`ClientOptions`](./providers.openai-chat-completions#clientoptions).[`clientConfig`](./providers.openai-chat-completions#clientconfig)

<a id="config-1"></a>

##### config?

> `readonly` `optional` **config?**: [`Config`](./providers.openai-chat-completions#config-2)

###### Inherited from

[`Options`](./providers.openai-chat-completions#options).[`config`](./providers.openai-chat-completions#config-1)

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

###### Inherited from

[`Options`](./providers.openai-chat-completions#options).[`model`](./providers.openai-chat-completions#model-1)

<a id="registrationkey-1"></a>

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`registrationKey`](./providers.openai#registrationkey-3)

## Variables

<a id="layerazureopenai"></a>

### layerAzureOpenAI

> `const` **layerAzureOpenAI**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`AzureOptions`](#azureoptions)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

<a id="layerdeepseek"></a>

### layerDeepSeek

> `const` **layerDeepSeek**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

<a id="layergoogleaistudio"></a>

### layerGoogleAIStudio

> `const` **layerGoogleAIStudio**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

<a id="layergroq"></a>

### layerGroq

> `const` **layerGroq**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

<a id="layermistral"></a>

### layerMistral

> `const` **layerMistral**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

<a id="layerollama"></a>

### layerOllama

> `const` **layerOllama**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

<a id="layerxai"></a>

### layerXAI

> `const` **layerXAI**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `Config.ConfigError`, `HttpClient.HttpClient`\>
