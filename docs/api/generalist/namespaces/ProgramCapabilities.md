[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ProgramCapabilities

# ProgramCapabilities

## Classes

### ProgramAgentFailure

#### Extends

- `ProgramAgentFailure_base`

#### Constructors

##### Constructor

> **new ProgramAgentFailure**(...`args`): [`ProgramAgentFailure`](#programagentfailure)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramAgentFailure`](#programagentfailure)

###### Inherited from

`ProgramAgentFailure_base.constructor`

#### Properties

##### cause

> `readonly` **cause**: `unknown`

###### Inherited from

`ProgramAgentFailure_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramAgentFailure_base.hint`

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramAgentFailure_base.operation`

##### selection

> `readonly` **selection**: `string`

###### Inherited from

`ProgramAgentFailure_base.selection`

***

### ProgramAuthorizationFailure

#### Extends

- `ProgramAuthorizationFailure_base`

#### Constructors

##### Constructor

> **new ProgramAuthorizationFailure**(...`args`): [`ProgramAuthorizationFailure`](#programauthorizationfailure)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramAuthorizationFailure`](#programauthorizationfailure)

###### Inherited from

`ProgramAuthorizationFailure_base.constructor`

#### Properties

##### capability

> `readonly` **capability**: `string`

###### Inherited from

`ProgramAuthorizationFailure_base.capability`

##### cause

> `readonly` **cause**: `unknown`

###### Inherited from

`ProgramAuthorizationFailure_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramAuthorizationFailure_base.hint`

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramAuthorizationFailure_base.operation`

***

### ProgramBudgetExhausted

#### Extends

- `ProgramBudgetExhausted_base`

#### Constructors

##### Constructor

> **new ProgramBudgetExhausted**(...`args`): [`ProgramBudgetExhausted`](#programbudgetexhausted)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramBudgetExhausted`](#programbudgetexhausted)

###### Inherited from

`ProgramBudgetExhausted_base.constructor`

#### Properties

##### dimension

> `readonly` **dimension**: `"toolCalls"` \| `"tokens"` \| `"outputBytes"` \| `"agentRuns"` \| `"concurrency"` \| `"wallClockMillis"` \| `"logBytes"`

###### Inherited from

`ProgramBudgetExhausted_base.dimension`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramBudgetExhausted_base.hint`

##### limit

> `readonly` **limit**: `number`

###### Inherited from

`ProgramBudgetExhausted_base.limit`

***

### ProgramCancelled

#### Extends

- `ProgramCancelled_base`

#### Constructors

##### Constructor

> **new ProgramCancelled**(...`args`): [`ProgramCancelled`](#programcancelled)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramCancelled`](#programcancelled)

###### Inherited from

`ProgramCancelled_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramCancelled_base.hint`

##### reason

> `readonly` **reason**: `string`

###### Inherited from

`ProgramCancelled_base.reason`

***

### ProgramCapabilities

Host-owned encoded operations exposed only inside a sandbox execution.

#### Extends

- `ProgramCapabilities_base`

#### Constructors

##### Constructor

> **new ProgramCapabilities**(`_`): [`ProgramCapabilities`](#programcapabilities)

###### Parameters

###### \_

`never`

###### Returns

[`ProgramCapabilities`](#programcapabilities)

###### Inherited from

`ProgramCapabilities_base.constructor`

***

### ProgramCapabilityDenied

#### Extends

- `ProgramCapabilityDenied_base`

#### Constructors

##### Constructor

> **new ProgramCapabilityDenied**(...`args`): [`ProgramCapabilityDenied`](#programcapabilitydenied)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramCapabilityDenied`](#programcapabilitydenied)

###### Inherited from

`ProgramCapabilityDenied_base.constructor`

#### Properties

##### capability

> `readonly` **capability**: `string`

###### Inherited from

`ProgramCapabilityDenied_base.capability`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramCapabilityDenied_base.hint`

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramCapabilityDenied_base.operation`

##### reason

> `readonly` **reason**: `string`

###### Inherited from

`ProgramCapabilityDenied_base.reason`

***

### ProgramCapabilityMissing

#### Extends

- `ProgramCapabilityMissing_base`

#### Constructors

##### Constructor

> **new ProgramCapabilityMissing**(...`args`): [`ProgramCapabilityMissing`](#programcapabilitymissing)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramCapabilityMissing`](#programcapabilitymissing)

###### Inherited from

`ProgramCapabilityMissing_base.constructor`

#### Properties

##### capability

> `readonly` **capability**: `string`

###### Inherited from

`ProgramCapabilityMissing_base.capability`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramCapabilityMissing_base.hint`

***

### ProgramInvocationFailure

One decoded invocation failed with an implementation-specific error.

#### Extends

- `ProgramInvocationFailure_base`

#### Constructors

##### Constructor

> **new ProgramInvocationFailure**(...`args`): [`ProgramInvocationFailure`](#programinvocationfailure)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramInvocationFailure`](#programinvocationfailure)

###### Inherited from

`ProgramInvocationFailure_base.constructor`

#### Properties

##### cause

> `readonly` **cause**: `unknown`

###### Inherited from

`ProgramInvocationFailure_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramInvocationFailure_base.hint`

***

### ProgramOperationUnknown

#### Extends

- `ProgramOperationUnknown_base`

#### Constructors

##### Constructor

> **new ProgramOperationUnknown**(...`args`): [`ProgramOperationUnknown`](#programoperationunknown)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramOperationUnknown`](#programoperationunknown)

###### Inherited from

`ProgramOperationUnknown_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramOperationUnknown_base.hint`

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramOperationUnknown_base.operation`

***

### ProgramReplayDivergence

#### Extends

- `ProgramReplayDivergence_base`

#### Constructors

##### Constructor

> **new ProgramReplayDivergence**(...`args`): [`ProgramReplayDivergence`](#programreplaydivergence)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramReplayDivergence`](#programreplaydivergence)

###### Inherited from

`ProgramReplayDivergence_base.constructor`

#### Properties

##### actual

> `readonly` **actual**: `string`

###### Inherited from

`ProgramReplayDivergence_base.actual`

##### expected

> `readonly` **expected**: `string`

###### Inherited from

`ProgramReplayDivergence_base.expected`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramReplayDivergence_base.hint`

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramReplayDivergence_base.operation`

***

### ProgramSchemaFailure

#### Extends

- `ProgramSchemaFailure_base`

#### Constructors

##### Constructor

> **new ProgramSchemaFailure**(...`args`): [`ProgramSchemaFailure`](#programschemafailure)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramSchemaFailure`](#programschemafailure)

###### Inherited from

`ProgramSchemaFailure_base.constructor`

#### Properties

##### boundary

> `readonly` **boundary**: `"program-input"` \| `"program-output"` \| `"tool-input"` \| `"tool-output"` \| `"step-input"` \| `"step-output"` \| `"agent-input"` \| `"agent-output"`

###### Inherited from

`ProgramSchemaFailure_base.boundary`

##### capability?

> `readonly` `optional` **capability?**: `string`

###### Inherited from

`ProgramSchemaFailure_base.capability`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramSchemaFailure_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`ProgramSchemaFailure_base.message`

***

### ProgramStepFailure

#### Extends

- `ProgramStepFailure_base`

#### Constructors

##### Constructor

> **new ProgramStepFailure**(...`args`): [`ProgramStepFailure`](#programstepfailure)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramStepFailure`](#programstepfailure)

###### Inherited from

`ProgramStepFailure_base.constructor`

#### Properties

##### cause

> `readonly` **cause**: `unknown`

###### Inherited from

`ProgramStepFailure_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramStepFailure_base.hint`

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramStepFailure_base.operation`

##### step

> `readonly` **step**: `string`

###### Inherited from

`ProgramStepFailure_base.step`

***

### ProgramSuspended

#### Extends

- `ProgramSuspended_base`

#### Constructors

##### Constructor

> **new ProgramSuspended**(...`args`): [`ProgramSuspended`](#programsuspended)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramSuspended`](#programsuspended)

###### Inherited from

`ProgramSuspended_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramSuspended_base.hint`

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramSuspended_base.operation`

##### reason

> `readonly` **reason**: `"agent"` \| `"step"` \| `"approval"` \| `"tool-wait"`

###### Inherited from

`ProgramSuspended_base.reason`

##### token?

> `readonly` `optional` **token?**: `string`

###### Inherited from

`ProgramSuspended_base.token`

***

### ProgramToolFailure

#### Extends

- `ProgramToolFailure_base`

#### Constructors

##### Constructor

> **new ProgramToolFailure**(...`args`): [`ProgramToolFailure`](#programtoolfailure)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgramToolFailure`](#programtoolfailure)

###### Inherited from

`ProgramToolFailure_base.constructor`

#### Properties

##### cause

> `readonly` **cause**: `unknown`

###### Inherited from

`ProgramToolFailure_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramToolFailure_base.hint`

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramToolFailure_base.operation`

##### tool

> `readonly` **tool**: `string`

###### Inherited from

`ProgramToolFailure_base.tool`

## Interfaces

### AgentFanOutInput

#### Properties

##### members

> `readonly` **members**: readonly `AgentFanOutMember`[]

##### operation

> `readonly` **operation**: `string`

***

### AgentMapInput

#### Properties

##### members

> `readonly` **members**: readonly `AgentMapMember`[]

##### operation

> `readonly` **operation**: `string`

##### selection

> `readonly` **selection**: `string`

***

### AgentMemberResult

#### Properties

##### member

> `readonly` **member**: `string`

##### result

> `readonly` **result**: [`AgentRunResult`](#agentrunresult)

***

### AgentRunInput

#### Properties

##### input

> `readonly` **input**: `unknown`

##### operation

> `readonly` **operation**: `string`

##### selection

> `readonly` **selection**: `string`

***

### AgentRunResult

#### Properties

##### text

> `readonly` **text**: `string`

##### tokenUsage

> `readonly` **tokenUsage**: `AgentTokenUsage`

##### turns

> `readonly` **turns**: `number`

***

### LogInput

#### Properties

##### data?

> `readonly` `optional` **data?**: `JsonObject`

##### level

> `readonly` **level**: `"error"` \| `"debug"` \| `"info"` \| `"warn"`

##### message

> `readonly` **message**: `string`

##### operation

> `readonly` **operation**: `string`

***

### Service

Encoded operations visible to sandboxed source.

#### Properties

##### callStep

> `readonly` **callStep**: (`input`) => `Effect`\<`unknown`, [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

###### Parameters

###### input

[`StepCallInput`](#stepcallinput)

###### Returns

`Effect`\<`unknown`, [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

##### callTool

> `readonly` **callTool**: (`input`) => `Effect`\<`unknown`, [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

###### Parameters

###### input

[`ToolCallInput`](#toolcallinput)

###### Returns

`Effect`\<`unknown`, [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

##### describeTool

> `readonly` **describeTool**: (`name`) => `Effect`\<[`ToolDescription`](#tooldescription), [`ProgramCapabilityMissing`](#programcapabilitymissing)\>

###### Parameters

###### name

`string`

###### Returns

`Effect`\<[`ToolDescription`](#tooldescription), [`ProgramCapabilityMissing`](#programcapabilitymissing)\>

##### discoverTools

> `readonly` **discoverTools**: `Effect`\<readonly [`ToolSummary`](#toolsummary)[]\>

##### fanOutAgents

> `readonly` **fanOutAgents**: (`input`) => `Effect`\<readonly [`AgentMemberResult`](#agentmemberresult)[], [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

###### Parameters

###### input

[`AgentFanOutInput`](#agentfanoutinput)

###### Returns

`Effect`\<readonly [`AgentMemberResult`](#agentmemberresult)[], [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

##### log

> `readonly` **log**: (`input`) => `Effect`\<`void`, [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

###### Parameters

###### input

[`LogInput`](#loginput)

###### Returns

`Effect`\<`void`, [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

##### mapAgents

> `readonly` **mapAgents**: (`input`) => `Effect`\<readonly [`AgentMemberResult`](#agentmemberresult)[], [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

###### Parameters

###### input

[`AgentMapInput`](#agentmapinput)

###### Returns

`Effect`\<readonly [`AgentMemberResult`](#agentmemberresult)[], [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

##### runAgent

> `readonly` **runAgent**: (`input`) => `Effect`\<[`AgentRunResult`](#agentrunresult), [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

###### Parameters

###### input

[`AgentRunInput`](#agentruninput)

###### Returns

`Effect`\<[`AgentRunResult`](#agentrunresult), [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

***

### StepCallInput

#### Properties

##### input

> `readonly` **input**: `unknown`

##### operation

> `readonly` **operation**: `string`

##### step

> `readonly` **step**: `string`

***

### ToolCallInput

#### Properties

##### input

> `readonly` **input**: `unknown`

##### operation

> `readonly` **operation**: `string`

##### tool

> `readonly` **tool**: `string`

***

### ToolDescription

Focused encoded type description for one manifest-scoped tool.

#### Extends

- [`ToolSummary`](#toolsummary)

#### Properties

##### inputSchema

> `readonly` **inputSchema**: `Json`

##### name

> `readonly` **name**: `string`

###### Inherited from

[`ToolSummary`](#toolsummary).[`name`](#name-1)

##### outputSchema

> `readonly` **outputSchema**: `Json`

***

### ToolSummary

One manifest-scoped tool visible to Program source.

#### Extended by

- [`ToolDescription`](#tooldescription)

#### Properties

##### name

> `readonly` **name**: `string`

## Type Aliases

### CapabilityFailure

> **CapabilityFailure** = *typeof* `CapabilityFailure.Type`

Failures crossing the encoded program capability protocol.

***

### LogLevel

> **LogLevel** = *typeof* `LogLevel.Type`

***

### ProgramMemberKey

> **ProgramMemberKey** = *typeof* `ProgramMemberKey.Type`

Stable, bounded identity for one member of a map or fan-out.

***

### ProgramOperationName

> **ProgramOperationName** = *typeof* `ProgramOperationName.Type`

Stable, bounded, source-owned identity for one effectful operation.

## Variables

### CapabilityFailure

> `const` **CapabilityFailure**: `Schema.Union`\<readonly \[*typeof* [`ProgramCapabilityMissing`](#programcapabilitymissing), *typeof* [`ProgramCapabilityDenied`](#programcapabilitydenied), *typeof* [`ProgramAuthorizationFailure`](#programauthorizationfailure), *typeof* [`ProgramSchemaFailure`](#programschemafailure), *typeof* [`ProgramToolFailure`](#programtoolfailure), *typeof* [`ProgramStepFailure`](#programstepfailure), *typeof* [`ProgramAgentFailure`](#programagentfailure), *typeof* [`ProgramBudgetExhausted`](#programbudgetexhausted), *typeof* [`ProgramReplayDivergence`](#programreplaydivergence), *typeof* [`ProgramOperationUnknown`](#programoperationunknown), *typeof* [`ProgramSuspended`](#programsuspended), *typeof* [`ProgramCancelled`](#programcancelled)\]\>

Failures crossing the encoded program capability protocol.

***

### LogLevel

> `const` **LogLevel**: `Schema.Literals`\<readonly \[`"debug"`, `"info"`, `"warn"`, `"error"`\]\>

***

### ProgramMemberKey

> `const` **ProgramMemberKey**: `Schema.String`

Stable, bounded identity for one member of a map or fan-out.

***

### ProgramOperationName

> `const` **ProgramOperationName**: `Schema.String`

Stable, bounded, source-owned identity for one effectful operation.
