[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Handoff

# Handoff

## Classes

### Catalog

#### Extends

- `Catalog_base`

#### Constructors

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

### FanOutUnsatisfied

#### Extends

- `FanOutUnsatisfied_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`FanOutUnsatisfied_base.hint`

##### join

> `readonly` **join**: `"FirstSuccess"` \| `"Quorum"`

###### Inherited from

`FanOutUnsatisfied_base.join`

##### required

> `readonly` **required**: `number`

###### Inherited from

`FanOutUnsatisfied_base.required`

##### settled

> `readonly` **settled**: `number`

###### Inherited from

`FanOutUnsatisfied_base.settled`

##### succeeded

> `readonly` **succeeded**: `number`

###### Inherited from

`FanOutUnsatisfied_base.succeeded`

##### total

> `readonly` **total**: `number`

###### Inherited from

`FanOutUnsatisfied_base.total`

***

### ProjectionInvalid

#### Extends

- `ProjectionInvalid_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProjectionInvalid_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`ProjectionInvalid_base.message`

***

### Rejected

A same-run handoff rejected before its target became active.

#### Extends

- `Rejected_base`

#### Constructors

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

##### handoffId

> `readonly` **handoffId**: `string`

###### Inherited from

`Rejected_base.handoffId`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Rejected_base.hint`

##### reason

> `readonly` **reason**: `string`

###### Inherited from

`Rejected_base.reason`

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`Rejected_base.turn`

## Interfaces

### DelegateOptions

#### Type Parameters

##### Parameters

`Parameters` *extends* `Schema.Top` = `DefaultDelegateParameters`

##### Success

`Success` *extends* `Schema.Top` = *typeof* `Schema.String`

#### Properties

##### description?

> `readonly` `optional` **description?**: `string`

##### fromResult?

> `readonly` `optional` **fromResult?**: (`output`) => `Success`\[`"Type"`\]

###### Parameters

###### output

`string`

###### Returns

`Success`\[`"Type"`\]

##### nameOverride?

> `readonly` `optional` **nameOverride?**: `string`

##### parameters?

> `readonly` `optional` **parameters?**: `Parameters`

##### success?

> `readonly` `optional` **success?**: `Success`

##### toPrompt?

> `readonly` `optional` **toPrompt?**: (`params`) => `string`

###### Parameters

###### params

`Parameters`\[`"Type"`\]

###### Returns

`string`

***

### FanOutAllSuccessOptions

#### Extends

- `FanOutBaseOptions`

#### Properties

##### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### Inherited from

`FanOutBaseOptions.concurrency`

##### join?

> `readonly` `optional` **join?**: `object`

###### \_tag

> `readonly` **\_tag**: `"AllSuccess"`

##### remainder?

> `readonly` `optional` **remainder?**: [`FanOutRemainder`](#fanoutremainder)

###### Inherited from

`FanOutBaseOptions.remainder`

***

### FanOutChild

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\> = `Record`\<`string`, `Tool.Any`\>

##### R

`R` = `never`

#### Properties

##### options?

> `readonly` `optional` **options?**: `Omit`\<[`InvocationOptions`](./Agent#invocationoptions), `"memory"`\>

##### prompt

> `readonly` **prompt**: `string`

##### registration

> `readonly` **registration**: [`Registration`](#registration-1)\<`Tools`, `R`\>

***

### FanOutCollectOptions

#### Extends

- `FanOutBaseOptions`

#### Properties

##### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### Inherited from

`FanOutBaseOptions.concurrency`

##### join

> `readonly` **join**: \{ `_tag`: `"AllSettled"`; \} \| \{ `_tag`: `"FirstSuccess"`; \} \| \{ `_tag`: `"Quorum"`; `required`: `number`; \} \| \{ `_tag`: `"BestEffort"`; \}

##### remainder?

> `readonly` `optional` **remainder?**: [`FanOutRemainder`](#fanoutremainder)

###### Inherited from

`FanOutBaseOptions.remainder`

***

### HandoffToolOptions

#### Properties

##### description?

> `readonly` `optional` **description?**: `string`

##### maxRepeatedEdge?

> `readonly` `optional` **maxRepeatedEdge?**: `number`

##### nameOverride?

> `readonly` `optional` **nameOverride?**: `string`

##### projection?

> `readonly` `optional` **projection?**: `ContextProjection`

***

### Registration

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\> = `Record`\<`string`, `Tool.Any`\>

##### R

`R` = `never`

#### Properties

##### name

> `readonly` **name**: `string`

##### requirements

> `readonly` **requirements**: (`value`) => `R`

###### Parameters

###### value

`R`

###### Returns

`R`

##### run

> `readonly` **run**: \<`O`\>(`input`, `options?`) => `Effect`\<`string`, `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror), `Exclude`\<`R`, `R`\> \| `Exclude`\<`HandlersFor`\<`Tools`\>, `R`\> \| `Exclude`\<`Exclude`\<`HandlerServices`\<`Tools`\[keyof `Tools`\]\>, [`ToolContext`](./ToolContext#toolcontext)\>, `R`\> \| `Exclude`\<`OperationRequirements`\<`O`\>, `R`\>\>

###### Type Parameters

###### O

`O` *extends* [`InvocationOptions`](./Agent#invocationoptions)

###### Parameters

###### input

`string`

###### options?

`O`

###### Returns

`Effect`\<`string`, `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](#projectioninvalid) \| [`Rejected`](#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid) \| [`RegistrationError`](./AgentTool#registrationerror), `Exclude`\<`R`, `R`\> \| `Exclude`\<`HandlersFor`\<`Tools`\>, `R`\> \| `Exclude`\<`Exclude`\<`HandlerServices`\<`Tools`\[keyof `Tools`\]\>, [`ToolContext`](./ToolContext#toolcontext)\>, `R`\> \| `Exclude`\<`OperationRequirements`\<`O`\>, `R`\>\>

***

### Supervisor

#### Type Parameters

##### R

`R`

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\> = `Record`\<`string`, `Tool.Any`\>

#### Properties

##### agent

> `readonly` **agent**: [`Agent`](./Agent#agent)\<`Tools`, `LanguageModel` \| `R`\>

##### catalog

> `readonly` **catalog**: `Layer`\<[`Catalog`](#catalog)\>

##### toolkit

> `readonly` **toolkit**: [`ClosedToolSet`](./ToolExecutor#closedtoolset)\<`never`, `Tools`\[keyof `Tools`\]\>

***

### SupervisorOptions

#### Properties

##### handoffOptions?

> `readonly` `optional` **handoffOptions?**: [`HandoffToolOptions`](#handofftooloptions)

##### instructions?

> `readonly` `optional` **instructions?**: `string`

##### name

> `readonly` **name**: `string`

##### policy?

> `readonly` `optional` **policy?**: [`Policy`](./Policy-1#policy)\<`never`\>

##### specialists

> `readonly` **specialists**: readonly [`Target`](#target)[]

***

### Target

One catalog entry. The catalog never provides a target's requirements; `HandoffRequirementsMissing` reports them.

#### Properties

##### agent

> `readonly` **agent**: `Any`

##### model?

> `readonly` `optional` **model?**: `Layer`\<`LanguageModel`, `never`, `never`\>

Model layer the specialist runs on after the handoff. Wins over the active registry selection.

##### name

> `readonly` **name**: `string`

##### pin?

> `readonly` `optional` **pin?**: `string` & `Brand`\<`"generalist/agent-pin"`\>

## Type Aliases

### Commit

> **Commit** = *typeof* `Commit.Type`

***

### ControlState

> **ControlState** = *typeof* `ControlState.Type`

***

### FanOutJoin

> **FanOutJoin** = \{ `_tag`: `"AllSuccess"`; \} \| \{ `_tag`: `"AllSettled"`; \} \| \{ `_tag`: `"FirstSuccess"`; \} \| \{ `_tag`: `"Quorum"`; `required`: `number`; \} \| \{ `_tag`: `"BestEffort"`; \}

***

### FanOutMemberResult

> **FanOutMemberResult** = \{ `ordinal`: `number`; `result`: `string`; `status`: `"succeeded"`; \} \| \{ `cause`: `Cause.Cause`\<[`RunError`](./Agent#runerror) \| [`RegistrationError`](./AgentTool#registrationerror)\>; `ordinal`: `number`; `status`: `"failed"`; \} \| \{ `cause?`: `Cause.Cause`\<[`RunError`](./Agent#runerror) \| [`RegistrationError`](./AgentTool#registrationerror)\>; `ordinal`: `number`; `status`: `"cancelled"`; \}

***

### FanOutOptions

> **FanOutOptions** = [`FanOutAllSuccessOptions`](#fanoutallsuccessoptions) \| [`FanOutCollectOptions`](#fanoutcollectoptions)

***

### FanOutRemainder

> **FanOutRemainder** = `"await"` \| `"request-cancel"` \| `"terminate"`

***

### Input

> **Input** = *typeof* `Input.Type`

***

### Output

> **Output** = *typeof* `Output.Type`

## Variables

### Commit

> `const` **Commit**: `Schema.TaggedStruct`\<`"Commit"`, \{ `projectedHistory`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `sessionEntryId`: `Schema.String`; `sessionParentId`: `Schema.NullOr`\<`Schema.String`\>; `state`: `Schema.Struct`\<\{ `active`: `Schema.String`; `edgeCounts`: `Schema.$Array`\<`Schema.Struct`\<\{ `count`: `Schema.Finite`; `source`: `Schema.String`; `target`: `Schema.String`; \}\>\>; `handoffCount`: `Schema.Finite`; `path`: `Schema.$Array`\<`Schema.Struct`\<\{ `handoffId`: `Schema.String`; `reason`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.String`; `target`: `Schema.String`; `turn`: `Schema.Finite`; \}\>\>; `pendingContinuation`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `instructions`: `Schema.optionalKey`\<`Schema.String`\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; \}\>\>; `root`: `Schema.String`; \}\>; `targetAgentPin`: `Schema.optionalKey`\<`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>\>; \}\>

***

### ControlState

> `const` **ControlState**: `Schema.Struct`\<\{ `active`: `Schema.String`; `edgeCounts`: `Schema.$Array`\<`Schema.Struct`\<\{ `count`: `Schema.Finite`; `source`: `Schema.String`; `target`: `Schema.String`; \}\>\>; `handoffCount`: `Schema.Finite`; `path`: `Schema.$Array`\<`Schema.Struct`\<\{ `handoffId`: `Schema.String`; `reason`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.String`; `target`: `Schema.String`; `turn`: `Schema.Finite`; \}\>\>; `pendingContinuation`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `instructions`: `Schema.optionalKey`\<`Schema.String`\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; \}\>\>; `root`: `Schema.String`; \}\>

