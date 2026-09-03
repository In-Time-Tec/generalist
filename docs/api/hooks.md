[**generalist**](./index)

***

[generalist](./index) / hooks

# hooks

## Classes

### HookFailed

A lifecycle hook failed instead of returning a decision.

#### Extends

- `HookFailed_base`

#### Constructors

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

##### cause

> `readonly` **cause**: `unknown`

###### Inherited from

`HookFailed_base.cause`

##### event

> `readonly` **event**: `"RunStart"` \| `"TurnStart"` \| `"ModelCall"` \| `"ToolCall"` \| `"ToolResult"` \| `"ApprovalRequest"` \| `"Compaction"` \| `"ChildStart"` \| `"ChildEnd"` \| `"Steer"` \| `"RunEnd"`

###### Inherited from

`HookFailed_base.event`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`HookFailed_base.hint`

***

### Hooks

Optional ordered lifecycle interceptor service.

#### Extends

- `Hooks_base`

#### Constructors

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

### AddContext

Append prompt context at a prompt-bearing boundary.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"AddContext"`

##### prompt

> `readonly` **prompt**: `Prompt`

***

### Approval

Stable approval identity exposed before Approvals resolves it.

#### Properties

##### approvalId

> `readonly` **approvalId**: `string`

##### capability

> `readonly` **capability**: `string`

##### input

> `readonly` **input**: `unknown`

##### operation

> `readonly` **operation**: `string`

***

### ApprovalRequestInput

Input observed before an approval request is resolved.

#### Extends

- `RunContext`

#### Properties

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

##### request

> `readonly` **request**: [`Approval`](#approval)

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

##### turn

> `readonly` **turn**: `number`

***

### Ask

Defer the guarded operation to the configured Approvals service.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Ask"`

***

### Block

Stop the guarded operation before it crosses its boundary.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Block"`

##### reason

> `readonly` **reason**: `string`

***

### Child

Process-local or durable child identity exposed to child hooks.

#### Properties

##### childRunId?

> `readonly` `optional` **childRunId?**: `string`

##### label?

> `readonly` `optional` **label?**: `string`

##### operation

> `readonly` **operation**: `string`

##### prompt?

> `readonly` `optional` **prompt?**: `Prompt`

##### selection

> `readonly` **selection**: `string`

***

### ChildEndInput

Input observed after a child reaches a result visible to its parent.

#### Extends

- `RunContext`

#### Properties

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

##### child

