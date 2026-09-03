[**generalist**](../index)

***

[generalist](../index) / unstable.rl-export

# unstable.rl-export

## Namespaces

- [Reward](./namespaces/Reward)

## Interfaces

### Dag

**`Experimental`**

A point-in-time operation DAG projected from Runtime journals.

#### Properties

##### \[DagTypeId\]

> `readonly` **\[DagTypeId\]**: *typeof* `DagTypeId`

**`Experimental`**

##### edges

> `readonly` **edges**: readonly `object`[]

**`Experimental`**

##### leaves

> `readonly` **leaves**: readonly `string`[]

**`Experimental`**

##### nodes

> `readonly` **nodes**: readonly `object`[]

**`Experimental`**

##### rootRunId

> `readonly` **rootRunId**: `string`

**`Experimental`**

***

### DagRuntime

**`Experimental`**

Cross-driver Runtime methods required by `dag`.

#### Extends

- [`JournalReader`](../trajectory#journalreader)

#### Properties

##### history

> `readonly` **history**: (`input`) => `Effect`\<readonly [`RunEvent`](../runtime/namespaces/RunEvent#runevent)[], [`EventsError`](../runtime/namespaces/Runtime#eventserror)\>

**`Experimental`**

###### Parameters

###### input

[`HistoryInput`](../runtime/namespaces/Runtime#historyinput)

###### Returns

`Effect`\<readonly [`RunEvent`](../runtime/namespaces/RunEvent#runevent)[], [`EventsError`](../runtime/namespaces/Runtime#eventserror)\>

###### Inherited from

[`JournalReader`](../trajectory#journalreader).[`history`](../trajectory#history)

##### recordReward

> `readonly` **recordReward**: (`input`) => `Effect`\<`void`, `RecordRewardError`\>

**`Experimental`**

###### Parameters

###### input

[`RewardInput`](../runtime/namespaces/RunEvent#rewardinput)

###### Returns

`Effect`\<`void`, `RecordRewardError`\>

##### resolveModelResponse

> `readonly` **resolveModelResponse**: (`event`) => `Effect`\<\{ `content`: readonly (\{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"text"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"reasoning"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `approvalId`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `toolCallId`: `string`; `type`: `"tool-approval-request"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `data`: `Uint8Array`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `type`: `"file"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `fileName?`: `string`; `id`: `string`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"document"`; `title`: `string`; `type`: `"source"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"url"`; `title`: `string`; `type`: `"source"`; `url`: `URL`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id?`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `modelId?`: `string`; `request?`: \{ \}; `timestamp?`: `Utc`; `type`: `"response-metadata"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `reason`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `response?`: \{ `headers`: \{\[`key`: `string`\]: `string` \| `Redacted`\<...\>; \}; `status`: `number`; \}; `type`: `"finish"`; `usage`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `params`: `unknown`; `providerExecuted`: `boolean`; `type`: `"tool-call"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `encodedResult`: `unknown`; `id`: `string`; `isFailure`: `boolean`; `memoized?`: \{ `fromOperation`: `string`; `fromRun`: `string`; \}; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `preliminary`: `boolean`; `providerExecuted`: `boolean`; `result`: `unknown`; `type`: `"tool-result"`; \})[]; `finishReason?`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `usage?`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \}, [`SessionEntryError`](../runtime/namespaces/Runtime#sessionentryerror)\>

**`Experimental`**

###### Parameters

###### event

[`ModelResponseEvent`](../runtime/namespaces/Runtime#modelresponseevent)

###### Returns

`Effect`\<\{ `content`: readonly (\{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"text"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `text`: `string`; `type`: `"reasoning"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `approvalId`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `toolCallId`: `string`; `type`: `"tool-approval-request"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `data`: `Uint8Array`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `type`: `"file"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `fileName?`: `string`; `id`: `string`; `mediaType`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"document"`; `title`: `string`; `type`: `"source"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `sourceType`: `"url"`; `title`: `string`; `type`: `"source"`; `url`: `URL`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id?`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `modelId?`: `string`; `request?`: \{ \}; `timestamp?`: `Utc`; `type`: `"response-metadata"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `reason`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `response?`: \{ `headers`: \{\[`key`: `string`\]: `string` \| `Redacted`\<...\>; \}; `status`: `number`; \}; `type`: `"finish"`; `usage`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `id`: `string`; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `params`: `unknown`; `providerExecuted`: `boolean`; `type`: `"tool-call"`; \} \| \{ `~effect/ai/Content/Part`: `"~effect/ai/Content/Part"`; `encodedResult`: `unknown`; `id`: `string`; `isFailure`: `boolean`; `memoized?`: \{ `fromOperation`: `string`; `fromRun`: `string`; \}; `metadata`: \{\[`key`: `string`\]: `Json`; \}; `name`: `string`; `preliminary`: `boolean`; `providerExecuted`: `boolean`; `result`: `unknown`; `type`: `"tool-result"`; \})[]; `finishReason?`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `usage?`: \{ `inputTokens`: \{ `cacheRead?`: `number`; `cacheWrite?`: `number`; `total?`: `number`; `uncached?`: `number`; \}; `outputTokens`: \{ `reasoning?`: `number`; `text?`: `number`; `total?`: `number`; \}; \}; \}, [`SessionEntryError`](../runtime/namespaces/Runtime#sessionentryerror)\>

###### Inherited from

[`JournalReader`](../trajectory#journalreader).[`resolveModelResponse`](../trajectory#resolvemodelresponse)

##### sessionEntry

> `readonly` **sessionEntry**: (`input`) => `Effect`\<[`Entry`](../generalist/namespaces/Session#entry), [`SessionEntryError`](../runtime/namespaces/Runtime#sessionentryerror)\>

**`Experimental`**

###### Parameters

###### input

[`SessionEntryInput`](../runtime/namespaces/Runtime#sessionentryinput)

###### Returns

`Effect`\<[`Entry`](../generalist/namespaces/Session#entry), [`SessionEntryError`](../runtime/namespaces/Runtime#sessionentryerror)\>

###### Inherited from

[`JournalReader`](../trajectory#journalreader).[`sessionEntry`](../trajectory#sessionentry)

##### snapshot

> `readonly` **snapshot**: (`runId`) => `Effect`\<[`RunSnapshot`](../runtime/namespaces/Run#runsnapshot), [`InspectError`](../runtime/namespaces/Runtime#inspecterror)\>

**`Experimental`**

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RunSnapshot`](../runtime/namespaces/Run#runsnapshot), [`InspectError`](../runtime/namespaces/Runtime#inspecterror)\>

###### Inherited from

[`JournalReader`](../trajectory#journalreader).[`snapshot`](../trajectory#snapshot)

***

### ExportOptions

**`Experimental`**

Verifiers v1 JSONL export options.

#### Type Parameters

##### R

`R` = `never`

##### E

`E` = `never`

#### Properties

##### format

> `readonly` **format**: `"verifiers-v1"`

**`Experimental`**

##### include

> `readonly` **include**: [`IncludeOptions`](#includeoptions)

**`Experimental`**

##### reward

> `readonly` **reward**: [`Service`](./namespaces/Reward#service)\<`R`, `E`\>

**`Experimental`**

***

### IncludeOptions

**`Experimental`**

Branches included in verifiers v1 export.

#### Properties

##### childBranches

> `readonly` **childBranches**: `boolean`

**`Experimental`**

##### compactionBranches

> `readonly` **compactionBranches**: `boolean`

**`Experimental`**

##### logprobs

> `readonly` **logprobs**: `boolean`

**`Experimental`**

##### speculationLosers

> `readonly` **speculationLosers**: `boolean`

**`Experimental`**

Accepted for forward compatibility; speculation has no journal branches until issue #358 lands.

## Type Aliases

### ChildLink

> **ChildLink** = *typeof* `ChildLink.Type`

**`Experimental`**

***

### Compaction

> **Compaction** = *typeof* `Compaction.Type`

**`Experimental`**

***

### Edge

> **Edge** = *typeof* `Edge.Type`

**`Experimental`**

***

### ModelCall

> **ModelCall** = *typeof* `ModelCall.Type`

**`Experimental`**

***

### Node

> **Node** = *typeof* `Node.Type`

**`Experimental`**

***

### Operation

> **Operation** = *typeof* `Operation.Type`

**`Experimental`**

***

### Terminal

> **Terminal** = *typeof* `Terminal.Type`

**`Experimental`**

***

### ToolCall

> **ToolCall** = *typeof* `ToolCall.Type`

**`Experimental`**

***

### VerifiersV1Record

> **VerifiersV1Record** = *typeof* `VerifiersV1Record.Type`

**`Experimental`**

## Variables

### ChildLink

> `const` **ChildLink**: `Schema.TaggedStruct`\<`"ChildLink"`, \{ `childRunId`: `Schema.String`; `operationId`: `Schema.String`; `selection`: `Schema.String`; \}\>

**`Experimental`**

One durable child-link operation.

***

### Compaction

> `const` **Compaction**: `Schema.TaggedStruct`\<`"Compaction"`, \{ `checkpointId`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"microcompact"`, `"summarize"`\]\>; `operationId`: `Schema.String`; `turn`: `Schema.Finite`; \}\>

**`Experimental`**

One applied durable compaction operation.

***

### dag

> `const` **dag**: (`runtime`, `runId`) => `Effect.Effect`\<[`Dag`](#dag), [`FromJournalError`](../trajectory#fromjournalerror), `never`\>

**`Experimental`**

Project a root Run, retained forks, and linked child Runs into one operation DAG.

#### Parameters

##### runtime

[`DagRuntime`](#dagruntime)

##### runId

`string`

#### Returns

`Effect.Effect`\<[`Dag`](#dag), [`FromJournalError`](../trajectory#fromjournalerror), `never`\>

***

### Edge

> `const` **Edge**: `Schema.Struct`\<\{ `from`: `Schema.String`; `to`: `Schema.String`; `type`: `Schema.Literals`\<readonly \[`"parent"`, `"fork"`, `"child"`, `"compaction"`\]\>; \}\>

**`Experimental`**

The journal fact relating two trajectory operations.

***

### export

> `const` **export**: \{\<`R`, `E`\>(`options`): (`dagValue`) => `Stream`\<`Uint8Array`\<`ArrayBufferLike`\>, `SchemaError` \| `RecordRewardError` \| [`RewardInvalid`](./namespaces/Reward#rewardinvalid) \| `E`, `R`\>; \<`R`, `E`\>(`dagValue`, `options`): `Stream`\<`Uint8Array`\<`ArrayBufferLike`\>, `SchemaError` \| `RecordRewardError` \| [`RewardInvalid`](./namespaces/Reward#rewardinvalid) \| `E`, `R`\>; \}

#### Call Signature

> \<`R`, `E`\>(`options`): (`dagValue`) => `Stream`\<`Uint8Array`\<`ArrayBufferLike`\>, `SchemaError` \| `RecordRewardError` \| [`RewardInvalid`](./namespaces/Reward#rewardinvalid) \| `E`, `R`\>

##### Type Parameters

###### R

`R`

###### E

`E`

##### Parameters

###### options

[`ExportOptions`](#exportoptions)\<`R`, `E`\>

##### Returns

(`dagValue`) => `Stream`\<`Uint8Array`\<`ArrayBufferLike`\>, `SchemaError` \| `RecordRewardError` \| [`RewardInvalid`](./namespaces/Reward#rewardinvalid) \| `E`, `R`\>

#### Call Signature

> \<`R`, `E`\>(`dagValue`, `options`): `Stream`\<`Uint8Array`\<`ArrayBufferLike`\>, `SchemaError` \| `RecordRewardError` \| [`RewardInvalid`](./namespaces/Reward#rewardinvalid) \| `E`, `R`\>

##### Type Parameters

###### R

`R`

###### E

`E`

##### Parameters

###### dagValue

[`Dag`](#dag)

###### options

[`ExportOptions`](#exportoptions)\<`R`, `E`\>

##### Returns

`Stream`\<`Uint8Array`\<`ArrayBufferLike`\>, `SchemaError` \| `RecordRewardError` \| [`RewardInvalid`](./namespaces/Reward#rewardinvalid) \| `E`, `R`\>

***

### ModelCall

> `const` **ModelCall**: `Schema.TaggedStruct`\<`"ModelCall"`, \{ `logprobs`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Finite`\>\>; `modelCallId`: `Schema.String`; `operationId`: `Schema.String`; `tokens`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Int`\>\>; `turn`: `Schema.Finite`; \}\>

**`Experimental`**

One durable conversation model-call operation.

***

### Node

> `const` **Node**: `Schema.Struct`\<\{ `id`: `Schema.String`; `operation`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"ModelCall"`, \{ `logprobs`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Finite`\>\>; `modelCallId`: `Schema.String`; `operationId`: `Schema.String`; `tokens`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Int`\>\>; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"ToolCall"`, \{ `isFailure`: `Schema.Boolean`; `operationId`: `Schema.String`; `tool`: `Schema.String`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"ChildLink"`, \{ `childRunId`: `Schema.String`; `operationId`: `Schema.String`; `selection`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Compaction"`, \{ `checkpointId`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"microcompact"`, `"summarize"`\]\>; `operationId`: `Schema.String`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"Terminal"`, \{ `operationId`: `Schema.String`; `status`: `Schema.Literals`\<readonly \[`"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}\>

**`Experimental`**

One journal operation in a trajectory DAG.

***

### Operation

> `const` **Operation**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"ModelCall"`, \{ `logprobs`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Finite`\>\>; `modelCallId`: `Schema.String`; `operationId`: `Schema.String`; `tokens`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Int`\>\>; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"ToolCall"`, \{ `isFailure`: `Schema.Boolean`; `operationId`: `Schema.String`; `tool`: `Schema.String`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"ChildLink"`, \{ `childRunId`: `Schema.String`; `operationId`: `Schema.String`; `selection`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Compaction"`, \{ `checkpointId`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"microcompact"`, `"summarize"`\]\>; `operationId`: `Schema.String`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"Terminal"`, \{ `operationId`: `Schema.String`; `status`: `Schema.Literals`\<readonly \[`"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>\]\>

**`Experimental`**

Operations represented in an RL trajectory DAG.

***

### Terminal

> `const` **Terminal**: `Schema.TaggedStruct`\<`"Terminal"`, \{ `operationId`: `Schema.String`; `status`: `Schema.Literals`\<readonly \[`"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>

**`Experimental`**

One terminal durable Run operation.

***

### ToolCall

> `const` **ToolCall**: `Schema.TaggedStruct`\<`"ToolCall"`, \{ `isFailure`: `Schema.Boolean`; `operationId`: `Schema.String`; `tool`: `Schema.String`; `turn`: `Schema.Finite`; \}\>

**`Experimental`**

One completed durable tool operation.

***

### VerifiersV1Record

> `const` **VerifiersV1Record**: `Schema.Struct`\<\{ `env`: `Schema.Struct`\<\{ `harness`: `Schema.String`; `taskset`: `Schema.String`; \}\>; `logprobs`: `Schema.optionalKey`\<`Schema.NullOr`\<`Schema.$Array`\<`Schema.Finite`\>\>\>; `messages`: `Schema.$Array`\<`Schema.Codec`\<`Prompt.Message`, `Prompt.MessageEncoded`, `never`, `never`\>\>; `reward`: `Schema.Finite`; `tokens`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Int`\>\>; \}\>

**`Experimental`**

One flattened verifiers v1 training record.
