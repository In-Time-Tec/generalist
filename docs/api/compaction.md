[**generalist**](./index)

***

[generalist](./index) / compaction

# compaction

## Classes

<a id="compaction"></a>

### Compaction

#### Extends

- `Compaction_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new Compaction**(`_`): [`Compaction`](#compaction)

###### Parameters

###### \_

`never`

###### Returns

[`Compaction`](#compaction)

###### Inherited from

`Compaction_base.constructor`

***

<a id="compactionerror"></a>

### CompactionError

Compaction service failure.

#### Extends

- `CompactionError_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new CompactionError**(...`args`): [`CompactionError`](#compactionerror)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`CompactionError`](#compactionerror)

###### Inherited from

`CompactionError_base.constructor`

#### Properties

<a id="cause"></a>

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`CompactionError_base.cause`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`CompactionError_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`CompactionError_base.message`

## Interfaces

<a id="cacheawareoptions"></a>

### CacheAwareOptions

Options for cache-aware semantic compaction.

#### Properties

<a id="keeprecenttokens"></a>

##### keepRecentTokens?

> `readonly` `optional` **keepRecentTokens?**: `number`

<a id="media"></a>

##### media?

> `readonly` `optional` **media?**: `Strategy`

<a id="stableprefixturns"></a>

##### stablePrefixTurns

> `readonly` **stablePrefixTurns**: `number`

<a id="summarize"></a>

##### summarize

> `readonly` **summarize**: (`plan`, `request`) => `Effect`\<`string`, [`CompactionError`](#compactionerror), `LanguageModel`\>

###### Parameters

###### plan

[`Plan`](#plan)

###### request

[`Request`](#request)

###### Returns

`Effect`\<`string`, [`CompactionError`](#compactionerror), `LanguageModel`\>

***

<a id="defaultoptions"></a>

### DefaultOptions

Options for the default compaction implementation.

#### Extended by

- [`LayerOptions`](#layeroptions)

#### Properties

<a id="contextwindow"></a>

##### contextWindow?

> `readonly` `optional` **contextWindow?**: `number`

<a id="keeprecenttokens-1"></a>

##### keepRecentTokens?

> `readonly` `optional` **keepRecentTokens?**: `number`

<a id="media-1"></a>

##### media?

> `readonly` `optional` **media?**: `Strategy`

**`Experimental`**

Reference-only media handling during compaction.

<a id="reservetokens"></a>

##### reserveTokens?

> `readonly` `optional` **reserveTokens?**: `number`

<a id="summarymodel"></a>

##### summaryModel?

> `readonly` `optional` **summaryModel?**: `Layer`\<`LanguageModel`, `never`, `never`\>

<a id="summaryprompt"></a>

##### summaryPrompt?

> `readonly` `optional` **summaryPrompt?**: `string`

***

<a id="keeprecentoptions"></a>

### KeepRecentOptions

Options for token-denominated recent retention.

#### Properties

<a id="tokens"></a>

##### tokens

> `readonly` **tokens**: `number`

***

<a id="layerconstructor"></a>

### LayerConstructor()

Layer wiring the default or provided strategy.

#### Call Signature

> **LayerConstructor**(`options?`): `Layer`\<[`Compaction`](#compaction)\>

Layer wiring the default or provided strategy.

##### Parameters

###### options?

[`LayerOptions`](#layeroptions)

##### Returns

`Layer`\<[`Compaction`](#compaction)\>

#### Call Signature

> **LayerConstructor**(`providedStrategy`): `Layer`\<[`Compaction`](#compaction)\>

Layer wiring the default or provided strategy.

##### Parameters

###### providedStrategy

[`Strategy`](#strategy-1)

##### Returns

`Layer`\<[`Compaction`](#compaction)\>

***

<a id="layeroptions"></a>

### LayerOptions

Options accepted by the Compaction layer.

#### Extends

- [`DefaultOptions`](#defaultoptions)

#### Properties

<a id="contextwindow-1"></a>

##### contextWindow?

> `readonly` `optional` **contextWindow?**: `number`

###### Inherited from

[`DefaultOptions`](#defaultoptions).[`contextWindow`](#contextwindow)

<a id="keeprecenttokens-2"></a>

##### keepRecentTokens?

> `readonly` `optional` **keepRecentTokens?**: `number`

###### Inherited from

[`DefaultOptions`](#defaultoptions).[`keepRecentTokens`](#keeprecenttokens-1)

<a id="media-2"></a>

##### media?

> `readonly` `optional` **media?**: `Strategy`

**`Experimental`**

Reference-only media handling during compaction.

###### Inherited from

[`DefaultOptions`](#defaultoptions).[`media`](#media-1)

<a id="reservetokens-1"></a>

##### reserveTokens?

> `readonly` `optional` **reserveTokens?**: `number`

###### Inherited from

[`DefaultOptions`](#defaultoptions).[`reserveTokens`](#reservetokens)

<a id="strategy"></a>

##### strategy?

> `readonly` `optional` **strategy?**: [`Strategy`](#strategy-1)

<a id="summarymodel-1"></a>

##### summaryModel?

> `readonly` `optional` **summaryModel?**: `Layer`\<`LanguageModel`, `never`, `never`\>

###### Inherited from

[`DefaultOptions`](#defaultoptions).[`summaryModel`](#summarymodel)

<a id="summaryprompt-1"></a>

##### summaryPrompt?

> `readonly` `optional` **summaryPrompt?**: `string`

###### Inherited from

[`DefaultOptions`](#defaultoptions).[`summaryPrompt`](#summaryprompt)

***

<a id="outputboundoptions"></a>

### OutputBoundOptions

Options for lossless tool-output bounding.

#### Properties

<a id="maxbytes"></a>

##### maxBytes

> `readonly` **maxBytes**: `number`

***

<a id="plan"></a>

### Plan

What to keep verbatim and what the summary replaces.

#### Properties

<a id="compact"></a>

##### compact

> `readonly` **compact**: `Prompt`

<a id="keep"></a>

##### keep

> `readonly` **keep**: `Prompt`

<a id="recent"></a>

##### recent

> `readonly` **recent**: `Prompt`

***

<a id="request"></a>

### Request

Request passed to a compaction implementation.

#### Properties

<a id="agentname"></a>

##### agentName

> `readonly` **agentName**: `string`

<a id="compactionid"></a>

##### compactionId

> `readonly` **compactionId**: `string`

<a id="history"></a>

##### history

> `readonly` **history**: `Prompt`

<a id="overflow"></a>

##### overflow

> `readonly` **overflow**: `boolean`

<a id="path"></a>

##### path?

> `readonly` `optional` **path?**: readonly [`Entry`](./generalist/namespaces/Session#entry)[]

<a id="prompt"></a>

##### prompt

> `readonly` **prompt**: `Prompt`

<a id="runid"></a>

##### runId?

> `readonly` `optional` **runId?**: `string`

Durable run identity. Keys the unchanged-threshold cache so concurrent runs never share an entry.

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

<a id="tooloutputmaxbytes"></a>

##### toolOutputMaxBytes?

> `readonly` `optional` **toolOutputMaxBytes?**: `number`

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

<a id="usage"></a>

##### usage

> `readonly` **usage**: [`Usage`](#usage-1)

***

<a id="service"></a>

### Service

Compaction service boundary consulted by the loop.

#### Properties

<a id="maybecompact"></a>

##### maybeCompact

> `readonly` **maybeCompact**: (`request`) => `Effect`\<`Option`\<\{ `history`: `Prompt`; `prompt`: `Prompt`; \} \| \{ `history`: `Prompt`; `prompt`: `Prompt`; `summary`: `string`; \}\>, [`CompactionError`](#compactionerror), `LanguageModel`\>

###### Parameters

###### request

[`Request`](#request)

###### Returns

`Effect`\<`Option`\<\{ `history`: `Prompt`; `prompt`: `Prompt`; \} \| \{ `history`: `Prompt`; `prompt`: `Prompt`; `summary`: `string`; \}\>, [`CompactionError`](#compactionerror), `LanguageModel`\>

<a id="willcompact"></a>

##### willCompact?

> `readonly` `optional` **willCompact?**: (`input`) => `boolean`

###### Parameters

###### input

###### overflow

`boolean`

###### usage

[`Usage`](#usage-1)

###### Returns

`boolean`

***

<a id="strategy-1"></a>

### Strategy

Compaction strategy: decide, cut, summarize.

#### Properties

<a id="cut"></a>

##### cut

> `readonly` **cut**: (`prompt`, `keepRecentTokens`) => `Option`\<[`Plan`](#plan)\>

###### Parameters

###### prompt

`Prompt`

###### keepRecentTokens

`number`

###### Returns

`Option`\<[`Plan`](#plan)\>

<a id="keeprecenttokens-3"></a>

##### keepRecentTokens?

> `readonly` `optional` **keepRecentTokens?**: `number`

<a id="media-3"></a>

##### media

> `readonly` **media**: `Strategy`

**`Experimental`**

Reference-only media handling during compaction.

<a id="shouldcompact"></a>

##### shouldCompact

> `readonly` **shouldCompact**: (`input`) => `boolean`

###### Parameters

###### input

###### contextWindow

`number`

###### tokens

`number`

###### Returns

`boolean`

<a id="summarize-1"></a>

##### summarize

> `readonly` **summarize**: (`plan`, `request`) => `Effect`\<`string`, [`CompactionError`](#compactionerror), `LanguageModel`\>

###### Parameters

###### plan

[`Plan`](#plan)

###### request

[`Request`](#request)

###### Returns

`Effect`\<`string`, [`CompactionError`](#compactionerror), `LanguageModel`\>

<a id="tooloutputmaxbytes-1"></a>

##### toolOutputMaxBytes?

> `readonly` `optional` **toolOutputMaxBytes?**: `number`

***

<a id="strategypart"></a>

### StrategyPart

One independently composable compaction capability.

#### Properties

<a id="cut-1"></a>

##### cut?

> `readonly` `optional` **cut?**: (`prompt`, `keepRecentTokens`) => `Option`\<[`Plan`](#plan)\>

###### Parameters

###### prompt

`Prompt`

###### keepRecentTokens

`number`

###### Returns

`Option`\<[`Plan`](#plan)\>

<a id="keeprecenttokens-4"></a>

##### keepRecentTokens?

> `readonly` `optional` **keepRecentTokens?**: `number`

<a id="media-4"></a>

##### media?

> `readonly` `optional` **media?**: `Strategy`

**`Experimental`**

Reference-only media handling during compaction.

<a id="shouldcompact-1"></a>

##### shouldCompact?

> `readonly` `optional` **shouldCompact?**: (`input`) => `boolean`

###### Parameters

###### input

###### contextWindow

`number`

###### tokens

`number`

###### Returns

`boolean`

<a id="summarize-2"></a>

##### summarize?

> `readonly` `optional` **summarize?**: (`plan`, `request`) => `Effect`\<`string`, [`CompactionError`](#compactionerror), `LanguageModel`\>

###### Parameters

###### plan

[`Plan`](#plan)

###### request

[`Request`](#request)

###### Returns

`Effect`\<`string`, [`CompactionError`](#compactionerror), `LanguageModel`\>

<a id="tooloutputmaxbytes-2"></a>

##### toolOutputMaxBytes?

> `readonly` `optional` **toolOutputMaxBytes?**: `number`

***

<a id="structuredsummaryoptions"></a>

### StructuredSummaryOptions

Options for schema-validated structured summaries.

#### Properties

<a id="objectname"></a>

##### objectName?

> `readonly` `optional` **objectName?**: `string`

<a id="summarymodel-2"></a>

##### summaryModel?

> `readonly` `optional` **summaryModel?**: `Layer`\<`LanguageModel`, `never`, `never`\>

<a id="summaryprompt-2"></a>

##### summaryPrompt?

> `readonly` `optional` **summaryPrompt?**: `string`

***

<a id="summarizewithmodeloptions"></a>

### SummarizeWithModelOptions

Options for model-backed text summaries.

#### Properties

<a id="model"></a>

##### model?

> `readonly` `optional` **model?**: `Layer`\<`LanguageModel`, `never`, `never`\>

Closed model layer for summary calls; omit to use the ambient LanguageModel.

<a id="prompt-1"></a>

##### prompt?

> `readonly` `optional` **prompt?**: `string`

***

<a id="usage-1"></a>

### Usage

Token accounting for a compaction decision.

#### Properties

<a id="contexttokens"></a>

##### contextTokens

> `readonly` **contextTokens**: `number`

<a id="contextwindow-2"></a>

##### contextWindow

> `readonly` **contextWindow**: `number`

<a id="reservetokens-2"></a>

##### reserveTokens

> `readonly` **reserveTokens**: `number`

## Type Aliases

<a id="agentsummary"></a>

### AgentSummary

> **AgentSummary** = *typeof* `AgentSummary.Type`

Structured checkpoint schema used by structuredSummary.

***

<a id="microcompactresult"></a>

### MicrocompactResult

> **MicrocompactResult** = `Extract`\<[`Result`](#result), \{ `_tag`: `"Microcompact"`; \}\>

Result from tool-output microcompaction.

***

<a id="result"></a>

### Result

> **Result** = *typeof* `Result.Type`

Compaction result applied by the agent loop.

***

<a id="summarizeresult"></a>

### SummarizeResult

> **SummarizeResult** = `Extract`\<[`Result`](#result), \{ `_tag`: `"Summarize"`; \}\>

Result from summary checkpointing.

## Variables

<a id="agentsummary-1"></a>

### AgentSummary

> `const` **AgentSummary**: `Schema.Struct`\<\{ `decisions`: `Schema.$Array`\<`Schema.String`\>; `facts`: `Schema.$Array`\<`Schema.String`\>; `goal`: `Schema.String`; `openQuestions`: `Schema.$Array`\<`Schema.String`\>; `toolFindings`: `Schema.$Array`\<`Schema.String`\>; \}\>

Structured checkpoint schema used by structuredSummary.

***

<a id="cacheaware"></a>

### cacheAware

> `const` **cacheAware**: (`options`) => [`Strategy`](#strategy-1)

Keep instructions and the oldest configured user turns byte-stable,
summarize only the middle, and retain the recent token-denominated tail verbatim.

#### Parameters

##### options

[`CacheAwareOptions`](#cacheawareoptions)

#### Returns

[`Strategy`](#strategy-1)

***

<a id="defaultkeeprecenttokens"></a>

### defaultKeepRecentTokens

> `const` **defaultKeepRecentTokens**: `20000` = `20000`

Default recent-session suffix target kept verbatim.

***

<a id="defaultreservetokens"></a>

### defaultReserveTokens

> `const` **defaultReserveTokens**: `16384` = `16384`

Default headroom kept for the next model response.

***

<a id="defaultstrategy"></a>

### defaultStrategy

> `const` **defaultStrategy**: (`options?`) => [`Strategy`](#strategy-1)

The default two-stage compaction strategy.

#### Parameters

##### options?

[`DefaultOptions`](#defaultoptions)

#### Returns

[`Strategy`](#strategy-1)

***

<a id="keeprecent"></a>

### keepRecent

> `const` **keepRecent**: (`options`) => [`StrategyPart`](#strategypart)

Configure the token target retained verbatim after a summary cut.

#### Parameters

##### options

[`KeepRecentOptions`](#keeprecentoptions)

#### Returns

[`StrategyPart`](#strategypart)

***

<a id="layer"></a>

### layer

> `const` **layer**: [`LayerConstructor`](#layerconstructor)

Layer wiring the default or provided strategy.

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Compaction`](#compaction)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`Compaction`](#compaction)\>

***

<a id="layertruncate"></a>

### layerTruncate

> `const` **layerTruncate**: (`maxTokens`) => `Layer.Layer`\<[`Compaction`](#compaction), `never`, `Tokenizer.Tokenizer`\>

Exact truncate-only compaction. The layer declares the `Tokenizer` requirement.

#### Parameters

##### maxTokens

`number`

#### Returns

`Layer.Layer`\<[`Compaction`](#compaction), `never`, `Tokenizer.Tokenizer`\>

***

<a id="layertruncateestimated"></a>

### layerTruncateEstimated

> `const` **layerTruncateEstimated**: (`maxTokens`) => `Layer.Layer`\<[`Compaction`](#compaction)\>

Approximate truncate-only compaction over the prompt token estimator; no `Tokenizer` required.

#### Parameters

##### maxTokens

`number`

#### Returns

`Layer.Layer`\<[`Compaction`](#compaction)\>

***

<a id="make"></a>

### make

> `const` **make**: \{(`options?`): (`compactionStrategy`) => [`Service`](#service); (`compactionStrategy`, `options?`): [`Service`](#service); \}

Build a compaction service from a strategy.

#### Call Signature

> (`options?`): (`compactionStrategy`) => [`Service`](#service)

##### Parameters

###### options?

[`DefaultOptions`](#defaultoptions)

##### Returns

(`compactionStrategy`) => [`Service`](#service)

#### Call Signature

> (`compactionStrategy`, `options?`): [`Service`](#service)

##### Parameters

###### compactionStrategy

[`Strategy`](#strategy-1)

###### options?

[`DefaultOptions`](#defaultoptions)

##### Returns

[`Service`](#service)

***

<a id="result-1"></a>

### Result

> `const` **Result**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Microcompact"`, \{ `history`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; \}\>, `Schema.TaggedStruct`\<`"Summarize"`, \{ `history`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `summary`: `Schema.String`; \}\>\]\>

Compaction result applied by the agent loop.

***

<a id="strategy-2"></a>

### strategy

> `const` **strategy**: \{(`base?`): (`parts`) => [`Strategy`](#strategy-1); (`parts`, `base?`): [`Strategy`](#strategy-1); \}

Compile ordered strategy parts onto a complete strategy.

#### Call Signature

> (`base?`): (`parts`) => [`Strategy`](#strategy-1)

##### Parameters

###### base?

[`Strategy`](#strategy-1)

##### Returns

(`parts`) => [`Strategy`](#strategy-1)

#### Call Signature

> (`parts`, `base?`): [`Strategy`](#strategy-1)

##### Parameters

###### parts

readonly [`StrategyPart`](#strategypart)[]

###### base?

[`Strategy`](#strategy-1)

##### Returns

[`Strategy`](#strategy-1)

***

<a id="structuredsummary"></a>

### structuredSummary

> `const` **structuredSummary**: (`options?`) => [`StrategyPart`](#strategypart)

Summarize through Effect AI structured output and render a string checkpoint.

#### Parameters

##### options?

[`StructuredSummaryOptions`](#structuredsummaryoptions)

#### Returns

[`StrategyPart`](#strategypart)

***

<a id="summarizewithmodel"></a>

### summarizeWithModel

> `const` **summarizeWithModel**: (`options?`) => [`Strategy`](#strategy-1)\[`"summarize"`\]

Summarize compacted context with an ambient or dedicated LanguageModel.

#### Parameters

##### options?

[`SummarizeWithModelOptions`](#summarizewithmodeloptions)

#### Returns

[`Strategy`](#strategy-1)\[`"summarize"`\]

***

<a id="summarytemplate"></a>

### summaryTemplate

> `const` **summaryTemplate**: "Summarize the conversation so another agent can continue seamlessly.\n\nUse Markdown with these sections:\n\n## Goal\n## Constraints\n## Progress\n### Done\n### In Progress\n### Blocked\n## Key Decisions\n## Next Steps\n## Critical Context\n\nDo not mention that context was compacted." = "Summarize the conversation so another agent can continue seamlessly.\n\nUse Markdown with these sections:\n\n## Goal\n## Constraints\n## Progress\n### Done\n### In Progress\n### Blocked\n## Key Decisions\n## Next Steps\n## Critical Context\n\nDo not mention that context was compacted."

Fixed prompt used for dedicated summary calls.

***

<a id="tooloutputbound"></a>

### toolOutputBound

> `const` **toolOutputBound**: (`options`) => [`StrategyPart`](#strategypart)

Configure lossless successful-tool-result bounding.

#### Parameters

##### options

[`OutputBoundOptions`](#outputboundoptions)

#### Returns

[`StrategyPart`](#strategypart)

***

<a id="withlifecycle"></a>

### withLifecycle

> `const` **withLifecycle**: (`request`) => \<`A`, `E`, `R`\>(`work`) => `Effect.Effect`\<`Option.Option`\<[`Result`](#result)\>, `E`, `R`\>

Wrap custom work after deciding to run; changed results must use this to join their lifecycle.

#### Parameters

##### request

[`Request`](#request)

#### Returns

\<`A`, `E`, `R`\>(`work`) => `Effect.Effect`\<`Option.Option`\<[`Result`](#result)\>, `E`, `R`\>