> `readonly` **child**: [`Child`](#child)

##### result

> `readonly` **result**: `unknown`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

##### turn

> `readonly` **turn**: `number`

***

### ChildStartInput

Input observed before a child is started or admitted.

#### Extends

- `RunContext`

#### Properties

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

##### child

> `readonly` **child**: [`Child`](#child)

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

##### turn

> `readonly` **turn**: `number`

***

### CompactionInput

Input observed when the loop has decided to attempt compaction.

#### Extends

- `RunContext`

#### Properties

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

##### before

> `readonly` **before**: `Prompt`

##### overflow

> `readonly` **overflow**: `boolean`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

##### turn

> `readonly` **turn**: `number`

***

### Continue

Continue the guarded operation unchanged.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Continue"`

***

### Declaration

Plugin-facing type-erased declaration shape accepted by Hooks.layer.

#### Properties

##### event

> `readonly` **event**: `"RunStart"` \| `"TurnStart"` \| `"ModelCall"` \| `"ToolCall"` \| `"ToolResult"` \| `"ApprovalRequest"` \| `"Compaction"` \| `"ChildStart"` \| `"ChildEnd"` \| `"Steer"` \| `"RunEnd"`

##### hook

> `readonly` **hook**: [`Hook`](#hook-1)\<`never`\>

***

### ModelCallInput

Input observed at the ModelMiddleware prompt boundary.

#### Extends

- `RunContext`

#### Properties

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

##### prompt

> `readonly` **prompt**: `Prompt`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

##### turn

> `readonly` **turn**: `number`

***

### Replace

Replace the event-specific mutable value.

#### Type Parameters

##### Value

`Value` = `unknown`

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Replace"`

##### value

> `readonly` **value**: `Value`

***

### RunEndInput

Input observed immediately before the terminal Completed event.

#### Extends

- `RunContext`

#### Type Parameters

##### Output

`Output` = `unknown`

#### Properties

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

##### output

> `readonly` **output**: `Output`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

##### text

> `readonly` **text**: `string`

##### transcript

> `readonly` **transcript**: `Prompt`

##### turns

> `readonly` **turns**: `number`

***

### RunStartInput

Input observed before a Run begins.

#### Extends

- `RunContext`

#### Properties

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

##### input

> `readonly` **input**: `Prompt`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

***

### Service

Ordered lifecycle hook declarations for one Agent execution context.

#### Properties

##### declarations

> `readonly` **declarations**: readonly [`Declaration`](#declaration)[]

***

### SteerInput

Input observed when queued steering enters the next prompt.

#### Extends

- `RunContext`

#### Properties

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

##### count

> `readonly` **count**: `number`

##### prompt

> `readonly` **prompt**: `Prompt`

##### queue

> `readonly` **queue**: `"steering"` \| `"followUp"`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

##### turn

> `readonly` **turn**: `number`

***

### ToolCallInput

Input observed before authorization and tool execution.

#### Extends

- `RunContext`

#### Properties

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

##### args

> `readonly` **args**: `unknown`

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

##### tool

> `readonly` **tool**: `string`

##### turn

> `readonly` **turn**: `number`

***

### ToolResultInput

Input observed after tool execution and before its result is committed.

#### Extends

- `RunContext`

#### Properties

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

##### args

> `readonly` **args**: `unknown`

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

##### result

> `readonly` **result**: `unknown`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

##### tool

> `readonly` **tool**: `string`

##### turn

> `readonly` **turn**: `number`

***

### TurnStartInput

Input observed before one zero-based turn begins.

#### Extends

- `RunContext`

#### Properties

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

`RunContext.agentName`

##### prompt

> `readonly` **prompt**: `Prompt`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunContext.runId`

##### turn

> `readonly` **turn**: `number`

## Type Aliases

### ApprovalRequest

> **ApprovalRequest** = `HookDeclaration`\<`"ApprovalRequest"`, [`ApprovalRequestInput`](#approvalrequestinput), `ApprovalDecision`\>

***

### Checkpoint

> **Checkpoint** = *typeof* `Checkpoint.Type`

**`Internal`**

One completed declaration chain stored in the driver checkpoint.

***

### ChildEnd

> **ChildEnd** = `HookDeclaration`\<`"ChildEnd"`, [`ChildEndInput`](#childendinput), `ChildEndDecision`\>

***

### ChildStart

> **ChildStart** = `HookDeclaration`\<`"ChildStart"`, [`ChildStartInput`](#childstartinput), `ChildStartDecision`\>

***

### Compaction

> **Compaction** = `HookDeclaration`\<`"Compaction"`, [`CompactionInput`](#compactioninput), `PromptDecision`\>

***

### Decision

> **Decision**\<`Value`\> = [`Continue`](#continue) \| [`Block`](#block) \| [`Replace`](#replace)\<`Value`\> \| [`AddContext`](#addcontext) \| [`Ask`](#ask)

Serializable decision recorded in the durable driver checkpoint.

#### Type Parameters

##### Value

`Value` = `unknown`

***

### Event

> **Event** = *typeof* `Event.Type`

Typed lifecycle boundary exposed to a hook declaration.

***

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

### ModelCall

> **ModelCall** = `HookDeclaration`\<`"ModelCall"`, [`ModelCallInput`](#modelcallinput), `PromptDecision`\>

***

### RunEnd

> **RunEnd**\<`Output`\> = `HookDeclaration`\<`"RunEnd"`, [`RunEndInput`](#runendinput)\<`Output`\>, `RunEndDecision`\<`Output`\>\>

#### Type Parameters

##### Output

`Output` = `unknown`

***

### RunStart

> **RunStart** = `HookDeclaration`\<`"RunStart"`, [`RunStartInput`](#runstartinput), `PromptDecision`\>

***

### Steer

> **Steer** = `HookDeclaration`\<`"Steer"`, [`SteerInput`](#steerinput), `PromptDecision`\>

***

### ToolCall

> **ToolCall** = `HookDeclaration`\<`"ToolCall"`, [`ToolCallInput`](#toolcallinput), `ToolCallDecision`\>

***

### ToolResult

> **ToolResult** = `HookDeclaration`\<`"ToolResult"`, [`ToolResultInput`](#toolresultinput), `ToolResultDecision`\>

***

### TurnStart

> **TurnStart** = `HookDeclaration`\<`"TurnStart"`, [`TurnStartInput`](#turnstartinput), `PromptDecision`\>

## Variables

### AddContext

> **AddContext**: (`prompt`) => [`AddContext`](#addcontext)

Append context to the prompt at a prompt-bearing boundary.

#### Parameters

##### prompt

`RawInput`

#### Returns

[`AddContext`](#addcontext)

***

### Ask

> **Ask**: () => [`Ask`](#ask)

Defer the guarded operation to the configured Approvals service.

#### Returns

[`Ask`](#ask)

***

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

### Checkpoint

> `const` **Checkpoint**: `Schema.Struct`\<\{ `complete`: `Schema.Boolean`; `decisions`: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Continue"`, \{ \}\>, `Schema.TaggedStruct`\<`"Block"`, \{ `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Replace"`, \{ `value`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"AddContext"`, \{ `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; \}\>, `Schema.TaggedStruct`\<`"Ask"`, \{ \}\>\]\>\>; `event`: `Schema.Literals`\<readonly \[`"RunStart"`, `"TurnStart"`, `"ModelCall"`, `"ToolCall"`, `"ToolResult"`, `"ApprovalRequest"`, `"Compaction"`, `"ChildStart"`, `"ChildEnd"`, `"Steer"`, `"RunEnd"`\]\>; `key`: `Schema.String`; \}\>

**`Internal`**

One completed declaration chain stored in the driver checkpoint.

***

### Continue

> **Continue**: () => [`Continue`](#continue)

Continue the guarded operation unchanged.

#### Returns

[`Continue`](#continue)

***

### Decision

> `const` **Decision**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Continue"`, \{ \}\>, `Schema.TaggedStruct`\<`"Block"`, \{ `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Replace"`, \{ `value`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"AddContext"`, \{ `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; \}\>, `Schema.TaggedStruct`\<`"Ask"`, \{ \}\>\]\>

Serializable decision recorded in the durable driver checkpoint.

***

### Event

> `const` **Event**: `Schema.Literals`\<readonly \[`"RunStart"`, `"TurnStart"`, `"ModelCall"`, `"ToolCall"`, `"ToolResult"`, `"ApprovalRequest"`, `"Compaction"`, `"ChildStart"`, `"ChildEnd"`, `"Steer"`, `"RunEnd"`\]\>

Typed lifecycle boundary exposed to a hook declaration.

***

### layer

> `const` **layer**: (`declarations`) => `Layer.Layer`\<[`Hooks`](#hooks)\>

Provide an explicit ordered hook declaration list.

#### Parameters

##### declarations

`ReadonlyArray`\<[`Declaration`](#declaration)\>

#### Returns

`Layer.Layer`\<[`Hooks`](#hooks)\>

***

### layerIdentity

> `const` **layerIdentity**: `Layer.Layer`\<[`Hooks`](#hooks)\>

Explicit empty hook chain. Omitting Hooks has the same behavior.

***

### onApprovalRequest

> `const` **onApprovalRequest**: (`hook`) => [`ApprovalRequest`](#approvalrequest)

#### Parameters

##### hook

[`ApprovalRequest`](#approvalrequest)\[`"hook"`\]

#### Returns

[`ApprovalRequest`](#approvalrequest)

***

### onChildEnd

> `const` **onChildEnd**: (`hook`) => [`ChildEnd`](#childend)

#### Parameters

##### hook

[`ChildEnd`](#childend)\[`"hook"`\]

#### Returns

[`ChildEnd`](#childend)

***

### onChildStart

> `const` **onChildStart**: (`hook`) => [`ChildStart`](#childstart)

#### Parameters

##### hook

[`ChildStart`](#childstart)\[`"hook"`\]

#### Returns

[`ChildStart`](#childstart)

***

### onCompaction

> `const` **onCompaction**: (`hook`) => [`Compaction`](#compaction)

#### Parameters

##### hook

[`Compaction`](#compaction)\[`"hook"`\]

#### Returns

[`Compaction`](#compaction)

***

### onModelCall

> `const` **onModelCall**: (`hook`) => [`ModelCall`](#modelcall)

#### Parameters

##### hook

[`ModelCall`](#modelcall)\[`"hook"`\]

#### Returns

[`ModelCall`](#modelcall)

***

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

### onRunStart

> `const` **onRunStart**: (`hook`) => [`RunStart`](#runstart)

#### Parameters

##### hook

[`RunStart`](#runstart)\[`"hook"`\]

#### Returns

[`RunStart`](#runstart)

***

### onSteer

> `const` **onSteer**: (`hook`) => [`Steer`](#steer)

#### Parameters

##### hook

[`Steer`](#steer)\[`"hook"`\]

#### Returns

[`Steer`](#steer)

***

### onToolCall

> `const` **onToolCall**: (`hook`) => [`ToolCall`](#toolcall)

#### Parameters

##### hook

[`ToolCall`](#toolcall)\[`"hook"`\]

#### Returns

[`ToolCall`](#toolcall)

***

### onToolResult

> `const` **onToolResult**: (`hook`) => [`ToolResult`](#toolresult)

#### Parameters

##### hook

[`ToolResult`](#toolresult)\[`"hook"`\]

#### Returns

[`ToolResult`](#toolresult)

***

### onTurnStart

> `const` **onTurnStart**: (`hook`) => [`TurnStart`](#turnstart)

#### Parameters

##### hook

[`TurnStart`](#turnstart)\[`"hook"`\]

#### Returns

[`TurnStart`](#turnstart)

***

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
