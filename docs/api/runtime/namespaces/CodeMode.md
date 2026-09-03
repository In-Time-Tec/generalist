[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / CodeMode

# CodeMode

## Classes

### ProgramAdmissionFailed

#### Extends

- `ProgramAdmissionFailed_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramAdmissionFailed_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`ProgramAdmissionFailed_base.message`

***

### ProgramAuthorityExceeded

#### Extends

- `ProgramAuthorityExceeded_base`

#### Constructors

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

##### allowedIds

> `readonly` **allowedIds**: readonly `string`[]

###### Inherited from

`ProgramAuthorityExceeded_base.allowedIds`

##### dimension

> `readonly` **dimension**: `"toolCalls"` \| `"tokens"` \| `"outputBytes"` \| `"agentRuns"` \| `"concurrency"` \| `"wallClockMillis"` \| `"logBytes"` \| `"tools"` \| `"agents"` \| `"steps"` \| `"sourceBytes"`

###### Inherited from

`ProgramAuthorityExceeded_base.dimension`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramAuthorityExceeded_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`ProgramAuthorityExceeded_base.message`

##### requestedId?

> `readonly` `optional` **requestedId?**: `string`

###### Inherited from

`ProgramAuthorityExceeded_base.requestedId`

***

### ProgramAuthorityMissing

#### Extends

- `ProgramAuthorityMissing_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramAuthorityMissing_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`ProgramAuthorityMissing_base.runId`

## Interfaces

### AuthorityCatalog

Exact selection IDs advertised to the model for one ProgramAuthority.

#### Properties

##### agents

> `readonly` **agents**: readonly `string`[]

##### steps

> `readonly` **steps**: readonly `string`[]

##### tools

> `readonly` **tools**: readonly `string`[]

***

### Parameters

Exact model-authored Program request admitted only through an authorized Agent Run.

#### Properties

##### agents

> `readonly` **agents**: readonly `string`[]

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

##### input

> `readonly` **input**: `string`

##### source

> `readonly` **source**: `string`

##### steps

> `readonly` **steps**: readonly `string`[]

##### tools

> `readonly` **tools**: readonly `string`[]

***

### Service

#### Properties

##### admitSuspension

> `readonly` **admitSuspension**: (`input`) => `Effect`\<`void`, [`ProgramAdmissionFailed`](#programadmissionfailed)\>

###### Parameters

###### input

###### checkpoint?

\{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \} \| \{ `version`: `"1"`; \}

###### continuation?

\{ `nextTurn`: `number`; `prompt`: `Prompt`; `queue?`: `"steering"` \| `"followUp"`; `schemaVersion`: `1`; `steeringEntryIds`: readonly `string`[]; \} \| `null`

###### openedAt

`string`

###### suspension

[`AgentSuspended`](../../generalist/namespaces/AgentEvent#agentsuspended)

###### waits

readonly `object`[]

###### Returns

`Effect`\<`void`, [`ProgramAdmissionFailed`](#programadmissionfailed)\>

##### invoke

> `readonly` **invoke**: (`request`) => `Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor#outcome)\>

###### Parameters

###### request

[`Parameters`](#parameters) & `object`

###### Returns

`Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor#outcome)\>

##### parameters

> `readonly` **parameters**: `Struct`\<\{ `agents`: `Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Struct`\<\{ `agentRuns`: `Int`; `concurrency`: `Int`; `logBytes`: `Int`; `outputBytes`: `Int`; `tokens`: `Int`; `toolCalls`: `Int`; `wallClockMillis`: `Int`; \}\>; `input`: `String`; `source`: `String`; `steps`: `Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>

##### tool

> `readonly` **tool**: `Tool`\<`"code_mode"`\>

## Variables

### Executor

> `const` **Executor**: `object`

Tool executor that owns the code_mode route.

#### Type Declaration

##### make

> **make**: *typeof* `makeExecutor`

***

### make

> `const` **make**: (`input`) => [`Service`](#service)

Construct the Run-attempt scoped implementation; applications still own sandbox and handlers resolution.

#### Parameters

##### input

###### authority

[`ProgramAuthority`](../../generalist/namespaces/AgentManifest#programauthority-1)

###### claim

`ExecutionClaim`

###### claimed

`ExecutionRecord`

###### store

[`Service`](./RunStore#service)

#### Returns

[`Service`](#service)

***

### makeCatalog

> `const` **makeCatalog**: (`authority`) => [`AuthorityCatalog`](#authoritycatalog)

Construct the exact canonical selection catalog for one ProgramAuthority.

#### Parameters

##### authority

[`ProgramAuthority`](../../generalist/namespaces/AgentManifest#programauthority-1)

#### Returns

[`AuthorityCatalog`](#authoritycatalog)

***

### makeParameters

> `const` **makeParameters**: (`authority`) => `Schema.Struct`\<\{ `agents`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Schema.Struct`\<\{ `agentRuns`: `Schema.Int`; `concurrency`: `Schema.Int`; `logBytes`: `Schema.Int`; `outputBytes`: `Schema.Int`; `tokens`: `Schema.Int`; `toolCalls`: `Schema.Int`; `wallClockMillis`: `Schema.Int`; \}\>; `input`: `Schema.String`; `source`: `Schema.String`; `steps`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>

Construct the model-visible request schema for one exact ProgramAuthority.

#### Parameters

##### authority

[`ProgramAuthority`](../../generalist/namespaces/AgentManifest#programauthority-1)

#### Returns

`Schema.Struct`\<\{ `agents`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Schema.Struct`\<\{ `agentRuns`: `Schema.Int`; `concurrency`: `Schema.Int`; `logBytes`: `Schema.Int`; `outputBytes`: `Schema.Int`; `tokens`: `Schema.Int`; `toolCalls`: `Schema.Int`; `wallClockMillis`: `Schema.Int`; \}\>; `input`: `Schema.String`; `source`: `Schema.String`; `steps`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>

***

### makeTool

> `const` **makeTool**: (`authority`) => `Tool.Tool`\<`"code_mode"`, \{ `failure`: `Schema.Union`\<readonly \[*typeof* [`ProgramAuthorityMissing`](#programauthoritymissing), *typeof* [`ProgramAuthorityExceeded`](#programauthorityexceeded), *typeof* [`ProgramAdmissionFailed`](#programadmissionfailed)\]\>; `failureMode`: `"error"`; `parameters`: `Schema.Struct`\<\{ `agents`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Schema.Struct`\<\{ `agentRuns`: `Schema.Int`; `concurrency`: `Schema.Int`; `logBytes`: `Schema.Int`; `outputBytes`: `Schema.Int`; `tokens`: `Schema.Int`; `toolCalls`: `Schema.Int`; `wallClockMillis`: `Schema.Int`; \}\>; `input`: `Schema.String`; `source`: `Schema.String`; `steps`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>; `success`: `Schema.Unknown`; \}, `never`\>

Construct the Runtime-owned Effect AI tool for one exact ProgramAuthority.

#### Parameters

##### authority

[`ProgramAuthority`](../../generalist/namespaces/AgentManifest#programauthority-1)

#### Returns

`Tool.Tool`\<`"code_mode"`, \{ `failure`: `Schema.Union`\<readonly \[*typeof* [`ProgramAuthorityMissing`](#programauthoritymissing), *typeof* [`ProgramAuthorityExceeded`](#programauthorityexceeded), *typeof* [`ProgramAdmissionFailed`](#programadmissionfailed)\]\>; `failureMode`: `"error"`; `parameters`: `Schema.Struct`\<\{ `agents`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Schema.Struct`\<\{ `agentRuns`: `Schema.Int`; `concurrency`: `Schema.Int`; `logBytes`: `Schema.Int`; `outputBytes`: `Schema.Int`; `tokens`: `Schema.Int`; `toolCalls`: `Schema.Int`; `wallClockMillis`: `Schema.Int`; \}\>; `input`: `Schema.String`; `source`: `Schema.String`; `steps`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>; `success`: `Schema.Unknown`; \}, `never`\>

***

### withTool

> `const` **withTool**: \{(`implementation`): \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`) => [`Agent`](../../generalist/namespaces/Agent#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>; \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`, `implementation`): [`Agent`](../../generalist/namespaces/Agent#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>; \}

Add the Runtime-owned parallel-safe declaration without changing the resolved Agent identity.

#### Call Signature

> (`implementation`): \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`) => [`Agent`](../../generalist/namespaces/Agent#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>

##### Parameters

###### implementation

[`Service`](#service)

##### Returns

\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`) => [`Agent`](../../generalist/namespaces/Agent#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>

#### Call Signature

> \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`, `implementation`): [`Agent`](../../generalist/namespaces/Agent#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>

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

[`Agent`](../../generalist/namespaces/Agent#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>

###### implementation

[`Service`](#service)

##### Returns

[`Agent`](../../generalist/namespaces/Agent#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>
