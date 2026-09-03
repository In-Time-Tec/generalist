[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / CodeMode

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

<a id="invoke"></a>

##### invoke

> `readonly` **invoke**: (`request`) => `Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor#outcome)\>

###### Parameters

###### request

[`Parameters`](#parameters) & `object`

###### Returns

`Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor#outcome)\>

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

<a id="makecatalog"></a>

### makeCatalog

> `const` **makeCatalog**: (`authority`) => [`AuthorityCatalog`](#authoritycatalog)

Construct the exact canonical selection catalog for one ProgramAuthority.

#### Parameters

##### authority

[`ProgramAuthority`](../../generalist/namespaces/AgentManifest#programauthority-1)

#### Returns

[`AuthorityCatalog`](#authoritycatalog)

***

<a id="makeparameters"></a>

### makeParameters

> `const` **makeParameters**: (`authority`) => `Schema.Struct`\<\{ `agents`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Schema.Struct`\<\{ `agentRuns`: `Schema.Int`; `concurrency`: `Schema.Int`; `logBytes`: `Schema.Int`; `outputBytes`: `Schema.Int`; `tokens`: `Schema.Int`; `toolCalls`: `Schema.Int`; `wallClockMillis`: `Schema.Int`; \}\>; `input`: `Schema.String`; `source`: `Schema.String`; `steps`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>

Construct the model-visible request schema for one exact ProgramAuthority.

#### Parameters

##### authority

[`ProgramAuthority`](../../generalist/namespaces/AgentManifest#programauthority-1)

#### Returns

`Schema.Struct`\<\{ `agents`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Schema.Struct`\<\{ `agentRuns`: `Schema.Int`; `concurrency`: `Schema.Int`; `logBytes`: `Schema.Int`; `outputBytes`: `Schema.Int`; `tokens`: `Schema.Int`; `toolCalls`: `Schema.Int`; `wallClockMillis`: `Schema.Int`; \}\>; `input`: `Schema.String`; `source`: `Schema.String`; `steps`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>

***

<a id="maketool"></a>

### makeTool

> `const` **makeTool**: (`authority`) => `Tool.Tool`\<`"code_mode"`, \{ `failure`: `Schema.Union`\<readonly \[*typeof* [`ProgramAuthorityMissing`](#programauthoritymissing), *typeof* [`ProgramAuthorityExceeded`](#programauthorityexceeded), *typeof* [`ProgramAdmissionFailed`](#programadmissionfailed)\]\>; `failureMode`: `"error"`; `parameters`: `Schema.Struct`\<\{ `agents`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Schema.Struct`\<\{ `agentRuns`: `Schema.Int`; `concurrency`: `Schema.Int`; `logBytes`: `Schema.Int`; `outputBytes`: `Schema.Int`; `tokens`: `Schema.Int`; `toolCalls`: `Schema.Int`; `wallClockMillis`: `Schema.Int`; \}\>; `input`: `Schema.String`; `source`: `Schema.String`; `steps`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>; `success`: `Schema.Unknown`; \}, `never`\>

Construct the Runtime-owned Effect AI tool for one exact ProgramAuthority.

#### Parameters

##### authority

[`ProgramAuthority`](../../generalist/namespaces/AgentManifest#programauthority-1)

#### Returns

`Tool.Tool`\<`"code_mode"`, \{ `failure`: `Schema.Union`\<readonly \[*typeof* [`ProgramAuthorityMissing`](#programauthoritymissing), *typeof* [`ProgramAuthorityExceeded`](#programauthorityexceeded), *typeof* [`ProgramAdmissionFailed`](#programadmissionfailed)\]\>; `failureMode`: `"error"`; `parameters`: `Schema.Struct`\<\{ `agents`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `budget`: `Schema.Struct`\<\{ `agentRuns`: `Schema.Int`; `concurrency`: `Schema.Int`; `logBytes`: `Schema.Int`; `outputBytes`: `Schema.Int`; `tokens`: `Schema.Int`; `toolCalls`: `Schema.Int`; `wallClockMillis`: `Schema.Int`; \}\>; `input`: `Schema.String`; `source`: `Schema.String`; `steps`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; `tools`: `Schema.Codec`\<readonly `string`[], readonly `string`[], `never`, `never`\>; \}\>; `success`: `Schema.Unknown`; \}, `never`\>

***

<a id="withtool"></a>

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
