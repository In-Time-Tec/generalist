[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / AgentProgram

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

> `readonly` **pinned**: [`PinnedProgram`](./ProgramManifest#pinnedprogram)

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

`ReadonlyArray`\<[`ProgramAgentCapability`](./ProgramManifest#programagentcapability)\>

###### budget

[`ProgramBudget`](./ProgramManifest#programbudget)

###### input

`Schema.Codec`\<`I`, `IE`\>

###### inputPin

[`CapabilityPin`](./Pins#capabilitypin)

###### name

`string`

###### output

`Schema.Codec`\<`O`, `OE`\>

###### outputPin

[`CapabilityPin`](./Pins#capabilitypin)

###### sandbox

[`CapabilityPin`](./Pins#capabilitypin)

###### source

`string`

###### steps

`ReadonlyArray`\<[`NamedCapability`](./AgentManifest#namedcapability)\>

###### tools

`ReadonlyArray`\<[`NamedCapability`](./AgentManifest#namedcapability)\>

#### Returns

[`Program`](#program)\<`I`, `IE`, `O`, `OE`\>

***

<a id="run"></a>

### run

> `const` **run**: \{\<`I`, `IE`, `O`, `OE`\>(`input`): (`program`) => `Effect`\<`O`, [`SandboxUnavailable`](./CodeExecutor#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled) \| [`ProgramHandlerMismatch`](./ProgramRunner#programhandlermismatch) \| [`ProgramIdentityMismatch`](./ProgramRunner#programidentitymismatch), `Scope` \| [`ProgramRunner`](./ProgramRunner#programrunner)\>; \<`I`, `IE`, `O`, `OE`\>(`program`, `input`): `Effect`\<`O`, [`SandboxUnavailable`](./CodeExecutor#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled) \| [`ProgramHandlerMismatch`](./ProgramRunner#programhandlermismatch) \| [`ProgramIdentityMismatch`](./ProgramRunner#programidentitymismatch), `Scope` \| [`ProgramRunner`](./ProgramRunner#programrunner)\>; \}

Execute a trusted, caller-supplied Agent Program through the configured sandbox boundary.

#### Call Signature

> \<`I`, `IE`, `O`, `OE`\>(`input`): (`program`) => `Effect`\<`O`, [`SandboxUnavailable`](./CodeExecutor#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled) \| [`ProgramHandlerMismatch`](./ProgramRunner#programhandlermismatch) \| [`ProgramIdentityMismatch`](./ProgramRunner#programidentitymismatch), `Scope` \| [`ProgramRunner`](./ProgramRunner#programrunner)\>

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

(`program`) => `Effect`\<`O`, [`SandboxUnavailable`](./CodeExecutor#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled) \| [`ProgramHandlerMismatch`](./ProgramRunner#programhandlermismatch) \| [`ProgramIdentityMismatch`](./ProgramRunner#programidentitymismatch), `Scope` \| [`ProgramRunner`](./ProgramRunner#programrunner)\>

#### Call Signature

> \<`I`, `IE`, `O`, `OE`\>(`program`, `input`): `Effect`\<`O`, [`SandboxUnavailable`](./CodeExecutor#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled) \| [`ProgramHandlerMismatch`](./ProgramRunner#programhandlermismatch) \| [`ProgramIdentityMismatch`](./ProgramRunner#programidentitymismatch), `Scope` \| [`ProgramRunner`](./ProgramRunner#programrunner)\>

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

`Effect`\<`O`, [`SandboxUnavailable`](./CodeExecutor#sandboxunavailable) \| [`SandboxSourceInvalid`](./CodeExecutor#sandboxsourceinvalid) \| [`SandboxInputInvalid`](./CodeExecutor#sandboxinputinvalid) \| [`SandboxOutputInvalid`](./CodeExecutor#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](./CodeExecutor#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](./CodeExecutor#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](./CodeExecutor#sandboxdeadlineexceeded) \| [`SandboxCancelled`](./CodeExecutor#sandboxcancelled) \| [`SandboxResourceExceeded`](./CodeExecutor#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](./CodeExecutor#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled) \| [`ProgramHandlerMismatch`](./ProgramRunner#programhandlermismatch) \| [`ProgramIdentityMismatch`](./ProgramRunner#programidentitymismatch), `Scope` \| [`ProgramRunner`](./ProgramRunner#programrunner)\>
