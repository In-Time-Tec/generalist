[**generalist**](../../index.md)

***

[generalist](../../index.md) / [generalist](../index.md) / ProgramRunner

# ProgramRunner

## Classes

<a id="programhandlermismatch"></a>

### ProgramHandlerMismatch

#### Extends

- `ProgramHandlerMismatch_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new ProgramHandlerMismatch**(...`args`): [`ProgramHandlerMismatch`](#programhandlermismatch)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramHandlerMismatch`](#programhandlermismatch)

###### Inherited from

`ProgramHandlerMismatch_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramHandlerMismatch_base.hint`

<a id="kind"></a>

##### kind

> `readonly` **kind**: `"agent"` \| `"tool"` \| `"step"`

###### Inherited from

`ProgramHandlerMismatch_base.kind`

<a id="name"></a>

##### name

> `readonly` **name**: `string`

###### Inherited from

`ProgramHandlerMismatch_base.name`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `string`

###### Inherited from

`ProgramHandlerMismatch_base.reason`

***

<a id="programidentitymismatch"></a>

### ProgramIdentityMismatch

#### Extends

- `ProgramIdentityMismatch_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new ProgramIdentityMismatch**(...`args`): [`ProgramIdentityMismatch`](#programidentitymismatch)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramIdentityMismatch`](#programidentitymismatch)

###### Inherited from

`ProgramIdentityMismatch_base.constructor`

#### Properties

<a id="actual"></a>

##### actual

> `readonly` **actual**: `string`

###### Inherited from

`ProgramIdentityMismatch_base.actual`

<a id="expected"></a>

##### expected

> `readonly` **expected**: `string`

###### Inherited from

`ProgramIdentityMismatch_base.expected`

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramIdentityMismatch_base.hint`

***

<a id="programrunner"></a>

### ProgramRunner

Owner of Agent Program execution and its host policy.

#### Extends

- `ProgramRunner_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new ProgramRunner**(`_`): [`ProgramRunner`](#programrunner)

###### Parameters

###### \_

`never`

###### Returns

[`ProgramRunner`](#programrunner)

###### Inherited from

`ProgramRunner_base.constructor`

## Interfaces

<a id="request"></a>

### Request

Encoded execution request used by direct and durable hosts.

#### Properties

<a id="input"></a>

##### input

> `readonly` **input**: `unknown`

<a id="program"></a>

##### program

> `readonly` **program**: [`PinnedProgram`](./ProgramManifest.md#pinnedprogram)

***

<a id="service"></a>

### Service

#### Properties

<a id="execute"></a>

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<`unknown`, [`SandboxUnavailable`](./CodeExecutor.md#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor.md#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor.md#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor.md#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor.md#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor.md#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor.md#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor.md#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor.md#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor.md#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities.md#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities.md#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities.md#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities.md#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities.md#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities.md#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities.md#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities.md#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities.md#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities.md#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities.md#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities.md#programcancelled) \| [`ProgramHandlerMismatch`](#programhandlermismatch) \| [`ProgramIdentityMismatch`](#programidentitymismatch), `Scope`\>

###### Parameters

###### request

[`Request`](#request)

###### Returns

`Effect`\<`unknown`, [`SandboxUnavailable`](./CodeExecutor.md#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor.md#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor.md#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor.md#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor.md#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor.md#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor.md#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor.md#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor.md#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor.md#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities.md#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities.md#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities.md#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities.md#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities.md#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities.md#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities.md#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities.md#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities.md#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities.md#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities.md#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities.md#programcancelled) \| [`ProgramHandlerMismatch`](#programhandlermismatch) \| [`ProgramIdentityMismatch`](#programidentitymismatch), `Scope`\>

## Type Aliases

<a id="executionfailure"></a>

### ExecutionFailure

> **ExecutionFailure** = *typeof* `ExecutionFailure.Type`

## Variables

<a id="executionfailure-1"></a>

### ExecutionFailure

> `const` **ExecutionFailure**: `Schema.Union`\<readonly \[`Schema.Union`\<readonly \[[`SandboxUnavailable`](./CodeExecutor.md#sandboxunavailable), [`SandboxSourceInvalid`](./CodeExecutor.md#sandboxsourceinvalid), [`SandboxInputInvalid`](./CodeExecutor.md#sandboxinputinvalid), [`SandboxOutputInvalid`](./CodeExecutor.md#sandboxoutputinvalid), [`SandboxExecutionFailure`](./CodeExecutor.md#sandboxexecutionfailure), [`SandboxProtocolViolation`](./CodeExecutor.md#sandboxprotocolviolation), [`SandboxDeadlineExceeded`](./CodeExecutor.md#sandboxdeadlineexceeded), [`SandboxCancelled`](./CodeExecutor.md#sandboxcancelled), [`SandboxResourceExceeded`](./CodeExecutor.md#sandboxresourceexceeded), [`SandboxGuaranteeUnavailable`](./CodeExecutor.md#sandboxguaranteeunavailable), `Schema.Union`\<readonly \[*typeof* [`ProgramCapabilityMissing`](./ProgramCapabilities.md#programcapabilitymissing), *typeof* [`ProgramCapabilityDenied`](./ProgramCapabilities.md#programcapabilitydenied), *typeof* [`ProgramAuthorizationFailure`](./ProgramCapabilities.md#programauthorizationfailure), *typeof* [`ProgramSchemaFailure`](./ProgramCapabilities.md#programschemafailure), *typeof* [`ProgramToolFailure`](./ProgramCapabilities.md#programtoolfailure), *typeof* [`ProgramStepFailure`](./ProgramCapabilities.md#programstepfailure), *typeof* [`ProgramAgentFailure`](./ProgramCapabilities.md#programagentfailure), *typeof* [`ProgramBudgetExhausted`](./ProgramCapabilities.md#programbudgetexhausted), *typeof* [`ProgramReplayDivergence`](./ProgramCapabilities.md#programreplaydivergence), [`ProgramOperationUnknown`](./ProgramCapabilities.md#programoperationunknown), *typeof* [`ProgramSuspended`](./ProgramCapabilities.md#programsuspended), *typeof* [`ProgramCancelled`](./ProgramCapabilities.md#programcancelled)\]\>\]\>, *typeof* [`ProgramHandlerMismatch`](#programhandlermismatch), *typeof* [`ProgramIdentityMismatch`](#programidentitymismatch)\]\>

Failures returned by Core-owned Program execution.

***

<a id="layerdirect"></a>

### layerDirect

> `const` **layerDirect**: (`options`) => `Layer.Layer`\<[`ProgramRunner`](#programrunner)\>

Direct process-local runner for an explicitly supplied code executor and live handlers.

#### Parameters

##### options

###### executor

[`Service`](./CodeExecutor.md#service)

###### handlers

[`Handlers`](./ProgramHandlers.md#handlers)

#### Returns

`Layer.Layer`\<[`ProgramRunner`](#programrunner)\>

***

<a id="validatehandlers"></a>

### validateHandlers

> `const` **validateHandlers**: \{(`handlers`): (`program`) => `Effect`\<`void`, [`ProgramHandlerMismatch`](#programhandlermismatch)\>; (`program`, `handlers`): `Effect`\<`void`, [`ProgramHandlerMismatch`](#programhandlermismatch)\>; \}

Verify that live Program handlers exactly match persisted manifest authority.

#### Call Signature

> (`handlers`): (`program`) => `Effect`\<`void`, [`ProgramHandlerMismatch`](#programhandlermismatch)\>

##### Parameters

###### handlers

[`Handlers`](./ProgramHandlers.md#handlers)

##### Returns

(`program`) => `Effect`\<`void`, [`ProgramHandlerMismatch`](#programhandlermismatch)\>

#### Call Signature

> (`program`, `handlers`): `Effect`\<`void`, [`ProgramHandlerMismatch`](#programhandlermismatch)\>

##### Parameters

###### program

[`PinnedProgram`](./ProgramManifest.md#pinnedprogram)

###### handlers

[`Handlers`](./ProgramHandlers.md#handlers)

##### Returns

`Effect`\<`void`, [`ProgramHandlerMismatch`](#programhandlermismatch)\>
