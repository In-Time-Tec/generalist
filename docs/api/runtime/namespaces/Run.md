[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Run

# Run

## Interfaces

<a id="run"></a>

### Run

#### Properties

<a id="attempt"></a>

##### attempt

> `readonly` **attempt**: `number`

<a id="depth"></a>

##### depth

> `readonly` **depth**: `number`

<a id="executablemanifest"></a>

##### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

<a id="executableref"></a>

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

<a id="lastsequence"></a>

##### lastSequence

> `readonly` **lastSequence**: `number`

<a id="messageid"></a>

##### messageId

> `readonly` **messageId**: `string`

<a id="parentrunid"></a>

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

<a id="rootrunid"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

<a id="status"></a>

##### status

> `readonly` **status**: `"failed"` \| `"cancelled"` \| `"queued"` \| `"succeeded"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`

<a id="treepolicy"></a>

##### treePolicy

> `readonly` **treePolicy**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

<a id="waits"></a>

##### waits

> `readonly` **waits**: readonly `object`[]

***

<a id="runinspection"></a>

### RunInspection

#### Extended by

- [`RuntimeInspection`](./Runtime#runtimeinspection)

#### Properties

<a id="branches"></a>

##### branches

> `readonly` **branches**: readonly `object`[]

<a id="childreadiness"></a>

##### childReadiness?

> `readonly` `optional` **childReadiness?**: `"queued"` \| `"ready"` \| `"settled"`

<a id="depth-1"></a>

##### depth

> `readonly` **depth**: `number`

<a id="durability"></a>

##### durability

> `readonly` **durability**: `"ephemeral"` \| `"durable"`

<a id="executablemanifest-1"></a>

##### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

<a id="executableref-1"></a>

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

<a id="lastsequence-1"></a>

##### lastSequence

> `readonly` **lastSequence**: `number`

<a id="parentrunid-1"></a>

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

<a id="runid-1"></a>

##### runId

> `readonly` **runId**: `string`

<a id="status-1"></a>

##### status

> `readonly` **status**: `"failed"` \| `"cancelled"` \| `"queued"` \| `"succeeded"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`

<a id="treepolicy-1"></a>

##### treePolicy

> `readonly` **treePolicy**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

<a id="waits-1"></a>

##### waits

> `readonly` **waits**: readonly `object`[]

***

<a id="runinspectionencoded"></a>

### RunInspectionEncoded

Encoded durable Run inspection.

#### Extends

- `Omit`\<[`RunInspection`](#runinspection), `"runId"` \| `"executableRef"` \| `"executableManifest"` \| `"waits"`\>

#### Properties

<a id="branches-1"></a>

##### branches

> `readonly` **branches**: readonly `object`[]

###### Inherited from

[`RunInspection`](#runinspection).[`branches`](#branches)

<a id="childreadiness-1"></a>

##### childReadiness?

> `readonly` `optional` **childReadiness?**: `"queued"` \| `"ready"` \| `"settled"`

###### Inherited from

[`RunInspection`](#runinspection).[`childReadiness`](#childreadiness)

<a id="depth-2"></a>

##### depth

> `readonly` **depth**: `number`

###### Inherited from

[`RunInspection`](#runinspection).[`depth`](#depth-1)

<a id="durability-1"></a>

##### durability

> `readonly` **durability**: `"ephemeral"` \| `"durable"`

###### Inherited from

[`RunInspection`](#runinspection).[`durability`](#durability)

<a id="executablemanifest-2"></a>

##### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifestEncoded`](../../generalist/namespaces/ExecutableManifest#executablemanifestencoded)

<a id="executableref-2"></a>

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string`

###### executable

> `readonly` **executable**: `string`

<a id="lastsequence-2"></a>

##### lastSequence

> `readonly` **lastSequence**: `number`

###### Inherited from

[`RunInspection`](#runinspection).[`lastSequence`](#lastsequence-1)

<a id="parentrunid-2"></a>

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

###### Inherited from

[`RunInspection`](#runinspection).[`parentRunId`](#parentrunid-1)

<a id="runid-2"></a>

##### runId

> `readonly` **runId**: `string`

<a id="status-2"></a>

##### status

> `readonly` **status**: `"failed"` \| `"cancelled"` \| `"queued"` \| `"succeeded"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`

###### Inherited from

[`RunInspection`](#runinspection).[`status`](#status-1)

<a id="treepolicy-2"></a>

##### treePolicy

> `readonly` **treePolicy**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

###### Inherited from

[`RunInspection`](#runinspection).[`treePolicy`](#treepolicy-1)

<a id="waits-2"></a>

##### waits

> `readonly` **waits**: readonly `object`[]

***

<a id="runreceipt"></a>

### RunReceipt

#### Extended by

- [`StartReceipt`](./Runtime#startreceipt)

#### Properties

<a id="acceptedsequence"></a>

##### acceptedSequence

> `readonly` **acceptedSequence**: `number`

<a id="duplicate"></a>

##### duplicate

> `readonly` **duplicate**: `boolean`

<a id="messageid-1"></a>

##### messageId

> `readonly` **messageId**: `string`

<a id="runid-3"></a>

##### runId

> `readonly` **runId**: `string`

***

<a id="runsnapshot"></a>

### RunSnapshot

#### Properties

<a id="budget"></a>

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

<a id="compactions"></a>

##### compactions

> `readonly` **compactions**: readonly [`CompactionInspection`](#compactioninspection)[]

<a id="cursor"></a>

##### cursor

> `readonly` **cursor**: `number`

<a id="gates"></a>

##### gates

> `readonly` **gates**: readonly `object`[]

<a id="outcome"></a>

##### outcome?

> `readonly` `optional` **outcome?**: [`RunOutcome`](#runoutcome)

<a id="run-1"></a>

##### run

> `readonly` **run**: [`RunInspection`](#runinspection)

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

<a id="usagefacts"></a>

##### usageFacts

> `readonly` **usageFacts**: readonly [`RawUsageFact`](#rawusagefact)[]

## Type Aliases

<a id="compactioninspection"></a>

### CompactionInspection

> **CompactionInspection** = `CompactionInspectionBase` & `object` \| `CompactionInspectionBase` & `object` \| `CompactionInspectionBase` & `object`

***

<a id="executionresult"></a>

### ExecutionResult

> **ExecutionResult** = [`ExecutionResult`](./ExecutionState#executionresult)

***

<a id="rawusagefact"></a>

### RawUsageFact

> **RawUsageFact** = `RawUsageCommon` & `object` \| `RawUsageCommon` & `object`

***

<a id="runbranch"></a>

### RunBranch

> **RunBranch** = *typeof* `RunBranch.Type`

A durable alternate continuation retained from a fork or rewind.

***

<a id="runfailure"></a>

### RunFailure

> **RunFailure** = [`AgentExecutionFailure`](./Errors#agentexecutionfailure) \| [`ExecutablePinMissing`](./Errors#executablepinmissing) \| [`ExecutableIdentityMismatch`](./Errors#executableidentitymismatch) \| [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing) \| [`ExecutionFailure`](../../generalist/namespaces/ProgramRunner#executionfailure)

***

<a id="runid-4"></a>

### RunId

> **RunId** = [`RunId`](../../generalist/index#runid)

Runtime uses Core's canonical Agent execution identity.

***

<a id="runoutcome"></a>

### RunOutcome

> **RunOutcome** = \{ `_tag`: `"Succeeded"`; `eventId`: `string`; `occurredAt`: `string`; `result`: [`ExecutionResult`](./ExecutionState#executionresult); \} \| \{ `_tag`: `"Failed"`; `error`: [`RunFailure`](#runfailure); `eventId`: `string`; `occurredAt`: `string`; \} \| \{ `_tag`: `"Cancelled"`; `eventId`: `string`; `occurredAt`: `string`; `reason?`: `string`; \}

***

<a id="runstatus-1"></a>

### RunStatus

> **RunStatus** = *typeof* `RunStatus.Type`

## Variables

<a id="compactioninspection-1"></a>

### CompactionInspection

> **CompactionInspection**: `Codec`\<[`CompactionInspection`](#compactioninspection), [`CompactionInspection`](#compactioninspection), `never`, `never`\>

***

<a id="decodeinspection"></a>

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

<a id="decodereceipt"></a>

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

<a id="decodesnapshot"></a>

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

<a id="encodeinspection"></a>

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

<a id="encodereceipt"></a>

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

<a id="encodesnapshot"></a>

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

<a id="executionresult-1"></a>

### ExecutionResult

> `const` **ExecutionResult**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `output`: `Schema.optionalKey`\<`Schema.Unknown`\>; `session`: `Schema.Struct`\<\{ `leafId`: `Schema.NullOr`\<`Schema.String`\>; `sessionId`: `Schema.String`; \}\>; `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"Program"`, \{ `value`: `Schema.Unknown`; \}\>\]\>

***

<a id="isterminal"></a>

### isTerminal

> `const` **isTerminal**: (`status`) => status is "succeeded" \| "failed" \| "cancelled"

#### Parameters

##### status

[`RunStatus`](#runstatus-1)

#### Returns

status is "succeeded" \| "failed" \| "cancelled"

***

<a id="rawusagefact-1"></a>

### RawUsageFact

> **RawUsageFact**: `Codec`\<[`RawUsageFact`](#rawusagefact), [`RawUsageFact`](#rawusagefact), `never`, `never`\>

***

<a id="run-2"></a>

### Run

> **Run**: `Codec`\<[`Run`](#run), `RunEncoded`, `never`, `never`\>

***

<a id="runbranch-1"></a>

### RunBranch

> `const` **RunBranch**: `Schema.Struct`\<\{ `forkedAt`: `Schema.Int`; `runId`: `Schema.String`; \}\>

A durable alternate continuation retained from a fork or rewind.

***

<a id="runfailure-1"></a>

### RunFailure

> **RunFailure**: `Codec`\<[`RunFailure`](#runfailure), `unknown`, `never`, `never`\>

***

<a id="runid-5"></a>

### RunId

> `const` **RunId**: `Schema.String`

Runtime uses Core's canonical Agent execution identity.

***

<a id="runinspection-1"></a>

### RunInspection

> **RunInspection**: `Codec`\<[`RunInspection`](#runinspection), [`RunInspectionEncoded`](#runinspectionencoded), `never`, `never`\>

***

<a id="runinspectionfields"></a>

### RunInspectionFields

> `const` **RunInspectionFields**: `object`

Field schemas shared by `RunInspection` and the schemas that extend it.

#### Type Declaration

<a id="branches-2"></a>

##### branches

> `readonly` **branches**: `Schema.$Array`\<`Schema.Struct`\<\{ `forkedAt`: `Schema.Int`; `runId`: `Schema.String`; \}\>\>

<a id="childreadiness-2"></a>

##### childReadiness

> `readonly` **childReadiness**: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>\>

<a id="depth-3"></a>

##### depth

> `readonly` **depth**: `Schema.Int`

<a id="durability-2"></a>

##### durability

> `readonly` **durability**: `Schema.Literals`\<readonly \[`"ephemeral"`, `"durable"`\]\>

<a id="executablemanifest-3"></a>

##### executableManifest

> `readonly` **executableManifest**: `Schema.Codec`\<[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest), [`ExecutableManifestEncoded`](../../generalist/namespaces/ExecutableManifest#executablemanifestencoded), `never`, `never`\>

<a id="executableref-3"></a>

##### executableRef

> `readonly` **executableRef**: `Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>

<a id="lastsequence-3"></a>

##### lastSequence

> `readonly` **lastSequence**: `Schema.Int`

<a id="parentrunid-3"></a>

##### parentRunId

> `readonly` **parentRunId**: `Schema.optionalKey`\<`Schema.String`\>

<a id="runid-6"></a>

##### runId

> `readonly` **runId**: `Schema.String`

<a id="status-3"></a>

##### status

> `readonly` **status**: `Schema.Literals`\<readonly \[`"queued"`, `"running"`, `"waiting"`, `"needs-resolution"`, `"cancelling"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>

<a id="treepolicy-3"></a>

##### treePolicy

> `readonly` **treePolicy**: `Schema.Struct`\<\{ `maxDepth`: `Schema.Int`; `maxSubagents`: `Schema.Int`; \}\>

<a id="waits-3"></a>

##### waits

> `readonly` **waits**: `Schema.$Array`\<`Schema.Struct`\<\{ `closedAt`: `Schema.optionalKey`\<`Schema.String`\>; `openedAt`: `Schema.String`; `reason`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"ToolWait"`, \{ \}\>, `Schema.TaggedStruct`\<`"Approval"`, \{ `request`: `Schema.Struct`\<\{ `approvalId`: ...; `capability`: ...; `input`: ...; `operation`: ...; \}\>; \}\>, `Schema.TaggedStruct`\<`"Signal"`, \{ `name`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Timer"`, \{ `dueAt`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"External"`, \{ `capability`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"AwaitEvent"`, \{ `deadline`: `Schema.String`; `filter`: `Schema.Union`\<readonly ...\>; \}\>\]\>; `resolution`: `Schema.optionalKey`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<...\>; \}\>, `Schema.TaggedStruct`\<`"ToolResult"`, \{ `encodedResult`: `Schema.Unknown`; `result`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Signal"`, \{ `name`: `Schema.String`; `payload`: `Schema.optionalKey`\<...\>; \}\>\]\>\>; `status`: `Schema.Literals`\<readonly \[`"open"`, `"responded"`, `"signaled"`, `"cancelled"`\]\>; `waitId`: `Schema.String`; \}\>\>

***

<a id="runoutcome-1"></a>

### RunOutcome

> **RunOutcome**: `Codec`\<[`RunOutcome`](#runoutcome), `RunOutcomeEncoded`, `never`, `never`\>

***

<a id="runreceipt-1"></a>

### RunReceipt

> **RunReceipt**: `Codec`\<[`RunReceipt`](#runreceipt), `RunReceiptEncoded`, `never`, `never`\>

***

<a id="runsnapshot-1"></a>

### RunSnapshot

> **RunSnapshot**: `Codec`\<[`RunSnapshot`](#runsnapshot), `RunSnapshotEncoded`, `never`, `never`\>

***

<a id="runstatus-2"></a>

### RunStatus

> `const` **RunStatus**: `Schema.Literals`\<readonly \[`"queued"`, `"running"`, `"waiting"`, `"needs-resolution"`, `"cancelling"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>
