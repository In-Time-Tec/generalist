[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Handoff

# Handoff

## Classes

<a id="catalog"></a>

### Catalog

#### Extends

- `Catalog_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new Catalog**(`_`): [`Catalog`](#catalog)

###### Parameters

###### \_

`never`

###### Returns

[`Catalog`](#catalog)

###### Inherited from

`Catalog_base.constructor`

***

<a id="fanoutunsatisfied"></a>

### FanOutUnsatisfied

#### Extends

- `FanOutUnsatisfied_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new FanOutUnsatisfied**(...`args`): [`FanOutUnsatisfied`](#fanoutunsatisfied)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`FanOutUnsatisfied`](#fanoutunsatisfied)

###### Inherited from

`FanOutUnsatisfied_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`FanOutUnsatisfied_base.hint`

<a id="join"></a>

##### join

> `readonly` **join**: `"FirstSuccess"` \| `"Quorum"`

###### Inherited from

`FanOutUnsatisfied_base.join`

<a id="required"></a>

##### required

> `readonly` **required**: `number`

###### Inherited from

`FanOutUnsatisfied_base.required`

<a id="settled"></a>

##### settled

> `readonly` **settled**: `number`

###### Inherited from

`FanOutUnsatisfied_base.settled`

<a id="succeeded"></a>

##### succeeded

> `readonly` **succeeded**: `number`

###### Inherited from

`FanOutUnsatisfied_base.succeeded`

<a id="total"></a>

##### total

> `readonly` **total**: `number`

###### Inherited from

`FanOutUnsatisfied_base.total`

***

<a id="projectioninvalid"></a>

### ProjectionInvalid

#### Extends

- `ProjectionInvalid_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new ProjectionInvalid**(...`args`): [`ProjectionInvalid`](#projectioninvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProjectionInvalid`](#projectioninvalid)

###### Inherited from

`ProjectionInvalid_base.constructor`

#### Properties

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProjectionInvalid_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`ProjectionInvalid_base.message`

***

<a id="rejected"></a>

### Rejected

A same-run handoff rejected before its target became active.

#### Extends

- `Rejected_base`

#### Constructors

<a id="constructor-3"></a>

##### Constructor

> **new Rejected**(...`args`): [`Rejected`](#rejected)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`Rejected`](#rejected)

###### Inherited from

`Rejected_base.constructor`

#### Properties

<a id="handoffid"></a>

##### handoffId

> `readonly` **handoffId**: `string`

###### Inherited from

`Rejected_base.handoffId`

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Rejected_base.hint`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `string`

###### Inherited from

`Rejected_base.reason`

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`Rejected_base.turn`

## Interfaces

<a id="delegateoptions"></a>

### DelegateOptions

#### Type Parameters

##### Parameters

`Parameters` *extends* `Schema.Top` = `DefaultDelegateParameters`

##### Success

`Success` *extends* `Schema.Top` = *typeof* `Schema.String`

#### Properties

<a id="description"></a>

##### description?

> `readonly` `optional` **description?**: `string`

<a id="fromresult"></a>

##### fromResult?

> `readonly` `optional` **fromResult?**: (`output`) => `Success`\[`"Type"`\]

###### Parameters

###### output

`string`

###### Returns

`Success`\[`"Type"`\]

<a id="nameoverride"></a>

##### nameOverride?

> `readonly` `optional` **nameOverride?**: `string`

<a id="parameters-1"></a>

##### parameters?

> `readonly` `optional` **parameters?**: `Parameters`

<a id="success-1"></a>

##### success?

> `readonly` `optional` **success?**: `Success`

<a id="toprompt"></a>

##### toPrompt?

> `readonly` `optional` **toPrompt?**: (`params`) => `string`

###### Parameters

###### params

`Parameters`\[`"Type"`\]

###### Returns

`string`

***

<a id="fanoutallsuccessoptions"></a>

### FanOutAllSuccessOptions

#### Extends

- `FanOutBaseOptions`

#### Properties

<a id="concurrency"></a>

##### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### Inherited from

`FanOutBaseOptions.concurrency`

<a id="join-1"></a>

##### join?

> `readonly` `optional` **join?**: `object`

###### \_tag

> `readonly` **\_tag**: `"AllSuccess"`

<a id="remainder"></a>

##### remainder?

> `readonly` `optional` **remainder?**: [`FanOutRemainder`](#fanoutremainder)

###### Inherited from

`FanOutBaseOptions.remainder`

***

<a id="fanoutchild"></a>

### FanOutChild

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\> = `Record`\<`string`, `Tool.Any`\>

##### R

`R` = `never`

#### Properties

<a id="options"></a>

##### options?

> `readonly` `optional` **options?**: `Omit`\<[`InvocationOptions`](./Agent#invocationoptions), `"memory"`\>

<a id="prompt"></a>

##### prompt

> `readonly` **prompt**: `string`

<a id="registration"></a>

##### registration

> `readonly` **registration**: [`Registration`](#registration-1)\<`Tools`, `R`\>

***

<a id="fanoutcollectoptions"></a>

### FanOutCollectOptions

#### Extends

- `FanOutBaseOptions`

#### Properties

<a id="concurrency-1"></a>

##### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### Inherited from

`FanOutBaseOptions.concurrency`

<a id="join-2"></a>

##### join

> `readonly` **join**: \{ `_tag`: `"AllSettled"`; \} \| \{ `_tag`: `"FirstSuccess"`; \} \| \{ `_tag`: `"Quorum"`; `required`: `number`; \} \| \{ `_tag`: `"BestEffort"`; \}

<a id="remainder-1"></a>

##### remainder?

> `readonly` `optional` **remainder?**: [`FanOutRemainder`](#fanoutremainder)

###### Inherited from

`FanOutBaseOptions.remainder`

***

<a id="handofftooloptions"></a>

### HandoffToolOptions

#### Properties

<a id="description-1"></a>

##### description?

> `readonly` `optional` **description?**: `string`

<a id="maxrepeatededge"></a>

##### maxRepeatedEdge?

> `readonly` `optional` **maxRepeatedEdge?**: `number`

<a id="nameoverride-1"></a>

##### nameOverride?

> `readonly` `optional` **nameOverride?**: `string`

<a id="projection"></a>

##### projection?

> `readonly` `optional` **projection?**: `ContextProjection`

***

<a id="registration-1"></a>

### Registration

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\> = `Record`\<`string`, `Tool.Any`\>

##### R

`R` = `never`

#### Properties

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="requirements"></a>

##### requirements

> `readonly` **requirements**: (`value`) => `R`

###### Parameters

###### value

`R`

###### Returns

`R`

<a id="run"></a>

##### run

> `readonly` **run**: \<`O`\>(`input`, `options?`) => `Effect`\<`string`, `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror), `Exclude`\<`R`, `R`\> \| `Exclude`\<`StaticToolServices`\<`Tools`\>, `R`\> \| `Exclude`\<`OperationRequirements`\<`O`\>, `R`\>\>

###### Type Parameters

###### O

`O` *extends* [`InvocationOptions`](./Agent#invocationoptions)

###### Parameters

###### input

`string`

###### options?

`O`

###### Returns

`Effect`\<`string`, `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror), `Exclude`\<`R`, `R`\> \| `Exclude`\<`StaticToolServices`\<`Tools`\>, `R`\> \| `Exclude`\<`OperationRequirements`\<`O`\>, `R`\>\>

***

<a id="supervisor"></a>

### Supervisor

#### Type Parameters

##### R

`R`

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\> = `Record`\<`string`, `Tool.Any`\>

#### Properties

<a id="agent"></a>

##### agent

> `readonly` **agent**: [`Agent`](./Agent#agent)\<`Tools`, `LanguageModel` \| `R`\>

<a id="catalog-1"></a>

##### catalog

> `readonly` **catalog**: `Layer`\<[`Catalog`](#catalog)\>

<a id="toolkit"></a>

##### toolkit

> `readonly` **toolkit**: [`ClosedToolSet`](./ToolExecutor#closedtoolset)\<`never`, `Tools`\[keyof `Tools`\]\>

***

<a id="supervisoroptions"></a>

### SupervisorOptions

#### Properties

<a id="handoffoptions"></a>

##### handoffOptions?

> `readonly` `optional` **handoffOptions?**: [`HandoffToolOptions`](#handofftooloptions)

<a id="instructions"></a>

##### instructions?

> `readonly` `optional` **instructions?**: `string`

<a id="name-1"></a>

##### name

> `readonly` **name**: `string`

<a id="policy"></a>

##### policy?

> `readonly` `optional` **policy?**: [`Policy`](./Policy-1#policy)\<`never`\>

<a id="specialists"></a>

##### specialists

> `readonly` **specialists**: readonly [`Target`](#target)[]

***

<a id="target"></a>

### Target

One catalog entry. The catalog never provides a target's requirements; `HandoffRequirementsMissing` reports them.

#### Properties

<a id="agent-1"></a>

##### agent

> `readonly` **agent**: `Any`

<a id="model"></a>

##### model?

> `readonly` `optional` **model?**: `Layer`\<`LanguageModel`, `never`, `never`\>

Model layer the specialist runs on after the handoff. Wins over the active registry selection.

<a id="name-2"></a>

##### name

> `readonly` **name**: `string`

<a id="pin"></a>

##### pin?

> `readonly` `optional` **pin?**: `string` & `Brand`\<`"generalist/agent-pin"`\>

## Type Aliases

<a id="commit"></a>

### Commit

> **Commit** = *typeof* `Commit.Type`

***

<a id="controlstate"></a>

### ControlState

> **ControlState** = *typeof* `ControlState.Type`

***

<a id="fanoutjoin"></a>

### FanOutJoin

> **FanOutJoin** = \{ `_tag`: `"AllSuccess"`; \} \| \{ `_tag`: `"AllSettled"`; \} \| \{ `_tag`: `"FirstSuccess"`; \} \| \{ `_tag`: `"Quorum"`; `required`: `number`; \} \| \{ `_tag`: `"BestEffort"`; \}

***

<a id="fanoutmemberresult"></a>

### FanOutMemberResult

> **FanOutMemberResult** = \{ `ordinal`: `number`; `result`: `string`; `status`: `"succeeded"`; \} \| \{ `cause`: `Cause.Cause`\<[`RunError`](./Agent#runerror) \| [`RegistrationError`](./AgentTool#registrationerror)\>; `ordinal`: `number`; `status`: `"failed"`; \} \| \{ `cause?`: `Cause.Cause`\<[`RunError`](./Agent#runerror) \| [`RegistrationError`](./AgentTool#registrationerror)\>; `ordinal`: `number`; `status`: `"cancelled"`; \}

***

<a id="fanoutoptions"></a>

### FanOutOptions

> **FanOutOptions** = [`FanOutAllSuccessOptions`](#fanoutallsuccessoptions) \| [`FanOutCollectOptions`](#fanoutcollectoptions)

***

<a id="fanoutremainder"></a>

### FanOutRemainder

> **FanOutRemainder** = `"await"` \| `"request-cancel"` \| `"terminate"`

***

<a id="input"></a>

### Input

> **Input** = *typeof* `Input.Type`

***

<a id="output"></a>

### Output

> **Output** = *typeof* `Output.Type`

## Variables

<a id="commit-1"></a>

### Commit

> `const` **Commit**: `Schema.TaggedStruct`\<`"Commit"`, \{ `projectedHistory`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `sessionEntryId`: `Schema.String`; `sessionParentId`: `Schema.NullOr`\<`Schema.String`\>; `state`: `Schema.Struct`\<\{ `active`: `Schema.String`; `edgeCounts`: `Schema.$Array`\<`Schema.Struct`\<\{ `count`: `Schema.Finite`; `source`: `Schema.String`; `target`: `Schema.String`; \}\>\>; `handoffCount`: `Schema.Finite`; `path`: `Schema.$Array`\<`Schema.Struct`\<\{ `handoffId`: `Schema.String`; `reason`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.String`; `target`: `Schema.String`; `turn`: `Schema.Finite`; \}\>\>; `pendingContinuation`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `instructions`: `Schema.optionalKey`\<`Schema.String`\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; \}\>\>; `root`: `Schema.String`; \}\>; `targetAgentPin`: `Schema.optionalKey`\<`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>\>; \}\>

***

<a id="controlstate-1"></a>

### ControlState

> `const` **ControlState**: `Schema.Struct`\<\{ `active`: `Schema.String`; `edgeCounts`: `Schema.$Array`\<`Schema.Struct`\<\{ `count`: `Schema.Finite`; `source`: `Schema.String`; `target`: `Schema.String`; \}\>\>; `handoffCount`: `Schema.Finite`; `path`: `Schema.$Array`\<`Schema.Struct`\<\{ `handoffId`: `Schema.String`; `reason`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.String`; `target`: `Schema.String`; `turn`: `Schema.Finite`; \}\>\>; `pendingContinuation`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `instructions`: `Schema.optionalKey`\<`Schema.String`\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; \}\>\>; `root`: `Schema.String`; \}\>

