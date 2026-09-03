[**generalist**](../../index)

***

[generalist](../../index) / [unstable.foldkit](../index) / Chat

# Chat

## Interfaces

<a id="model"></a>

### Model

**`Experimental`**

#### Properties

<a id="connection"></a>

##### connection

> `readonly` **connection**: `"open"` \| `"disconnected"` \| `"connecting"` \| `"reconnecting"`

**`Experimental`**

<a id="draft"></a>

##### draft

> `readonly` **draft**: `string`

**`Experimental`**

<a id="entries"></a>

##### entries

> `readonly` **entries**: readonly [`ChatEntry`](#chatentry)[]

**`Experimental`**

<a id="lastseq"></a>

##### lastSeq

> `readonly` **lastSeq**: `number`

**`Experimental`**

<a id="run"></a>

##### run

> `readonly` **run**: [`RunState`](#runstate)

**`Experimental`**

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string` \| `null`

**`Experimental`**

## Type Aliases

<a id="action"></a>

### Action

> **Action** = *typeof* `ReceivedConnection.Type` \| *typeof* `OpenedSession.Type` \| *typeof* `ChangedDraft.Type` \| *typeof* `SubmittedMessage.Type` \| *typeof* `ClickedCancel.Type` \| *typeof* `ClickedApprove.Type` \| *typeof* `ClickedDeny.Type` \| *typeof* `SentUserMessage.Type` \| *typeof* `ResolvedApproval.Type` \| *typeof* `CancelledRun.Type` \| *typeof* `FailedAgentCommand.Type`

**`Experimental`**

***

<a id="chatcommand"></a>

### ChatCommand

> **ChatCommand** = `Command`\<[`Action`](#action), [`AgentCommandError`](./Connection#agentcommanderror), [`Connection`](./Connection#connection)\>

**`Experimental`**

***

<a id="chatentry"></a>

### ChatEntry

> **ChatEntry** = *typeof* `UserEntry.Type` \| *typeof* `AssistantEntry.Type` \| *typeof* `ToolEntry.Type`

**`Experimental`**

***

<a id="conversationitem"></a>

### ConversationItem

> **ConversationItem** = *typeof* `UserConversationItem.Type` \| *typeof* `AssistantConversationItem.Type` \| *typeof* `ToolConversationItem.Type` \| *typeof* `WaitingConversationItem.Type` \| *typeof* `ApprovalConversationItem.Type` \| *typeof* `FailureConversationItem.Type`

**`Experimental`**

***

<a id="messagealign"></a>

### MessageAlign

> **MessageAlign** = *typeof* `MessageAlign.Type`

**`Experimental`**

***

<a id="output"></a>

### Output

> **Output** = *typeof* `RunCompleted.Type` \| *typeof* `ApprovalRequired.Type` \| *typeof* `RunFailed.Type`

**`Experimental`**

***

<a id="promptinputstatus"></a>

### PromptInputStatus

> **PromptInputStatus** = *typeof* `PromptInputStatus.Type`

**`Experimental`**

***

<a id="runstate"></a>

### RunState

> **RunState** = *typeof* `Idle.Type` \| *typeof* `Running.Type` \| *typeof* `AwaitingApproval.Type` \| *typeof* `Failed.Type`

**`Experimental`**

***

<a id="tooloutcome"></a>

### ToolOutcome

> **ToolOutcome** = *typeof* `Pending.Type` \| *typeof* `Completed.Type`

**`Experimental`**

***

<a id="toolpendingphase"></a>

### ToolPendingPhase

> **ToolPendingPhase** = *typeof* `ToolPendingPhase.Type`

**`Experimental`**

***

<a id="toolstatus"></a>

### ToolStatus

> **ToolStatus** = *typeof* `ToolStatus.Type`

**`Experimental`**

## Variables

<a id="action-1"></a>

### Action

> **Action**: `Schema`\<[`Action`](#action)\>

**`Experimental`**

***

<a id="approvalconversationitem"></a>

### ApprovalConversationItem

> `const` **ApprovalConversationItem**: `CallableTaggedStruct`\<`"ApprovalConversationItem"`, \{ `align`: *typeof* [`MessageAlign`](#messagealign-1); `key`: *typeof* `Schema.String`; `params`: *typeof* `Schema.Unknown`; `token`: *typeof* `Schema.String`; `toolName`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

<a id="approvalrequired"></a>

### ApprovalRequired

> `const` **ApprovalRequired**: `CallableTaggedStruct`\<`"ApprovalRequired"`, `EmptyFields`\>

**`Experimental`**

***

<a id="assistantconversationitem"></a>

### AssistantConversationItem

> `const` **AssistantConversationItem**: `CallableTaggedStruct`\<`"AssistantConversationItem"`, \{ `align`: *typeof* [`MessageAlign`](#messagealign-1); `entry`: *typeof* [`AssistantEntry`](#assistantentry); `key`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

<a id="assistantentry"></a>

### AssistantEntry

> `const` **AssistantEntry**: `CallableTaggedStruct`\<`"AssistantEntry"`, *typeof* `AssistantEntryFields`\>

**`Experimental`**

***

<a id="awaitingapproval"></a>

### AwaitingApproval

> `const` **AwaitingApproval**: `CallableTaggedStruct`\<`"AwaitingApproval"`, *typeof* `AwaitingApprovalFields`\>

**`Experimental`**

***

<a id="cancelledrun"></a>

### CancelledRun

> `const` **CancelledRun**: `CallableTaggedStruct`\<`"CancelledRun"`, `EmptyFields`\>

**`Experimental`**

***

<a id="cancelrun"></a>

### CancelRun

> `const` **CancelRun**: `CommandDefinitionWithArgs`

**`Experimental`**

***

<a id="changeddraft"></a>

### ChangedDraft

> `const` **ChangedDraft**: `CallableTaggedStruct`\<`"ChangedDraft"`, *typeof* `UserEntryFields`\>

**`Experimental`**

***

<a id="chatentry-1"></a>

### ChatEntry

> **ChatEntry**: `Schema`\<[`ChatEntry`](#chatentry)\>

**`Experimental`**

***

<a id="clickedapprove"></a>

### ClickedApprove

> `const` **ClickedApprove**: `CallableTaggedStruct`\<`"ClickedApprove"`, `EmptyFields`\>

**`Experimental`**

***

<a id="clickedcancel"></a>

### ClickedCancel

> `const` **ClickedCancel**: `CallableTaggedStruct`\<`"ClickedCancel"`, `EmptyFields`\>

**`Experimental`**

***

<a id="clickeddeny"></a>

### ClickedDeny

> `const` **ClickedDeny**: `CallableTaggedStruct`\<`"ClickedDeny"`, *typeof* `ClickedDenyFields`\>

**`Experimental`**

***

<a id="conversationitem-1"></a>

### ConversationItem

> **ConversationItem**: `Schema`\<[`ConversationItem`](#conversationitem)\>

**`Experimental`**

***

<a id="conversationitems"></a>

### conversationItems

> `const` **conversationItems**: (`model`) => `ReadonlyArray`\<[`ConversationItem`](#conversationitem)\>

**`Experimental`**

#### Parameters

##### model

[`Model`](#model)

#### Returns

`ReadonlyArray`\<[`ConversationItem`](#conversationitem)\>

***

<a id="failed"></a>

### Failed

> `const` **Failed**: `CallableTaggedStruct`\<`"Failed"`, \{ `message`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

<a id="failedagentcommand"></a>

### FailedAgentCommand

> `const` **FailedAgentCommand**: `CallableTaggedStruct`\<`"FailedAgentCommand"`, \{ `error`: *typeof* [`AgentCommandError`](./Connection#agentcommanderror-1); `operation`: *typeof* [`CommandOperation`](./Connection#commandoperation-1); `reason`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

<a id="failureconversationitem"></a>

### FailureConversationItem

> `const` **FailureConversationItem**: `CallableTaggedStruct`\<`"FailureConversationItem"`, \{ `align`: *typeof* [`MessageAlign`](#messagealign-1); `key`: *typeof* `Schema.String`; `message`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

<a id="idle"></a>

### Idle

> `const` **Idle**: `CallableTaggedStruct`\<`"Idle"`, `EmptyFields`\>

**`Experimental`**

***

<a id="initialmodel"></a>

### initialModel

> `const` **initialModel**: (`sessionId?`) => [`Model`](#model)

**`Experimental`**

#### Parameters

##### sessionId?

`string` \| `null`

#### Returns

[`Model`](#model)

***

<a id="messagealign-1"></a>

### MessageAlign

> `const` **MessageAlign**: `Schema.Literals`\<readonly \[`"start"`, `"end"`\]\>

**`Experimental`**

***

<a id="model-1"></a>

### Model

> **Model**: `Schema`\<[`Model`](#model)\>

**`Experimental`**

***

<a id="openedsession"></a>

### OpenedSession

> `const` **OpenedSession**: `CallableTaggedStruct`\<`"OpenedSession"`, *typeof* `OpenedSessionFields`\>

**`Experimental`**

***

<a id="output-1"></a>

### Output

> **Output**: `Schema`\<[`Output`](#output)\>

**`Experimental`**

***

<a id="promptinputstatus-1"></a>

### PromptInputStatus

> `const` **PromptInputStatus**: `Schema.Literals`\<readonly \[`"idle"`, `"submitted"`, `"streaming"`, `"error"`\]\>

**`Experimental`**

***

<a id="promptinputstatusof"></a>

### promptInputStatusOf

> `const` **promptInputStatusOf**: (`run`) => [`PromptInputStatus`](#promptinputstatus)

**`Experimental`**

#### Parameters

##### run

[`RunState`](#runstate)

#### Returns

[`PromptInputStatus`](#promptinputstatus)

***

<a id="receivedconnection"></a>

### ReceivedConnection

> `const` **ReceivedConnection**: `CallableTaggedStruct`\<`"ReceivedConnection"`, *typeof* `ReceivedConnectionFields`\>

**`Experimental`**

***

<a id="resolveapproval"></a>

### ResolveApproval

> `const` **ResolveApproval**: `CommandDefinitionWithArgs`

**`Experimental`**

***

<a id="resolvedapproval"></a>

### ResolvedApproval

> `const` **ResolvedApproval**: `CallableTaggedStruct`\<`"ResolvedApproval"`, `EmptyFields`\>

**`Experimental`**

***

<a id="runcompleted"></a>

### RunCompleted

> `const` **RunCompleted**: `CallableTaggedStruct`\<`"RunCompleted"`, *typeof* `RunCompletedFields`\>

**`Experimental`**

***

<a id="runfailed"></a>

### RunFailed

> `const` **RunFailed**: `CallableTaggedStruct`\<`"RunFailed"`, \{ `message`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

<a id="running"></a>

### Running

> `const` **Running**: `CallableTaggedStruct`\<`"Running"`, *typeof* `RunningFields`\>

**`Experimental`**

***

<a id="runstate-1"></a>

### RunState

> **RunState**: `Schema`\<[`RunState`](#runstate)\>

**`Experimental`**

***

<a id="sendusermessage"></a>

### SendUserMessage

> `const` **SendUserMessage**: `CommandDefinitionWithArgs`

**`Experimental`**

***

<a id="sentusermessage"></a>

### SentUserMessage

> `const` **SentUserMessage**: `CallableTaggedStruct`\<`"SentUserMessage"`, `EmptyFields`\>

**`Experimental`**

***

<a id="submittedmessage"></a>

### SubmittedMessage

> `const` **SubmittedMessage**: `CallableTaggedStruct`\<`"SubmittedMessage"`, `EmptyFields`\>

**`Experimental`**

***

<a id="subscriptions"></a>

### subscriptions

> `const` **subscriptions**: `object`

**`Experimental`**

#### Type Declaration

<a id="agentframes"></a>

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

<a id="toolconversationitem"></a>

### ToolConversationItem

> `const` **ToolConversationItem**: `CallableTaggedStruct`\<`"ToolConversationItem"`, \{ `align`: *typeof* [`MessageAlign`](#messagealign-1); `entry`: *typeof* [`ToolEntry`](#toolentry); `input`: *typeof* `Schema.String`; `key`: *typeof* `Schema.String`; `status`: *typeof* [`ToolStatus`](#toolstatus-1); \}\>

**`Experimental`**

***

<a id="toolentry"></a>

### ToolEntry

> `const` **ToolEntry**: `CallableTaggedStruct`\<`"ToolEntry"`, *typeof* `ToolEntryFields`\>

**`Experimental`**

***

<a id="tooloutcome-1"></a>

### ToolOutcome

> **ToolOutcome**: `Schema`\<[`ToolOutcome`](#tooloutcome)\>

**`Experimental`**

***

<a id="toolpendingphase-1"></a>

### ToolPendingPhase

> `const` **ToolPendingPhase**: `Schema.Literals`\<readonly \[`"called"`, `"executing"`\]\>

**`Experimental`**

***

<a id="toolstatus-1"></a>

### ToolStatus

> `const` **ToolStatus**: `Schema.Literals`\<readonly \[`"input-available"`, `"output-available"`, `"output-error"`\]\>

**`Experimental`**

***

<a id="toolstatusof"></a>

### toolStatusOf

> `const` **toolStatusOf**: (`entry`) => [`ToolStatus`](#toolstatus)

**`Experimental`**

#### Parameters

##### entry

*typeof* `ToolEntry.Type`

#### Returns

[`ToolStatus`](#toolstatus)

***

<a id="update"></a>

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

<a id="userconversationitem"></a>

### UserConversationItem

> `const` **UserConversationItem**: `CallableTaggedStruct`\<`"UserConversationItem"`, \{ `align`: *typeof* [`MessageAlign`](#messagealign-1); `entry`: *typeof* [`UserEntry`](#userentry); `key`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

<a id="userentry"></a>

### UserEntry

> `const` **UserEntry**: `CallableTaggedStruct`\<`"UserEntry"`, *typeof* `UserEntryFields`\>

**`Experimental`**

***

<a id="waitingconversationitem"></a>

### WaitingConversationItem

> `const` **WaitingConversationItem**: `CallableTaggedStruct`\<`"WaitingConversationItem"`, \{ `align`: *typeof* [`MessageAlign`](#messagealign-1); `key`: *typeof* `Schema.String`; \}\>

**`Experimental`**
