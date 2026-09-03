[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Run

# Run

## Interfaces

### Run

#### Properties

##### attempt

> `readonly` **attempt**: `number`

##### depth

> `readonly` **depth**: `number`

##### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

##### lastSequence

> `readonly` **lastSequence**: `number`

##### messageId

> `readonly` **messageId**: `string`

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

##### rootRunId

> `readonly` **rootRunId**: `string`

##### runId

> `readonly` **runId**: `string`

##### sessionId

> `readonly` **sessionId**: `string`

##### status

> `readonly` **status**: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`

##### treePolicy

> `readonly` **treePolicy**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

##### waits

> `readonly` **waits**: readonly `object`[]

***

### RunInspection

#### Extended by

- [`RuntimeInspection`](./Runtime#runtimeinspection)

#### Properties

##### branches

> `readonly` **branches**: readonly `object`[]

##### childReadiness?

> `readonly` `optional` **childReadiness?**: `"queued"` \| `"ready"` \| `"settled"`

##### depth

> `readonly` **depth**: `number`

##### durability

> `readonly` **durability**: `"ephemeral"` \| `"durable"`

##### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

##### lastSequence

> `readonly` **lastSequence**: `number`

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

##### runId

> `readonly` **runId**: `string`

##### status

> `readonly` **status**: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`

##### treePolicy

> `readonly` **treePolicy**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

##### waits

> `readonly` **waits**: readonly `object`[]

***

### RunInspectionEncoded

Encoded durable Run inspection.

#### Extends

- `Omit`\<[`RunInspection`](#runinspection), `"runId"` \| `"executableRef"` \| `"executableManifest"` \| `"waits"`\>

#### Properties

##### branches

> `readonly` **branches**: readonly `object`[]

###### Inherited from

[`RunInspection`](#runinspection).[`branches`](#branches)

##### childReadiness?

> `readonly` `optional` **childReadiness?**: `"queued"` \| `"ready"` \| `"settled"`

###### Inherited from

[`RunInspection`](#runinspection).[`childReadiness`](#childreadiness)

##### depth

> `readonly` **depth**: `number`

###### Inherited from

[`RunInspection`](#runinspection).[`depth`](#depth-1)

##### durability

> `readonly` **durability**: `"ephemeral"` \| `"durable"`

###### Inherited from

[`RunInspection`](#runinspection).[`durability`](#durability)

##### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifestEncoded`](../../generalist/namespaces/ExecutableManifest#executablemanifestencoded)

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string`

###### executable

> `readonly` **executable**: `string`

##### lastSequence

> `readonly` **lastSequence**: `number`

###### Inherited from

[`RunInspection`](#runinspection).[`lastSequence`](#lastsequence-1)

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

###### Inherited from

[`RunInspection`](#runinspection).[`parentRunId`](#parentrunid-1)

##### runId

> `readonly` **runId**: `string`

##### status

> `readonly` **status**: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`

###### Inherited from

[`RunInspection`](#runinspection).[`status`](#status-1)

##### treePolicy

> `readonly` **treePolicy**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

###### Inherited from

[`RunInspection`](#runinspection).[`treePolicy`](#treepolicy-1)

##### waits

> `readonly` **waits**: readonly `object`[]

***

### RunReceipt

#### Extended by

- [`StartReceipt`](./Runtime#startreceipt)

#### Properties

##### acceptedSequence

> `readonly` **acceptedSequence**: `number`

##### duplicate

> `readonly` **duplicate**: `boolean`

##### messageId

> `readonly` **messageId**: `string`

##### runId

> `readonly` **runId**: `string`

***

### RunSnapshot

#### Properties

##### budget

> `readonly` **budget**: `object`

###### children?

> `readonly` `optional` **children?**: `number`

###### duration?

> `readonly` `optional` **duration?**: `number`

###### tokens?

> `readonly` `optional` **tokens?**: `number`

###### toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### usd?

> `readonly` `optional` **usd?**: `number` \| `"unknown"`

##### compactions

> `readonly` **compactions**: readonly [`CompactionInspection`](#compactioninspection)[]

##### cursor

> `readonly` **cursor**: `number`

##### gates

> `readonly` **gates**: readonly `object`[]

##### outcome?

> `readonly` `optional` **outcome?**: [`RunOutcome`](#runoutcome)

##### run

> `readonly` **run**: [`RunInspection`](#runinspection)

##### turn

> `readonly` **turn**: `number`

##### usageFacts

> `readonly` **usageFacts**: readonly [`RawUsageFact`](#rawusagefact)[]

## Type Aliases

### CompactionInspection

> **CompactionInspection** = `CompactionInspectionBase` & `object` \| `CompactionInspectionBase` & `object` \| `CompactionInspectionBase` & `object`

***

### ExecutionResult

> **ExecutionResult** = [`ExecutionResult`](./ExecutionState#executionresult)

***

### RawUsageFact

> **RawUsageFact** = `RawUsageCommon` & `object` \| `RawUsageCommon` & `object`

***

### RunBranch

> **RunBranch** = *typeof* `RunBranch.Type`

A durable alternate continuation retained from a fork or rewind.

***

### RunFailure

> **RunFailure** = [`AgentExecutionFailure`](./Errors#agentexecutionfailure) \| [`ExecutablePinMissing`](./Errors#executablepinmissing) \| [`ExecutableIdentityMismatch`](./Errors#executableidentitymismatch) \| [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing) \| [`ExecutionFailure`](../../generalist/namespaces/ProgramRunner#executionfailure)

***

### RunId

> **RunId** = [`RunId`](../../generalist/index#runid)

Runtime uses Core's canonical Agent execution identity.

***

### RunOutcome

> **RunOutcome** = \{ `_tag`: `"Succeeded"`; `eventId`: `string`; `occurredAt`: `string`; `result`: [`ExecutionResult`](./ExecutionState#executionresult); \} \| \{ `_tag`: `"Failed"`; `error`: [`RunFailure`](#runfailure); `eventId`: `string`; `occurredAt`: `string`; \} \| \{ `_tag`: `"Cancelled"`; `eventId`: `string`; `occurredAt`: `string`; `reason?`: `string`; \}

***

### RunStatus

> **RunStatus** = *typeof* `RunStatus.Type`

## Variables

### CompactionInspection

> **CompactionInspection**: `Codec`\<[`CompactionInspection`](#compactioninspection), [`CompactionInspection`](#compactioninspection), `never`, `never`\>

***

### decodeInspection

> `const` **decodeInspection**: \{(`input`, `options?`): `Effect`\<[`RunInspection`](#runinspection), `SchemaError`, `never`\>; (`options?`): (`input`) => `Effect`\<[`RunInspection`](#runinspection), `SchemaError`, `never`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<[`RunInspection`](#runinspection), `SchemaError`, `never`\>

##### Parameters

###### input

[`RunInspectionEncoded`](#runinspectionencoded)

###### options?

`ParseOptions`

##### Returns

`Effect`\<[`RunInspection`](#runinspection), `SchemaError`, `never`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<[`RunInspection`](#runinspection), `SchemaError`, `never`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<[`RunInspection`](#runinspection), `SchemaError`, `never`\>

***

### decodeReceipt

> `const` **decodeReceipt**: \{(`input`, `options?`): `Effect`\<[`RunReceipt`](#runreceipt), `SchemaError`, `never`\>; (`options?`): (`input`) => `Effect`\<[`RunReceipt`](#runreceipt), `SchemaError`, `never`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<[`RunReceipt`](#runreceipt), `SchemaError`, `never`\>

##### Parameters

###### input

`RunReceiptEncoded`

###### options?

`ParseOptions`

##### Returns

`Effect`\<[`RunReceipt`](#runreceipt), `SchemaError`, `never`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<[`RunReceipt`](#runreceipt), `SchemaError`, `never`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<[`RunReceipt`](#runreceipt), `SchemaError`, `never`\>

***

### decodeSnapshot

> `const` **decodeSnapshot**: \{(`input`, `options?`): `Effect`\<[`RunSnapshot`](#runsnapshot), `SchemaError`, `never`\>; (`options?`): (`input`) => `Effect`\<[`RunSnapshot`](#runsnapshot), `SchemaError`, `never`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<[`RunSnapshot`](#runsnapshot), `SchemaError`, `never`\>

##### Parameters

###### input

`RunSnapshotEncoded`

###### options?

`ParseOptions`

##### Returns

`Effect`\<[`RunSnapshot`](#runsnapshot), `SchemaError`, `never`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<[`RunSnapshot`](#runsnapshot), `SchemaError`, `never`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<[`RunSnapshot`](#runsnapshot), `SchemaError`, `never`\>

***

### encodeInspection

> `const` **encodeInspection**: \{(`input`, `options?`): `Effect`\<[`RunInspectionEncoded`](#runinspectionencoded), `SchemaError`, `never`\>; (`options?`): (`input`) => `Effect`\<[`RunInspectionEncoded`](#runinspectionencoded), `SchemaError`, `never`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<[`RunInspectionEncoded`](#runinspectionencoded), `SchemaError`, `never`\>

##### Parameters

###### input

[`RunInspection`](#runinspection)

###### options?

`ParseOptions`

##### Returns

`Effect`\<[`RunInspectionEncoded`](#runinspectionencoded), `SchemaError`, `never`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<[`RunInspectionEncoded`](#runinspectionencoded), `SchemaError`, `never`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<[`RunInspectionEncoded`](#runinspectionencoded), `SchemaError`, `never`\>

***

### encodeReceipt

> `const` **encodeReceipt**: \{(`input`, `options?`): `Effect`\<`RunReceiptEncoded`, `SchemaError`, `never`\>; (`options?`): (`input`) => `Effect`\<`RunReceiptEncoded`, `SchemaError`, `never`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<`RunReceiptEncoded`, `SchemaError`, `never`\>

##### Parameters

###### input

[`RunReceipt`](#runreceipt)

###### options?

`ParseOptions`

##### Returns

`Effect`\<`RunReceiptEncoded`, `SchemaError`, `never`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<`RunReceiptEncoded`, `SchemaError`, `never`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<`RunReceiptEncoded`, `SchemaError`, `never`\>

***

### encodeSnapshot

> `const` **encodeSnapshot**: \{(`input`, `options?`): `Effect`\<`RunSnapshotEncoded`, `SchemaError`, `never`\>; (`options?`): (`input`) => `Effect`\<`RunSnapshotEncoded`, `SchemaError`, `never`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<`RunSnapshotEncoded`, `SchemaError`, `never`\>

##### Parameters

###### input

[`RunSnapshot`](#runsnapshot)

###### options?

`ParseOptions`

##### Returns

`Effect`\<`RunSnapshotEncoded`, `SchemaError`, `never`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<`RunSnapshotEncoded`, `SchemaError`, `never`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<`RunSnapshotEncoded`, `SchemaError`, `never`\>

***

### ExecutionResult

> `const` **ExecutionResult**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `output`: `Schema.optionalKey`\<`Schema.Unknown`\>; `session`: `Schema.Struct`\<\{ `leafId`: `Schema.NullOr`\<`Schema.String`\>; `sessionId`: `Schema.String`; \}\>; `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"Program"`, \{ `value`: `Schema.Unknown`; \}\>\]\>

***

### isTerminal

> `const` **isTerminal**: (`status`) => status is "succeeded" \| "failed" \| "cancelled"

#### Parameters

##### status

[`RunStatus`](#runstatus-1)

#### Returns

status is "succeeded" \| "failed" \| "cancelled"

***

### RawUsageFact

> **RawUsageFact**: `Codec`\<[`RawUsageFact`](#rawusagefact), [`RawUsageFact`](#rawusagefact), `never`, `never`\>

***

### Run

> **Run**: `Codec`\<[`Run`](#run), `RunEncoded`, `never`, `never`\>

***

### RunBranch

> `const` **RunBranch**: `Schema.Struct`\<\{ `forkedAt`: `Schema.Int`; `runId`: `Schema.String`; \}\>

A durable alternate continuation retained from a fork or rewind.

***

### RunFailure

> **RunFailure**: `Codec`\<[`RunFailure`](#runfailure), `unknown`, `never`, `never`\>

***

### RunId

> `const` **RunId**: `Schema.String`

Runtime uses Core's canonical Agent execution identity.

***

### RunInspection

> **RunInspection**: `Codec`\<[`RunInspection`](#runinspection), [`RunInspectionEncoded`](#runinspectionencoded), `never`, `never`\>

***

### RunInspectionFields

> `const` **RunInspectionFields**: `object`

Field schemas shared by `RunInspection` and the schemas that extend it.

#### Type Declaration

##### branches

> `readonly` **branches**: `Schema.$Array`\<`Schema.Struct`\<\{ `forkedAt`: `Schema.Int`; `runId`: `Schema.String`; \}\>\>

##### childReadiness

> `readonly` **childReadiness**: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>\>

##### depth

> `readonly` **depth**: `Schema.Int`

##### durability

> `readonly` **durability**: `Schema.Literals`\<readonly \[`"ephemeral"`, `"durable"`\]\>

##### executableManifest

> `readonly` **executableManifest**: `Schema.Codec`\<[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest), [`ExecutableManifestEncoded`](../../generalist/namespaces/ExecutableManifest#executablemanifestencoded), `never`, `never`\>

##### executableRef

> `readonly` **executableRef**: `Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>

##### lastSequence

> `readonly` **lastSequence**: `Schema.Int`

##### parentRunId

> `readonly` **parentRunId**: `Schema.optionalKey`\<`Schema.String`\>

##### runId

> `readonly` **runId**: `Schema.String`

##### status

> `readonly` **status**: `Schema.Literals`\<readonly \[`"queued"`, `"running"`, `"waiting"`, `"needs-resolution"`, `"cancelling"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>

##### treePolicy

> `readonly` **treePolicy**: `Schema.Struct`\<\{ `maxDepth`: `Schema.Int`; `maxSubagents`: `Schema.Int`; \}\>

##### waits

> `readonly` **waits**: `Schema.$Array`\<`Schema.Struct`\<\{ `closedAt`: `Schema.optionalKey`\<`Schema.String`\>; `openedAt`: `Schema.String`; `reason`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"ToolWait"`, \{ \}\>, `Schema.TaggedStruct`\<`"Approval"`, \{ `request`: `Schema.Struct`\<\{ `approvalId`: ...; `capability`: ...; `input`: ...; `operation`: ...; \}\>; \}\>, `Schema.TaggedStruct`\<`"Signal"`, \{ `name`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Timer"`, \{ `dueAt`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"External"`, \{ `capability`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"AwaitEvent"`, \{ `deadline`: `Schema.String`; `filter`: `Schema.Union`\<readonly ...\>; \}\>\]\>; `resolution`: `Schema.optionalKey`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<...\>; \}\>, `Schema.TaggedStruct`\<`"ToolResult"`, \{ `encodedResult`: `Schema.Unknown`; `result`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Signal"`, \{ `name`: `Schema.String`; `payload`: `Schema.optionalKey`\<...\>; \}\>\]\>\>; `status`: `Schema.Literals`\<readonly \[`"open"`, `"responded"`, `"signaled"`, `"cancelled"`\]\>; `waitId`: `Schema.String`; \}\>\>

***

### RunOutcome

> **RunOutcome**: `Codec`\<[`RunOutcome`](#runoutcome), `RunOutcomeEncoded`, `never`, `never`\>

***

### RunReceipt

> **RunReceipt**: `Codec`\<[`RunReceipt`](#runreceipt), `RunReceiptEncoded`, `never`, `never`\>

***

### RunSnapshot

> **RunSnapshot**: `Codec`\<[`RunSnapshot`](#runsnapshot), `RunSnapshotEncoded`, `never`, `never`\>

***

### RunStatus

> `const` **RunStatus**: `Schema.Literals`\<readonly \[`"queued"`, `"running"`, `"waiting"`, `"needs-resolution"`, `"cancelling"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>
