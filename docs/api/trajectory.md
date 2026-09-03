[**generalist**](./index)

***

[generalist](./index) / trajectory

# trajectory

## Classes

<a id="projectionfailed"></a>

### ProjectionFailed

#### Extends

- `ProjectionFailed_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new ProjectionFailed**(...`args`): [`ProjectionFailed`](#projectionfailed)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProjectionFailed`](#projectionfailed)

###### Inherited from

`ProjectionFailed_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProjectionFailed_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`ProjectionFailed_base.message`

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`ProjectionFailed_base.runId`

## Interfaces

<a id="exportoptions"></a>

### ExportOptions

#### Properties

<a id="format"></a>

##### format

> `readonly` **format**: `"jsonl"`

***

<a id="journalreader"></a>

### JournalReader

Cross-driver Runtime journal reads required by `fromJournal`.

#### Extended by

- [`DagRuntime`](./unstable.rl-export/index#dagruntime)

#### Properties

<a id="history"></a>

##### history

> `readonly` **history**: (`input`) => `Effect`\<readonly [`RunEvent`](./runtime/namespaces/RunEvent#runevent)[], [`EventsError`](./runtime/namespaces/Runtime#eventserror)\>

###### Parameters

###### input

[`HistoryInput`](./runtime/namespaces/Runtime#historyinput)

###### Returns

`Effect`\<readonly [`RunEvent`](./runtime/namespaces/RunEvent#runevent)[], [`EventsError`](./runtime/namespaces/Runtime#eventserror)\>

<a id="resolvemodelresponse"></a>

##### resolveModelResponse

> `readonly` **resolveModelResponse**: (`event`) => `Effect`\<\{ `content`: readonly (\{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"text"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"reasoning"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `approvalId`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `toolCallId`: `string`; `type`: `"tool-approval-request"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `data`: `Uint8Array`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `type`: `"file"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `fileName?`: `string`; `id`: `string`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"document"`; `title`: `string`; `type`: `"source"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"url"`; `title`: `string`; `type`: `"source"`; `url`: `URL`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id?`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `modelId?`: `string`; `request?`: \{ \}; `timestamp?`: `Utc`; `type`: `"response-metadata"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `reason`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `response?`: \{ `headers`: \{\[`key`: `string`\]: `string` \| `Redacted`\<...\>; \}; `status`: `number`; \}; `type`: `"finish"`; `usage`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `params`: `unknown`; `providerExecuted`: `boolean`; `type`: `"tool-call"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `encodedResult`: `unknown`; `id`: `string`; `isFailure`: `boolean`; `memoized?`: \{ `fromOperation`: `string`; `fromRun`: `string`; \}; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `preliminary`: `boolean`; `providerExecuted`: `boolean`; `result`: `unknown`; `type`: `"tool-result"`; \})[]; `finishReason?`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `usage?`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \}, [`SessionEntryError`](./runtime/namespaces/Runtime#sessionentryerror)\>

###### Parameters

###### event

[`ModelResponseEvent`](./runtime/namespaces/Runtime#modelresponseevent)

###### Returns

`Effect`\<\{ `content`: readonly (\{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"text"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"reasoning"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `approvalId`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `toolCallId`: `string`; `type`: `"tool-approval-request"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `data`: `Uint8Array`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `type`: `"file"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `fileName?`: `string`; `id`: `string`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"document"`; `title`: `string`; `type`: `"source"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"url"`; `title`: `string`; `type`: `"source"`; `url`: `URL`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id?`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `modelId?`: `string`; `request?`: \{ \}; `timestamp?`: `Utc`; `type`: `"response-metadata"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `reason`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `response?`: \{ `headers`: \{\[`key`: `string`\]: `string` \| `Redacted`\<...\>; \}; `status`: `number`; \}; `type`: `"finish"`; `usage`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `params`: `unknown`; `providerExecuted`: `boolean`; `type`: `"tool-call"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `encodedResult`: `unknown`; `id`: `string`; `isFailure`: `boolean`; `memoized?`: \{ `fromOperation`: `string`; `fromRun`: `string`; \}; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `preliminary`: `boolean`; `providerExecuted`: `boolean`; `result`: `unknown`; `type`: `"tool-result"`; \})[]; `finishReason?`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `usage?`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \}, [`SessionEntryError`](./runtime/namespaces/Runtime#sessionentryerror)\>

<a id="sessionentry"></a>

##### sessionEntry

> `readonly` **sessionEntry**: (`input`) => `Effect`\<[`Entry`](./generalist/namespaces/Session#entry), [`SessionEntryError`](./runtime/namespaces/Runtime#sessionentryerror)\>

###### Parameters

###### input

[`SessionEntryInput`](./runtime/namespaces/Runtime#sessionentryinput)

###### Returns

`Effect`\<[`Entry`](./generalist/namespaces/Session#entry), [`SessionEntryError`](./runtime/namespaces/Runtime#sessionentryerror)\>

<a id="snapshot"></a>

##### snapshot

> `readonly` **snapshot**: (`runId`) => `Effect`\<[`RunSnapshot`](./runtime/namespaces/Run#runsnapshot), [`InspectError`](./runtime/namespaces/Runtime#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RunSnapshot`](./runtime/namespaces/Run#runsnapshot), [`InspectError`](./runtime/namespaces/Runtime#inspecterror)\>

## Type Aliases

<a id="fromjournalerror"></a>

### FromJournalError

> **FromJournalError** = [`InspectError`](./runtime/namespaces/Runtime#inspecterror) \| [`EventsError`](./runtime/namespaces/Runtime#eventserror) \| [`SessionEntryError`](./runtime/namespaces/Runtime#sessionentryerror) \| [`ProjectionFailed`](#projectionfailed)

***

<a id="jsonlrecord"></a>

### JsonlRecord

> **JsonlRecord** = *typeof* `JsonlRecord.Type`

One JSON Lines record. Each exported stream currently contains exactly one trajectory record.

***

<a id="toolcall"></a>

### ToolCall

> **ToolCall** = *typeof* `ToolCall.Type`

***

<a id="trajectory"></a>

### Trajectory

> **Trajectory** = *typeof* `Trajectory.Type`

Stable, serializable projection of one Runtime journal.

***

<a id="turn"></a>

### Turn

> **Turn** = *typeof* `Turn.Type`

## Variables

<a id="encode"></a>

### encode

> `const` **encode**: (`trajectory`) => `Effect.Effect`\<*typeof* `Trajectory.Encoded`, `Schema.SchemaError`\>

#### Parameters

##### trajectory

[`Trajectory`](#trajectory)

#### Returns

`Effect.Effect`\<*typeof* `Trajectory.Encoded`, `Schema.SchemaError`\>

***

<a id="export"></a>

### export

> `const` **export**: \{(`options`): (`trajectory`) => `Stream`\<`Uint8Array`\<`ArrayBufferLike`\>, `SchemaError`\>; (`trajectory`, `options`): `Stream`\<`Uint8Array`\<`ArrayBufferLike`\>, `SchemaError`\>; \}

#### Call Signature

> (`options`): (`trajectory`) => `Stream`\<`Uint8Array`\<`ArrayBufferLike`\>, `SchemaError`\>

##### Parameters

###### options

[`ExportOptions`](#exportoptions)

##### Returns

(`trajectory`) => `Stream`\<`Uint8Array`\<`ArrayBufferLike`\>, `SchemaError`\>

#### Call Signature

> (`trajectory`, `options`): `Stream`\<`Uint8Array`\<`ArrayBufferLike`\>, `SchemaError`\>

##### Parameters

###### trajectory

###### agent

`Schema.String`

###### budget?

`Schema.optionalKey`\<`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>

Agent budget allocation when the journal's executable manifest declares one.

###### gates

`Schema.$Array`\<`Schema.Struct`\<\{ `evidence`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `name`: `Schema.String`; `verdict`: `Schema.Literals`\<readonly \[`"pass"`, `"fail"`\]\>; \}\>\>

###### input

`Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>

###### output

`Schema.Unknown`

###### runId

`Schema.String`

###### stopReason

`Schema.String`

###### turns

`Schema.$Array`\<`Schema.Struct`\<\{ `compaction`: `Schema.optionalKey`\<`Schema.Codec`\<[`CompactionInspection`](./runtime/namespaces/Run#compactioninspection), [`CompactionInspection`](./runtime/namespaces/Run#compactioninspection), `never`, `never`\>\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `response`: `Schema.Struct`\<\{ `content`: `Schema.$Array`\<`Schema.Union`\<readonly \[..., ..., ..., ..., ..., ..., ..., ..., ..., ...\]\>\>; `finishReason`: `Schema.optionalKey`\<`Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>\>; `usage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: `Schema.Struct`\<...\>; `outputTokens`: `Schema.Struct`\<...\>; \}\>\>; \}\>; `toolCalls`: `Schema.$Array`\<`Schema.Struct`\<\{ `id`: `Schema.String`; `isFailure`: `Schema.optionalKey`\<`Schema.Boolean`\>; `name`: `Schema.String`; `params`: `Schema.Unknown`; `result`: `Schema.optionalKey`\<`Schema.Unknown`\>; \}\>\>; `usageFacts`: `Schema.$Array`\<`Schema.Codec`\<[`RawUsageFact`](./runtime/namespaces/Run#rawusagefact), [`RawUsageFact`](./runtime/namespaces/Run#rawusagefact), `never`, `never`\>\>; \}\>\>

###### options

[`ExportOptions`](#exportoptions)

##### Returns

`Stream`\<`Uint8Array`\<`ArrayBufferLike`\>, `SchemaError`\>

***

<a id="fromjournal"></a>

### fromJournal

> `const` **fromJournal**: (`runtime`, `runId`) => `Effect.Effect`\<\{ `agent`: `string`; `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `gates`: readonly `object`[]; `input`: `Prompt.Prompt`; `output`: `unknown`; `runId`: `string`; `stopReason`: `string`; `turns`: readonly `object`[]; \}, [`FromJournalError`](#fromjournalerror), `never`\>

Project one point-in-time Runtime journal using only cross-driver Runtime read methods.

#### Parameters

##### runtime

[`JournalReader`](#journalreader)

##### runId

`string`

#### Returns

`Effect.Effect`\<\{ `agent`: `string`; `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `gates`: readonly `object`[]; `input`: `Prompt.Prompt`; `output`: `unknown`; `runId`: `string`; `stopReason`: `string`; `turns`: readonly `object`[]; \}, [`FromJournalError`](#fromjournalerror), `never`\>

***

<a id="jsonlrecord-1"></a>

### JsonlRecord

> `const` **JsonlRecord**: `Schema.Struct`\<\{ `schemaVersion`: `Schema.Literal`\<`"1"`\>; `trajectory`: `Schema.Struct`\<\{ `agent`: `Schema.String`; `budget`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>; `gates`: `Schema.$Array`\<`Schema.Struct`\<\{ `evidence`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `name`: `Schema.String`; `verdict`: `Schema.Literals`\<readonly \[`"pass"`, `"fail"`\]\>; \}\>\>; `input`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `output`: `Schema.Unknown`; `runId`: `Schema.String`; `stopReason`: `Schema.String`; `turns`: `Schema.$Array`\<`Schema.Struct`\<\{ `compaction`: `Schema.optionalKey`\<`Schema.Codec`\<[`CompactionInspection`](./runtime/namespaces/Run#compactioninspection), [`CompactionInspection`](./runtime/namespaces/Run#compactioninspection), `never`, `never`\>\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `response`: `Schema.Struct`\<\{ `content`: `Schema.$Array`\<`Schema.Union`\<...\>\>; `finishReason`: `Schema.optionalKey`\<`Schema.Literals`\<...\>\>; `usage`: `Schema.optionalKey`\<`Schema.Struct`\<...\>\>; \}\>; `toolCalls`: `Schema.$Array`\<`Schema.Struct`\<\{ `id`: `Schema.String`; `isFailure`: `Schema.optionalKey`\<...\>; `name`: `Schema.String`; `params`: `Schema.Unknown`; `result`: `Schema.optionalKey`\<...\>; \}\>\>; `usageFacts`: `Schema.$Array`\<`Schema.Codec`\<[`RawUsageFact`](./runtime/namespaces/Run#rawusagefact), [`RawUsageFact`](./runtime/namespaces/Run#rawusagefact), `never`, `never`\>\>; \}\>\>; \}\>; \}\>

One JSON Lines record. Each exported stream currently contains exactly one trajectory record.

***

<a id="toolcall-1"></a>

### ToolCall

> `const` **ToolCall**: `Schema.Struct`\<\{ `id`: `Schema.String`; `isFailure`: `Schema.optionalKey`\<`Schema.Boolean`\>; `name`: `Schema.String`; `params`: `Schema.Unknown`; `result`: `Schema.optionalKey`\<`Schema.Unknown`\>; \}\>

***

<a id="trajectory-1"></a>

### Trajectory

> `const` **Trajectory**: `Schema.Struct`\<\{ `agent`: `Schema.String`; `budget`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>; `gates`: `Schema.$Array`\<`Schema.Struct`\<\{ `evidence`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `name`: `Schema.String`; `verdict`: `Schema.Literals`\<readonly \[`"pass"`, `"fail"`\]\>; \}\>\>; `input`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `output`: `Schema.Unknown`; `runId`: `Schema.String`; `stopReason`: `Schema.String`; `turns`: `Schema.$Array`\<`Schema.Struct`\<\{ `compaction`: `Schema.optionalKey`\<`Schema.Codec`\<[`CompactionInspection`](./runtime/namespaces/Run#compactioninspection), [`CompactionInspection`](./runtime/namespaces/Run#compactioninspection), `never`, `never`\>\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `response`: `Schema.Struct`\<\{ `content`: `Schema.$Array`\<`Schema.Union`\<readonly \[..., ..., ..., ..., ..., ..., ..., ..., ..., ...\]\>\>; `finishReason`: `Schema.optionalKey`\<`Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>\>; `usage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: `Schema.Struct`\<...\>; `outputTokens`: `Schema.Struct`\<...\>; \}\>\>; \}\>; `toolCalls`: `Schema.$Array`\<`Schema.Struct`\<\{ `id`: `Schema.String`; `isFailure`: `Schema.optionalKey`\<`Schema.Boolean`\>; `name`: `Schema.String`; `params`: `Schema.Unknown`; `result`: `Schema.optionalKey`\<`Schema.Unknown`\>; \}\>\>; `usageFacts`: `Schema.$Array`\<`Schema.Codec`\<[`RawUsageFact`](./runtime/namespaces/Run#rawusagefact), [`RawUsageFact`](./runtime/namespaces/Run#rawusagefact), `never`, `never`\>\>; \}\>\>; \}\>

Stable, serializable projection of one Runtime journal.

***

<a id="turn-1"></a>

### Turn

> `const` **Turn**: `Schema.Struct`\<\{ `compaction`: `Schema.optionalKey`\<`Schema.Codec`\<[`CompactionInspection`](./runtime/namespaces/Run#compactioninspection), [`CompactionInspection`](./runtime/namespaces/Run#compactioninspection), `never`, `never`\>\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `response`: `Schema.Struct`\<\{ `content`: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<...\>; `metadata`: `Schema.withDecodingDefault`\<...\>; `text`: `Schema.String`; `type`: `Schema.tag`\<...\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<...\>; `metadata`: `Schema.withDecodingDefault`\<...\>; `text`: `Schema.String`; `type`: `Schema.tag`\<...\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<...\>; `approvalId`: `Schema.String`; `metadata`: `Schema.withDecodingDefault`\<...\>; `toolCallId`: `Schema.String`; `type`: `Schema.tag`\<...\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<...\>; `data`: `Schema.Uint8ArrayFromBase64`; `mediaType`: `Schema.String`; `metadata`: `Schema.withDecodingDefault`\<...\>; `type`: `Schema.tag`\<...\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<...\>; `fileName`: `Schema.optionalKey`\<...\>; `id`: `Schema.String`; `mediaType`: `Schema.String`; `metadata`: `Schema.withDecodingDefault`\<...\>; `sourceType`: `Schema.tag`\<...\>; `title`: `Schema.String`; `type`: `Schema.tag`\<...\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<...\>; `id`: `Schema.String`; `metadata`: `Schema.withDecodingDefault`\<...\>; `sourceType`: `Schema.tag`\<...\>; `title`: `Schema.String`; `type`: `Schema.tag`\<...\>; `url`: `Schema.URLFromString`; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<...\>; `id`: `Schema.optional`\<...\>; `metadata`: `Schema.withDecodingDefault`\<...\>; `modelId`: `Schema.optional`\<...\>; `request`: `Schema.optional`\<...\>; `timestamp`: `Schema.optional`\<...\>; `type`: `Schema.tag`\<...\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<...\>; `metadata`: `Schema.withDecodingDefault`\<...\>; `reason`: `Schema.Literals`\<...\>; `response`: `Schema.optionalKey`\<...\>; `type`: `Schema.tag`\<...\>; `usage`: `Schema.Struct`\<...\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<..., ...\>; `id`: `Schema.String`; `metadata`: `Schema.$Record`\<..., ...\>; `name`: `Schema.String`; `params`: `Schema.Unknown`; `providerExecuted`: `Schema.Boolean`; `type`: `Schema.Literal`\<...\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<..., ...\>; `encodedResult`: `Schema.Unknown`; `id`: `Schema.String`; `isFailure`: `Schema.Boolean`; `memoized`: `Schema.optionalKey`\<...\>; `metadata`: `Schema.$Record`\<..., ...\>; `name`: `Schema.String`; `preliminary`: `Schema.Boolean`; `providerExecuted`: `Schema.Boolean`; `result`: `Schema.Unknown`; `type`: `Schema.Literal`\<...\>; \}\>\]\>\>; `finishReason`: `Schema.optionalKey`\<`Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>\>; `usage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: `Schema.Struct`\<\{ `cacheRead`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<...\>\>; `cacheWrite`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<...\>\>; `total`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<...\>\>; `uncached`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<...\>\>; \}\>; `outputTokens`: `Schema.Struct`\<\{ `reasoning`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<...\>\>; `text`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<...\>\>; `total`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<...\>\>; \}\>; \}\>\>; \}\>; `toolCalls`: `Schema.$Array`\<`Schema.Struct`\<\{ `id`: `Schema.String`; `isFailure`: `Schema.optionalKey`\<`Schema.Boolean`\>; `name`: `Schema.String`; `params`: `Schema.Unknown`; `result`: `Schema.optionalKey`\<`Schema.Unknown`\>; \}\>\>; `usageFacts`: `Schema.$Array`\<`Schema.Codec`\<[`RawUsageFact`](./runtime/namespaces/Run#rawusagefact), [`RawUsageFact`](./runtime/namespaces/Run#rawusagefact), `never`, `never`\>\>; \}\>
