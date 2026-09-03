[**generalist**](./index)

***

[generalist](./index) / providers.anthropic

# providers.anthropic

## Interfaces

<a id="clientoptions"></a>

### ClientOptions

#### Extends

- [`Options`](#options)

#### Properties

<a id="apikey"></a>

##### apiKey

> `readonly` **apiKey**: `Config`\<`Redacted`\<`string`\>\>

<a id="clientconfig"></a>

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"`\>

<a id="config"></a>

##### config?

> `readonly` `optional` **config?**: `object`

###### cache\_control?

> `readonly` `optional` **cache\_control?**: \{ `ttl?`: `"5m"` \| `"1h"`; `type`: `"ephemeral"`; \} \| `null`

###### container?

> `readonly` `optional` **container?**: `string` \| \{ `id?`: `string` \| `null`; `skills?`: readonly `object`[] \| `null`; \} \| `null`

###### context\_management?

> `readonly` `optional` **context\_management?**: \{ `edits?`: readonly (\{ `clear_at_least?`: \{ `type`: `"input_tokens"`; `value`: `number`; \} \| `null`; `clear_tool_inputs?`: `boolean` \| readonly `string`[] \| `null`; `exclude_tools?`: readonly `string`[] \| `null`; `keep?`: \{ `type`: `"tool_uses"`; `value`: `number`; \}; `trigger?`: \{ `type`: `"input_tokens"`; `value`: `number`; \} \| \{ `type`: `"tool_uses"`; `value`: `number`; \}; `type`: `"clear_tool_uses_20250919"`; \} \| \{ `keep?`: `"all"` \| \{ `type`: `"thinking_turns"`; `value`: `number`; \} \| \{ `type`: `"all"`; \}; `type`: `"clear_thinking_20251015"`; \} \| \{ `instructions?`: `string` \| `null`; `pause_after_compaction?`: `boolean`; `trigger?`: \{ `type`: `"input_tokens"`; `value`: `number`; \} \| `null`; `type`: `"compact_20260112"`; \})[]; \} \| `null`

###### disableParallelToolCalls?

> `readonly` `optional` **disableParallelToolCalls?**: `boolean`

###### inference\_geo?

> `readonly` `optional` **inference\_geo?**: `string` \| `null`

###### max\_tokens?

> `readonly` `optional` **max\_tokens?**: `number`

###### mcp\_servers?

> `readonly` `optional` **mcp\_servers?**: readonly `object`[]

###### metadata?

> `readonly` `optional` **metadata?**: `object`

###### metadata.user\_id?

> `readonly` `optional` **user\_id?**: `string` \| `null`

###### output\_config?

> `readonly` `optional` **output\_config?**: `object`

###### output\_config.effort?

> `readonly` `optional` **effort?**: `"low"` \| `"medium"` \| `"high"` \| `"max"` \| `null`

###### output\_format?

> `readonly` `optional` **output\_format?**: \{ `schema`: \{\[`key`: `string`\]: `Json`; \}; `type`: `"json_schema"`; \} \| `null`

###### service\_tier?

> `readonly` `optional` **service\_tier?**: `"auto"` \| `"standard_only"`

###### speed?

> `readonly` `optional` **speed?**: `"standard"` \| `"fast"` \| `null`

###### stop\_sequences?

> `readonly` `optional` **stop\_sequences?**: readonly `string`[]

###### strictJsonSchema?

> `readonly` `optional` **strictJsonSchema?**: `boolean`

###### system?

> `readonly` `optional` **system?**: `string` \| readonly `object`[]

###### temperature?

> `readonly` `optional` **temperature?**: `number`

###### thinking?

> `readonly` `optional` **thinking?**: \{ `budget_tokens`: `number`; `type`: `"enabled"`; \} \| \{ `type`: `"disabled"`; \} \| \{ `type`: `"adaptive"`; \}

###### top\_k?

> `readonly` `optional` **top\_k?**: `number`

###### top\_p?

> `readonly` `optional` **top\_p?**: `number`

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

> `readonly` **model**: `string` & `object` \| `"claude-sonnet-5"` \| `"claude-fable-5"` \| `"claude-mythos-5"` \| `"claude-opus-4-8"` \| `"claude-opus-4-7"` \| `"claude-mythos-preview"` \| `"claude-opus-4-6"` \| `"claude-sonnet-4-6"` \| `"claude-haiku-4-5"` \| `"claude-haiku-4-5-20251001"` \| `"claude-opus-4-5"` \| `"claude-opus-4-5-20251101"` \| `"claude-sonnet-4-5"` \| `"claude-sonnet-4-5-20250929"` \| `"claude-opus-4-1"` \| `"claude-opus-4-1-20250805"`

###### Inherited from

[`Options`](#options).[`model`](#model-1)

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

<a id="config-1"></a>

##### config?

> `readonly` `optional` **config?**: `object`

###### cache\_control?

> `readonly` `optional` **cache\_control?**: \{ `ttl?`: `"5m"` \| `"1h"`; `type`: `"ephemeral"`; \} \| `null`

###### container?

> `readonly` `optional` **container?**: `string` \| \{ `id?`: `string` \| `null`; `skills?`: readonly `object`[] \| `null`; \} \| `null`

###### context\_management?

> `readonly` `optional` **context\_management?**: \{ `edits?`: readonly (\{ `clear_at_least?`: \{ `type`: `"input_tokens"`; `value`: `number`; \} \| `null`; `clear_tool_inputs?`: `boolean` \| readonly `string`[] \| `null`; `exclude_tools?`: readonly `string`[] \| `null`; `keep?`: \{ `type`: `"tool_uses"`; `value`: `number`; \}; `trigger?`: \{ `type`: `"input_tokens"`; `value`: `number`; \} \| \{ `type`: `"tool_uses"`; `value`: `number`; \}; `type`: `"clear_tool_uses_20250919"`; \} \| \{ `keep?`: `"all"` \| \{ `type`: `"thinking_turns"`; `value`: `number`; \} \| \{ `type`: `"all"`; \}; `type`: `"clear_thinking_20251015"`; \} \| \{ `instructions?`: `string` \| `null`; `pause_after_compaction?`: `boolean`; `trigger?`: \{ `type`: `"input_tokens"`; `value`: `number`; \} \| `null`; `type`: `"compact_20260112"`; \})[]; \} \| `null`

###### disableParallelToolCalls?

> `readonly` `optional` **disableParallelToolCalls?**: `boolean`

###### inference\_geo?

> `readonly` `optional` **inference\_geo?**: `string` \| `null`

###### max\_tokens?

> `readonly` `optional` **max\_tokens?**: `number`

###### mcp\_servers?

> `readonly` `optional` **mcp\_servers?**: readonly `object`[]

###### metadata?

> `readonly` `optional` **metadata?**: `object`

###### metadata.user\_id?

> `readonly` `optional` **user\_id?**: `string` \| `null`

###### output\_config?

> `readonly` `optional` **output\_config?**: `object`

###### output\_config.effort?

> `readonly` `optional` **effort?**: `"low"` \| `"medium"` \| `"high"` \| `"max"` \| `null`

###### output\_format?

> `readonly` `optional` **output\_format?**: \{ `schema`: \{\[`key`: `string`\]: `Json`; \}; `type`: `"json_schema"`; \} \| `null`

###### service\_tier?

> `readonly` `optional` **service\_tier?**: `"auto"` \| `"standard_only"`

###### speed?

> `readonly` `optional` **speed?**: `"standard"` \| `"fast"` \| `null`

###### stop\_sequences?

> `readonly` `optional` **stop\_sequences?**: readonly `string`[]

###### strictJsonSchema?

> `readonly` `optional` **strictJsonSchema?**: `boolean`

###### system?

> `readonly` `optional` **system?**: `string` \| readonly `object`[]

###### temperature?

> `readonly` `optional` **temperature?**: `number`

###### thinking?

> `readonly` `optional` **thinking?**: \{ `budget_tokens`: `number`; `type`: `"enabled"`; \} \| \{ `type`: `"disabled"`; \} \| \{ `type`: `"adaptive"`; \}

###### top\_k?

> `readonly` `optional` **top\_k?**: `number`

###### top\_p?

> `readonly` `optional` **top\_p?**: `number`

<a id="metadata-1"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`metadata`](./providers.openai#metadata-3)

<a id="model-1"></a>

##### model

> `readonly` **model**: `string` & `object` \| `"claude-sonnet-5"` \| `"claude-fable-5"` \| `"claude-mythos-5"` \| `"claude-opus-4-8"` \| `"claude-opus-4-7"` \| `"claude-mythos-preview"` \| `"claude-opus-4-6"` \| `"claude-sonnet-4-6"` \| `"claude-haiku-4-5"` \| `"claude-haiku-4-5-20251001"` \| `"claude-opus-4-5"` \| `"claude-opus-4-5-20251101"` \| `"claude-sonnet-4-5"` \| `"claude-sonnet-4-5-20250929"` \| `"claude-opus-4-1"` \| `"claude-opus-4-1-20250805"`

<a id="registrationkey-1"></a>

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`registrationKey`](./providers.openai#registrationkey-3)

## Type Aliases

<a id="config-2"></a>

### Config

> **Config** = *typeof* `ConfigSchema.Type`

## Variables

<a id="classifyfailure"></a>

### classifyFailure

> `const` **classifyFailure**: [`FailureClassifier`](./generalist/namespaces/ModelRegistry#failureclassifier)

***

<a id="decodeconfig"></a>

### decodeConfig

> `const` **decodeConfig**: (`options`) => `Effect.Effect`\<[`Config`](#config-2), `Schema.SchemaError`\>

#### Parameters

##### options

`ConfigInput`

#### Returns

`Effect.Effect`\<[`Config`](#config-2), `Schema.SchemaError`\>

***

<a id="layer"></a>

### layer

> `const` **layer**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `EffectConfig.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### input

[`ClientOptions`](#clientoptions)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `EffectConfig.ConfigError`, `HttpClient.HttpClient`\>

***

<a id="layerconfig"></a>

### layerConfig

> `const` **layerConfig**: (`options?`) => `Layer.Layer`\<`AnthropicClient.AnthropicClient`, `EffectConfig.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### options?

###### apiKey?

`EffectConfig.Config`\<`Redacted.Redacted`\<`string`\> \| `undefined`\>

###### apiUrl?

`EffectConfig.Config`\<`string`\>

###### apiVersion?

`EffectConfig.Config`\<`string`\>

###### transformClient?

(`client`) => `HttpClient.HttpClient`

#### Returns

`Layer.Layer`\<`AnthropicClient.AnthropicClient`, `EffectConfig.ConfigError`, `HttpClient.HttpClient`\>

***

<a id="layermodel"></a>

### layerModel

> `const` **layerModel**: (`input`) => `Model.Model`\<`"anthropic"`, `LanguageModel.LanguageModel`, `AnthropicClient.AnthropicClient`\>

Model layer over `AnthropicClient`; provide it to a run with `Effect.provide`.

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Model.Model`\<`"anthropic"`, `LanguageModel.LanguageModel`, `AnthropicClient.AnthropicClient`\>

***

<a id="registration"></a>

### registration

> `const` **registration**: (`input`) => `ReturnType`\<*typeof* [`registration`](./generalist/namespaces/ModelRegistry#registration-2)\>

Bare registration effect; the consumer provides the Anthropic client (see layerConfig).

#### Parameters

##### input

[`Options`](#options)

#### Returns

`ReturnType`\<*typeof* [`registration`](./generalist/namespaces/ModelRegistry#registration-2)\>

***

<a id="resolvedconfig"></a>

### resolvedConfig

> `const` **resolvedConfig**: (`input`) => [`Config`](#config-2)

Effective Anthropic request config; callers opt into top-level automatic caching.

#### Parameters

##### input

[`Options`](#options)

#### Returns

[`Config`](#config-2)

***

<a id="tooljsonschemacompiler"></a>

### toolJsonSchemaCompiler

> `const` **toolJsonSchemaCompiler**: [`ToolJsonSchemaCompiler`](./generalist/namespaces/ModelRegistry#tooljsonschemacompiler-1)
