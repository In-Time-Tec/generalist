[**generalist**](../index)

***

[generalist](../index) / unstable.rl-export

# unstable.rl-export

## Namespaces

- [Reward](./namespaces/Reward)

## Interfaces

<a id="dag"></a>

### Dag

**`Experimental`**

A point-in-time operation DAG projected from Runtime journals.

#### Properties

<a id="dagtypeid"></a>

##### \[DagTypeId\]

> `readonly` **\[DagTypeId\]**: *typeof* `DagTypeId`

**`Experimental`**

<a id="edges"></a>

##### edges

> `readonly` **edges**: readonly `object`[]

**`Experimental`**

<a id="leaves"></a>

##### leaves

> `readonly` **leaves**: readonly `string`[]

**`Experimental`**

<a id="nodes"></a>

##### nodes

> `readonly` **nodes**: readonly `object`[]

**`Experimental`**

<a id="rootrunid"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

**`Experimental`**

***

<a id="dagruntime"></a>

### DagRuntime

**`Experimental`**

Cross-driver Runtime methods required by `dag`.

#### Extends

- [`JournalReader`](../trajectory#journalreader)

#### Properties

<a id="history"></a>

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

<a id="recordreward"></a>

##### recordReward

> `readonly` **recordReward**: (`input`) => `Effect`\<`void`, `RecordRewardError`\>

**`Experimental`**

###### Parameters

###### input

[`RewardInput`](../runtime/namespaces/RunEvent#rewardinput)

###### Returns

`Effect`\<`void`, `RecordRewardError`\>

<a id="resolvemodelresponse"></a>

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

<a id="sessionentry"></a>

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

<a id="snapshot"></a>

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

<a id="exportoptions"></a>

### ExportOptions

**`Experimental`**

Verifiers v1 JSONL export options.

#### Type Parameters

##### R

`R` = `never`

##### E

`E` = `never`

#### Properties

<a id="format"></a>

##### format

> `readonly` **format**: `"verifiers-v1"`

**`Experimental`**

<a id="include"></a>

##### include

> `readonly` **include**: [`IncludeOptions`](#includeoptions)

**`Experimental`**

<a id="reward"></a>

##### reward

> `readonly` **reward**: [`Service`](./namespaces/Reward#service)\<`R`, `E`\>

**`Experimental`**

***

<a id="includeoptions"></a>

### IncludeOptions

**`Experimental`**

Branches included in verifiers v1 export.

#### Properties

<a id="childbranches"></a>

##### childBranches

> `readonly` **childBranches**: `boolean`

**`Experimental`**

<a id="compactionbranches"></a>

##### compactionBranches

> `readonly` **compactionBranches**: `boolean`

**`Experimental`**

<a id="logprobs"></a>

##### logprobs

> `readonly` **logprobs**: `boolean`

**`Experimental`**

<a id="speculationlosers"></a>

##### speculationLosers

> `readonly` **speculationLosers**: `boolean`

**`Experimental`**

Accepted for forward compatibility; speculation has no journal branches until issue #358 lands.

## Type Aliases

<a id="childlink"></a>

### ChildLink

> **ChildLink** = *typeof* `ChildLink.Type`

**`Experimental`**

***

<a id="compaction"></a>

### Compaction

> **Compaction** = *typeof* `Compaction.Type`

**`Experimental`**

***

<a id="edge"></a>

### Edge

> **Edge** = *typeof* `Edge.Type`

**`Experimental`**

***

<a id="modelcall"></a>

### ModelCall

> **ModelCall** = *typeof* `ModelCall.Type`

**`Experimental`**

***

<a id="node"></a>

### Node

> **Node** = *typeof* `Node.Type`

**`Experimental`**

***

<a id="operation"></a>

### Operation

> **Operation** = *typeof* `Operation.Type`

**`Experimental`**

***

<a id="terminal"></a>

### Terminal

> **Terminal** = *typeof* `Terminal.Type`

**`Experimental`**

***

<a id="toolcall"></a>

### ToolCall

> **ToolCall** = *typeof* `ToolCall.Type`

**`Experimental`**

***

<a id="verifiersv1record"></a>

### VerifiersV1Record

> **VerifiersV1Record** = *typeof* `VerifiersV1Record.Type`

**`Experimental`**

## Variables

<a id="childlink-1"></a>

### ChildLink

> `const` **ChildLink**: `Schema.TaggedStruct`\<`"ChildLink"`, \{ `childRunId`: `Schema.String`; `operationId`: `Schema.String`; `selection`: `Schema.String`; \}\>

**`Experimental`**

One durable child-link operation.

***

<a id="compaction-1"></a>

### Compaction

> `const` **Compaction**: `Schema.TaggedStruct`\<`"Compaction"`, \{ `checkpointId`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"microcompact"`, `"summarize"`\]\>; `operationId`: `Schema.String`; `turn`: `Schema.Finite`; \}\>

**`Experimental`**

One applied durable compaction operation.

***

<a id="dag-1"></a>

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

<a id="edge-1"></a>

### Edge

> `const` **Edge**: `Schema.Struct`\<\{ `from`: `Schema.String`; `to`: `Schema.String`; `type`: `Schema.Literals`\<readonly \[`"parent"`, `"fork"`, `"child"`, `"compaction"`\]\>; \}\>

**`Experimental`**

The journal fact relating two trajectory operations.

***

<a id="export"></a>

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

<a id="modelcall-1"></a>

### ModelCall

> `const` **ModelCall**: `Schema.TaggedStruct`\<`"ModelCall"`, \{ `logprobs`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Finite`\>\>; `modelCallId`: `Schema.String`; `operationId`: `Schema.String`; `tokens`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Int`\>\>; `turn`: `Schema.Finite`; \}\>

**`Experimental`**

One durable conversation model-call operation.

***

<a id="node-1"></a>

### Node

> `const` **Node**: `Schema.Struct`\<\{ `id`: `Schema.String`; `operation`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"ModelCall"`, \{ `logprobs`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Finite`\>\>; `modelCallId`: `Schema.String`; `operationId`: `Schema.String`; `tokens`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Int`\>\>; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"ToolCall"`, \{ `isFailure`: `Schema.Boolean`; `operationId`: `Schema.String`; `tool`: `Schema.String`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"ChildLink"`, \{ `childRunId`: `Schema.String`; `operationId`: `Schema.String`; `selection`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Compaction"`, \{ `checkpointId`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"microcompact"`, `"summarize"`\]\>; `operationId`: `Schema.String`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"Terminal"`, \{ `operationId`: `Schema.String`; `status`: `Schema.Literals`\<readonly \[`"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}\>

**`Experimental`**

One journal operation in a trajectory DAG.

***

<a id="operation-1"></a>

### Operation

> `const` **Operation**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"ModelCall"`, \{ `logprobs`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Finite`\>\>; `modelCallId`: `Schema.String`; `operationId`: `Schema.String`; `tokens`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Int`\>\>; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"ToolCall"`, \{ `isFailure`: `Schema.Boolean`; `operationId`: `Schema.String`; `tool`: `Schema.String`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"ChildLink"`, \{ `childRunId`: `Schema.String`; `operationId`: `Schema.String`; `selection`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Compaction"`, \{ `checkpointId`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"microcompact"`, `"summarize"`\]\>; `operationId`: `Schema.String`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"Terminal"`, \{ `operationId`: `Schema.String`; `status`: `Schema.Literals`\<readonly \[`"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>\]\>

**`Experimental`**

Operations represented in an RL trajectory DAG.

***

<a id="terminal-1"></a>

### Terminal

> `const` **Terminal**: `Schema.TaggedStruct`\<`"Terminal"`, \{ `operationId`: `Schema.String`; `status`: `Schema.Literals`\<readonly \[`"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>

**`Experimental`**

One terminal durable Run operation.

***

<a id="toolcall-1"></a>

### ToolCall

> `const` **ToolCall**: `Schema.TaggedStruct`\<`"ToolCall"`, \{ `isFailure`: `Schema.Boolean`; `operationId`: `Schema.String`; `tool`: `Schema.String`; `turn`: `Schema.Finite`; \}\>

**`Experimental`**

One completed durable tool operation.

***

<a id="verifiersv1record-1"></a>

### VerifiersV1Record

> `const` **VerifiersV1Record**: `Schema.Struct`\<\{ `env`: `Schema.Struct`\<\{ `harness`: `Schema.String`; `taskset`: `Schema.String`; \}\>; `logprobs`: `Schema.optionalKey`\<`Schema.NullOr`\<`Schema.$Array`\<`Schema.Finite`\>\>\>; `messages`: `Schema.$Array`\<`Schema.Codec`\<`Prompt.Message`, `Prompt.MessageEncoded`, `never`, `never`\>\>; `reward`: `Schema.Finite`; `tokens`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Int`\>\>; \}\>

**`Experimental`**

One flattened verifiers v1 training record.
