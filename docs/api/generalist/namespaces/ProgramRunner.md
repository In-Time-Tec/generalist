[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ProgramRunner

# ProgramRunner

## Classes

### ProgramHandlerMismatch

#### Extends

- `ProgramHandlerMismatch_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramHandlerMismatch_base.hint`

##### kind

> `readonly` **kind**: `"agent"` \| `"tool"` \| `"step"`

###### Inherited from

`ProgramHandlerMismatch_base.kind`

##### name

> `readonly` **name**: `string`

###### Inherited from

`ProgramHandlerMismatch_base.name`

##### reason

> `readonly` **reason**: `string`

###### Inherited from

`ProgramHandlerMismatch_base.reason`

***

### ProgramIdentityMismatch

#### Extends

- `ProgramIdentityMismatch_base`

#### Constructors

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

##### actual

> `readonly` **actual**: `string`

###### Inherited from

`ProgramIdentityMismatch_base.actual`

##### expected

> `readonly` **expected**: `string`

###### Inherited from

`ProgramIdentityMismatch_base.expected`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramIdentityMismatch_base.hint`

***

### ProgramRunner

Owner of Agent Program execution and its host policy.

#### Extends

- `ProgramRunner_base`

#### Constructors

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

### Request

Encoded execution request used by direct and durable hosts.

#### Properties

##### input

> `readonly` **input**: `unknown`

##### program

> `readonly` **program**: [`PinnedProgram`](./ProgramManifest#pinnedprogram)

***

### Service

#### Properties

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<`unknown`, [`SandboxUnavailable`](./CodeExecutor#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled) \| [`ProgramHandlerMismatch`](#programhandlermismatch) \| [`ProgramIdentityMismatch`](#programidentitymismatch), `Scope`\>

###### Parameters

###### request

[`Request`](#request)

###### Returns

`Effect`\<`unknown`, [`SandboxUnavailable`](./CodeExecutor#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled) \| [`ProgramHandlerMismatch`](#programhandlermismatch) \| [`ProgramIdentityMismatch`](#programidentitymismatch), `Scope`\>

## Type Aliases

### ExecutionFailure

> **ExecutionFailure** = *typeof* `ExecutionFailure.Type`

## Variables

### ExecutionFailure

> `const` **ExecutionFailure**: `Schema.Union`\<readonly \[`Schema.Union`\<readonly \[[`SandboxUnavailable`](./CodeExecutor#sandboxunavailable), [`SandboxSourceInvalid`](./CodeExecutor#sandboxsourceinvalid), [`SandboxInputInvalid`](./CodeExecutor#sandboxinputinvalid), [`SandboxOutputInvalid`](./CodeExecutor#sandboxoutputinvalid), [`SandboxExecutionFailure`](./CodeExecutor#sandboxexecutionfailure), [`SandboxProtocolViolation`](./CodeExecutor#sandboxprotocolviolation), [`SandboxDeadlineExceeded`](./CodeExecutor#sandboxdeadlineexceeded), [`SandboxCancelled`](./CodeExecutor#sandboxcancelled), [`SandboxResourceExceeded`](./CodeExecutor#sandboxresourceexceeded), [`SandboxGuaranteeUnavailable`](./CodeExecutor#sandboxguaranteeunavailable), `Schema.Union`\<readonly \[*typeof* [`ProgramCapabilityMissing`](./ProgramCapabilities#programcapabilitymissing), *typeof* [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied), *typeof* [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure), *typeof* [`ProgramSchemaFailure`](./ProgramCapabilities#programschemafailure), *typeof* [`ProgramToolFailure`](./ProgramCapabilities#programtoolfailure), *typeof* [`ProgramStepFailure`](./ProgramCapabilities#programstepfailure), *typeof* [`ProgramAgentFailure`](./ProgramCapabilities#programagentfailure), *typeof* [`ProgramBudgetExhausted`](./ProgramCapabilities#programbudgetexhausted), *typeof* [`ProgramReplayDivergence`](./ProgramCapabilities#programreplaydivergence), [`ProgramOperationUnknown`](./ProgramCapabilities#programoperationunknown), *typeof* [`ProgramSuspended`](./ProgramCapabilities#programsuspended), *typeof* [`ProgramCancelled`](./ProgramCapabilities#programcancelled)\]\>\]\>, *typeof* [`ProgramHandlerMismatch`](#programhandlermismatch), *typeof* [`ProgramIdentityMismatch`](#programidentitymismatch)\]\>

Failures returned by Core-owned Program execution.

***

### layerDirect

> `const` **layerDirect**: (`options`) => `Layer.Layer`\<[`ProgramRunner`](#programrunner)\>

Direct process-local runner for an explicitly supplied code executor and live handlers.

#### Parameters

##### options

###### executor

[`Service`](./CodeExecutor#service)

###### handlers

[`Handlers`](./ProgramHandlers#handlers)

#### Returns

`Layer.Layer`\<[`ProgramRunner`](#programrunner)\>

***

### validateHandlers

> `const` **validateHandlers**: \{(`handlers`): (`program`) => `Effect`\<`void`, [`ProgramHandlerMismatch`](#programhandlermismatch)\>; (`program`, `handlers`): `Effect`\<`void`, [`ProgramHandlerMismatch`](#programhandlermismatch)\>; \}

Verify that live Program handlers exactly match persisted manifest authority.

#### Call Signature

> (`handlers`): (`program`) => `Effect`\<`void`, [`ProgramHandlerMismatch`](#programhandlermismatch)\>

##### Parameters

###### handlers

[`Handlers`](./ProgramHandlers#handlers)

##### Returns

(`program`) => `Effect`\<`void`, [`ProgramHandlerMismatch`](#programhandlermismatch)\>

#### Call Signature

> (`program`, `handlers`): `Effect`\<`void`, [`ProgramHandlerMismatch`](#programhandlermismatch)\>

##### Parameters

###### program

[`PinnedProgram`](./ProgramManifest#pinnedprogram)

###### handlers

[`Handlers`](./ProgramHandlers#handlers)

##### Returns

`Effect`\<`void`, [`ProgramHandlerMismatch`](#programhandlermismatch)\>
