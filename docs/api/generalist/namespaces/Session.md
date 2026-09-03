[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Session

# Session

## Classes

### ContextInvalid

Model context cannot be admitted while framework tool calls lack outcomes.

#### Extends

- `ContextInvalid_base`

#### Constructors

##### Constructor

> **new ContextInvalid**(...`args`): [`ContextInvalid`](#contextinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ContextInvalid`](#contextinvalid)

###### Inherited from

`ContextInvalid_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ContextInvalid_base.hint`

##### issues

> `readonly` **issues**: readonly `object`[]

###### Inherited from

`ContextInvalid_base.issues`

***

### SessionConflict

Session append conflict with the active path or entry identity.

#### Extends

- `SessionConflict_base`

#### Constructors

##### Constructor

> **new SessionConflict**(...`args`): [`SessionConflict`](#sessionconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SessionConflict`](#sessionconflict)

###### Inherited from

`SessionConflict_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SessionConflict_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`SessionConflict_base.message`

##### reason

> `readonly` **reason**: `"stale-leaf"` \| `"entry-id-reused"` \| `"checkpoint-id-reused"` \| `"checkpoint-not-on-active-path"`

###### Inherited from

`SessionConflict_base.reason`

***

### SessionDirectory

#### Extends

- `SessionDirectory_base`

#### Constructors

##### Constructor

> **new SessionDirectory**(`_`): [`SessionDirectory`](#sessiondirectory)

###### Parameters

###### \_

`never`

###### Returns

[`SessionDirectory`](#sessiondirectory)

###### Inherited from

`SessionDirectory_base.constructor`

***

### SessionStoreError

Session store operation failure.

#### Extends

- `SessionStoreError_base`

#### Constructors

##### Constructor

> **new SessionStoreError**(...`args`): [`SessionStoreError`](#sessionstoreerror)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SessionStoreError`](#sessionstoreerror)

###### Inherited from

`SessionStoreError_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SessionStoreError_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`SessionStoreError_base.message`

## Interfaces

### CheckpointAppend

Authoritative result of an idempotent checkpoint append.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Appended"` \| `"AlreadyPresent"`

##### checkpoint

> `readonly` **checkpoint**: [`CompactionEntry`](#compactionentry)

##### leafId

> `readonly` **leafId**: `string`

***

### Directory

Keyed Session storage and same-Session Run admission.

#### Properties

##### acquire

> `readonly` **acquire**: (`sessionId`) => `Effect`\<[`SessionStore`](#sessionstore), [`SessionStoreError`](#sessionstoreerror), `Scope`\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<[`SessionStore`](#sessionstore), [`SessionStoreError`](#sessionstoreerror), `Scope`\>

***

### PreparedCheckpoint

Exact idempotent projection. Atomically persist projection, telemetry, and commit; remote failure is ambiguous.

#### Properties

##### compactionCommit?

> `readonly` `optional` **compactionCommit?**: `object`

###### checkpointId

> `readonly` **checkpointId**: `string`

###### compactionId

> `readonly` **compactionId**: `string`

###### contextTokensAfter?

> `readonly` `optional` **contextTokensAfter?**: `number`

###### contextTokensBefore?

> `readonly` `optional` **contextTokensBefore?**: `number`

###### entriesAfter?

> `readonly` `optional` **entriesAfter?**: `number`

###### entriesBefore?

> `readonly` `optional` **entriesBefore?**: `number`

###### summaryModelCallId?

> `readonly` `optional` **summaryModelCallId?**: `string`

##### id

> `readonly` **id**: `string`

##### parentId

> `readonly` **parentId**: `string` \| `null`

##### projectedHistory

> `readonly` **projectedHistory**: `Prompt`

##### summary?

> `readonly` `optional` **summary?**: `string`

##### telemetry

> `readonly` **telemetry**: readonly (\{ `_tag`: `"ModelCallStarted"`; `compactionId?`: `string`; `deliveryId`: `string`; `model?`: `string`; `modelCallId`: `string`; `provider?`: `string`; `purpose`: `"conversation"` \| `"structured-output"` \| `"compaction-summary"`; `startedAt`: `number`; `turn`: `number`; \} \| \{ `_tag`: `"ModelAttemptStarted"`; `attempt`: `number`; `candidate?`: `number`; `deliveryId`: `string`; `model?`: `string`; `modelAttemptId`: `string`; `modelCallId`: `string`; `provider?`: `string`; `registrationKey?`: `string`; `startedAt`: `number`; `turn`: `number`; \} \| \{ `_tag`: `"ModelAttemptFirstOutput"`; `at`: `number`; `attempt`: `number`; `deliveryId`: `string`; `kind`: `"text"` \| `"reasoning"` \| `"tool-call"`; `modelAttemptId`: `string`; `modelCallId`: `string`; `turn`: `number`; \} \| \{ `_tag`: `"ModelAttemptCompleted"`; `attempt`: `number`; `candidate?`: `number`; `completedAt`: `number`; `deliveryId`: `string`; `finishReason`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `model?`: `string`; `modelAttemptId`: `string`; `modelCallId`: `string`; `provider?`: `string`; `providerMetadata?`: \{\[`key`: `string`\]: `Json`; \}; `registrationKey?`: `string`; `requestId?`: `string`; `responseModel?`: `string`; `serviceTier?`: `string`; `turn`: `number`; `usage`: `Usage`; `usageAt`: `number`; \} \| \{ `_tag`: `"ModelAttemptFailed"`; `attempt`: `number`; `candidate?`: `number`; `category`: `"unknown"` \| `"authentication"` \| `"rate-limit"` \| `"transport"` \| `"provider-response"` \| `"stream-decode"` \| `"truncated-stream"` \| `"context-overflow"` \| `"invalid-tool-call"` \| `"token-budget"` \| `"timeout"` \| `"cancellation"`; `classification`: `"transient"` \| `"terminal"`; `deliveryId`: `string`; `disposition`: `"terminal"` \| `"retry"` \| `"fallback"`; `failedAt`: `number`; `model?`: `string`; `modelAttemptId`: `string`; `modelCallId`: `string`; `provider?`: `string`; `providerUsage?`: \{ `inputTokens?`: `number`; `outputTokens?`: `number`; `totalTokens?`: `number`; \}; `registrationKey?`: `string`; `turn`: `number`; \} \| \{ `_tag`: `"ModelRetryScheduled"`; `at`: `number`; `attempt`: `number`; `category`: `"unknown"` \| `"authentication"` \| `"rate-limit"` \| `"transport"` \| `"provider-response"` \| `"stream-decode"` \| `"truncated-stream"` \| `"context-overflow"` \| `"invalid-tool-call"` \| `"token-budget"` \| `"timeout"` \| `"cancellation"`; `delayMillis`: `number`; `deliveryId`: `string`; `modelCallId`: `string`; `reason`: `"provider-resilience"` \| `"invalid-tool-call-correction"`; `turn`: `number`; \} \| \{ `_tag`: `"ModelFallbackScheduled"`; `at`: `number`; `attempt`: `number`; `category`: `"unknown"` \| `"authentication"` \| `"rate-limit"` \| `"transport"` \| `"provider-response"` \| `"stream-decode"` \| `"truncated-stream"` \| `"context-overflow"` \| `"invalid-tool-call"` \| `"token-budget"` \| `"timeout"` \| `"cancellation"`; `deliveryId`: `string`; `fromCandidate`: `number`; `fromModel`: `string`; `fromProvider`: `string`; `fromRegistrationKey?`: `string`; `modelCallId`: `string`; `toCandidate`: `number`; `toModel`: `string`; `toProvider`: `string`; `toRegistrationKey?`: `string`; `turn`: `number`; \} \| \{ `_tag`: `"ModelCallCompleted"`; `attempts`: `number`; `completedAt`: `number`; `deliveryId`: `string`; `failedAttemptUsage?`: \{ `inputTokens?`: `number`; `outputTokens?`: `number`; `totalTokens?`: `number`; \}; `finishReason?`: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`; `modelCallId`: `string`; `purpose`: `"conversation"` \| `"structured-output"` \| `"compaction-summary"`; `turn`: `number`; `usage?`: `Usage`; \} \| \{ `_tag`: `"ModelCallFailed"`; `attempts`: `number`; `category`: `"unknown"` \| `"authentication"` \| `"rate-limit"` \| `"transport"` \| `"provider-response"` \| `"stream-decode"` \| `"truncated-stream"` \| `"context-overflow"` \| `"invalid-tool-call"` \| `"token-budget"` \| `"timeout"` \| `"cancellation"`; `classification`: `"transient"` \| `"terminal"`; `deliveryId`: `string`; `failedAt`: `number`; `failedAttemptUsage?`: \{ `inputTokens?`: `number`; `outputTokens?`: `number`; `totalTokens?`: `number`; \}; `modelCallId`: `string`; `purpose`: `"conversation"` \| `"structured-output"` \| `"compaction-summary"`; `turn`: `number`; \} \| \{ `_tag`: `"CompactionStarted"`; `compactionId`: `string`; `contextTokensBefore?`: `number`; `deliveryId`: `string`; `entriesBefore?`: `number`; `startedAt`: `number`; `trigger`: `"threshold"` \| `"overflow"`; `turn`: `number`; \} \| \{ `_tag`: `"CompactionSkipped"`; `compactionId`: `string`; `deliveryId`: `string`; `skippedAt`: `number`; `turn`: `number`; \} \| \{ `_tag`: `"CompactionApplied"`; `appliedAt`: `number`; `checkpointId`: `string`; `commit`: \{ `checkpointId`: `string`; `compactionId`: `string`; `contextTokensAfter?`: `number`; `contextTokensBefore?`: `number`; `entriesAfter?`: `number`; `entriesBefore?`: `number`; `summaryModelCallId?`: `string`; \}; `compactionId`: `string`; `deliveryId`: `string`; `kind`: `"summarize"` \| `"microcompact"`; `turn`: `number`; \} \| \{ `_tag`: `"CompactionFailed"`; `compactionId`: `string`; `deliveryId`: `string`; `failedAt`: `number`; `turn`: `number`; \})[]

***

### SessionStore

Session event-log service boundary.

#### Properties

##### append

> `readonly` **append**: (`entry`, `options?`) => `Effect`\<[`Entry`](#entry), [`SessionConflict`](#sessionconflict) \| [`SessionStoreError`](#sessionstoreerror)\>

###### Parameters

###### entry

[`AppendInput`](#appendinput)

###### options?

[`AppendOptions`](#appendoptions)

###### Returns

`Effect`\<[`Entry`](#entry), [`SessionConflict`](#sessionconflict) \| [`SessionStoreError`](#sessionstoreerror)\>

##### appendCheckpoint

> `readonly` **appendCheckpoint**: (`checkpoint`) => `Effect`\<[`CheckpointAppend`](#checkpointappend), [`SessionConflict`](#sessionconflict) \| [`SessionStoreError`](#sessionstoreerror)\>

Atomically persists projection, telemetry, and commit. Remote failure is ambiguous; retry exactly.

###### Parameters

###### checkpoint

[`PreparedCheckpoint`](#preparedcheckpoint)

###### Returns

`Effect`\<[`CheckpointAppend`](#checkpointappend), [`SessionConflict`](#sessionconflict) \| [`SessionStoreError`](#sessionstoreerror)\>

##### leaf

> `readonly` **leaf**: `Effect`\<`string` \| `null`\>

##### path

> `readonly` **path**: (`leaf?`) => `Effect`\<readonly [`Entry`](#entry)[], [`SessionStoreError`](#sessionstoreerror)\>

###### Parameters

###### leaf?

`string`

###### Returns

`Effect`\<readonly [`Entry`](#entry)[], [`SessionStoreError`](#sessionstoreerror)\>

##### reserveEntryId

> `readonly` **reserveEntryId**: `Effect`\<`string`, [`SessionStoreError`](#sessionstoreerror)\>

##### setLeaf

> `readonly` **setLeaf**: (`id`) => `Effect`\<`void`, [`SessionStoreError`](#sessionstoreerror)\>

###### Parameters

###### id

`string` \| `null`

###### Returns

`Effect`\<`void`, [`SessionStoreError`](#sessionstoreerror)\>

## Type Aliases

### AppendInput

> **AppendInput** = `AppendEntryInput`\<[`Entry`](#entry)\>

Session entry input appended by a store implementation.

***

### AppendOptions

> **AppendOptions** = `GeneratedAppendOptions` \| `StableAppendOptions`

Identity and expected active leaf for a normal Session append.

***

### BaseEntry

> **BaseEntry** = `object`

Common fields for session entries.

#### Properties

##### id

> `readonly` **id**: [`EntryId`](#entryid)

##### metadata?

> `readonly` `optional` **metadata?**: [`Metadata`](#metadata-1)

##### parentId

> `readonly` **parentId**: [`EntryId`](#entryid) \| `null`

***

### BranchSummaryEntry

> **BranchSummaryEntry** = [`BaseEntry`](#baseentry) & `object`

A summary of an abandoned branch.

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"BranchSummary"`

##### summary

> `readonly` **summary**: `string`

***

### CompactionEntry

> **CompactionEntry** = [`BaseEntry`](#baseentry) & `object`

An exact point-in-time compaction projection.

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"Compaction"`

##### compactionCommit?

> `readonly` `optional` **compactionCommit?**: [`CompactionCommit`](./ModelTelemetry#compactioncommit)

##### projectedHistory

> `readonly` **projectedHistory**: `Prompt.Prompt`

##### summary?

> `readonly` `optional` **summary?**: `string`

##### telemetry

> `readonly` **telemetry**: `ReadonlyArray`\<[`Event`](./ModelTelemetry#event)\>

***

### Entry

> **Entry** = [`MessageEntry`](#messageentry) \| [`ModelResponseEntry`](#modelresponseentry) \| [`ToolCallEntry`](#toolcallentry) \| [`ToolResultEntry`](#toolresultentry) \| [`MemoryEntry`](#memoryentry) \| [`SkillEntry`](#skillentry) \| [`SteeringEntry`](#steeringentry) \| [`HandoffEntry`](#handoffentry) \| [`CompactionEntry`](#compactionentry) \| [`BranchSummaryEntry`](#branchsummaryentry)

Closed union of session entries.

***

### EntryId

> **EntryId** = `string`

Opaque session entry id.

***

### EntryPayload

> **EntryPayload** = *typeof* `EntryPayload.Type`

Durable wire form of a Session entry.

Session is the authority for model-facing history, so a store that persists entries needs one
shared encoding rather than each backend inventing its own. Entry ids and parent links are stored
as columns by the owning store; only the tag-specific payload is encoded here.

***

### HandoffEntry

> **HandoffEntry** = [`BaseEntry`](#baseentry) & `object`

A self-contained conversation projection imported by a durable handoff.

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"Handoff"`

##### handoffId

> `readonly` **handoffId**: `string`

##### projectedHistory

> `readonly` **projectedHistory**: `Prompt.Prompt`

##### target

> `readonly` **target**: `string`

***

### MemoryEntry

> **MemoryEntry** = [`BaseEntry`](#baseentry) & `object`

Recalled or persisted memory context.

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"Memory"`

##### items

> `readonly` **items**: `ReadonlyArray`\<`string`\>

***

### MessageEntry

> **MessageEntry** = [`BaseEntry`](#baseentry) & `object`

A verbatim conversation message.

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"Message"`

##### message

> `readonly` **message**: `Prompt.Message`

***

### Metadata

> **Metadata** = `Readonly`\<`Record`\<`string`, *typeof* `Schema.Unknown.Type`\>\>

Host-defined metadata carried by session entries.

***

### ModelResponseEntry

> **ModelResponseEntry** = [`BaseEntry`](#baseentry) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"ModelResponse"`

##### content

> `readonly` **content**: `ReadonlyArray`\<`Response.Part`\<`Record`\<`string`, `Tool.Any`\>\>\>

***

### SkillEntry

> **SkillEntry** = [`BaseEntry`](#baseentry) & `object`

An activated skill body.

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"Skill"`

##### body

> `readonly` **body**: `string`

##### name

> `readonly` **name**: `string`

***

### SteeringEntry

> **SteeringEntry** = [`BaseEntry`](#baseentry) & `object`

Live steering input preserved as a prompt message.

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"Steering"`

##### message

> `readonly` **message**: `Prompt.Message`

***

### ToolCallEntry

> **ToolCallEntry** = [`BaseEntry`](#baseentry) & `object`

A model-requested tool call.

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"ToolCall"`

##### part

> `readonly` **part**: `Prompt.ToolCallPart`

***

### ToolResultEntry

> **ToolResultEntry** = [`BaseEntry`](#baseentry) & `object`

A tool execution result.

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"ToolResult"`

##### part

> `readonly` **part**: `Prompt.ToolResultPart`

## Variables

### acquire

> `const` **acquire**: (`sessionId`) => `Effect.Effect`\<[`SessionStore`](#sessionstore), [`SessionStoreError`](#sessionstoreerror), [`SessionDirectory`](#sessiondirectory) \| `Scope.Scope`\>

Acquire one exact Session store for the current Scope.

#### Parameters

##### sessionId

`string`

#### Returns

`Effect.Effect`\<[`SessionStore`](#sessionstore), [`SessionStoreError`](#sessionstoreerror), [`SessionDirectory`](#sessiondirectory) \| `Scope.Scope`\>

***

### buildContext

> `const` **buildContext**: (`path`) => `Prompt.Prompt`

Purely projects a root-to-leaf session path into model context.

#### Parameters

##### path

`ReadonlyArray`\<[`Entry`](#entry)\>

#### Returns

`Prompt.Prompt`

***

### buildMemoryContext

> `const` **buildMemoryContext**: (`path`) => `Prompt.Prompt`

Purely projects a lossless path for memory retention.

#### Parameters

##### path

`ReadonlyArray`\<[`Entry`](#entry)\>

#### Returns

`Prompt.Prompt`

***

### checkpointMatches

> `const` **checkpointMatches**: \{(`prepared`): (`entry`) => `boolean`; (`entry`, `prepared`): `boolean`; \}

Canonical exact checkpoint equivalence.

#### Call Signature

> (`prepared`): (`entry`) => `boolean`

##### Parameters

###### prepared

[`PreparedCheckpoint`](#preparedcheckpoint)

##### Returns

(`entry`) => `boolean`

#### Call Signature

> (`entry`, `prepared`): `boolean`

##### Parameters

###### entry

[`CompactionEntry`](#compactionentry)

###### prepared

[`PreparedCheckpoint`](#preparedcheckpoint)

##### Returns

`boolean`

***

### EntryPayload

> `const` **EntryPayload**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Message"`, \{ `message`: `Schema.Codec`\<`Prompt.Message`, `Prompt.MessageEncoded`, `never`, `never`\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>\>; \}\>, `Schema.TaggedStruct`\<`"ModelResponse"`, \{ `content`: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.Struct`\<\{ `~effect/ai/Content/Part`: ...; `metadata`: ...; `text`: ...; `type`: ...; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: ...; `metadata`: ...; `text`: ...; `type`: ...; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: ...; `approvalId`: ...; `metadata`: ...; `toolCallId`: ...; `type`: ...; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: ...; `data`: ...; `mediaType`: ...; `metadata`: ...; `type`: ...; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: ...; `fileName`: ...; `id`: ...; `mediaType`: ...; `metadata`: ...; `sourceType`: ...; `title`: ...; `type`: ...; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: ...; `id`: ...; `metadata`: ...; `sourceType`: ...; `title`: ...; `type`: ...; `url`: ...; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: ...; `id`: ...; `metadata`: ...; `modelId`: ...; `request`: ...; `timestamp`: ...; `type`: ...; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: ...; `metadata`: ...; `reason`: ...; `response`: ...; `type`: ...; `usage`: ...; \}\>, `Schema.Struct`\<\{ `id`: ...; `metadata`: ...; `name`: ...; `params`: ...; `providerExecuted`: ...; `type`: ...; \}\>, `Schema.Struct`\<\{ `encodedResult`: ...; `id`: ...; `isFailure`: ...; `metadata`: ...; `name`: ...; `preliminary`: ...; `providerExecuted`: ...; `result`: ...; `type`: ...; \}\>\]\>\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>\>; \}\>, `Schema.TaggedStruct`\<`"ToolCall"`, \{ `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>\>; `part`: `Schema.Struct`\<\{ `~effect/ai/Prompt/Part`: `Schema.withDecodingDefaultKey`\<`Schema.Literal`\<`"~effect/ai/Prompt/Part"`\>\>; `id`: `Schema.String`; `name`: `Schema.String`; `options`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<`Schema.Codec`\<...\>\>\>\>; `params`: `Schema.Unknown`; `providerExecuted`: `Schema.withDecodingDefault`\<`Schema.Boolean`\>; `type`: `Schema.Literal`\<`"tool-call"`\>; \}\>; \}\>, `Schema.TaggedStruct`\<`"ToolResult"`, \{ `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>\>; `part`: `Schema.Struct`\<\{ `~effect/ai/Prompt/Part`: `Schema.withDecodingDefaultKey`\<`Schema.Literal`\<`"~effect/ai/Prompt/Part"`\>\>; `id`: `Schema.String`; `isFailure`: `Schema.Boolean`; `name`: `Schema.String`; `options`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<`Schema.Codec`\<...\>\>\>\>; `providerExecuted`: `Schema.withDecodingDefault`\<`Schema.Boolean`\>; `result`: `Schema.Unknown`; `type`: `Schema.Literal`\<`"tool-result"`\>; \}\>; \}\>, `Schema.TaggedStruct`\<`"Memory"`, \{ `items`: `Schema.$Array`\<`Schema.String`\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>\>; \}\>, `Schema.TaggedStruct`\<`"Skill"`, \{ `body`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>\>; `name`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Steering"`, \{ `message`: `Schema.Codec`\<`Prompt.Message`, `Prompt.MessageEncoded`, `never`, `never`\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>\>; \}\>, `Schema.TaggedStruct`\<`"Handoff"`, \{ `handoffId`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>\>; `projectedHistory`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `target`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Compaction"`, \{ `compactionCommit`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `checkpointId`: `Schema.String`; `compactionId`: `Schema.String`; `contextTokensAfter`: `Schema.optionalKey`\<`Schema.Finite`\>; `contextTokensBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `entriesAfter`: `Schema.optionalKey`\<`Schema.Finite`\>; `entriesBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `summaryModelCallId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>\>; `projectedHistory`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `summary`: `Schema.optionalKey`\<`Schema.String`\>; `telemetry`: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: ...; `compactionId`: ...; `deliveryId`: ...; `model`: ...; `modelCallId`: ...; `provider`: ...; `purpose`: ...; `startedAt`: ...; `turn`: ...; \}\>, `Schema.Struct`\<\{ `_tag`: ...; `attempt`: ...; `candidate`: ...; `deliveryId`: ...; `model`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider`: ...; `registrationKey`: ...; `startedAt`: ...; `turn`: ...; \}\>, `Schema.Struct`\<\{ `_tag`: ...; `at`: ...; `attempt`: ...; `deliveryId`: ...; `kind`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `turn`: ...; \}\>, `Schema.Struct`\<\{ `_tag`: ...; `attempt`: ...; `candidate`: ...; `completedAt`: ...; `deliveryId`: ...; `finishReason`: ...; `model`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider`: ...; `providerMetadata`: ...; `registrationKey`: ...; `requestId`: ...; `responseModel`: ...; `serviceTier`: ...; `turn`: ...; `usage`: ...; `usageAt`: ...; \}\>, `Schema.Struct`\<\{ `_tag`: ...; `attempt`: ...; `candidate`: ...; `category`: ...; `classification`: ...; `deliveryId`: ...; `disposition`: ...; `failedAt`: ...; `model`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider`: ...; `providerUsage`: ...; `registrationKey`: ...; `turn`: ...; \}\>, `Schema.Struct`\<\{ `_tag`: ...; `at`: ...; `attempt`: ...; `category`: ...; `delayMillis`: ...; `deliveryId`: ...; `modelCallId`: ...; `reason`: ...; `turn`: ...; \}\>, `Schema.Struct`\<\{ `_tag`: ...; `at`: ...; `attempt`: ...; `category`: ...; `deliveryId`: ...; `fromCandidate`: ...; `fromModel`: ...; `fromProvider`: ...; `fromRegistrationKey`: ...; `modelCallId`: ...; `toCandidate`: ...; `toModel`: ...; `toProvider`: ...; `toRegistrationKey`: ...; `turn`: ...; \}\>, `Schema.Struct`\<\{ `_tag`: ...; `attempts`: ...; `completedAt`: ...; `deliveryId`: ...; `failedAttemptUsage`: ...; `finishReason`: ...; `modelCallId`: ...; `purpose`: ...; `turn`: ...; `usage`: ...; \}\>, `Schema.Struct`\<\{ `_tag`: ...; `attempts`: ...; `category`: ...; `classification`: ...; `deliveryId`: ...; `failedAt`: ...; `failedAttemptUsage`: ...; `modelCallId`: ...; `purpose`: ...; `turn`: ...; \}\>, `Schema.Struct`\<\{ `_tag`: ...; `compactionId`: ...; `contextTokensBefore`: ...; `deliveryId`: ...; `entriesBefore`: ...; `startedAt`: ...; `trigger`: ...; `turn`: ...; \}\>, `Schema.Struct`\<\{ `_tag`: ...; `compactionId`: ...; `deliveryId`: ...; `skippedAt`: ...; `turn`: ...; \}\>, `Schema.Struct`\<\{ `_tag`: ...; `appliedAt`: ...; `checkpointId`: ...; `commit`: ...; `compactionId`: ...; `deliveryId`: ...; `kind`: ...; `turn`: ...; \}\>, `Schema.Struct`\<\{ `_tag`: ...; `compactionId`: ...; `deliveryId`: ...; `failedAt`: ...; `turn`: ...; \}\>\]\>\>; \}\>, `Schema.TaggedStruct`\<`"BranchSummary"`, \{ `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>\>; `summary`: `Schema.String`; \}\>\]\>

Durable wire form of a Session entry.

Session is the authority for model-facing history, so a store that persists entries needs one
shared encoding rather than each backend inventing its own. Entry ids and parent links are stored
as columns by the owning store; only the tag-specific payload is encoded here.

***

### layerMemory

> `const` **layerMemory**: `Layer.Layer`\<[`SessionDirectory`](#sessiondirectory)\>

Ref-backed non-durable Session directory with one linear lane per Session ID.

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`SessionDirectory`](#sessiondirectory)\>

#### Parameters

##### implementation

[`Directory`](#directory)

#### Returns

`Layer.Layer`\<[`SessionDirectory`](#sessiondirectory)\>

***

### ModelResponseContent

> `const` **ModelResponseContent**: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`\>\>\>; `text`: `Schema.String`; `type`: `Schema.tag`\<`"text"`\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`\>\>\>; `text`: `Schema.String`; `type`: `Schema.tag`\<`"reasoning"`\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `approvalId`: `Schema.String`; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`\>\>\>; `toolCallId`: `Schema.String`; `type`: `Schema.tag`\<`"tool-approval-request"`\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `data`: `Schema.Uint8ArrayFromBase64`; `mediaType`: `Schema.String`; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`\>\>\>; `type`: `Schema.tag`\<`"file"`\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `fileName`: `Schema.optionalKey`\<`Schema.String`\>; `id`: `Schema.String`; `mediaType`: `Schema.String`; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`\>\>\>; `sourceType`: `Schema.tag`\<`"document"`\>; `title`: `Schema.String`; `type`: `Schema.tag`\<`"source"`\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `id`: `Schema.String`; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`\>\>\>; `sourceType`: `Schema.tag`\<`"url"`\>; `title`: `Schema.String`; `type`: `Schema.tag`\<`"source"`\>; `url`: `Schema.URLFromString`; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `id`: `Schema.optional`\<`Schema.String`\>; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`\>\>\>; `modelId`: `Schema.optional`\<`Schema.String`\>; `request`: `Schema.optional`\<*typeof* `Response.HttpRequestDetails`\>; `timestamp`: `Schema.optional`\<`Schema.DateTimeUtcFromString`\>; `type`: `Schema.tag`\<`"response-metadata"`\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`\>\>\>; `reason`: `Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>; `response`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<`Schema.Struct`\<\{ `headers`: `Schema.$Record`\<..., ...\>; `status`: `Schema.Int`; \}\>\>\>; `type`: `Schema.tag`\<`"finish"`\>; `usage`: `Schema.Struct`\<\{ `inputTokens`: `Schema.Struct`\<\{ `cacheRead`: `Schema.optionalKey`\<...\>; `cacheWrite`: `Schema.optionalKey`\<...\>; `total`: `Schema.optionalKey`\<...\>; `uncached`: `Schema.optionalKey`\<...\>; \}\>; `outputTokens`: `Schema.Struct`\<\{ `reasoning`: `Schema.optionalKey`\<...\>; `text`: `Schema.optionalKey`\<...\>; `total`: `Schema.optionalKey`\<...\>; \}\>; \}\>; \}\>, `Schema.Struct`\<\{ `id`: `Schema.String`; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<`Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `name`: `Schema.String`; `params`: `Schema.Unknown`; `providerExecuted`: `Schema.Boolean`; `type`: `Schema.Literal`\<`"tool-call"`\>; \}\>, `Schema.Struct`\<\{ `encodedResult`: `Schema.Unknown`; `id`: `Schema.String`; `isFailure`: `Schema.Boolean`; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<`Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `name`: `Schema.String`; `preliminary`: `Schema.Boolean`; `providerExecuted`: `Schema.Boolean`; `result`: `Schema.Unknown`; `type`: `Schema.Literal`\<`"tool-result"`\>; \}\>\]\>\>

***

### unresolvedToolCalls

> `const` **unresolvedToolCalls**: (`prompt`) => `ReadonlyArray`\<`Prompt.ToolCallPart`\>

Framework tool calls in model context that do not yet have a corresponding result.

#### Parameters

##### prompt

`Prompt.Prompt`

#### Returns

`ReadonlyArray`\<`Prompt.ToolCallPart`\>

***

### validateContext

> `const` **validateContext**: (`prompt`) => `Effect.Effect`\<`void`, [`ContextInvalid`](#contextinvalid)\>

Reject model context unless every framework tool call has exactly one matching result.

#### Parameters

##### prompt

`Prompt.Prompt`

#### Returns

`Effect.Effect`\<`void`, [`ContextInvalid`](#contextinvalid)\>
