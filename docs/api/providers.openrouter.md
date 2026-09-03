[**generalist**](./index)

***

[generalist](./index) / providers.openrouter

# providers.openrouter

## Interfaces

### ClientOptions

#### Extends

- [`Options`](#options)

#### Properties

##### apiKey

> `readonly` **apiKey**: `Config`\<`Redacted`\<`string`\>\>

##### clientConfig?

> `readonly` `optional` **clientConfig?**: `Omit`\<\{ \}, `"apiKey"`\>

##### config?

> `readonly` `optional` **config?**: `object`

###### cache\_control?

> `readonly` `optional` **cache\_control?**: `object`

###### cache\_control.ttl?

> `readonly` `optional` **ttl?**: `"5m"` \| `"1h"`

###### cache\_control.type

> `readonly` **type**: `"ephemeral"`

###### frequency\_penalty?

> `readonly` `optional` **frequency\_penalty?**: `number` \| `null`

###### image\_config?

> `readonly` `optional` **image\_config?**: `object`

###### logit\_bias?

> `readonly` `optional` **logit\_bias?**: \{\[`key`: `string`\]: `number`; \} \| `null`

###### logprobs?

> `readonly` `optional` **logprobs?**: `boolean` \| `null`

###### max\_completion\_tokens?

> `readonly` `optional` **max\_completion\_tokens?**: `number` \| `null`

###### max\_tokens?

> `readonly` `optional` **max\_tokens?**: `number` \| `null`

###### metadata?

> `readonly` `optional` **metadata?**: `object`

###### min\_p?

> `readonly` `optional` **min\_p?**: `number` \| `null`

###### modalities?

> `readonly` `optional` **modalities?**: readonly (`"text"` \| `"image"` \| `"audio"`)[]

###### models?

> `readonly` `optional` **models?**: readonly `string`[]

###### parallel\_tool\_calls?

> `readonly` `optional` **parallel\_tool\_calls?**: `boolean` \| `null`

###### plugins?

> `readonly` `optional` **plugins?**: readonly (\{ `allowed_models?`: readonly `string`[]; `cost_quality_tradeoff?`: `number`; `enabled?`: `boolean`; `id`: `"auto-router"`; `pin_model?`: `boolean`; \} \| \{ `allowed_models?`: readonly `string`[]; `cost_quality_tradeoff?`: `number`; `enabled?`: `boolean`; `id`: `"auto-beta-router"`; \} \| \{ `id`: `"moderation"`; \} \| \{ `enabled?`: `boolean`; `engine?`: `"native"` \| `"exa"` \| `"firecrawl"` \| `"parallel"` \| `"perplexity"`; `exclude_domains?`: readonly `string`[]; `id`: `"web"`; `include_domains?`: readonly `string`[]; `max_results?`: `number`; `max_uses?`: `number`; `search_prompt?`: `string`; `user_location?`: \{\[`key`: `string`\]: `Json`; `city?`: `string` \| `null`; `country?`: `string` \| `null`; `region?`: `string` \| `null`; `timezone?`: `string` \| `null`; `type`: `"approximate"`; \}; \} \| \{ `allowed_domains?`: readonly `string`[]; `blocked_domains?`: readonly `string`[]; `id`: `"web-fetch"`; `max_content_tokens?`: `number`; `max_uses?`: `number`; \} \| \{ `enabled?`: `boolean`; `id`: `"file-parser"`; `pdf?`: \{ `engine?`: `"native"` \| `"mistral-ocr"` \| `"cloudflare-ai"` \| `"pdf-text"`; \}; \} \| \{ `enabled?`: `boolean`; `id`: `"response-healing"`; \} \| \{ `enabled?`: `boolean`; `engine?`: `"middle-out"`; `id`: `"context-compression"`; \} \| \{ `enabled?`: `boolean`; `id`: `"pareto-router"`; `max_price?`: `number`; `min_coding_score?`: `number`; `price_source?`: `"prompt"` \| `"weighted_avg"`; \} \| \{ `analysis_models?`: readonly `string`[]; `enabled?`: `boolean`; `id`: `"fusion"`; `max_tool_calls?`: `number`; `model?`: `string`; `preset?`: `"general-high"` \| `"general-budget"` \| `"general-fast"`; `tools?`: readonly `object`[]; \})[]

###### prediction?

> `readonly` `optional` **prediction?**: \{\[`key`: `string`\]: `Json`; `content`: `string` \| readonly `object`[]; `type`: `"content"`; \} \| `null`

###### presence\_penalty?

> `readonly` `optional` **presence\_penalty?**: `number` \| `null`

###### prompt\_cache\_key?

> `readonly` `optional` **prompt\_cache\_key?**: `string` \| `null`

###### prompt\_cache\_options?

> `readonly` `optional` **prompt\_cache\_options?**: \{\[`key`: `string`\]: `Json`; `mode`: `"explicit"`; `ttl?`: `string` \| `null`; \} \| `null`

###### provider?

> `readonly` `optional` **provider?**: \{ `allow_fallbacks?`: `boolean` \| `null`; `data_collection?`: `"allow"` \| `"deny"` \| `null`; `enforce_distillable_text?`: `boolean` \| `null`; `ignore?`: readonly `string`[] \| `null`; `max_price?`: \{ `audio?`: `string`; `completion?`: `string`; `image?`: `string`; `prompt?`: `string`; `request?`: `string`; \}; `only?`: readonly `string`[] \| `null`; `order?`: readonly `string`[] \| `null`; `preferred_max_latency?`: `number` \| \{ `p50?`: `number` \| `null`; `p75?`: `number` \| `null`; `p90?`: `number` \| `null`; `p99?`: `number` \| `null`; \} \| `null`; `preferred_min_throughput?`: `number` \| \{ `p50?`: `number` \| `null`; `p75?`: `number` \| `null`; `p90?`: `number` \| `null`; `p99?`: `number` \| `null`; \} \| `null`; `quantizations?`: readonly (`"unknown"` \| `"int4"` \| `"int8"` \| `"fp4"` \| `"fp6"` \| `"fp8"` \| `"fp16"` \| `"bf16"` \| `"fp32"`)[] \| `null`; `require_parameters?`: `boolean` \| `null`; `sort?`: `"latency"` \| `"price"` \| `"throughput"` \| `"exacto"` \| \{ `by?`: `"latency"` \| `"price"` \| `"throughput"` \| `"exacto"` \| `null`; `partition?`: `"model"` \| `"none"` \| `null`; \} \| `null`; `zdr?`: `boolean` \| `null`; \} \| `null`

###### reasoning?

> `readonly` `optional` **reasoning?**: `object`

###### reasoning.effort?

> `readonly` `optional` **effort?**: `"low"` \| `"medium"` \| `"high"` \| `"max"` \| `"xhigh"` \| `"minimal"` \| `"none"` \| `null`

###### reasoning.summary?

> `readonly` `optional` **summary?**: `"auto"` \| `"concise"` \| `"detailed"` \| `null`

###### reasoning\_effort?

> `readonly` `optional` **reasoning\_effort?**: `"low"` \| `"medium"` \| `"high"` \| `"max"` \| `"xhigh"` \| `"minimal"` \| `"none"` \| `null`

###### repetition\_penalty?

> `readonly` `optional` **repetition\_penalty?**: `number` \| `null`

###### route?

> `readonly` `optional` **route?**: `"fallback"` \| `"sort"` \| `null`

###### seed?

> `readonly` `optional` **seed?**: `number` \| `null`

###### service\_tier?

> `readonly` `optional` **service\_tier?**: `"auto"` \| `"default"` \| `"flex"` \| `"priority"` \| `"scale"` \| `null`

###### session\_id?

> `readonly` `optional` **session\_id?**: `string`

###### stop?

> `readonly` `optional` **stop?**: `string` \| readonly `string`[] \| `null`

###### stop\_server\_tools\_when?

> `readonly` `optional` **stop\_server\_tools\_when?**: readonly (\{ `step_count`: `number`; `type`: `"step_count_is"`; \} \| \{ `tool_name`: `string`; `type`: `"has_tool_call"`; \} \| \{ `max_tokens`: `number`; `type`: `"max_tokens_used"`; \} \| \{ `max_cost_in_dollars`: `number`; `type`: `"max_cost"`; \} \| \{ `reason`: `string`; `type`: `"finish_reason_is"`; \})[]

###### strictJsonSchema?

> `readonly` `optional` **strictJsonSchema?**: `boolean`

###### temperature?

> `readonly` `optional` **temperature?**: `number` \| `null`

###### top\_a?

> `readonly` `optional` **top\_a?**: `number` \| `null`

###### top\_k?

> `readonly` `optional` **top\_k?**: `number` \| `null`

###### top\_logprobs?

> `readonly` `optional` **top\_logprobs?**: `number` \| `null`

###### top\_p?

> `readonly` `optional` **top\_p?**: `number` \| `null`

###### trace?

> `readonly` `optional` **trace?**: `object`

###### trace.generation\_name?

> `readonly` `optional` **generation\_name?**: `string`

###### trace.parent\_span\_id?

> `readonly` `optional` **parent\_span\_id?**: `string`

###### trace.span\_name?

> `readonly` `optional` **span\_name?**: `string`

###### trace.trace\_id?

> `readonly` `optional` **trace\_id?**: `string`

###### trace.trace\_name?

> `readonly` `optional` **trace\_name?**: `string`

###### user?

> `readonly` `optional` **user?**: `string`

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

##### config?

> `readonly` `optional` **config?**: `object`

###### cache\_control?

> `readonly` `optional` **cache\_control?**: `object`

###### cache\_control.ttl?

> `readonly` `optional` **ttl?**: `"5m"` \| `"1h"`

###### cache\_control.type

> `readonly` **type**: `"ephemeral"`

###### frequency\_penalty?

> `readonly` `optional` **frequency\_penalty?**: `number` \| `null`

###### image\_config?

> `readonly` `optional` **image\_config?**: `object`

###### logit\_bias?

> `readonly` `optional` **logit\_bias?**: \{\[`key`: `string`\]: `number`; \} \| `null`

###### logprobs?

> `readonly` `optional` **logprobs?**: `boolean` \| `null`

###### max\_completion\_tokens?

> `readonly` `optional` **max\_completion\_tokens?**: `number` \| `null`

###### max\_tokens?

> `readonly` `optional` **max\_tokens?**: `number` \| `null`

###### metadata?

> `readonly` `optional` **metadata?**: `object`

###### min\_p?

> `readonly` `optional` **min\_p?**: `number` \| `null`

###### modalities?

> `readonly` `optional` **modalities?**: readonly (`"text"` \| `"image"` \| `"audio"`)[]

###### models?

> `readonly` `optional` **models?**: readonly `string`[]

###### parallel\_tool\_calls?

> `readonly` `optional` **parallel\_tool\_calls?**: `boolean` \| `null`

###### plugins?

> `readonly` `optional` **plugins?**: readonly (\{ `allowed_models?`: readonly `string`[]; `cost_quality_tradeoff?`: `number`; `enabled?`: `boolean`; `id`: `"auto-router"`; `pin_model?`: `boolean`; \} \| \{ `allowed_models?`: readonly `string`[]; `cost_quality_tradeoff?`: `number`; `enabled?`: `boolean`; `id`: `"auto-beta-router"`; \} \| \{ `id`: `"moderation"`; \} \| \{ `enabled?`: `boolean`; `engine?`: `"native"` \| `"exa"` \| `"firecrawl"` \| `"parallel"` \| `"perplexity"`; `exclude_domains?`: readonly `string`[]; `id`: `"web"`; `include_domains?`: readonly `string`[]; `max_results?`: `number`; `max_uses?`: `number`; `search_prompt?`: `string`; `user_location?`: \{\[`key`: `string`\]: `Json`; `city?`: `string` \| `null`; `country?`: `string` \| `null`; `region?`: `string` \| `null`; `timezone?`: `string` \| `null`; `type`: `"approximate"`; \}; \} \| \{ `allowed_domains?`: readonly `string`[]; `blocked_domains?`: readonly `string`[]; `id`: `"web-fetch"`; `max_content_tokens?`: `number`; `max_uses?`: `number`; \} \| \{ `enabled?`: `boolean`; `id`: `"file-parser"`; `pdf?`: \{ `engine?`: `"native"` \| `"mistral-ocr"` \| `"cloudflare-ai"` \| `"pdf-text"`; \}; \} \| \{ `enabled?`: `boolean`; `id`: `"response-healing"`; \} \| \{ `enabled?`: `boolean`; `engine?`: `"middle-out"`; `id`: `"context-compression"`; \} \| \{ `enabled?`: `boolean`; `id`: `"pareto-router"`; `max_price?`: `number`; `min_coding_score?`: `number`; `price_source?`: `"prompt"` \| `"weighted_avg"`; \} \| \{ `analysis_models?`: readonly `string`[]; `enabled?`: `boolean`; `id`: `"fusion"`; `max_tool_calls?`: `number`; `model?`: `string`; `preset?`: `"general-high"` \| `"general-budget"` \| `"general-fast"`; `tools?`: readonly `object`[]; \})[]

###### prediction?

> `readonly` `optional` **prediction?**: \{\[`key`: `string`\]: `Json`; `content`: `string` \| readonly `object`[]; `type`: `"content"`; \} \| `null`

###### presence\_penalty?

> `readonly` `optional` **presence\_penalty?**: `number` \| `null`

###### prompt\_cache\_key?

> `readonly` `optional` **prompt\_cache\_key?**: `string` \| `null`

###### prompt\_cache\_options?

> `readonly` `optional` **prompt\_cache\_options?**: \{\[`key`: `string`\]: `Json`; `mode`: `"explicit"`; `ttl?`: `string` \| `null`; \} \| `null`

###### provider?

> `readonly` `optional` **provider?**: \{ `allow_fallbacks?`: `boolean` \| `null`; `data_collection?`: `"allow"` \| `"deny"` \| `null`; `enforce_distillable_text?`: `boolean` \| `null`; `ignore?`: readonly `string`[] \| `null`; `max_price?`: \{ `audio?`: `string`; `completion?`: `string`; `image?`: `string`; `prompt?`: `string`; `request?`: `string`; \}; `only?`: readonly `string`[] \| `null`; `order?`: readonly `string`[] \| `null`; `preferred_max_latency?`: `number` \| \{ `p50?`: `number` \| `null`; `p75?`: `number` \| `null`; `p90?`: `number` \| `null`; `p99?`: `number` \| `null`; \} \| `null`; `preferred_min_throughput?`: `number` \| \{ `p50?`: `number` \| `null`; `p75?`: `number` \| `null`; `p90?`: `number` \| `null`; `p99?`: `number` \| `null`; \} \| `null`; `quantizations?`: readonly (`"unknown"` \| `"int4"` \| `"int8"` \| `"fp4"` \| `"fp6"` \| `"fp8"` \| `"fp16"` \| `"bf16"` \| `"fp32"`)[] \| `null`; `require_parameters?`: `boolean` \| `null`; `sort?`: `"latency"` \| `"price"` \| `"throughput"` \| `"exacto"` \| \{ `by?`: `"latency"` \| `"price"` \| `"throughput"` \| `"exacto"` \| `null`; `partition?`: `"model"` \| `"none"` \| `null`; \} \| `null`; `zdr?`: `boolean` \| `null`; \} \| `null`

###### reasoning?

> `readonly` `optional` **reasoning?**: `object`

###### reasoning.effort?

> `readonly` `optional` **effort?**: `"low"` \| `"medium"` \| `"high"` \| `"max"` \| `"xhigh"` \| `"minimal"` \| `"none"` \| `null`

###### reasoning.summary?

> `readonly` `optional` **summary?**: `"auto"` \| `"concise"` \| `"detailed"` \| `null`

###### reasoning\_effort?

> `readonly` `optional` **reasoning\_effort?**: `"low"` \| `"medium"` \| `"high"` \| `"max"` \| `"xhigh"` \| `"minimal"` \| `"none"` \| `null`

###### repetition\_penalty?

> `readonly` `optional` **repetition\_penalty?**: `number` \| `null`

###### route?

> `readonly` `optional` **route?**: `"fallback"` \| `"sort"` \| `null`

###### seed?

> `readonly` `optional` **seed?**: `number` \| `null`

###### service\_tier?

> `readonly` `optional` **service\_tier?**: `"auto"` \| `"default"` \| `"flex"` \| `"priority"` \| `"scale"` \| `null`

###### session\_id?

> `readonly` `optional` **session\_id?**: `string`

###### stop?

> `readonly` `optional` **stop?**: `string` \| readonly `string`[] \| `null`

###### stop\_server\_tools\_when?

> `readonly` `optional` **stop\_server\_tools\_when?**: readonly (\{ `step_count`: `number`; `type`: `"step_count_is"`; \} \| \{ `tool_name`: `string`; `type`: `"has_tool_call"`; \} \| \{ `max_tokens`: `number`; `type`: `"max_tokens_used"`; \} \| \{ `max_cost_in_dollars`: `number`; `type`: `"max_cost"`; \} \| \{ `reason`: `string`; `type`: `"finish_reason_is"`; \})[]

###### strictJsonSchema?

> `readonly` `optional` **strictJsonSchema?**: `boolean`

###### temperature?

> `readonly` `optional` **temperature?**: `number` \| `null`

###### top\_a?

> `readonly` `optional` **top\_a?**: `number` \| `null`

###### top\_k?

> `readonly` `optional` **top\_k?**: `number` \| `null`

###### top\_logprobs?

> `readonly` `optional` **top\_logprobs?**: `number` \| `null`

###### top\_p?

> `readonly` `optional` **top\_p?**: `number` \| `null`

###### trace?

> `readonly` `optional` **trace?**: `object`

###### trace.generation\_name?

> `readonly` `optional` **generation\_name?**: `string`

###### trace.parent\_span\_id?

> `readonly` `optional` **parent\_span\_id?**: `string`

###### trace.span\_name?

> `readonly` `optional` **span\_name?**: `string`

###### trace.trace\_id?

> `readonly` `optional` **trace\_id?**: `string`

###### trace.trace\_name?

> `readonly` `optional` **trace\_name?**: `string`

###### user?

> `readonly` `optional` **user?**: `string`

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`metadata`](./providers.openai#metadata-3)

##### model

> `readonly` **model**: `string`

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`registrationKey`](./providers.openai#registrationkey-3)

## Type Aliases

### Config

> **Config** = *typeof* `ConfigSchema.Type`

## Variables

### classifyFailure

> `const` **classifyFailure**: [`FailureClassifier`](./generalist/namespaces/ModelRegistry#failureclassifier)

***

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

> `const` **layerConfig**: (`options?`) => `Layer.Layer`\<`OpenRouterClient.OpenRouterClient`, `Config.ConfigError`, `HttpClient.HttpClient`\>

#### Parameters

##### options?

`Parameters`\<*typeof* `OpenRouterClient.layerConfig`\>\[`0`\]

#### Returns

`Layer.Layer`\<`OpenRouterClient.OpenRouterClient`, `Config.ConfigError`, `HttpClient.HttpClient`\>

***

### layerModel

> `const` **layerModel**: (`input`) => `Model.Model`\<`"openrouter"`, `LanguageModel.LanguageModel`, `OpenRouterClient.OpenRouterClient`\>

Model layer over `OpenRouterClient`; provide it to a run with `Effect.provide`.

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Model.Model`\<`"openrouter"`, `LanguageModel.LanguageModel`, `OpenRouterClient.OpenRouterClient`\>

***

### toolJsonSchemaCompiler

> `const` **toolJsonSchemaCompiler**: (`model`) => [`ToolJsonSchemaCompiler`](./generalist/namespaces/ModelRegistry#tooljsonschemacompiler-1)

#### Parameters

##### model

`string`

#### Returns

[`ToolJsonSchemaCompiler`](./generalist/namespaces/ModelRegistry#tooljsonschemacompiler-1)
