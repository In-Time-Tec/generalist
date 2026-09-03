[**generalist**](./index)

***

[generalist](./index) / hooks

# hooks

## Classes

<a id="hookfailed"></a>

### HookFailed

A lifecycle hook failed instead of returning a decision.

#### Extends

- `HookFailed_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new HookFailed**(...`args`): [`HookFailed`](#hookfailed)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`HookFailed`](#hookfailed)

###### Inherited from

`HookFailed_base.constructor`

#### Properties

<a id="cause"></a>

##### cause

> `readonly` **cause**: `unknown`

###### Inherited from

`HookFailed_base.cause`

<a id="event"></a>

##### event

> `readonly` **event**: `"RunStart"` \| `"TurnStart"` \| `"ModelCall"` \| `"ToolCall"` \| `"ToolResult"` \| `"ApprovalRequest"` \| `"Compaction"` \| `"ChildStart"` \| `"ChildEnd"` \| `"Steer"` \| `"RunEnd"`

###### Inherited from

`HookFailed_base.event`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`HookFailed_base.hint`

***

<a id="hooks"></a>

### Hooks

Optional ordered lifecycle interceptor service.

#### Extends

- `Hooks_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new Hooks**(`_`): [`Hooks`](#hooks)

###### Parameters

###### \_

`never`

###### Returns

[`Hooks`](#hooks)

###### Inherited from

`Hooks_base.constructor`

## Interfaces

<a id="addcontext"></a>

### AddContext

Append prompt context at a prompt-bearing boundary.

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"AddContext"`

<a id="prompt"></a>

##### prompt

> `readonly` **prompt**: `Prompt`

***

<a id="approval"></a>

### Approval

Stable approval identity exposed before Approvals resolves it.

#### Properties

<a id="approvalid"></a>

##### approvalId

> `readonly` **approvalId**: `string`

<a id="capability"></a>

##### capability

> `readonly` **capability**: `string`

<a id="input"></a>

##### input

> `readonly` **input**: `unknown`

<a id="operation"></a>

##### operation

> `readonly` **operation**: `string`

***

<a id="approvalrequestinput"></a>

### ApprovalRequestInput

Input observed before an approval request is resolved.

#### Extends

- `RunContext`

#### Properties

<a id="agentname"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

<a id="call"></a>

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

<a id="request"></a>

##### request

> `readonly` **request**: [`Approval`](#approval)

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="ask"></a>

### Ask

Defer the guarded operation to the configured Approvals service.

#### Properties

<a id="_tag-1"></a>

##### \_tag

> `readonly` **\_tag**: `"Ask"`

***

<a id="block"></a>

### Block

Stop the guarded operation before it crosses its boundary.

#### Properties

<a id="_tag-2"></a>

##### \_tag

> `readonly` **\_tag**: `"Block"`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `string`

***

<a id="child"></a>

### Child

Process-local or durable child identity exposed to child hooks.

#### Properties

<a id="childrunid"></a>

##### childRunId?

> `readonly` `optional` **childRunId?**: `string`

<a id="label"></a>

##### label?

> `readonly` `optional` **label?**: `string`

<a id="operation-1"></a>

##### operation

> `readonly` **operation**: `string`

<a id="prompt-1"></a>

##### prompt?

> `readonly` `optional` **prompt?**: `Prompt`

<a id="selection"></a>

##### selection

> `readonly` **selection**: `string`

***

<a id="childendinput"></a>

### ChildEndInput

Input observed after a child reaches a result visible to its parent.

#### Extends

- `RunContext`

#### Properties

<a id="agentname-1"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

<a id="child-1"></a>

##### child

> `readonly` **child**: [`Child`](#child)

<a id="result"></a>

##### result

> `readonly` **result**: `unknown`

<a id="runid-1"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

<a id="turn-1"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="childstartinput"></a>

### ChildStartInput

Input observed before a child is started or admitted.

#### Extends

- `RunContext`

#### Properties

<a id="agentname-2"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

<a id="child-2"></a>

##### child

> `readonly` **child**: [`Child`](#child)

<a id="runid-2"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

<a id="turn-2"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="compactioninput"></a>

### CompactionInput

Input observed when the loop has decided to attempt compaction.

#### Extends

- `RunContext`

#### Properties

<a id="agentname-3"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

<a id="before"></a>

##### before

> `readonly` **before**: `Prompt`

<a id="overflow"></a>

##### overflow

> `readonly` **overflow**: `boolean`

<a id="runid-3"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

<a id="turn-3"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="continue"></a>

### Continue

Continue the guarded operation unchanged.

#### Properties

<a id="_tag-3"></a>

##### \_tag

> `readonly` **\_tag**: `"Continue"`

***

<a id="declaration"></a>

### Declaration

Plugin-facing type-erased declaration shape accepted by Hooks.layer.

#### Properties

<a id="event-1"></a>

##### event

> `readonly` **event**: `"RunStart"` \| `"TurnStart"` \| `"ModelCall"` \| `"ToolCall"` \| `"ToolResult"` \| `"ApprovalRequest"` \| `"Compaction"` \| `"ChildStart"` \| `"ChildEnd"` \| `"Steer"` \| `"RunEnd"`

<a id="hook"></a>

##### hook

> `readonly` **hook**: [`Hook`](#hook-1)\<`never`\>

***

<a id="modelcallinput"></a>

### ModelCallInput

Input observed at the ModelMiddleware prompt boundary.

#### Extends

- `RunContext`

#### Properties

<a id="agentname-4"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

<a id="prompt-2"></a>

##### prompt

> `readonly` **prompt**: `Prompt`

<a id="runid-4"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

<a id="turn-4"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="replace"></a>

### Replace

Replace the event-specific mutable value.

#### Type Parameters

##### Value

`Value` = `unknown`

#### Properties

<a id="_tag-4"></a>

##### \_tag

> `readonly` **\_tag**: `"Replace"`

<a id="value-1"></a>

##### value

> `readonly` **value**: `Value`

***

<a id="runendinput"></a>

### RunEndInput

Input observed immediately before the terminal Completed event.

#### Extends

- `RunContext`

#### Type Parameters

##### Output

`Output` = `unknown`

#### Properties

<a id="agentname-5"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

<a id="output-1"></a>

##### output

> `readonly` **output**: `Output`

<a id="runid-5"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

<a id="text"></a>

##### text

> `readonly` **text**: `string`

<a id="transcript"></a>

##### transcript

> `readonly` **transcript**: `Prompt`

<a id="turns"></a>

##### turns

> `readonly` **turns**: `number`

***

<a id="runstartinput"></a>

### RunStartInput

Input observed before a Run begins.

#### Extends

- `RunContext`

#### Properties

<a id="agentname-6"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

<a id="input-1"></a>

##### input

> `readonly` **input**: `Prompt`

<a id="runid-6"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

***

<a id="service"></a>

### Service

Ordered lifecycle hook declarations for one Agent execution context.

#### Properties

<a id="declarations"></a>

##### declarations

> `readonly` **declarations**: readonly [`Declaration`](#declaration)[]

***

<a id="steerinput"></a>

### SteerInput

Input observed when queued steering enters the next prompt.

#### Extends

- `RunContext`

#### Properties

<a id="agentname-7"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

<a id="count"></a>

##### count

> `readonly` **count**: `number`

<a id="prompt-3"></a>

##### prompt

> `readonly` **prompt**: `Prompt`

<a id="queue"></a>

##### queue

> `readonly` **queue**: `"steering"` \| `"followUp"`

<a id="runid-7"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

<a id="turn-5"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="toolcallinput"></a>

### ToolCallInput

Input observed before authorization and tool execution.

#### Extends

- `RunContext`

#### Properties

<a id="agentname-8"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

<a id="args"></a>

##### args

> `readonly` **args**: `unknown`

<a id="call-1"></a>

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

<a id="runid-8"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

<a id="tool"></a>

##### tool

> `readonly` **tool**: `string`

<a id="turn-6"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="toolresultinput"></a>

### ToolResultInput

Input observed after tool execution and before its result is committed.

#### Extends

- `RunContext`

#### Properties

<a id="agentname-9"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

<a id="args-1"></a>

##### args

> `readonly` **args**: `unknown`

<a id="call-2"></a>

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

<a id="result-1"></a>

##### result

> `readonly` **result**: `unknown`

<a id="runid-9"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

<a id="tool-1"></a>

##### tool

> `readonly` **tool**: `string`

<a id="turn-7"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="turnstartinput"></a>

### TurnStartInput

Input observed before one zero-based turn begins.

#### Extends

- `RunContext`

#### Properties

<a id="agentname-10"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

<a id="prompt-4"></a>

##### prompt

> `readonly` **prompt**: `Prompt`

<a id="runid-10"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

<a id="turn-8"></a>

##### turn

> `readonly` **turn**: `number`

## Type Aliases

<a id="approvalrequest"></a>

### ApprovalRequest

> **ApprovalRequest** = `HookDeclaration`\<`"ApprovalRequest"`, [`ApprovalRequestInput`](#approvalrequestinput), `ApprovalDecision`\>

***

<a id="checkpoint"></a>

### Checkpoint

> **Checkpoint** = *typeof* `Checkpoint.Type`

**`Internal`**

One completed declaration chain stored in the driver checkpoint.

***

<a id="childend"></a>

### ChildEnd

> **ChildEnd** = `HookDeclaration`\<`"ChildEnd"`, [`ChildEndInput`](#childendinput), `ChildEndDecision`\>

***

<a id="childstart"></a>

### ChildStart

> **ChildStart** = `HookDeclaration`\<`"ChildStart"`, [`ChildStartInput`](#childstartinput), `ChildStartDecision`\>

***

<a id="compaction"></a>

### Compaction

> **Compaction** = `HookDeclaration`\<`"Compaction"`, [`CompactionInput`](#compactioninput), `PromptDecision`\>

***

<a id="decision"></a>

### Decision

> **Decision**\<`Value`\> = [`Continue`](#continue) \| [`Block`](#block) \| [`Replace`](#replace)\<`Value`\> \| [`AddContext`](#addcontext) \| [`Ask`](#ask)

Serializable decision recorded in the durable driver checkpoint.

#### Type Parameters

##### Value

`Value` = `unknown`

***

<a id="event-2"></a>

### Event

> **Event** = *typeof* `Event.Type`

Typed lifecycle boundary exposed to a hook declaration.

***

<a id="hook-1"></a>

### Hook

> **Hook**\<`Input`, `HookDecision`\> = (`input`) => `Effect.Effect`\<`HookDecision` \| `void`, `unknown`\>

One Effectful typed lifecycle interceptor. `void` is shorthand for Continue.

#### Type Parameters

##### Input

`Input`

##### HookDecision

`HookDecision` *extends* [`Decision`](#decision) = [`Decision`](#decision)

#### Parameters

##### input

`Input`

#### Returns

`Effect.Effect`\<`HookDecision` \| `void`, `unknown`\>

***

<a id="modelcall"></a>

### ModelCall

> **ModelCall** = `HookDeclaration`\<`"ModelCall"`, [`ModelCallInput`](#modelcallinput), `PromptDecision`\>

***

<a id="runend"></a>

### RunEnd

> **RunEnd**\<`Output`\> = `HookDeclaration`\<`"RunEnd"`, [`RunEndInput`](#runendinput)\<`Output`\>, `RunEndDecision`\<`Output`\>\>

#### Type Parameters

##### Output

`Output` = `unknown`

***

<a id="runstart"></a>

### RunStart

> **RunStart** = `HookDeclaration`\<`"RunStart"`, [`RunStartInput`](#runstartinput), `PromptDecision`\>

***

<a id="steer"></a>

### Steer

> **Steer** = `HookDeclaration`\<`"Steer"`, [`SteerInput`](#steerinput), `PromptDecision`\>

***

<a id="toolcall"></a>

### ToolCall

> **ToolCall** = `HookDeclaration`\<`"ToolCall"`, [`ToolCallInput`](#toolcallinput), `ToolCallDecision`\>

***

<a id="toolresult"></a>

### ToolResult

> **ToolResult** = `HookDeclaration`\<`"ToolResult"`, [`ToolResultInput`](#toolresultinput), `ToolResultDecision`\>

***

<a id="turnstart"></a>

### TurnStart

> **TurnStart** = `HookDeclaration`\<`"TurnStart"`, [`TurnStartInput`](#turnstartinput), `PromptDecision`\>

## Variables

<a id="addcontext-1"></a>

### AddContext

> **AddContext**: (`prompt`) => [`AddContext`](#addcontext)

Append context to the prompt at a prompt-bearing boundary.

#### Parameters

##### prompt

`RawInput`

#### Returns

[`AddContext`](#addcontext)

***

<a id="ask-1"></a>

### Ask

> **Ask**: () => [`Ask`](#ask)

Defer the guarded operation to the configured Approvals service.

#### Returns

[`Ask`](#ask)

***

<a id="block-1"></a>

### Block

> **Block**: (`input`) => [`Block`](#block)

Stop the guarded operation before it crosses its boundary.

#### Parameters

##### input

###### reason

`string`

#### Returns

[`Block`](#block)

***

<a id="checkpoint-1"></a>

### Checkpoint

> `const` **Checkpoint**: `Schema.Struct`\<\{ `complete`: `Schema.Boolean`; `decisions`: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Continue"`, \{ \}\>, `Schema.TaggedStruct`\<`"Block"`, \{ `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Replace"`, \{ `value`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"AddContext"`, \{ `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; \}\>, `Schema.TaggedStruct`\<`"Ask"`, \{ \}\>\]\>\>; `event`: `Schema.Literals`\<readonly \[`"RunStart"`, `"TurnStart"`, `"ModelCall"`, `"ToolCall"`, `"ToolResult"`, `"ApprovalRequest"`, `"Compaction"`, `"ChildStart"`, `"ChildEnd"`, `"Steer"`, `"RunEnd"`\]\>; `key`: `Schema.String`; \}\>

**`Internal`**

One completed declaration chain stored in the driver checkpoint.

***

<a id="continue-1"></a>

### Continue

> **Continue**: () => [`Continue`](#continue)

Continue the guarded operation unchanged.

#### Returns

[`Continue`](#continue)

***

<a id="decision-1"></a>

### Decision

> `const` **Decision**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Continue"`, \{ \}\>, `Schema.TaggedStruct`\<`"Block"`, \{ `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Replace"`, \{ `value`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"AddContext"`, \{ `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; \}\>, `Schema.TaggedStruct`\<`"Ask"`, \{ \}\>\]\>

Serializable decision recorded in the durable driver checkpoint.

***

<a id="event-3"></a>

### Event

> `const` **Event**: `Schema.Literals`\<readonly \[`"RunStart"`, `"TurnStart"`, `"ModelCall"`, `"ToolCall"`, `"ToolResult"`, `"ApprovalRequest"`, `"Compaction"`, `"ChildStart"`, `"ChildEnd"`, `"Steer"`, `"RunEnd"`\]\>

Typed lifecycle boundary exposed to a hook declaration.

***

<a id="layer"></a>

### layer

> `const` **layer**: (`declarations`) => `Layer.Layer`\<[`Hooks`](#hooks)\>

Provide an explicit ordered hook declaration list.

#### Parameters

##### declarations

`ReadonlyArray`\<[`Declaration`](#declaration)\>

#### Returns

`Layer.Layer`\<[`Hooks`](#hooks)\>

***

<a id="layeridentity"></a>

### layerIdentity

> `const` **layerIdentity**: `Layer.Layer`\<[`Hooks`](#hooks)\>

Explicit empty hook chain. Omitting Hooks has the same behavior.

***

<a id="onapprovalrequest"></a>

### onApprovalRequest

> `const` **onApprovalRequest**: (`hook`) => [`ApprovalRequest`](#approvalrequest)

#### Parameters

##### hook

[`ApprovalRequest`](#approvalrequest)\[`"hook"`\]

#### Returns

[`ApprovalRequest`](#approvalrequest)

***

<a id="onchildend"></a>

### onChildEnd

> `const` **onChildEnd**: (`hook`) => [`ChildEnd`](#childend)

#### Parameters

##### hook

[`ChildEnd`](#childend)\[`"hook"`\]

#### Returns

[`ChildEnd`](#childend)

***

<a id="onchildstart"></a>

### onChildStart

> `const` **onChildStart**: (`hook`) => [`ChildStart`](#childstart)

#### Parameters

##### hook

[`ChildStart`](#childstart)\[`"hook"`\]

#### Returns

[`ChildStart`](#childstart)

***

<a id="oncompaction"></a>

### onCompaction

> `const` **onCompaction**: (`hook`) => [`Compaction`](#compaction)

#### Parameters

##### hook

[`Compaction`](#compaction)\[`"hook"`\]

#### Returns

[`Compaction`](#compaction)

***

<a id="onmodelcall"></a>

### onModelCall

> `const` **onModelCall**: (`hook`) => [`ModelCall`](#modelcall)

#### Parameters

##### hook

[`ModelCall`](#modelcall)\[`"hook"`\]

#### Returns

[`ModelCall`](#modelcall)

***

<a id="onrunend"></a>

### onRunEnd

> `const` **onRunEnd**: \<`Output`\>(`hook`) => [`RunEnd`](#runend)\<`Output`\>

#### Type Parameters

##### Output

`Output` = `unknown`

#### Parameters

##### hook

[`RunEnd`](#runend)\<`Output`\>\[`"hook"`\]

#### Returns

[`RunEnd`](#runend)\<`Output`\>

***

<a id="onrunstart"></a>

### onRunStart

> `const` **onRunStart**: (`hook`) => [`RunStart`](#runstart)

#### Parameters

##### hook

[`RunStart`](#runstart)\[`"hook"`\]

#### Returns

[`RunStart`](#runstart)

***

<a id="onsteer"></a>

### onSteer

> `const` **onSteer**: (`hook`) => [`Steer`](#steer)

#### Parameters

##### hook

[`Steer`](#steer)\[`"hook"`\]

#### Returns

[`Steer`](#steer)

***

<a id="ontoolcall"></a>

### onToolCall

> `const` **onToolCall**: (`hook`) => [`ToolCall`](#toolcall)

#### Parameters

##### hook

[`ToolCall`](#toolcall)\[`"hook"`\]

#### Returns

[`ToolCall`](#toolcall)

***

<a id="ontoolresult"></a>

### onToolResult

> `const` **onToolResult**: (`hook`) => [`ToolResult`](#toolresult)

#### Parameters

##### hook

[`ToolResult`](#toolresult)\[`"hook"`\]

#### Returns

[`ToolResult`](#toolresult)

***

<a id="onturnstart"></a>

### onTurnStart

> `const` **onTurnStart**: (`hook`) => [`TurnStart`](#turnstart)

#### Parameters

##### hook

[`TurnStart`](#turnstart)\[`"hook"`\]

#### Returns

[`TurnStart`](#turnstart)

***

<a id="replace-1"></a>

### Replace

> **Replace**: \<`Value`\>(`value`) => [`Replace`](#replace)\<`Value`\>

Replace the event-specific mutable value.

#### Type Parameters

##### Value

`Value`

#### Parameters

##### value

`Value`

#### Returns

[`Replace`](#replace)\<`Value`\>