***

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

### filterContextProjection

> `const` **filterContextProjection**: (`predicate`) => `ContextProjection`

#### Parameters

##### predicate

(`message`) => `boolean`

#### Returns

`ContextProjection`

***

### Input

> `const` **Input**: `Schema.Struct`\<\{ `context`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>\>; `prompt`: `Schema.optionalKey`\<`Schema.String`\>; `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

***

### layerCatalog

> `const` **layerCatalog**: (`targets`) => `Layer.Layer`\<[`Catalog`](#catalog)\>

#### Parameters

##### targets

`ReadonlyArray`\<[`Target`](#target)\>

#### Returns

`Layer.Layer`\<[`Catalog`](#catalog)\>

***

### Output

> `const` **Output**: `Schema.Struct`\<\{ `summary`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

***

### supervisor

> `const` **supervisor**: (`options`) => [`Supervisor`](#supervisor)\<`Tool.Handler`\<`string`\> \| `LanguageModel.LanguageModel`, `Record`\<`string`, `Tool.Tool`\<`string`, \{ `failure`: *typeof* `Schema.String`; `failureMode`: `"return"`; `parameters`: [`Input`](#input); `success`: *typeof* `HandoffAccepted`; \}, `never`\>\>\>

#### Parameters

##### options

[`SupervisorOptions`](#supervisoroptions)

#### Returns

[`Supervisor`](#supervisor)\<`Tool.Handler`\<`string`\> \| `LanguageModel.LanguageModel`, `Record`\<`string`, `Tool.Tool`\<`string`, \{ `failure`: *typeof* `Schema.String`; `failureMode`: `"return"`; `parameters`: [`Input`](#input); `success`: *typeof* `HandoffAccepted`; \}, `never`\>\>\>

***

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

### register

Re-exports [register](./AgentTool#register)

***

### RegistrationError

Re-exports [RegistrationError](./AgentTool#registrationerror)
