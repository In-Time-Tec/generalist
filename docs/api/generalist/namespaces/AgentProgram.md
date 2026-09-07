[**generalist**](../../index.md)

***

[generalist](../../index.md) / [generalist](../index.md) / AgentProgram

# AgentProgram

## Interfaces

<a id="program"></a>

### Program

An exact Agent Program paired with its input and output codecs.

#### Type Parameters

##### I

`I`

##### IE

`IE`

##### O

`O`

##### OE

`OE`

#### Properties

<a id="input"></a>

##### input

> `readonly` **input**: `Codec`\<`I`, `IE`\>

<a id="output"></a>

##### output

> `readonly` **output**: `Codec`\<`O`, `OE`\>

<a id="pinned"></a>

##### pinned

> `readonly` **pinned**: [`PinnedProgram`](./ProgramManifest.md#pinnedprogram)

## Variables

<a id="make"></a>

### make

> `const` **make**: \<`I`, `IE`, `O`, `OE`\>(`input`) => [`Program`](#program)\<`I`, `IE`, `O`, `OE`\>

Construct and pin an Agent Program without evaluating its source.

#### Type Parameters

##### I

`I`

##### IE

`IE`

##### O

`O`

##### OE

`OE`

#### Parameters

##### input

###### agents

`ReadonlyArray`\<[`ProgramAgentCapability`](./ProgramManifest.md#programagentcapability)\>

###### budget

[`ProgramBudget`](./ProgramManifest.md#programbudget)

###### input

`Schema.Codec`\<`I`, `IE`\>

###### inputPin

[`CapabilityPin`](./Pins.md#capabilitypin)

###### name

`string`

###### output

`Schema.Codec`\<`O`, `OE`\>

###### outputPin

[`CapabilityPin`](./Pins.md#capabilitypin)

###### sandbox

[`CapabilityPin`](./Pins.md#capabilitypin)

###### source

`string`

###### steps

`ReadonlyArray`\<[`NamedCapability`](./AgentManifest.md#namedcapability)\>

###### tools

`ReadonlyArray`\<[`NamedCapability`](./AgentManifest.md#namedcapability)\>

#### Returns

[`Program`](#program)\<`I`, `IE`, `O`, `OE`\>

***

<a id="run"></a>

### run

> `const` **run**: \{\<`I`, `IE`, `O`, `OE`\>(`input`): (`program`) => `Effect`\<`O`, [`SandboxUnavailable`](./CodeExecutor.md#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor.md#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor.md#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor.md#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor.md#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor.md#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor.md#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor.md#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor.md#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor.md#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities.md#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities.md#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities.md#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities.md#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities.md#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities.md#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities.md#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities.md#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities.md#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities.md#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities.md#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities.md#programcancelled) \| [`ProgramHandlerMismatch`](./ProgramRunner.md#programhandlermismatch) \| [`ProgramIdentityMismatch`](./ProgramRunner.md#programidentitymismatch), `Scope` \| [`ProgramRunner`](./ProgramRunner.md#programrunner)\>; \<`I`, `IE`, `O`, `OE`\>(`program`, `input`): `Effect`\<`O`, [`SandboxUnavailable`](./CodeExecutor.md#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor.md#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor.md#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor.md#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor.md#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor.md#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor.md#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor.md#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor.md#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor.md#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities.md#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities.md#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities.md#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities.md#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities.md#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities.md#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities.md#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities.md#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities.md#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities.md#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities.md#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities.md#programcancelled) \| [`ProgramHandlerMismatch`](./ProgramRunner.md#programhandlermismatch) \| [`ProgramIdentityMismatch`](./ProgramRunner.md#programidentitymismatch), `Scope` \| [`ProgramRunner`](./ProgramRunner.md#programrunner)\>; \}

Execute a trusted, caller-supplied Agent Program through the configured sandbox boundary.

#### Call Signature

> \<`I`, `IE`, `O`, `OE`\>(`input`): (`program`) => `Effect`\<`O`, [`SandboxUnavailable`](./CodeExecutor.md#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor.md#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor.md#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor.md#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor.md#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor.md#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor.md#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor.md#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor.md#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor.md#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities.md#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities.md#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities.md#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities.md#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities.md#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities.md#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities.md#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities.md#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities.md#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities.md#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities.md#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities.md#programcancelled) \| [`ProgramHandlerMismatch`](./ProgramRunner.md#programhandlermismatch) \| [`ProgramIdentityMismatch`](./ProgramRunner.md#programidentitymismatch), `Scope` \| [`ProgramRunner`](./ProgramRunner.md#programrunner)\>

##### Type Parameters

###### I

`I`

###### IE

`IE`

###### O

`O`

###### OE

`OE`

##### Parameters

###### input

`I`

##### Returns

(`program`) => `Effect`\<`O`, [`SandboxUnavailable`](./CodeExecutor.md#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor.md#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor.md#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor.md#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor.md#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor.md#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor.md#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor.md#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor.md#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor.md#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities.md#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities.md#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities.md#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities.md#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities.md#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities.md#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities.md#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities.md#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities.md#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities.md#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities.md#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities.md#programcancelled) \| [`ProgramHandlerMismatch`](./ProgramRunner.md#programhandlermismatch) \| [`ProgramIdentityMismatch`](./ProgramRunner.md#programidentitymismatch), `Scope` \| [`ProgramRunner`](./ProgramRunner.md#programrunner)\>

#### Call Signature

> \<`I`, `IE`, `O`, `OE`\>(`program`, `input`): `Effect`\<`O`, [`SandboxUnavailable`](./CodeExecutor.md#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor.md#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor.md#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor.md#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor.md#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor.md#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor.md#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor.md#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor.md#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor.md#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities.md#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities.md#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities.md#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities.md#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities.md#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities.md#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities.md#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities.md#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities.md#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities.md#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities.md#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities.md#programcancelled) \| [`ProgramHandlerMismatch`](./ProgramRunner.md#programhandlermismatch) \| [`ProgramIdentityMismatch`](./ProgramRunner.md#programidentitymismatch), `Scope` \| [`ProgramRunner`](./ProgramRunner.md#programrunner)\>

##### Type Parameters

###### I

`I`

###### IE

`IE`

###### O

`O`

###### OE

`OE`

##### Parameters

###### program

[`Program`](#program)\<`I`, `IE`, `O`, `OE`\>

###### input

`I`

##### Returns

`Effect`\<`O`, [`SandboxUnavailable`](./CodeExecutor.md#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor.md#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor.md#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor.md#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor.md#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor.md#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor.md#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor.md#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor.md#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor.md#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities.md#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities.md#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities.md#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities.md#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities.md#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities.md#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities.md#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities.md#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities.md#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities.md#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities.md#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities.md#programcancelled) \| [`ProgramHandlerMismatch`](./ProgramRunner.md#programhandlermismatch) \| [`ProgramIdentityMismatch`](./ProgramRunner.md#programidentitymismatch), `Scope` \| [`ProgramRunner`](./ProgramRunner.md#programrunner)\>