***

<a id="defaultcontextprojection"></a>

### defaultContextProjection

> `const` **defaultContextProjection**: \{(`input`): (`history`) => `Effect`\<\{ `history`: `Prompt.Prompt`; `prompt`: `Prompt.RawInput`; \}, [`ProjectionInvalid`](#projectioninvalid)\>; (`history`, `input`): `Effect`\<\{ `history`: `Prompt.Prompt`; `prompt`: `Prompt.RawInput`; \}, [`ProjectionInvalid`](#projectioninvalid)\>; \}

#### Call Signature

> (`input`): (`history`) => `Effect`\<\{ `history`: `Prompt.Prompt`; `prompt`: `Prompt.RawInput`; \}, [`ProjectionInvalid`](#projectioninvalid)\>

##### Parameters

###### input

###### context?

`Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>\>

###### prompt?

`Schema.optionalKey`\<`Schema.String`\>

###### reason?

`Schema.optionalKey`\<`Schema.String`\>

##### Returns

(`history`) => `Effect`\<\{ `history`: `Prompt.Prompt`; `prompt`: `Prompt.RawInput`; \}, [`ProjectionInvalid`](#projectioninvalid)\>

#### Call Signature

> (`history`, `input`): `Effect`\<\{ `history`: `Prompt.Prompt`; `prompt`: `Prompt.RawInput`; \}, [`ProjectionInvalid`](#projectioninvalid)\>

##### Parameters

###### history

`Prompt`

###### input

###### context?

`Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>\>

###### prompt?

`Schema.optionalKey`\<`Schema.String`\>

###### reason?

`Schema.optionalKey`\<`Schema.String`\>

##### Returns

`Effect`\<\{ `history`: `Prompt.Prompt`; `prompt`: `Prompt.RawInput`; \}, [`ProjectionInvalid`](#projectioninvalid)\>

***

<a id="delegatetool"></a>

### delegateTool

> `const` **delegateTool**: \{\<`Tools`, `R`, `Parameters`, `Success`\>(`options?`): (`target`) => [`AgentToolToolkit`](./AgentTool#agenttooltoolkit)\<`string`, `Parameters`, `Success`, [`RunRequirements`](./Agent#runrequirements)\<`Tools`, `R`, \{ `prompt`: `Prompt.RawInput`; \}\> \| `Parameters`\[`"DecodingServices"`\]\>; \<`Tools`, `R`, `Parameters`, `Success`\>(`target`, `options?`): [`AgentToolToolkit`](./AgentTool#agenttooltoolkit)\<`string`, `Parameters`, `Success`, [`RunRequirements`](./Agent#runrequirements)\<`Tools`, `R`, \{ `prompt`: `Prompt.RawInput`; \}\> \| `Parameters`\[`"DecodingServices"`\]\>; \}

#### Call Signature

> \<`Tools`, `R`, `Parameters`, `Success`\>(`options?`): (`target`) => [`AgentToolToolkit`](./AgentTool#agenttooltoolkit)\<`string`, `Parameters`, `Success`, [`RunRequirements`](./Agent#runrequirements)\<`Tools`, `R`, \{ `prompt`: `Prompt.RawInput`; \}\> \| `Parameters`\[`"DecodingServices"`\]\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\> = `Record`\<`string`, `Any`\>

###### R

`R` = `never`

###### Parameters

`Parameters` *extends* `Top` = `Struct`\<\{ `prompt`: `Schema.String`; \}\>

###### Success

`Success` *extends* `Top` = `String`

##### Parameters

###### options?

[`DelegateOptions`](#delegateoptions)\<`Parameters`, `Success`\>

##### Returns

(`target`) => [`AgentToolToolkit`](./AgentTool#agenttooltoolkit)\<`string`, `Parameters`, `Success`, [`RunRequirements`](./Agent#runrequirements)\<`Tools`, `R`, \{ `prompt`: `Prompt.RawInput`; \}\> \| `Parameters`\[`"DecodingServices"`\]\>

#### Call Signature

> \<`Tools`, `R`, `Parameters`, `Success`\>(`target`, `options?`): [`AgentToolToolkit`](./AgentTool#agenttooltoolkit)\<`string`, `Parameters`, `Success`, [`RunRequirements`](./Agent#runrequirements)\<`Tools`, `R`, \{ `prompt`: `Prompt.RawInput`; \}\> \| `Parameters`\[`"DecodingServices"`\]\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\> = `Record`\<`string`, `Any`\>

###### R

`R` = `never`

###### Parameters

`Parameters` *extends* `Top` = `Struct`\<\{ `prompt`: `Schema.String`; \}\>

###### Success

`Success` *extends* `Top` = `String`

##### Parameters

###### target

[`Registration`](#registration-1)\<`Tools`, `R`\>

###### options?

[`DelegateOptions`](#delegateoptions)\<`Parameters`, `Success`\>

##### Returns

[`AgentToolToolkit`](./AgentTool#agenttooltoolkit)\<`string`, `Parameters`, `Success`, [`RunRequirements`](./Agent#runrequirements)\<`Tools`, `R`, \{ `prompt`: `Prompt.RawInput`; \}\> \| `Parameters`\[`"DecodingServices"`\]\>

***

<a id="fanout"></a>

### fanOut

> `const` **fanOut**: \{\<`Tools`, `R`\>(`options`): (`children`) => `Effect`\<readonly [`FanOutMemberResult`](#fanoutmemberresult)[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror) \| [`FanOutUnsatisfied`](#fanoutunsatisfied)\>; \<`Tools`, `R`\>(`options?`): (`children`) => `Effect`\<readonly `string`[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror)\>; \<`Tools`, `R`\>(`options`): (`children`) => `Effect`\<readonly `string`[] \| readonly [`FanOutMemberResult`](#fanoutmemberresult)[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror) \| [`FanOutUnsatisfied`](#fanoutunsatisfied)\>; \<`Tools`, `R`\>(): (`children`) => `Effect`\<readonly `string`[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror)\>; \<`Tools`, `R`\>(`children`, `options`): `Effect`\<readonly [`FanOutMemberResult`](#fanoutmemberresult)[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror) \| [`FanOutUnsatisfied`](#fanoutunsatisfied)\>; \<`Tools`, `R`\>(`children`, `options?`): `Effect`\<readonly `string`[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror)\>; \<`Tools`, `R`\>(`children`, `options`): `Effect`\<readonly `string`[] \| readonly [`FanOutMemberResult`](#fanoutmemberresult)[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror) \| [`FanOutUnsatisfied`](#fanoutunsatisfied)\>; \}

#### Call Signature

> \<`Tools`, `R`\>(`options`): (`children`) => `Effect`\<readonly [`FanOutMemberResult`](#fanoutmemberresult)[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror) \| [`FanOutUnsatisfied`](#fanoutunsatisfied)\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\> = `Record`\<`string`, `Any`\>

###### R

`R` = `never`

##### Parameters

###### options

[`FanOutCollectOptions`](#fanoutcollectoptions)

##### Returns

(`children`) => `Effect`\<readonly [`FanOutMemberResult`](#fanoutmemberresult)[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror) \| [`FanOutUnsatisfied`](#fanoutunsatisfied)\>

#### Call Signature

> \<`Tools`, `R`\>(`options?`): (`children`) => `Effect`\<readonly `string`[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror)\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\> = `Record`\<`string`, `Any`\>

###### R

`R` = `never`

##### Parameters

###### options?

[`FanOutAllSuccessOptions`](#fanoutallsuccessoptions)

##### Returns

(`children`) => `Effect`\<readonly `string`[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror)\>

#### Call Signature

> \<`Tools`, `R`\>(`options`): (`children`) => `Effect`\<readonly `string`[] \| readonly [`FanOutMemberResult`](#fanoutmemberresult)[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror) \| [`FanOutUnsatisfied`](#fanoutunsatisfied)\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\> = `Record`\<`string`, `Any`\>

###### R

`R` = `never`

##### Parameters

###### options

[`FanOutOptions`](#fanoutoptions)

##### Returns

(`children`) => `Effect`\<readonly `string`[] \| readonly [`FanOutMemberResult`](#fanoutmemberresult)[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror) \| [`FanOutUnsatisfied`](#fanoutunsatisfied)\>

#### Call Signature

> \<`Tools`, `R`\>(): (`children`) => `Effect`\<readonly `string`[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror)\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\> = `Record`\<`string`, `Any`\>

###### R

`R` = `never`

##### Returns

(`children`) => `Effect`\<readonly `string`[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror)\>

#### Call Signature

> \<`Tools`, `R`\>(`children`, `options`): `Effect`\<readonly [`FanOutMemberResult`](#fanoutmemberresult)[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror) \| [`FanOutUnsatisfied`](#fanoutunsatisfied)\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\> = `Record`\<`string`, `Any`\>

###### R

`R` = `never`

##### Parameters

###### children

readonly [`FanOutChild`](#fanoutchild)\<`Tools`, `R`\>[]

###### options

[`FanOutCollectOptions`](#fanoutcollectoptions)

##### Returns

`Effect`\<readonly [`FanOutMemberResult`](#fanoutmemberresult)[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror) \| [`FanOutUnsatisfied`](#fanoutunsatisfied)\>

#### Call Signature

> \<`Tools`, `R`\>(`children`, `options?`): `Effect`\<readonly `string`[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror)\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\> = `Record`\<`string`, `Any`\>

###### R

`R` = `never`

##### Parameters

###### children

readonly [`FanOutChild`](#fanoutchild)\<`Tools`, `R`\>[]

###### options?

[`FanOutAllSuccessOptions`](#fanoutallsuccessoptions)

##### Returns

`Effect`\<readonly `string`[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror)\>

#### Call Signature

> \<`Tools`, `R`\>(`children`, `options`): `Effect`\<readonly `string`[] \| readonly [`FanOutMemberResult`](#fanoutmemberresult)[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror) \| [`FanOutUnsatisfied`](#fanoutunsatisfied)\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\> = `Record`\<`string`, `Any`\>

###### R

`R` = `never`

##### Parameters

###### children

readonly [`FanOutChild`](#fanoutchild)\<`Tools`, `R`\>[]

###### options

[`FanOutOptions`](#fanoutoptions)

##### Returns

`Effect`\<readonly `string`[] \| readonly [`FanOutMemberResult`](#fanoutmemberresult)[], `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror) \| [`FanOutUnsatisfied`](#fanoutunsatisfied)\>

***

<a id="filtercontextprojection"></a>

### filterContextProjection

> `const` **filterContextProjection**: (`predicate`) => `ContextProjection`

#### Parameters

##### predicate

(`message`) => `boolean`

#### Returns

`ContextProjection`

***

<a id="input-1"></a>

### Input

> `const` **Input**: `Schema.Struct`\<\{ `context`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>\>; `prompt`: `Schema.optionalKey`\<`Schema.String`\>; `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

***

<a id="layercatalog"></a>

### layerCatalog

> `const` **layerCatalog**: (`targets`) => `Layer.Layer`\<[`Catalog`](#catalog)\>

#### Parameters

##### targets

`ReadonlyArray`\<[`Target`](#target)\>

#### Returns

`Layer.Layer`\<[`Catalog`](#catalog)\>

***

<a id="output-1"></a>

### Output

> `const` **Output**: `Schema.Struct`\<\{ `summary`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

***

<a id="supervisor-1"></a>

### supervisor

> `const` **supervisor**: (`options`) => [`Supervisor`](#supervisor)\<`Tool.Handler`\<`string`\> \| `LanguageModel.LanguageModel`, `Record`\<`string`, `Tool.Tool`\<`string`, \{ `failure`: *typeof* `Schema.String`; `failureMode`: `"return"`; `parameters`: [`Input`](#input); `success`: *typeof* `HandoffAccepted`; \}, `never`\>\>\>

#### Parameters

##### options

[`SupervisorOptions`](#supervisoroptions)

#### Returns

[`Supervisor`](#supervisor)\<`Tool.Handler`\<`string`\> \| `LanguageModel.LanguageModel`, `Record`\<`string`, `Tool.Tool`\<`string`, \{ `failure`: *typeof* `Schema.String`; `failureMode`: `"return"`; `parameters`: [`Input`](#input); `success`: *typeof* `HandoffAccepted`; \}, `never`\>\>\>

***

<a id="target-1"></a>

### target

> `const` **target**: \{(`options?`): (`agent`) => [`Target`](#target); (`agent`, `options?`): [`Target`](#target); \}

#### Call Signature

> (`options?`): (`agent`) => [`Target`](#target)

##### Parameters

###### options?

`TargetOptions`

##### Returns

(`agent`) => [`Target`](#target)

#### Call Signature

> (`agent`, `options?`): [`Target`](#target)

##### Parameters

###### agent

`Any`

###### options?

`TargetOptions`

##### Returns

[`Target`](#target)

***

<a id="transfertool"></a>

### transferTool

> `const` **transferTool**: \{(`options?`): (`handoffTarget`) => `HandoffToolkit`; (`handoffTarget`, `options?`): `HandoffToolkit`; \}

#### Call Signature

> (`options?`): (`handoffTarget`) => `HandoffToolkit`

##### Parameters

###### options?

[`HandoffToolOptions`](#handofftooloptions)

##### Returns

(`handoffTarget`) => `HandoffToolkit`

#### Call Signature

> (`handoffTarget`, `options?`): `HandoffToolkit`

##### Parameters

###### handoffTarget

[`Target`](#target)

###### options?

[`HandoffToolOptions`](#handofftooloptions)

##### Returns

`HandoffToolkit`

## References

<a id="register"></a>

### register

Re-exports [register](./AgentTool#register)

***

<a id="registrationerror"></a>

### RegistrationError

Re-exports [RegistrationError](./AgentTool#registrationerror)
