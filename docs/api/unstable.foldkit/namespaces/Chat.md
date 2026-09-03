[**generalist**](../../index)

***

[generalist](../../index) / [unstable.foldkit](../index) / Chat

# Chat

## Interfaces

### Model

**`Experimental`**

#### Properties

##### connection

> `readonly` **connection**: `"open"` \| `"disconnected"` \| `"connecting"` \| `"reconnecting"`

**`Experimental`**

##### draft

> `readonly` **draft**: `string`

**`Experimental`**

##### entries

> `readonly` **entries**: readonly [`ChatEntry`](#chatentry)[]

**`Experimental`**

##### lastSeq

> `readonly` **lastSeq**: `number`

**`Experimental`**

##### run

> `readonly` **run**: [`RunState`](#runstate)

**`Experimental`**

##### sessionId

> `readonly` **sessionId**: `string` \| `null`

**`Experimental`**

## Type Aliases

### Action

> **Action** = *typeof* `ReceivedConnection.Type` \| *typeof* `OpenedSession.Type` \| *typeof* `ChangedDraft.Type` \| *typeof* `SubmittedMessage.Type` \| *typeof* `ClickedCancel.Type` \| *typeof* `ClickedApprove.Type` \| *typeof* `ClickedDeny.Type` \| *typeof* `SentUserMessage.Type` \| *typeof* `ResolvedApproval.Type` \| *typeof* `CancelledRun.Type` \| *typeof* `FailedAgentCommand.Type`

**`Experimental`**

***

### ChatCommand

> **ChatCommand** = `Command`\<[`Action`](#action), [`AgentCommandError`](./Connection#agentcommanderror), [`Connection`](./Connection#connection)\>

**`Experimental`**

***

### ChatEntry

> **ChatEntry** = *typeof* `UserEntry.Type` \| *typeof* `AssistantEntry.Type` \| *typeof* `ToolEntry.Type`

**`Experimental`**

***

### ConversationItem

> **ConversationItem** = *typeof* `UserConversationItem.Type` \| *typeof* `AssistantConversationItem.Type` \| *typeof* `ToolConversationItem.Type` \| *typeof* `WaitingConversationItem.Type` \| *typeof* `ApprovalConversationItem.Type` \| *typeof* `FailureConversationItem.Type`

**`Experimental`**

***

### MessageAlign

> **MessageAlign** = *typeof* `MessageAlign.Type`

**`Experimental`**

***

### Output

> **Output** = *typeof* `RunCompleted.Type` \| *typeof* `ApprovalRequired.Type` \| *typeof* `RunFailed.Type`

**`Experimental`**

***

### PromptInputStatus

> **PromptInputStatus** = *typeof* `PromptInputStatus.Type`

**`Experimental`**

***

### RunState

> **RunState** = *typeof* `Idle.Type` \| *typeof* `Running.Type` \| *typeof* `AwaitingApproval.Type` \| *typeof* `Failed.Type`

**`Experimental`**

***

### ToolOutcome

> **ToolOutcome** = *typeof* `Pending.Type` \| *typeof* `Completed.Type`

**`Experimental`**

***

### ToolPendingPhase

> **ToolPendingPhase** = *typeof* `ToolPendingPhase.Type`

**`Experimental`**

***

### ToolStatus

> **ToolStatus** = *typeof* `ToolStatus.Type`

**`Experimental`**

## Variables

### Action

> **Action**: `Schema`\<[`Action`](#action)\>

**`Experimental`**

***

### ApprovalConversationItem

> `const` **ApprovalConversationItem**: `CallableTaggedStruct`\<`"ApprovalConversationItem"`, \{ `align`: *typeof* [`MessageAlign`](#messagealign-1); `key`: *typeof* `Schema.String`; `params`: *typeof* `Schema.Unknown`; `token`: *typeof* `Schema.String`; `toolName`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

### ApprovalRequired

> `const` **ApprovalRequired**: `CallableTaggedStruct`\<`"ApprovalRequired"`, `EmptyFields`\>

**`Experimental`**

***

### AssistantConversationItem

> `const` **AssistantConversationItem**: `CallableTaggedStruct`\<`"AssistantConversationItem"`, \{ `align`: *typeof* [`MessageAlign`](#messagealign-1); `entry`: *typeof* [`AssistantEntry`](#assistantentry); `key`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

### AssistantEntry

> `const` **AssistantEntry**: `CallableTaggedStruct`\<`"AssistantEntry"`, *typeof* `AssistantEntryFields`\>

**`Experimental`**

***

### AwaitingApproval

> `const` **AwaitingApproval**: `CallableTaggedStruct`\<`"AwaitingApproval"`, *typeof* `AwaitingApprovalFields`\>

**`Experimental`**

***

### CancelledRun

> `const` **CancelledRun**: `CallableTaggedStruct`\<`"CancelledRun"`, `EmptyFields`\>

**`Experimental`**

***

### CancelRun

> `const` **CancelRun**: `CommandDefinitionWithArgs`

**`Experimental`**

***

### ChangedDraft

> `const` **ChangedDraft**: `CallableTaggedStruct`\<`"ChangedDraft"`, *typeof* `UserEntryFields`\>

**`Experimental`**

***

### ChatEntry

> **ChatEntry**: `Schema`\<[`ChatEntry`](#chatentry)\>

**`Experimental`**

***

### ClickedApprove

> `const` **ClickedApprove**: `CallableTaggedStruct`\<`"ClickedApprove"`, `EmptyFields`\>

**`Experimental`**

***

### ClickedCancel

> `const` **ClickedCancel**: `CallableTaggedStruct`\<`"ClickedCancel"`, `EmptyFields`\>

**`Experimental`**

***

### ClickedDeny

> `const` **ClickedDeny**: `CallableTaggedStruct`\<`"ClickedDeny"`, *typeof* `ClickedDenyFields`\>

**`Experimental`**

***

### ConversationItem

> **ConversationItem**: `Schema`\<[`ConversationItem`](#conversationitem)\>

**`Experimental`**

***

### conversationItems

> `const` **conversationItems**: (`model`) => `ReadonlyArray`\<[`ConversationItem`](#conversationitem)\>

**`Experimental`**

#### Parameters

##### model

[`Model`](#model)

#### Returns

`ReadonlyArray`\<[`ConversationItem`](#conversationitem)\>

***

### Failed

> `const` **Failed**: `CallableTaggedStruct`\<`"Failed"`, \{ `message`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

### FailedAgentCommand

> `const` **FailedAgentCommand**: `CallableTaggedStruct`\<`"FailedAgentCommand"`, \{ `error`: *typeof* [`AgentCommandError`](./Connection#agentcommanderror-1); `operation`: *typeof* [`CommandOperation`](./Connection#commandoperation-1); `reason`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

### FailureConversationItem

> `const` **FailureConversationItem**: `CallableTaggedStruct`\<`"FailureConversationItem"`, \{ `align`: *typeof* [`MessageAlign`](#messagealign-1); `key`: *typeof* `Schema.String`; `message`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

### Idle

> `const` **Idle**: `CallableTaggedStruct`\<`"Idle"`, `EmptyFields`\>

**`Experimental`**

***

### initialModel

> `const` **initialModel**: (`sessionId?`) => [`Model`](#model)

**`Experimental`**

#### Parameters

##### sessionId?

`string` \| `null`

#### Returns

[`Model`](#model)

***

### MessageAlign

> `const` **MessageAlign**: `Schema.Literals`\<readonly \[`"start"`, `"end"`\]\>

**`Experimental`**

***

### Model

> **Model**: `Schema`\<[`Model`](#model)\>

**`Experimental`**

***

### OpenedSession

> `const` **OpenedSession**: `CallableTaggedStruct`\<`"OpenedSession"`, *typeof* `OpenedSessionFields`\>

**`Experimental`**

***

### Output

> **Output**: `Schema`\<[`Output`](#output)\>

**`Experimental`**

***

### PromptInputStatus

> `const` **PromptInputStatus**: `Schema.Literals`\<readonly \[`"idle"`, `"submitted"`, `"streaming"`, `"error"`\]\>

**`Experimental`**

***

### promptInputStatusOf

> `const` **promptInputStatusOf**: (`run`) => [`PromptInputStatus`](#promptinputstatus)

**`Experimental`**

#### Parameters

##### run

[`RunState`](#runstate)

#### Returns

[`PromptInputStatus`](#promptinputstatus)

***

### ReceivedConnection

> `const` **ReceivedConnection**: `CallableTaggedStruct`\<`"ReceivedConnection"`, *typeof* `ReceivedConnectionFields`\>

**`Experimental`**

***

### ResolveApproval

> `const` **ResolveApproval**: `CommandDefinitionWithArgs`

**`Experimental`**

***

### ResolvedApproval

> `const` **ResolvedApproval**: `CallableTaggedStruct`\<`"ResolvedApproval"`, `EmptyFields`\>

**`Experimental`**

***

### RunCompleted

> `const` **RunCompleted**: `CallableTaggedStruct`\<`"RunCompleted"`, *typeof* `RunCompletedFields`\>

**`Experimental`**

***

### RunFailed

> `const` **RunFailed**: `CallableTaggedStruct`\<`"RunFailed"`, \{ `message`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

### Running

> `const` **Running**: `CallableTaggedStruct`\<`"Running"`, *typeof* `RunningFields`\>

**`Experimental`**

***

### RunState

> **RunState**: `Schema`\<[`RunState`](#runstate)\>

**`Experimental`**

***

### SendUserMessage

> `const` **SendUserMessage**: `CommandDefinitionWithArgs`

**`Experimental`**

***

### SentUserMessage

> `const` **SentUserMessage**: `CallableTaggedStruct`\<`"SentUserMessage"`, `EmptyFields`\>

**`Experimental`**

***

### SubmittedMessage

> `const` **SubmittedMessage**: `CallableTaggedStruct`\<`"SubmittedMessage"`, `EmptyFields`\>

**`Experimental`**

***

### subscriptions

> `const` **subscriptions**: `object`

**`Experimental`**

#### Type Declaration

##### agentFrames

> `readonly` **agentFrames**: `object` & `object`

###### Type Declaration

###### dependenciesSchema

> `readonly` **dependenciesSchema**: `Schema.Schema`\<\{ `afterSeq`: `number`; `sessionId`: `string` \| `null`; \}\> & `object`

###### Type Declaration

###### fields

> `readonly` **fields**: `Schema.Struct.Fields`

###### dependenciesToStream

> `readonly` **dependenciesToStream**: (`dependencies`, `readDependencies`) => `Stream.Stream`\<[`Action`](#action), `never`, [`Connection`](./Connection#connection)\>

###### Parameters

###### dependencies

###### afterSeq

`number`

###### sessionId

`string` \| `null`

###### readDependencies

() => `object`

###### Returns

`Stream.Stream`\<[`Action`](#action), `never`, [`Connection`](./Connection#connection)\>

###### keepAliveEquivalence

> `readonly` **keepAliveEquivalence**: `Equivalence.Equivalence`\<\{ `afterSeq`: `number`; `sessionId`: `string` \| `null`; \}\>

###### modelToDependencies

> `readonly` **modelToDependencies**: (`model`) => `object`

###### Parameters

###### model

[`Model`](#model)

###### Returns

`object`

###### afterSeq

> `readonly` **afterSeq**: `number`

###### sessionId

> `readonly` **sessionId**: `string` \| `null`

###### Type Declaration

###### \_\_subscription

> `readonly` **\_\_subscription**: `never`

***

### ToolConversationItem

> `const` **ToolConversationItem**: `CallableTaggedStruct`\<`"ToolConversationItem"`, \{ `align`: *typeof* [`MessageAlign`](#messagealign-1); `entry`: *typeof* [`ToolEntry`](#toolentry); `input`: *typeof* `Schema.String`; `key`: *typeof* `Schema.String`; `status`: *typeof* [`ToolStatus`](#toolstatus-1); \}\>

**`Experimental`**

***

### ToolEntry

> `const` **ToolEntry**: `CallableTaggedStruct`\<`"ToolEntry"`, *typeof* `ToolEntryFields`\>

**`Experimental`**

***

### ToolOutcome

> **ToolOutcome**: `Schema`\<[`ToolOutcome`](#tooloutcome)\>

**`Experimental`**

***

### ToolPendingPhase

> `const` **ToolPendingPhase**: `Schema.Literals`\<readonly \[`"called"`, `"executing"`\]\>

**`Experimental`**

***

### ToolStatus

> `const` **ToolStatus**: `Schema.Literals`\<readonly \[`"input-available"`, `"output-available"`, `"output-error"`\]\>

**`Experimental`**

***

### toolStatusOf

> `const` **toolStatusOf**: (`entry`) => [`ToolStatus`](#toolstatus)

**`Experimental`**

#### Parameters

##### entry

*typeof* `ToolEntry.Type`

#### Returns

[`ToolStatus`](#toolstatus)

***

### update

> `const` **update**: \{(`action`): (`model`) => readonly \[[`Model`](#model), readonly `Readonly`\<\{ \}\>[], `Option`\<[`Output`](#output)\>\]; (`model`, `action`): readonly \[[`Model`](#model), readonly `Readonly`\<\{ \}\>[], `Option`\<[`Output`](#output)\>\]; \}

**`Experimental`**

#### Call Signature

> (`action`): (`model`) => readonly \[[`Model`](#model), readonly `Readonly`\<\{ \}\>[], `Option`\<[`Output`](#output)\>\]

##### Parameters

###### action

[`Action`](#action)

##### Returns

(`model`) => readonly \[[`Model`](#model), readonly `Readonly`\<\{ \}\>[], `Option`\<[`Output`](#output)\>\]

#### Call Signature

> (`model`, `action`): readonly \[[`Model`](#model), readonly `Readonly`\<\{ \}\>[], `Option`\<[`Output`](#output)\>\]

##### Parameters

###### model

[`Model`](#model)

###### action

[`Action`](#action)

##### Returns

readonly \[[`Model`](#model), readonly `Readonly`\<\{ \}\>[], `Option`\<[`Output`](#output)\>\]

***

### UserConversationItem

> `const` **UserConversationItem**: `CallableTaggedStruct`\<`"UserConversationItem"`, \{ `align`: *typeof* [`MessageAlign`](#messagealign-1); `entry`: *typeof* [`UserEntry`](#userentry); `key`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

### UserEntry

> `const` **UserEntry**: `CallableTaggedStruct`\<`"UserEntry"`, *typeof* `UserEntryFields`\>

**`Experimental`**

***

### WaitingConversationItem

> `const` **WaitingConversationItem**: `CallableTaggedStruct`\<`"WaitingConversationItem"`, \{ `align`: *typeof* [`MessageAlign`](#messagealign-1); `key`: *typeof* `Schema.String`; \}\>

**`Experimental`**
