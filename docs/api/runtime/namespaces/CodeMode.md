[**generalist**](../../index.md)

***

[generalist](../../index.md) / [runtime](../index.md) / CodeMode

# CodeMode

## Classes

<a id="programadmissionfailed"></a>

### ProgramAdmissionFailed

#### Extends

- `ProgramAdmissionFailed_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new ProgramAdmissionFailed**(...`args`): [`ProgramAdmissionFailed`](#programadmissionfailed)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramAdmissionFailed`](#programadmissionfailed)

###### Inherited from

`ProgramAdmissionFailed_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramAdmissionFailed_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`ProgramAdmissionFailed_base.message`

***

<a id="programauthorityexceeded"></a>

### ProgramAuthorityExceeded

#### Extends

- `ProgramAuthorityExceeded_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new ProgramAuthorityExceeded**(...`args`): [`ProgramAuthorityExceeded`](#programauthorityexceeded)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramAuthorityExceeded`](#programauthorityexceeded)

###### Inherited from

`ProgramAuthorityExceeded_base.constructor`

#### Properties

<a id="allowedids"></a>

##### allowedIds

> `readonly` **allowedIds**: readonly `string`[]

###### Inherited from

`ProgramAuthorityExceeded_base.allowedIds`

<a id="dimension"></a>

##### dimension

> `readonly` **dimension**: `"toolCalls"` \| `"tokens"` \| `"concurrency"` \| `"outputBytes"` \| `"agentRuns"` \| `"wallClockMillis"` \| `"logBytes"` \| `"tools"` \| `"agents"` \| `"steps"` \| `"sourceBytes"`

###### Inherited from

`ProgramAuthorityExceeded_base.dimension`

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramAuthorityExceeded_base.hint`

<a id="message-1"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`ProgramAuthorityExceeded_base.message`

<a id="requestedid"></a>

##### requestedId?

> `readonly` `optional` **requestedId?**: `string`

###### Inherited from

`ProgramAuthorityExceeded_base.requestedId`

***

<a id="programauthoritymissing"></a>

### ProgramAuthorityMissing

#### Extends

- `ProgramAuthorityMissing_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new ProgramAuthorityMissing**(...`args`): [`ProgramAuthorityMissing`](#programauthoritymissing)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramAuthorityMissing`](#programauthoritymissing)

###### Inherited from

`ProgramAuthorityMissing_base.constructor`

#### Properties

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramAuthorityMissing_base.hint`

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`ProgramAuthorityMissing_base.runId`

## Interfaces

<a id="authoritycatalog"></a>

### AuthorityCatalog

Exact selection IDs advertised to the model for one ProgramAuthority.

#### Properties

<a id="agents"></a>

##### agents

> `readonly` **agents**: readonly `string`[]

<a id="steps"></a>

##### steps

> `readonly` **steps**: readonly `string`[]

<a id="tools"></a>

##### tools

> `readonly` **tools**: readonly `string`[]

***

<a id="parameters"></a>

### Parameters

Exact model-authored Program request admitted only through an authorized Agent Run.

#### Properties

<a id="agents-1"></a>

##### agents

> `readonly` **agents**: readonly `string`[]

<a id="budget"></a>

##### budget

> `readonly` **budget**: `object`

###### agentRuns

> `readonly` **agentRuns**: `number`

###### concurrency

> `readonly` **concurrency**: `number`

###### logBytes

> `readonly` **logBytes**: `number`

###### outputBytes

> `readonly` **outputBytes**: `number`

###### tokens

> `readonly` **tokens**: `number`

###### toolCalls

> `readonly` **toolCalls**: `number`

###### wallClockMillis

> `readonly` **wallClockMillis**: `number`

<a id="input"></a>

##### input

> `readonly` **input**: `string`

<a id="source"></a>

##### source

> `readonly` **source**: `string`

<a id="steps-1"></a>

##### steps

> `readonly` **steps**: readonly `string`[]

<a id="tools-1"></a>

##### tools

> `readonly` **tools**: readonly `string`[]

***

<a id="service"></a>

### Service

#### Properties

<a id="admitsuspension"></a>

##### admitSuspension

> `readonly` **admitSuspension**: (`input`) => `Effect`\<`void`, [`ProgramAdmissionFailed`](#programadmissionfailed)\>

###### Parameters

###### input

###### checkpoint?

\{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\> \| `string` & `Brand`\<`"generalist/tool-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \} \| \{ `branch?`: \{ `namespace`: `string`; `replay`: \{\[`key`: `string`\]: `string`; \}; \}; `version`: `"1"`; \} \| \{ `version`: `"1"`; \}

###### continuation?

\{ `nextTurn`: `number`; `prompt`: `Prompt`; `queue?`: `"steering"`; `schemaVersion`: `1`; `steeringEntryIds`: readonly `string`[]; \} \| `null`

###### openedAt

`string`

###### suspension

[`AgentSuspended`](../../generalist/namespaces/AgentEvent.md#agentsuspended)

###### waits

readonly `object`[]

###### Returns

`Effect`\<`void`, [`ProgramAdmissionFailed`](#programadmissionfailed)\>

<a id="backgroundtools"></a>

##### backgroundTools

> `readonly` **backgroundTools**: `object`

###### await

> **await**: `Tool`\<`"await_program"`, \{ `failure`: *typeof* [`ProgramAdmissionFailed`](#programadmissionfailed); `failureMode`: `"error"`; `parameters`: `Struct`\<\{ `childRunId`: `String`; \}\>; `success`: `Unknown`; \}, `never`\>

###### cancel

> **cancel**: `Tool`\<`"cancel_program"`, \{ `failure`: *typeof* [`ProgramAdmissionFailed`](#programadmissionfailed); `failureMode`: `"error"`; `parameters`: `Struct`\<\{ `childRunId`: `String`; `reason`: `optionalKey`\<`String`\>; \}\>; `success`: `Struct`\<\{ `childRunId`: `String`; `outcome`: `optionalKey`\<`Codec`\<[`RunOutcome`](./Run.md#runoutcome), \{ `_tag`: `"Succeeded"`; `eventId`: `string`; `occurredAt`: `string`; `result`: \{ `output`: ...; `session`: ...; `text`: ...; `turns`: ...; \} \| \{ `_tag`: ...; `value`: ...; \} \| \{ `_tag`: ...; `isFailure`: ...; `value`: ...; \}; \} \| \{ `_tag`: `"Failed"`; `error`: \{ `_tag`: ...; `capability`: ...; `hint`: ...; \} \| \{ `_tag`: ...; `capability`: ...; `hint`: ...; `operation`: ...; `reason`: ...; \} \| \{ `_tag`: ...; `capability`: ...; `cause`: ...; `hint`: ...; `operation`: ...; \} \| \{ `_tag`: ...; `boundary`: ...; `capability?`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `cause`: ...; `hint`: ...; `operation`: ...; `tool`: ...; \} \| \{ `_tag`: ...; `cause`: ...; `hint`: ...; `operation`: ...; `step`: ...; \} \| \{ `_tag`: ...; `cause`: ...; `hint`: ...; `operation`: ...; `selection`: ...; \} \| \{ `_tag`: ...; `dimension`: ...; `hint`: ...; `limit`: ...; \} \| \{ `_tag`: ...; `actual`: ...; `expected`: ...; `hint`: ...; `operation`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `operation`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `operation`: ...; `reason`: ...; `token?`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `reason`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `limit`: ...; `resource`: ...; \} \| \{ `_tag`: ...; `guarantee`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `kind`: ...; `name`: ...; `reason`: ...; \} \| \{ `_tag`: ...; `actual`: ...; `expected`: ...; `hint`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `cause?`: ...; `failure?`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `ref`: ...; `runId`: ...; \} \| \{ `_tag`: ...; `actualRef`: ...; `expectedRef`: ...; `hint`: ...; `runId`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `pin`: ...; \}; `eventId`: `string`; `occurredAt`: `string`; \} \| \{ `_tag`: `"Cancelled"`; `eventId`: `string`; `occurredAt`: `string`; `reason?`: `string`; \}, `never`, `never`\>\>; `readiness`: `Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>; `status`: `Literals`\<readonly \[`"queued"`, `"running"`, `"waiting"`, `"needs-resolution"`, `"cancelling"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>; \}, `never`\>

###### inspect

> **inspect**: `Tool`\<`"inspect_program"`, \{ `failure`: *typeof* [`ProgramAdmissionFailed`](#programadmissionfailed); `failureMode`: `"error"`; `parameters`: `Struct`\<\{ `childRunId`: `String`; \}\>; `success`: `Struct`\<\{ `childRunId`: `String`; `outcome`: `optionalKey`\<`Codec`\<[`RunOutcome`](./Run.md#runoutcome), \{ `_tag`: `"Succeeded"`; `eventId`: `string`; `occurredAt`: `string`; `result`: \{ `output`: ...; `session`: ...; `text`: ...; `turns`: ...; \} \| \{ `_tag`: ...; `value`: ...; \} \| \{ `_tag`: ...; `isFailure`: ...; `value`: ...; \}; \} \| \{ `_tag`: `"Failed"`; `error`: \{ `_tag`: ...; `capability`: ...; `hint`: ...; \} \| \{ `_tag`: ...; `capability`: ...; `hint`: ...; `operation`: ...; `reason`: ...; \} \| \{ `_tag`: ...; `capability`: ...; `cause`: ...; `hint`: ...; `operation`: ...; \} \| \{ `_tag`: ...; `boundary`: ...; `capability?`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `cause`: ...; `hint`: ...; `operation`: ...; `tool`: ...; \} \| \{ `_tag`: ...; `cause`: ...; `hint`: ...; `operation`: ...; `step`: ...; \} \| \{ `_tag`: ...; `cause`: ...; `hint`: ...; `operation`: ...; `selection`: ...; \} \| \{ `_tag`: ...; `dimension`: ...; `hint`: ...; `limit`: ...; \} \| \{ `_tag`: ...; `actual`: ...; `expected`: ...; `hint`: ...; `operation`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `operation`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `operation`: ...; `reason`: ...; `token?`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `reason`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `limit`: ...; `resource`: ...; \} \| \{ `_tag`: ...; `guarantee`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `kind`: ...; `name`: ...; `reason`: ...; \} \| \{ `_tag`: ...; `actual`: ...; `expected`: ...; `hint`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `cause?`: ...; `failure?`: ...; `hint`: ...; `message`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `ref`: ...; `runId`: ...; \} \| \{ `_tag`: ...; `actualRef`: ...; `expectedRef`: ...; `hint`: ...; `runId`: ...; \} \| \{ `_tag`: ...; `hint`: ...; `pin`: ...; \}; `eventId`: `string`; `occurredAt`: `string`; \} \| \{ `_tag`: `"Cancelled"`; `eventId`: `string`; `occurredAt`: `string`; `reason?`: `string`; \}, `never`, `never`\>\>; `readiness`: `Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>; `status`: `Literals`\<readonly \[`"queued"`, `"running"`, `"waiting"`, `"needs-resolution"`, `"cancelling"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>; \}, `never`\>

###### start

> **start**: `Tool`\<`"start_program"`, \{ `failure`: *typeof* [`ProgramAdmissionFailed`](#programadmissionfailed); `failureMode`: `"error"`; `parameters`: `Struct`\<\{ `agents`: `Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Struct`\<\{ `agentRuns`: `Int`; `concurrency`: `Int`; `logBytes`: `Int`; `outputBytes`: `Int`; `tokens`: `Int`; `toolCalls`: `Int`; `wallClockMillis`: `Int`; \}\>; `input`: `String`; `source`: `String`; `steps`: `Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>; `success`: `Struct`\<\{ `childRunId`: `String`; \}\>; \}, `never`\>

<a id="invoke"></a>

##### invoke

> `readonly` **invoke**: (`request`) => `Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor.md#outcome)\>

###### Parameters

###### request

[`Parameters`](#parameters) & `object`

###### Returns

`Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor.md#outcome)\>

<a id="invokebackground"></a>

##### invokeBackground

> `readonly` **invokeBackground**: (`request`) => `Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor.md#outcome)\>

###### Parameters

###### request

[`Request`](../../generalist/namespaces/ToolExecutor.md#request)

###### Returns

`Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor.md#outcome)\>

<a id="parameters-1"></a>

##### parameters

> `readonly` **parameters**: `Struct`\<\{ `agents`: `Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Struct`\<\{ `agentRuns`: `Int`; `concurrency`: `Int`; `logBytes`: `Int`; `outputBytes`: `Int`; `tokens`: `Int`; `toolCalls`: `Int`; `wallClockMillis`: `Int`; \}\>; `input`: `String`; `source`: `String`; `steps`: `Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>

<a id="tool"></a>

##### tool

> `readonly` **tool**: `Tool`\<`"code_mode"`\>

## Variables

<a id="executor"></a>

### Executor

> `const` **Executor**: `object`

Tool executor that owns the code_mode route.

#### Type Declaration

<a id="make"></a>

##### make

> **make**: *typeof* `makeExecutor`

***

<a id="make-1"></a>

### make

> `const` **make**: (`input`) => [`Service`](#service)

Construct the Run-attempt scoped implementation; applications still own sandbox and handlers resolution.

#### Parameters

##### input

###### authority

[`ProgramAuthority`](../../generalist/namespaces/AgentManifest.md#programauthority-1)

###### claim

`ExecutionClaim`

###### claimed

`ExecutionRecord`

###### store

[`Service`](./RunStore.md#service)

#### Returns

[`Service`](#service)

***

<a id="makebackgroundtools"></a>

### makeBackgroundTools

> `const` **makeBackgroundTools**: (`authority`) => `object`

Nonblocking Program admission and explicit observation/cancellation tools.

#### Parameters

##### authority

[`ProgramAuthority`](../../generalist/namespaces/AgentManifest.md#programauthority-1)

#### Returns

`object`

##### await

> **await**: `Tool.Tool`\<`"await_program"`, \{ `failure`: *typeof* [`ProgramAdmissionFailed`](#programadmissionfailed); `failureMode`: `"error"`; `parameters`: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; \}\>; `success`: `Schema.Unknown`; \}, `never`\>

##### cancel

> **cancel**: `Tool.Tool`\<`"cancel_program"`, \{ `failure`: *typeof* [`ProgramAdmissionFailed`](#programadmissionfailed); `failureMode`: `"error"`; `parameters`: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>; `success`: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; `outcome`: `Schema.optionalKey`\<`Schema.Codec`\<[`RunOutcome`](./Run.md#runoutcome), \{ `_tag`: `"Succeeded"`; `eventId`: `string`; `occurredAt`: `string`; `result`: ... \| ... \| ...; \} \| \{ `_tag`: `"Failed"`; `error`: ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ...; `eventId`: `string`; `occurredAt`: `string`; \} \| \{ `_tag`: `"Cancelled"`; `eventId`: `string`; `occurredAt`: `string`; `reason?`: `string`; \}, `never`, `never`\>\>; `readiness`: `Schema.Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>; `status`: `Schema.Literals`\<readonly \[`"queued"`, `"running"`, `"waiting"`, `"needs-resolution"`, `"cancelling"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>; \}, `never`\>

##### inspect

> **inspect**: `Tool.Tool`\<`"inspect_program"`, \{ `failure`: *typeof* [`ProgramAdmissionFailed`](#programadmissionfailed); `failureMode`: `"error"`; `parameters`: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; \}\>; `success`: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; `outcome`: `Schema.optionalKey`\<`Schema.Codec`\<[`RunOutcome`](./Run.md#runoutcome), \{ `_tag`: `"Succeeded"`; `eventId`: `string`; `occurredAt`: `string`; `result`: ... \| ... \| ...; \} \| \{ `_tag`: `"Failed"`; `error`: ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ...; `eventId`: `string`; `occurredAt`: `string`; \} \| \{ `_tag`: `"Cancelled"`; `eventId`: `string`; `occurredAt`: `string`; `reason?`: `string`; \}, `never`, `never`\>\>; `readiness`: `Schema.Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>; `status`: `Schema.Literals`\<readonly \[`"queued"`, `"running"`, `"waiting"`, `"needs-resolution"`, `"cancelling"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>; \}, `never`\>

##### start

> **start**: `Tool.Tool`\<`"start_program"`, \{ `failure`: *typeof* [`ProgramAdmissionFailed`](#programadmissionfailed); `failureMode`: `"error"`; `parameters`: `Schema.Struct`\<\{ `agents`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Schema.Struct`\<\{ `agentRuns`: `Schema.Int`; `concurrency`: `Schema.Int`; `logBytes`: `Schema.Int`; `outputBytes`: `Schema.Int`; `tokens`: `Schema.Int`; `toolCalls`: `Schema.Int`; `wallClockMillis`: `Schema.Int`; \}\>; `input`: `Schema.String`; `source`: `Schema.String`; `steps`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>; `success`: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; \}\>; \}, `never`\>

***

<a id="makecatalog"></a>

### makeCatalog

> `const` **makeCatalog**: (`authority`) => [`AuthorityCatalog`](#authoritycatalog)

Construct the exact canonical selection catalog for one ProgramAuthority.

#### Parameters

##### authority

[`ProgramAuthority`](../../generalist/namespaces/AgentManifest.md#programauthority-1)

#### Returns

[`AuthorityCatalog`](#authoritycatalog)

***

<a id="makeparameters"></a>

### makeParameters

> `const` **makeParameters**: (`authority`) => `Schema.Struct`\<\{ `agents`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Schema.Struct`\<\{ `agentRuns`: `Schema.Int`; `concurrency`: `Schema.Int`; `logBytes`: `Schema.Int`; `outputBytes`: `Schema.Int`; `tokens`: `Schema.Int`; `toolCalls`: `Schema.Int`; `wallClockMillis`: `Schema.Int`; \}\>; `input`: `Schema.String`; `source`: `Schema.String`; `steps`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>

Construct the model-visible request schema for one exact ProgramAuthority.

#### Parameters

##### authority

[`ProgramAuthority`](../../generalist/namespaces/AgentManifest.md#programauthority-1)

#### Returns

`Schema.Struct`\<\{ `agents`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Schema.Struct`\<\{ `agentRuns`: `Schema.Int`; `concurrency`: `Schema.Int`; `logBytes`: `Schema.Int`; `outputBytes`: `Schema.Int`; `tokens`: `Schema.Int`; `toolCalls`: `Schema.Int`; `wallClockMillis`: `Schema.Int`; \}\>; `input`: `Schema.String`; `source`: `Schema.String`; `steps`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>

***

<a id="maketool"></a>

### makeTool

> `const` **makeTool**: (`authority`) => `Tool.Tool`\<`"code_mode"`, \{ `failure`: `Schema.Union`\<readonly \[*typeof* [`ProgramAuthorityMissing`](#programauthoritymissing), *typeof* [`ProgramAuthorityExceeded`](#programauthorityexceeded), *typeof* [`ProgramAdmissionFailed`](#programadmissionfailed)\]\>; `failureMode`: `"error"`; `parameters`: `Schema.Struct`\<\{ `agents`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Schema.Struct`\<\{ `agentRuns`: `Schema.Int`; `concurrency`: `Schema.Int`; `logBytes`: `Schema.Int`; `outputBytes`: `Schema.Int`; `tokens`: `Schema.Int`; `toolCalls`: `Schema.Int`; `wallClockMillis`: `Schema.Int`; \}\>; `input`: `Schema.String`; `source`: `Schema.String`; `steps`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>; `success`: `Schema.Unknown`; \}, `never`\>

Construct the Runtime-owned Effect AI tool for one exact ProgramAuthority.

#### Parameters

##### authority

[`ProgramAuthority`](../../generalist/namespaces/AgentManifest.md#programauthority-1)

#### Returns

`Tool.Tool`\<`"code_mode"`, \{ `failure`: `Schema.Union`\<readonly \[*typeof* [`ProgramAuthorityMissing`](#programauthoritymissing), *typeof* [`ProgramAuthorityExceeded`](#programauthorityexceeded), *typeof* [`ProgramAdmissionFailed`](#programadmissionfailed)\]\>; `failureMode`: `"error"`; `parameters`: `Schema.Struct`\<\{ `agents`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Schema.Struct`\<\{ `agentRuns`: `Schema.Int`; `concurrency`: `Schema.Int`; `logBytes`: `Schema.Int`; `outputBytes`: `Schema.Int`; `tokens`: `Schema.Int`; `toolCalls`: `Schema.Int`; `wallClockMillis`: `Schema.Int`; \}\>; `input`: `Schema.String`; `source`: `Schema.String`; `steps`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>; `success`: `Schema.Unknown`; \}, `never`\>

***

<a id="programhandle"></a>

### ProgramHandle

> `const` **ProgramHandle**: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; \}\>

A background Program handle identifies an admitted Run, not a completed tool result.

***

<a id="programinspection"></a>

### ProgramInspection

> `const` **ProgramInspection**: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; `outcome`: `Schema.optionalKey`\<`Schema.Codec`\<[`RunOutcome`](./Run.md#runoutcome), \{ `_tag`: `"Succeeded"`; `eventId`: `string`; `occurredAt`: `string`; `result`: \{ `output`: `unknown`; `session`: \{ `leafId`: `string` \| `null`; `sessionId`: `string`; \}; `text`: `string`; `turns`: `number`; \} \| \{ `_tag`: `"Program"`; `value`: `unknown`; \} \| \{ `_tag`: `"Tool"`; `isFailure`: `boolean`; `value`: `unknown`; \}; \} \| \{ `_tag`: `"Failed"`; `error`: \{ `_tag`: `"generalist/core/ProgramCapabilityMissing"`; `capability`: `string`; `hint`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramCapabilityDenied"`; `capability`: `string`; `hint`: `string`; `operation`: `string`; `reason`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramAuthorizationFailure"`; `capability`: `string`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramSchemaFailure"`; `boundary`: `"agent-input"` \| `"agent-output"` \| `"program-input"` \| `"program-output"` \| `"step-input"` \| `"step-output"` \| `"tool-input"` \| `"tool-output"`; `capability?`: `string`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramToolFailure"`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; `tool`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramStepFailure"`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; `step`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramAgentFailure"`; `cause`: `unknown`; `hint`: `string`; `operation`: `string`; `selection`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramBudgetExhausted"`; `dimension`: `"agentRuns"` \| `"concurrency"` \| `"logBytes"` \| `"outputBytes"` \| `"tokens"` \| `"toolCalls"` \| `"wallClockMillis"`; `hint`: `string`; `limit`: `number`; \} \| \{ `_tag`: `"generalist/core/ProgramReplayDivergence"`; `actual`: `string`; `expected`: `string`; `hint`: `string`; `operation`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramOperationUnknown"`; `hint`: `string`; `operation`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramSuspended"`; `hint`: `string`; `operation`: `string`; `reason`: `"agent"` \| `"approval"` \| `"step"` \| `"tool-wait"`; `token?`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramCancelled"`; `hint`: `string`; `reason`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxUnavailable"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxSourceInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxInputInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxOutputInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxExecutionFailure"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxProtocolViolation"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxDeadlineExceeded"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxCancelled"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/SandboxResourceExceeded"`; `hint`: `string`; `limit`: `number`; `resource`: `"cpu"` \| `"output"` \| `"subrequests"`; \} \| \{ `_tag`: `"generalist/core/SandboxGuaranteeUnavailable"`; `guarantee`: `"cpuMillis"` \| `"deadlineMillis"` \| `"filesystem"` \| `"network"` \| `"outputBytes"` \| `"persistence"` \| `"physicalIsolation"` \| `"processes"` \| `"subrequests"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramHandlerMismatch"`; `hint`: `string`; `kind`: `"agent"` \| `"step"` \| `"tool"`; `name`: `string`; `reason`: `string`; \} \| \{ `_tag`: `"generalist/core/ProgramIdentityMismatch"`; `actual`: `string`; `expected`: `string`; `hint`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutableRegistrationInvalid"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/runtime/AgentExecutionFailure"`; `cause?`: `Schema.Json`; `failure?`: \{ `_tag`: `"generalist/core/GateFailed"`; `gate`: \{ `evidence`: ...; `name`: ...; `verdict`: ...; \}; `hint`: `string`; \} \| \{ `_tag`: `"generalist/core/ResumeMismatch"`; `expected?`: ... \| ...; `hint`: `string`; `reason`: ... \| ...; `received`: \{ `_tag`: ...; `checkpoint`: ...; `hint`: ...; `waits`: ...; \}; \} \| \{ `_tag`: `"generalist/core/PermissionDenied"`; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/core/RunBudgetExhausted"`; `budget`: ... \| ... \| ... \| ... \| ...; `hint`: `string`; `remaining?`: `number`; `requested`: `number`; \}; `hint`: `string`; `message`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutablePinMissing"`; `hint`: `string`; `ref`: \{ `active`: `string`; `executable`: `string`; \}; `runId`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutableIdentityMismatch"`; `actualRef`: \{ `active`: `string`; `executable`: `string`; \}; `expectedRef`: \{ `active`: `string`; `executable`: `string`; \}; `hint`: `string`; `runId`: `string`; \} \| \{ `_tag`: `"generalist/runtime/ExecutableRegistrationMissing"`; `hint`: `string`; `pin`: `string`; \}; `eventId`: `string`; `occurredAt`: `string`; \} \| \{ `_tag`: `"Cancelled"`; `eventId`: `string`; `occurredAt`: `string`; `reason?`: `string`; \}, `never`, `never`\>\>; `readiness`: `Schema.Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>; `status`: `Schema.Literals`\<readonly \[`"queued"`, `"running"`, `"waiting"`, `"needs-resolution"`, `"cancelling"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>

Current durable state and, only after settlement, the Program outcome.

***

<a id="withtool"></a>

### withTool

> `const` **withTool**: \{(`implementation`): \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`) => [`Agent`](../../generalist/namespaces/Agent.md#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>; \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`, `implementation`): [`Agent`](../../generalist/namespaces/Agent.md#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>; \}

Add the Runtime-owned parallel-safe declaration without changing the resolved Agent identity.

#### Call Signature

> (`implementation`): \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`) => [`Agent`](../../generalist/namespaces/Agent.md#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>

##### Parameters

###### implementation

[`Service`](#service)

##### Returns

\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`) => [`Agent`](../../generalist/namespaces/Agent.md#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>

#### Call Signature

> \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`, `implementation`): [`Agent`](../../generalist/namespaces/Agent.md#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

###### PolicyServices

`PolicyServices`

###### AuthorizationServices

`AuthorizationServices`

###### InputSchema

`InputSchema` *extends* `Top`

###### OutputSchema

`OutputSchema` *extends* `Top`

##### Parameters

###### agent

[`Agent`](../../generalist/namespaces/Agent.md#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>

###### implementation

[`Service`](#service)

##### Returns

[`Agent`](../../generalist/namespaces/Agent.md#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>
