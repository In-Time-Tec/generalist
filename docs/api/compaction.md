[**generalist**](./index)

***

[generalist](./index) / compaction

# compaction

## Classes

### Compaction

#### Extends

- `Compaction_base`

#### Constructors

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

### CompactionError

Compaction service failure.

#### Extends

- `CompactionError_base`

#### Constructors

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

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`CompactionError_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`CompactionError_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`CompactionError_base.message`

## Interfaces

### CacheAwareOptions

Options for cache-aware semantic compaction.

#### Properties

##### keepRecentTokens?

> `readonly` `optional` **keepRecentTokens?**: `number`

##### media?

> `readonly` `optional` **media?**: `Strategy`

##### stablePrefixTurns

> `readonly` **stablePrefixTurns**: `number`

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

### DefaultOptions

Options for the default compaction implementation.

#### Extended by

- [`LayerOptions`](#layeroptions)

#### Properties

##### contextWindow?

> `readonly` `optional` **contextWindow?**: `number`

##### keepRecentTokens?

> `readonly` `optional` **keepRecentTokens?**: `number`

##### media?

> `readonly` `optional` **media?**: `Strategy`

**`Experimental`**

Reference-only media handling during compaction.

##### reserveTokens?

> `readonly` `optional` **reserveTokens?**: `number`

##### summaryModel?

> `readonly` `optional` **summaryModel?**: `Layer`\<`LanguageModel`, `never`, `never`\>

##### summaryPrompt?

> `readonly` `optional` **summaryPrompt?**: `string`

***

### KeepRecentOptions

Options for token-denominated recent retention.

#### Properties

##### tokens

> `readonly` **tokens**: `number`

***

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

### LayerOptions

Options accepted by the Compaction layer.

#### Extends

- [`DefaultOptions`](#defaultoptions)

#### Properties

##### contextWindow?

> `readonly` `optional` **contextWindow?**: `number`

###### Inherited from

[`DefaultOptions`](#defaultoptions).[`contextWindow`](#contextwindow)

##### keepRecentTokens?

> `readonly` `optional` **keepRecentTokens?**: `number`

###### Inherited from

[`DefaultOptions`](#defaultoptions).[`keepRecentTokens`](#keeprecenttokens-1)

##### media?

> `readonly` `optional` **media?**: `Strategy`

**`Experimental`**

Reference-only media handling during compaction.

###### Inherited from

[`DefaultOptions`](#defaultoptions).[`media`](#media-1)

##### reserveTokens?

> `readonly` `optional` **reserveTokens?**: `number`

###### Inherited from

[`DefaultOptions`](#defaultoptions).[`reserveTokens`](#reservetokens)

##### strategy?

> `readonly` `optional` **strategy?**: [`Strategy`](#strategy-1)

##### summaryModel?

> `readonly` `optional` **summaryModel?**: `Layer`\<`LanguageModel`, `never`, `never`\>

###### Inherited from

[`DefaultOptions`](#defaultoptions).[`summaryModel`](#summarymodel)

##### summaryPrompt?

> `readonly` `optional` **summaryPrompt?**: `string`

###### Inherited from

[`DefaultOptions`](#defaultoptions).[`summaryPrompt`](#summaryprompt)

***

### OutputBoundOptions

Options for lossless tool-output bounding.

#### Properties

##### maxBytes

> `readonly` **maxBytes**: `number`

***

### Plan

What to keep verbatim and what the summary replaces.

#### Properties

##### compact

> `readonly` **compact**: `Prompt`

##### keep

> `readonly` **keep**: `Prompt`

##### recent

> `readonly` **recent**: `Prompt`

***

### Request

Request passed to a compaction implementation.

#### Properties

##### agentName

> `readonly` **agentName**: `string`

##### compactionId

> `readonly` **compactionId**: `string`

##### history

> `readonly` **history**: `Prompt`

##### overflow

> `readonly` **overflow**: `boolean`

##### path?

> `readonly` `optional` **path?**: readonly [`Entry`](./generalist/namespaces/Session#entry)[]

##### prompt

> `readonly` **prompt**: `Prompt`

##### runId?

> `readonly` `optional` **runId?**: `string`

Durable run identity. Keys the unchanged-threshold cache so concurrent runs never share an entry.

##### sessionId

> `readonly` **sessionId**: `string`

##### toolOutputMaxBytes?

> `readonly` `optional` **toolOutputMaxBytes?**: `number`

##### turn

> `readonly` **turn**: `number`

##### usage

> `readonly` **usage**: [`Usage`](#usage-1)

***

### Service

Compaction service boundary consulted by the loop.

#### Properties

##### maybeCompact

> `readonly` **maybeCompact**: (`request`) => `Effect`\<`Option`\<\{ `history`: `Prompt`; `prompt`: `Prompt`; \} \| \{ `history`: `Prompt`; `prompt`: `Prompt`; `summary`: `string`; \}\>, [`CompactionError`](#compactionerror), `LanguageModel`\>

###### Parameters

###### request

[`Request`](#request)

###### Returns

`Effect`\<`Option`\<\{ `history`: `Prompt`; `prompt`: `Prompt`; \} \| \{ `history`: `Prompt`; `prompt`: `Prompt`; `summary`: `string`; \}\>, [`CompactionError`](#compactionerror), `LanguageModel`\>

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

### Strategy

Compaction strategy: decide, cut, summarize.

#### Properties

##### cut

> `readonly` **cut**: (`prompt`, `keepRecentTokens`) => `Option`\<[`Plan`](#plan)\>

###### Parameters

###### prompt

`Prompt`

###### keepRecentTokens

`number`

###### Returns

`Option`\<[`Plan`](#plan)\>

##### keepRecentTokens?

> `readonly` `optional` **keepRecentTokens?**: `number`

##### media

> `readonly` **media**: `Strategy`

**`Experimental`**

Reference-only media handling during compaction.

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

##### summarize

> `readonly` **summarize**: (`plan`, `request`) => `Effect`\<`string`, [`CompactionError`](#compactionerror), `LanguageModel`\>

###### Parameters

###### plan

[`Plan`](#plan)

###### request

[`Request`](#request)

###### Returns

`Effect`\<`string`, [`CompactionError`](#compactionerror), `LanguageModel`\>

##### toolOutputMaxBytes?

> `readonly` `optional` **toolOutputMaxBytes?**: `number`

***

### StrategyPart

One independently composable compaction capability.

#### Properties

##### cut?

> `readonly` `optional` **cut?**: (`prompt`, `keepRecentTokens`) => `Option`\<[`Plan`](#plan)\>

###### Parameters

###### prompt

`Prompt`

###### keepRecentTokens

`number`

###### Returns

`Option`\<[`Plan`](#plan)\>

##### keepRecentTokens?

> `readonly` `optional` **keepRecentTokens?**: `number`

##### media?

> `readonly` `optional` **media?**: `Strategy`

**`Experimental`**

Reference-only media handling during compaction.

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

##### summarize?

> `readonly` `optional` **summarize?**: (`plan`, `request`) => `Effect`\<`string`, [`CompactionError`](#compactionerror), `LanguageModel`\>

###### Parameters

###### plan

[`Plan`](#plan)

###### request

[`Request`](#request)

###### Returns

`Effect`\<`string`, [`CompactionError`](#compactionerror), `LanguageModel`\>

##### toolOutputMaxBytes?

> `readonly` `optional` **toolOutputMaxBytes?**: `number`

***

### StructuredSummaryOptions

Options for schema-validated structured summaries.

#### Properties

##### objectName?

> `readonly` `optional` **objectName?**: `string`

##### summaryModel?

> `readonly` `optional` **summaryModel?**: `Layer`\<`LanguageModel`, `never`, `never`\>

##### summaryPrompt?

> `readonly` `optional` **summaryPrompt?**: `string`

***

### SummarizeWithModelOptions

Options for model-backed text summaries.

#### Properties

##### model?

> `readonly` `optional` **model?**: `Layer`\<`LanguageModel`, `never`, `never`\>

Closed model layer for summary calls; omit to use the ambient LanguageModel.

##### prompt?

> `readonly` `optional` **prompt?**: `string`

***

### Usage

Token accounting for a compaction decision.

#### Properties

##### contextTokens

> `readonly` **contextTokens**: `number`

##### contextWindow

> `readonly` **contextWindow**: `number`

##### reserveTokens

> `readonly` **reserveTokens**: `number`

## Type Aliases

### AgentSummary

> **AgentSummary** = *typeof* `AgentSummary.Type`

Structured checkpoint schema used by structuredSummary.

***

### MicrocompactResult

> **MicrocompactResult** = `Extract`\<[`Result`](#result), \{ `_tag`: `"Microcompact"`; \}\>

Result from tool-output microcompaction.

***

### Result

> **Result** = *typeof* `Result.Type`

Compaction result applied by the agent loop.

***

### SummarizeResult

> **SummarizeResult** = `Extract`\<[`Result`](#result), \{ `_tag`: `"Summarize"`; \}\>

Result from summary checkpointing.

## Variables

### AgentSummary

> `const` **AgentSummary**: `Schema.Struct`\<\{ `decisions`: `Schema.$Array`\<`Schema.String`\>; `facts`: `Schema.$Array`\<`Schema.String`\>; `goal`: `Schema.String`; `openQuestions`: `Schema.$Array`\<`Schema.String`\>; `toolFindings`: `Schema.$Array`\<`Schema.String`\>; \}\>

Structured checkpoint schema used by structuredSummary.

***

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

### defaultKeepRecentTokens

> `const` **defaultKeepRecentTokens**: `20000` = `20000`

Default recent-session suffix target kept verbatim.

***

### defaultReserveTokens

> `const` **defaultReserveTokens**: `16384` = `16384`

Default headroom kept for the next model response.

***

### defaultStrategy

> `const` **defaultStrategy**: (`options?`) => [`Strategy`](#strategy-1)

The default two-stage compaction strategy.

#### Parameters

##### options?

[`DefaultOptions`](#defaultoptions)

#### Returns

[`Strategy`](#strategy-1)

***

### keepRecent

> `const` **keepRecent**: (`options`) => [`StrategyPart`](#strategypart)

Configure the token target retained verbatim after a summary cut.

#### Parameters

##### options

[`KeepRecentOptions`](#keeprecentoptions)

#### Returns

[`StrategyPart`](#strategypart)

***

### layer

> `const` **layer**: [`LayerConstructor`](#layerconstructor)

Layer wiring the default or provided strategy.

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Compaction`](#compaction)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`Compaction`](#compaction)\>

***

### layerTruncate

> `const` **layerTruncate**: (`maxTokens`) => `Layer.Layer`\<[`Compaction`](#compaction), `never`, `Tokenizer.Tokenizer`\>

Exact truncate-only compaction. The layer declares the `Tokenizer` requirement.

#### Parameters

##### maxTokens

`number`

#### Returns

`Layer.Layer`\<[`Compaction`](#compaction), `never`, `Tokenizer.Tokenizer`\>

***

### layerTruncateEstimated

> `const` **layerTruncateEstimated**: (`maxTokens`) => `Layer.Layer`\<[`Compaction`](#compaction)\>

Approximate truncate-only compaction over the prompt token estimator; no `Tokenizer` required.

#### Parameters

##### maxTokens

`number`

#### Returns

`Layer.Layer`\<[`Compaction`](#compaction)\>

***

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

### Result

> `const` **Result**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Microcompact"`, \{ `history`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; \}\>, `Schema.TaggedStruct`\<`"Summarize"`, \{ `history`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `summary`: `Schema.String`; \}\>\]\>

Compaction result applied by the agent loop.

***

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

### structuredSummary

> `const` **structuredSummary**: (`options?`) => [`StrategyPart`](#strategypart)

Summarize through Effect AI structured output and render a string checkpoint.

#### Parameters

##### options?

[`StructuredSummaryOptions`](#structuredsummaryoptions)

#### Returns

[`StrategyPart`](#strategypart)

***

### summarizeWithModel

> `const` **summarizeWithModel**: (`options?`) => [`Strategy`](#strategy-1)\[`"summarize"`\]

Summarize compacted context with an ambient or dedicated LanguageModel.

#### Parameters

##### options?

[`SummarizeWithModelOptions`](#summarizewithmodeloptions)

#### Returns

[`Strategy`](#strategy-1)\[`"summarize"`\]

***

### summaryTemplate

> `const` **summaryTemplate**: "Summarize the conversation so another agent can continue seamlessly.\n\nUse Markdown with these sections:\n\n## Goal\n## Constraints\n## Progress\n### Done\n### In Progress\n### Blocked\n## Key Decisions\n## Next Steps\n## Critical Context\n\nDo not mention that context was compacted." = "Summarize the conversation so another agent can continue seamlessly.\n\nUse Markdown with these sections:\n\n## Goal\n## Constraints\n## Progress\n### Done\n### In Progress\n### Blocked\n## Key Decisions\n## Next Steps\n## Critical Context\n\nDo not mention that context was compacted."

Fixed prompt used for dedicated summary calls.

***

### toolOutputBound

> `const` **toolOutputBound**: (`options`) => [`StrategyPart`](#strategypart)

Configure lossless successful-tool-result bounding.

#### Parameters

##### options

[`OutputBoundOptions`](#outputboundoptions)

#### Returns

[`StrategyPart`](#strategypart)

***

### withLifecycle

> `const` **withLifecycle**: (`request`) => \<`A`, `E`, `R`\>(`work`) => `Effect.Effect`\<`Option.Option`\<[`Result`](#result)\>, `E`, `R`\>

Wrap custom work after deciding to run; changed results must use this to join their lifecycle.

#### Parameters

##### request

[`Request`](#request)

#### Returns

\<`A`, `E`, `R`\>(`work`) => `Effect.Effect`\<`Option.Option`\<[`Result`](#result)\>, `E`, `R`\>
