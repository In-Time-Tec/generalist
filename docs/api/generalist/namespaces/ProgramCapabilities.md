[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ProgramCapabilities

# ProgramCapabilities

## Classes

<a id="programagentfailure"></a>

### ProgramAgentFailure

#### Extends

- `ProgramAgentFailure_base`

#### Constructors

<a id="constructor"></a>

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

<a id="cause"></a>

##### cause

> `readonly` **cause**: `unknown`

###### Inherited from

`ProgramAgentFailure_base.cause`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramAgentFailure_base.hint`

<a id="operation"></a>

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramAgentFailure_base.operation`

<a id="selection"></a>

##### selection

> `readonly` **selection**: `string`

###### Inherited from

`ProgramAgentFailure_base.selection`

***

<a id="programauthorizationfailure"></a>

### ProgramAuthorizationFailure

#### Extends

- `ProgramAuthorizationFailure_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="capability"></a>

##### capability

> `readonly` **capability**: `string`

###### Inherited from

`ProgramAuthorizationFailure_base.capability`

<a id="cause-1"></a>

##### cause

> `readonly` **cause**: `unknown`

###### Inherited from

`ProgramAuthorizationFailure_base.cause`

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramAuthorizationFailure_base.hint`

<a id="operation-1"></a>

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramAuthorizationFailure_base.operation`

***

<a id="programbudgetexhausted"></a>

### ProgramBudgetExhausted

#### Extends

- `ProgramBudgetExhausted_base`

#### Constructors

<a id="constructor-2"></a>

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

<a id="dimension"></a>

##### dimension

> `readonly` **dimension**: `"toolCalls"` \| `"tokens"` \| `"outputBytes"` \| `"agentRuns"` \| `"concurrency"` \| `"wallClockMillis"` \| `"logBytes"`

###### Inherited from

`ProgramBudgetExhausted_base.dimension`

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramBudgetExhausted_base.hint`

<a id="limit"></a>

##### limit

> `readonly` **limit**: `number`

###### Inherited from

`ProgramBudgetExhausted_base.limit`

***

<a id="programcancelled"></a>

### ProgramCancelled

#### Extends

- `ProgramCancelled_base`

#### Constructors

<a id="constructor-3"></a>

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

<a id="hint-3"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramCancelled_base.hint`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `string`

###### Inherited from

`ProgramCancelled_base.reason`

***

<a id="programcapabilities"></a>

### ProgramCapabilities

Host-owned encoded operations exposed only inside a sandbox execution.

#### Extends

- `ProgramCapabilities_base`

#### Constructors

<a id="constructor-4"></a>

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

<a id="programcapabilitydenied"></a>

### ProgramCapabilityDenied

#### Extends

- `ProgramCapabilityDenied_base`

#### Constructors

<a id="constructor-5"></a>

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

<a id="capability-1"></a>

##### capability

> `readonly` **capability**: `string`

###### Inherited from

`ProgramCapabilityDenied_base.capability`

<a id="hint-4"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramCapabilityDenied_base.hint`

<a id="operation-2"></a>

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramCapabilityDenied_base.operation`

<a id="reason-1"></a>

##### reason

> `readonly` **reason**: `string`

###### Inherited from

`ProgramCapabilityDenied_base.reason`

***

<a id="programcapabilitymissing"></a>

### ProgramCapabilityMissing

#### Extends

- `ProgramCapabilityMissing_base`

#### Constructors

<a id="constructor-6"></a>

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

<a id="capability-2"></a>

##### capability

> `readonly` **capability**: `string`

###### Inherited from

`ProgramCapabilityMissing_base.capability`

<a id="hint-5"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramCapabilityMissing_base.hint`

***

<a id="programinvocationfailure"></a>

### ProgramInvocationFailure

One decoded invocation failed with an implementation-specific error.

#### Extends

- `ProgramInvocationFailure_base`

#### Constructors

<a id="constructor-7"></a>

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

<a id="cause-2"></a>

##### cause

> `readonly` **cause**: `unknown`

###### Inherited from

`ProgramInvocationFailure_base.cause`

<a id="hint-6"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramInvocationFailure_base.hint`

***

<a id="programoperationunknown"></a>

### ProgramOperationUnknown

#### Extends

- `ProgramOperationUnknown_base`

#### Constructors

<a id="constructor-8"></a>

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

<a id="hint-7"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramOperationUnknown_base.hint`

<a id="operation-3"></a>

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramOperationUnknown_base.operation`

***

<a id="programreplaydivergence"></a>

### ProgramReplayDivergence

#### Extends

- `ProgramReplayDivergence_base`

#### Constructors

<a id="constructor-9"></a>

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

<a id="actual"></a>

##### actual

> `readonly` **actual**: `string`

###### Inherited from

`ProgramReplayDivergence_base.actual`

<a id="expected"></a>

##### expected

> `readonly` **expected**: `string`

###### Inherited from

`ProgramReplayDivergence_base.expected`

<a id="hint-8"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramReplayDivergence_base.hint`

<a id="operation-4"></a>

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramReplayDivergence_base.operation`

***

<a id="programschemafailure"></a>

### ProgramSchemaFailure

#### Extends

- `ProgramSchemaFailure_base`

#### Constructors

<a id="constructor-10"></a>

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

<a id="boundary"></a>

##### boundary

> `readonly` **boundary**: `"program-input"` \| `"program-output"` \| `"tool-input"` \| `"tool-output"` \| `"step-input"` \| `"step-output"` \| `"agent-input"` \| `"agent-output"`

###### Inherited from

`ProgramSchemaFailure_base.boundary`

<a id="capability-3"></a>

##### capability?

> `readonly` `optional` **capability?**: `string`

###### Inherited from

`ProgramSchemaFailure_base.capability`

<a id="hint-9"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramSchemaFailure_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`ProgramSchemaFailure_base.message`

***

<a id="programstepfailure"></a>

### ProgramStepFailure

#### Extends

- `ProgramStepFailure_base`

#### Constructors

<a id="constructor-11"></a>

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

<a id="cause-3"></a>

##### cause

> `readonly` **cause**: `unknown`

###### Inherited from

`ProgramStepFailure_base.cause`

<a id="hint-10"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramStepFailure_base.hint`

<a id="operation-5"></a>

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramStepFailure_base.operation`

<a id="step"></a>

##### step

> `readonly` **step**: `string`

###### Inherited from

`ProgramStepFailure_base.step`

***

<a id="programsuspended"></a>

### ProgramSuspended

#### Extends

- `ProgramSuspended_base`

#### Constructors

<a id="constructor-12"></a>

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

<a id="hint-11"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramSuspended_base.hint`

<a id="operation-6"></a>

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramSuspended_base.operation`

<a id="reason-2"></a>

##### reason

> `readonly` **reason**: `"agent"` \| `"step"` \| `"approval"` \| `"tool-wait"`

###### Inherited from

`ProgramSuspended_base.reason`

<a id="token"></a>

##### token?

> `readonly` `optional` **token?**: `string`

###### Inherited from

`ProgramSuspended_base.token`

***

<a id="programtoolfailure"></a>

### ProgramToolFailure

#### Extends

- `ProgramToolFailure_base`

#### Constructors

<a id="constructor-13"></a>

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

<a id="cause-4"></a>

##### cause

> `readonly` **cause**: `unknown`

###### Inherited from

`ProgramToolFailure_base.cause`

<a id="hint-12"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgramToolFailure_base.hint`

<a id="operation-7"></a>

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`ProgramToolFailure_base.operation`

<a id="tool"></a>

##### tool

> `readonly` **tool**: `string`

###### Inherited from

`ProgramToolFailure_base.tool`

## Interfaces

<a id="agentfanoutinput"></a>

### AgentFanOutInput

#### Properties

<a id="members"></a>

##### members

> `readonly` **members**: readonly `AgentFanOutMember`[]

<a id="operation-8"></a>

##### operation

> `readonly` **operation**: `string`

***

<a id="agentmapinput"></a>

### AgentMapInput

#### Properties

<a id="members-1"></a>

##### members

> `readonly` **members**: readonly `AgentMapMember`[]

<a id="operation-9"></a>

##### operation

> `readonly` **operation**: `string`

<a id="selection-1"></a>

##### selection

> `readonly` **selection**: `string`

***

<a id="agentmemberresult"></a>

### AgentMemberResult

#### Properties

<a id="member"></a>

##### member

> `readonly` **member**: `string`

<a id="result"></a>

##### result

> `readonly` **result**: [`AgentRunResult`](#agentrunresult)

***

<a id="agentruninput"></a>

### AgentRunInput

#### Properties

<a id="input"></a>

##### input

> `readonly` **input**: `unknown`

<a id="operation-10"></a>

##### operation

> `readonly` **operation**: `string`

<a id="selection-2"></a>

##### selection

> `readonly` **selection**: `string`

***

<a id="agentrunresult"></a>

### AgentRunResult

#### Properties

<a id="text"></a>

##### text

> `readonly` **text**: `string`

<a id="tokenusage"></a>

##### tokenUsage

> `readonly` **tokenUsage**: `AgentTokenUsage`

<a id="turns"></a>

##### turns

> `readonly` **turns**: `number`

***

<a id="loginput"></a>

### LogInput

#### Properties

<a id="data"></a>

##### data?

> `readonly` `optional` **data?**: `JsonObject`

<a id="level"></a>

##### level

> `readonly` **level**: `"error"` \| `"debug"` \| `"info"` \| `"warn"`

<a id="message-1"></a>

##### message

> `readonly` **message**: `string`

<a id="operation-11"></a>

##### operation

> `readonly` **operation**: `string`

***

<a id="service"></a>

### Service

Encoded operations visible to sandboxed source.

#### Properties

<a id="callstep"></a>

##### callStep

> `readonly` **callStep**: (`input`) => `Effect`\<`unknown`, [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

###### Parameters

###### input

[`StepCallInput`](#stepcallinput)

###### Returns

`Effect`\<`unknown`, [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

<a id="calltool"></a>

##### callTool

> `readonly` **callTool**: (`input`) => `Effect`\<`unknown`, [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

###### Parameters

###### input

[`ToolCallInput`](#toolcallinput)

###### Returns

`Effect`\<`unknown`, [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

<a id="describetool"></a>

##### describeTool

> `readonly` **describeTool**: (`name`) => `Effect`\<[`ToolDescription`](#tooldescription), [`ProgramCapabilityMissing`](#programcapabilitymissing)\>

###### Parameters

###### name

`string`

###### Returns

`Effect`\<[`ToolDescription`](#tooldescription), [`ProgramCapabilityMissing`](#programcapabilitymissing)\>

<a id="discovertools"></a>

##### discoverTools

> `readonly` **discoverTools**: `Effect`\<readonly [`ToolSummary`](#toolsummary)[]\>

<a id="fanoutagents"></a>

##### fanOutAgents

> `readonly` **fanOutAgents**: (`input`) => `Effect`\<readonly [`AgentMemberResult`](#agentmemberresult)[], [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

###### Parameters

###### input

[`AgentFanOutInput`](#agentfanoutinput)

###### Returns

`Effect`\<readonly [`AgentMemberResult`](#agentmemberresult)[], [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

<a id="log"></a>

##### log

> `readonly` **log**: (`input`) => `Effect`\<`void`, [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

###### Parameters

###### input

[`LogInput`](#loginput)

###### Returns

`Effect`\<`void`, [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

<a id="mapagents"></a>

##### mapAgents

> `readonly` **mapAgents**: (`input`) => `Effect`\<readonly [`AgentMemberResult`](#agentmemberresult)[], [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

###### Parameters

###### input

[`AgentMapInput`](#agentmapinput)

###### Returns

`Effect`\<readonly [`AgentMemberResult`](#agentmemberresult)[], [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

<a id="runagent"></a>

##### runAgent

> `readonly` **runAgent**: (`input`) => `Effect`\<[`AgentRunResult`](#agentrunresult), [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

###### Parameters

###### input

[`AgentRunInput`](#agentruninput)

###### Returns

`Effect`\<[`AgentRunResult`](#agentrunresult), [`ProgramCapabilityMissing`](#programcapabilitymissing) \| [`ProgramCapabilityDenied`](#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](#programauthorizationfailure) \| [`ProgramSchemaFailure`](#programschemafailure) \| [`ProgramToolFailure`](#programtoolfailure) \| [`ProgramStepFailure`](#programstepfailure) \| [`ProgramAgentFailure`](#programagentfailure) \| [`ProgramBudgetExhausted`](#programbudgetexhausted) \| [`ProgramReplayDivergence`](#programreplaydivergence) \| [`ProgramOperationUnknown`](#programoperationunknown) \| [`ProgramSuspended`](#programsuspended) \| [`ProgramCancelled`](#programcancelled)\>

***

<a id="stepcallinput"></a>

### StepCallInput

#### Properties

<a id="input-1"></a>

##### input

> `readonly` **input**: `unknown`

<a id="operation-12"></a>

##### operation

> `readonly` **operation**: `string`

<a id="step-1"></a>

##### step

> `readonly` **step**: `string`

***

<a id="toolcallinput"></a>

### ToolCallInput

#### Properties

<a id="input-2"></a>

##### input

> `readonly` **input**: `unknown`

<a id="operation-13"></a>

##### operation

> `readonly` **operation**: `string`

<a id="tool-1"></a>

##### tool

> `readonly` **tool**: `string`

***

<a id="tooldescription"></a>

### ToolDescription

Focused encoded type description for one manifest-scoped tool.

#### Extends

- [`ToolSummary`](#toolsummary)

#### Properties

<a id="inputschema"></a>

##### inputSchema

> `readonly` **inputSchema**: `Json`

<a id="name"></a>

##### name

> `readonly` **name**: `string`

###### Inherited from

[`ToolSummary`](#toolsummary).[`name`](#name-1)

<a id="outputschema"></a>

##### outputSchema

> `readonly` **outputSchema**: `Json`

***

<a id="toolsummary"></a>

### ToolSummary

One manifest-scoped tool visible to Program source.

#### Extended by

- [`ToolDescription`](#tooldescription)

#### Properties

<a id="name-1"></a>

##### name

> `readonly` **name**: `string`

## Type Aliases

<a id="capabilityfailure"></a>

### CapabilityFailure

> **CapabilityFailure** = *typeof* `CapabilityFailure.Type`

Failures crossing the encoded program capability protocol.

***

<a id="loglevel"></a>

### LogLevel

> **LogLevel** = *typeof* `LogLevel.Type`

***

<a id="programmemberkey"></a>

### ProgramMemberKey

> **ProgramMemberKey** = *typeof* `ProgramMemberKey.Type`

Stable, bounded identity for one member of a map or fan-out.

***

<a id="programoperationname"></a>

### ProgramOperationName

> **ProgramOperationName** = *typeof* `ProgramOperationName.Type`

Stable, bounded, source-owned identity for one effectful operation.

## Variables

<a id="capabilityfailure-1"></a>

### CapabilityFailure

> `const` **CapabilityFailure**: `Schema.Union`\<readonly \[*typeof* [`ProgramCapabilityMissing`](#programcapabilitymissing), *typeof* [`ProgramCapabilityDenied`](#programcapabilitydenied), *typeof* [`ProgramAuthorizationFailure`](#programauthorizationfailure), *typeof* [`ProgramSchemaFailure`](#programschemafailure), *typeof* [`ProgramToolFailure`](#programtoolfailure), *typeof* [`ProgramStepFailure`](#programstepfailure), *typeof* [`ProgramAgentFailure`](#programagentfailure), *typeof* [`ProgramBudgetExhausted`](#programbudgetexhausted), *typeof* [`ProgramReplayDivergence`](#programreplaydivergence), *typeof* [`ProgramOperationUnknown`](#programoperationunknown), *typeof* [`ProgramSuspended`](#programsuspended), *typeof* [`ProgramCancelled`](#programcancelled)\]\>

Failures crossing the encoded program capability protocol.

***

<a id="loglevel-1"></a>

### LogLevel

> `const` **LogLevel**: `Schema.Literals`\<readonly \[`"debug"`, `"info"`, `"warn"`, `"error"`\]\>

***

<a id="programmemberkey-1"></a>

### ProgramMemberKey

> `const` **ProgramMemberKey**: `Schema.String`

Stable, bounded identity for one member of a map or fan-out.

***

<a id="programoperationname-1"></a>

### ProgramOperationName

> `const` **ProgramOperationName**: `Schema.String`

Stable, bounded, source-owned identity for one effectful operation.
