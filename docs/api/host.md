[**generalist**](./index.md)

***

[generalist](./index.md) / host

# host

## Classes

<a id="agentinputinvalid"></a>

### AgentInputInvalid

An untyped Host start input did not satisfy the configured Agent's input Schema.

#### Extends

- `AgentInputInvalid_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new AgentInputInvalid**(...`args`): [`AgentInputInvalid`](#agentinputinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AgentInputInvalid`](#agentinputinvalid)

###### Inherited from

`AgentInputInvalid_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AgentInputInvalid_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`AgentInputInvalid_base.message`

<a id="name"></a>

##### name

> `readonly` **name**: `string`

###### Inherited from

`AgentInputInvalid_base.name`

***

<a id="agentnotregistered"></a>

### AgentNotRegistered

A Run start used an Agent that was not configured on this host.

#### Extends

- `AgentNotRegistered_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new AgentNotRegistered**(...`args`): [`AgentNotRegistered`](#agentnotregistered)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AgentNotRegistered`](#agentnotregistered)

###### Inherited from

`AgentNotRegistered_base.constructor`

#### Properties

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AgentNotRegistered_base.hint`

<a id="name-1"></a>

##### name

> `readonly` **name**: `string`

###### Inherited from

`AgentNotRegistered_base.name`

***

<a id="pluginnameconflict"></a>

### PluginNameConflict

A plugin name was declared more than once in one host.

#### Extends

- `PluginNameConflict_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new PluginNameConflict**(...`args`): [`PluginNameConflict`](#pluginnameconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`PluginNameConflict`](#pluginnameconflict)

###### Inherited from

`PluginNameConflict_base.constructor`

#### Properties

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PluginNameConflict_base.hint`

<a id="name-2"></a>

##### name

> `readonly` **name**: `string`

###### Inherited from

`PluginNameConflict_base.name`

***

<a id="plugintoolconflict"></a>

### PluginToolConflict

Two host declarations attempted to install the same static tool name.

#### Extends

- `PluginToolConflict_base`

#### Constructors

<a id="constructor-3"></a>

##### Constructor

> **new PluginToolConflict**(...`args`): [`PluginToolConflict`](#plugintoolconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`PluginToolConflict`](#plugintoolconflict)

###### Inherited from

`PluginToolConflict_base.constructor`

#### Properties

<a id="hint-3"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PluginToolConflict_base.hint`

<a id="name-3"></a>

##### name

> `readonly` **name**: `string`

###### Inherited from

`PluginToolConflict_base.name`

<a id="sources"></a>

##### sources

> `readonly` **sources**: readonly `string`[]

###### Inherited from

`PluginToolConflict_base.sources`

***

<a id="sessionconflict"></a>

### SessionConflict

A host Session already owns the requested identity.

#### Extends

- `SessionConflict_base`

#### Constructors

<a id="constructor-4"></a>

##### Constructor

> **new SessionConflict**(...`args`): [`SessionConflict`](#sessionconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SessionConflict`](#sessionconflict)

###### Inherited from

`SessionConflict_base.constructor`

#### Properties

<a id="hint-4"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SessionConflict_base.hint`

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`SessionConflict_base.sessionId`

***

<a id="sessioncursorexpired"></a>

### SessionCursorExpired

A Session replay cursor is outside the driver's retained event range.

#### Extends

- `SessionCursorExpired_base`

#### Constructors

<a id="constructor-5"></a>

##### Constructor

> **new SessionCursorExpired**(...`args`): [`SessionCursorExpired`](#sessioncursorexpired)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SessionCursorExpired`](#sessioncursorexpired)

###### Inherited from

`SessionCursorExpired_base.constructor`

#### Properties

<a id="cursor"></a>

##### cursor

> `readonly` **cursor**: `number`

###### Inherited from

`SessionCursorExpired_base.cursor`

<a id="earliestcursor"></a>

##### earliestCursor

> `readonly` **earliestCursor**: `number`

###### Inherited from

`SessionCursorExpired_base.earliestCursor`

<a id="hint-5"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SessionCursorExpired_base.hint`

<a id="latestcursor"></a>

##### latestCursor

> `readonly` **latestCursor**: `number`

###### Inherited from

`SessionCursorExpired_base.latestCursor`

<a id="sessionid-1"></a>

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`SessionCursorExpired_base.sessionId`

***

<a id="sessionnotfound"></a>

### SessionNotFound

A requested host Session does not exist.

#### Extends

- `SessionNotFound_base`

#### Constructors

<a id="constructor-6"></a>

##### Constructor

> **new SessionNotFound**(...`args`): [`SessionNotFound`](#sessionnotfound)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SessionNotFound`](#sessionnotfound)

###### Inherited from

`SessionNotFound_base.constructor`

#### Properties

<a id="hint-6"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SessionNotFound_base.hint`

<a id="sessionid-2"></a>

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`SessionNotFound_base.sessionId`

***

<a id="sessionpageinvalid"></a>

### SessionPageInvalid

**`Experimental`**

A page selector does not name retained evidence in the authorized Session.

#### Extends

- `SessionPageInvalid_base`

#### Constructors

<a id="constructor-7"></a>

##### Constructor

> **new SessionPageInvalid**(...`args`): [`SessionPageInvalid`](#sessionpageinvalid)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SessionPageInvalid`](#sessionpageinvalid)

###### Inherited from

`SessionPageInvalid_base.constructor`

#### Properties

<a id="hint-7"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`SessionPageInvalid_base.hint`

<a id="sessionid-3"></a>

##### sessionId

> `readonly` **sessionId**: `string`

**`Experimental`**

###### Inherited from

`SessionPageInvalid_base.sessionId`

***

<a id="sessionsubscriberlagged"></a>

### SessionSubscriberLagged

A Session event subscriber could not keep up with its bounded live queue.

#### Extends

- `SessionSubscriberLagged_base`

#### Constructors

<a id="constructor-8"></a>

##### Constructor

> **new SessionSubscriberLagged**(...`args`): [`SessionSubscriberLagged`](#sessionsubscriberlagged)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SessionSubscriberLagged`](#sessionsubscriberlagged)

###### Inherited from

`SessionSubscriberLagged_base.constructor`

#### Properties

<a id="hint-8"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SessionSubscriberLagged_base.hint`

<a id="lastdeliveredcursor"></a>

##### lastDeliveredCursor

> `readonly` **lastDeliveredCursor**: `number`

###### Inherited from

`SessionSubscriberLagged_base.lastDeliveredCursor`

<a id="sessionid-4"></a>

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`SessionSubscriberLagged_base.sessionId`

***

<a id="toolidentity"></a>

### ToolIdentity

**`Experimental`**

Application-owned identities for an independently retained Tool implementation and authorization policy.

#### Extends

- `ToolIdentity_base`

#### Constructors

<a id="constructor-9"></a>

##### Constructor

> **new ToolIdentity**(`_`): [`ToolIdentity`](#toolidentity)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`ToolIdentity`](#toolidentity)

###### Inherited from

`ToolIdentity_base.constructor`

## Interfaces

<a id="childhandle"></a>

### ChildHandle

#### Properties

<a id="run"></a>

##### run

> `readonly` **run**: [`HostRun`](#hostrun)\<`unknown`\>

<a id="session"></a>

##### session

> `readonly` **session**: [`SessionHandle`](#sessionhandle)

***

<a id="childspawnoptions"></a>

### ChildSpawnOptions

#### Properties

<a id="commandid"></a>

##### commandId

> `readonly` **commandId**: `string`

<a id="label"></a>

##### label?

> `readonly` `optional` **label?**: `string`

***

<a id="createoptions"></a>

### CreateOptions

#### Type Parameters

##### Agents

`Agents` *extends* `ReadonlyArray`\<[`Any`](./generalist/namespaces/Agent.md#any)\>

##### Plugins

`Plugins` *extends* `ReadonlyArray`\<[`Plugin`](#plugin)\<`ReadonlyArray`\<`Tool.Any`\>\>\> = `ReadonlyArray`\<`never`\>

##### Tools

`Tools` *extends* `ReadonlyArray`\<`Tool.Any`\> = `ReadonlyArray`\<`never`\>

#### Properties

<a id="agents-1"></a>

##### agents

> `readonly` **agents**: `Agents`

<a id="limits"></a>

##### limits?

> `readonly` `optional` **limits?**: [`HostLimits`](./runtime/namespaces/TreePolicy.md#hostlimits)

<a id="plugins-1"></a>

##### plugins?

> `readonly` `optional` **plugins?**: `Plugins`

<a id="tools-1"></a>

##### tools?

> `readonly` `optional` **tools?**: `Tools`

***

<a id="host"></a>

### Host

#### Type Parameters

##### Agents

`Agents` *extends* `ReadonlyArray`\<[`Any`](./generalist/namespaces/Agent.md#any)\>

#### Properties

<a id="approvals"></a>

##### approvals

> `readonly` **approvals**: `object`

###### resolve

> `readonly` **resolve**: (`runId`, `token`, `decision`, `operator`) => `Effect`\<`void`, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`RunNotFound`](./runtime/namespaces/Errors.md#runnotfound) \| [`ApprovalStale`](./runtime/namespaces/Errors.md#approvalstale) \| [`ApprovalMismatch`](./runtime/namespaces/Errors.md#approvalmismatch) \| [`IllegalOperatorAction`](./runtime/namespaces/Errors.md#illegaloperatoraction)\>

###### Parameters

###### runId

`string`

###### token

`string`

###### decision

\{ \} \| \{ `reason?`: `string`; \}

###### operator

`string`

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`RunNotFound`](./runtime/namespaces/Errors.md#runnotfound) \| [`ApprovalStale`](./runtime/namespaces/Errors.md#approvalstale) \| [`ApprovalMismatch`](./runtime/namespaces/Errors.md#approvalmismatch) \| [`IllegalOperatorAction`](./runtime/namespaces/Errors.md#illegaloperatoraction)\>

<a id="artifacts"></a>

##### artifacts

> `readonly` **artifacts**: `Artifacts`

<a id="attachments"></a>

##### attachments

> `readonly` **attachments**: `Attachments`

<a id="events"></a>

##### events

> `readonly` **events**: `object`

###### previews

> `readonly` **previews**: (`sessionId`, `runId`) => `Effect`\<`Stream`\<\{ `authorityAttemptFence`: `number`; `event`: \{ `_tag`: `"ModelPreview"`; `attempt`: `number`; `attemptFence`: `number`; `changes`: readonly \[\{ `channel`: `"text"` \| `"reasoning"`; `delta`: `string`; `offset`: `number`; \}, \{ `channel`: `"text"` \| `"reasoning"`; `delta`: `string`; `offset`: `number`; \}\]; `generation`: `number`; `modelAttemptId`: `string`; `modelCallId`: `string`; `runId`: `string`; `sequence`: `number`; `turn`: `number`; \} \| \{ `attemptFence`: `number`; `generation`: `number`; `runId`: `string`; \}; `runId`: `string`; `sessionId`: `string`; \}, `never`, `never`\>, [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### runId

`string`

###### Returns

`Effect`\<`Stream`\<\{ `authorityAttemptFence`: `number`; `event`: \{ `_tag`: `"ModelPreview"`; `attempt`: `number`; `attemptFence`: `number`; `changes`: readonly \[\{ `channel`: `"text"` \| `"reasoning"`; `delta`: `string`; `offset`: `number`; \}, \{ `channel`: `"text"` \| `"reasoning"`; `delta`: `string`; `offset`: `number`; \}\]; `generation`: `number`; `modelAttemptId`: `string`; `modelCallId`: `string`; `runId`: `string`; `sequence`: `number`; `turn`: `number`; \} \| \{ `attemptFence`: `number`; `generation`: `number`; `runId`: `string`; \}; `runId`: `string`; `sessionId`: `string`; \}, `never`, `never`\>, [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

###### subscribe

> `readonly` **subscribe**: (`sessionId`, `cursor?`) => `Effect`\<`Stream`\<\{ `cursor`: `number`; `event`: \{ `_tag`: `"RunAccepted"`; `address`: `string` & `Brand`\<`"Address"`\>; `attemptId?`: `string`; `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `causationId?`: `string`; `correlationId?`: `string`; `depth`: `number`; `eventId`: `string`; `executableRef`: \{ `active`: `string` & `Brand`\<...\> \| `string` & `Brand`\<...\> \| `string` & `Brand`\<...\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `messageId`: `string`; `occurredAt`: `string`; `parentRunId?`: `string`; `rootRunId`: `string`; `runId`: `string`; `sequence`: `number`; `specVersion`: `"1"`; \}; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `object` & [`TurnStarted`](./generalist/namespaces/AgentEvent.md#turnstarted) & `object` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `object` & `TurnCompleted` & `object` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `never` \| `object` & [`ToolExecutionStarted`](./generalist/namespaces/AgentEvent.md#toolexecutionstarted) & `object` \| `object` & [`ToolProgress`](./generalist/namespaces/AgentEvent.md#toolprogress) & `object` \| `object` & [`ToolExecutionCompleted`](./generalist/namespaces/AgentEvent.md#toolexecutioncompleted) & `object` \| `object` & [`ToolExecutionWaiting`](./generalist/namespaces/AgentEvent.md#toolexecutionwaiting) & `object` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `items`: readonly `object`[]; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `runId`: `string`; `sessionId`: `string`; `update`: \{ `artifact`: `string`; `attribution`: \{ `actor`: `string`; `runId`: `string`; \} \| \{ `actor`: `string`; \}; `base`: `number`; `branch?`: `string`; `result`: `number`; \}; \} \| \{ `cursor`: `number`; `event`: \{ `_tag`: `"ApprovalRequested"`; `attemptId?`: `string`; `call`: `ToolCallPart`\<`string`, `unknown`\>; `causationId?`: `string`; `correlationId?`: `string`; `depth`: `number`; `eventId`: `string`; `executableRef`: \{ `active`: `string` & `Brand`\<...\> \| `string` & `Brand`\<...\> \| `string` & `Brand`\<...\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `metadata?`: `Readonly`\<`Record`\<`string`, `Json`\>\>; `occurredAt`: `string`; `parentRunId?`: `string`; `request`: \{ `approvalId`: `string`; `capability`: `string`; `input`: `unknown`; `operation`: `string`; \}; `rootRunId`: `string`; `runId`: `string`; `sequence`: `number`; `specVersion`: `"1"`; `turn`: `number`; \}; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: \{ `_tag`: `"CompactionApplied"`; `appliedAt`: `number`; `attemptId?`: `string`; `causationId?`: `string`; `checkpointId`: `string`; `commit`: \{ `checkpointId`: `string`; `compactionId`: `string`; `contextTokensAfter?`: `number`; `contextTokensBefore?`: `number`; `entriesAfter?`: `number`; `entriesBefore?`: `number`; `summaryModelCallId?`: `string`; \}; `compactionId`: `string`; `correlationId?`: `string`; `deliveryId`: `string`; `depth`: `number`; `eventId`: `string`; `executableRef`: \{ `active`: `string` & `Brand`\<...\> \| `string` & `Brand`\<...\> \| `string` & `Brand`\<...\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `kind`: `"summarize"` \| `"microcompact"`; `occurredAt`: `string`; `parentRunId?`: `string`; `rootRunId`: `string`; `runId`: `string`; `sequence`: `number`; `specVersion`: `"1"`; `turn`: `number`; \}; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `object` & `object` & `object` \| `object` & `object` & `object` \| `never` \| `object` & `object` & `object` \| `never` \| `never`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `sessionId`: `string`; `update`: \{ `afterEntryId`: `string` \| `null`; `entries`: readonly `ConversationEntry`[]; `leafId`: `string` \| `null`; `nextLeafId?`: `string`; `previousLeafId`: `string` \| `null`; `reset?`: `true`; \}; \}, [`SessionEventsError`](./runtime/namespaces/HostSession.md#sessioneventserror), `never`\>, [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### cursor?

`number`

###### Returns

`Effect`\<`Stream`\<\{ `cursor`: `number`; `event`: \{ `_tag`: `"RunAccepted"`; `address`: `string` & `Brand`\<`"Address"`\>; `attemptId?`: `string`; `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `causationId?`: `string`; `correlationId?`: `string`; `depth`: `number`; `eventId`: `string`; `executableRef`: \{ `active`: `string` & `Brand`\<...\> \| `string` & `Brand`\<...\> \| `string` & `Brand`\<...\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `messageId`: `string`; `occurredAt`: `string`; `parentRunId?`: `string`; `rootRunId`: `string`; `runId`: `string`; `sequence`: `number`; `specVersion`: `"1"`; \}; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `object` & [`TurnStarted`](./generalist/namespaces/AgentEvent.md#turnstarted) & `object` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `object` & `TurnCompleted` & `object` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `never` \| `object` & [`ToolExecutionStarted`](./generalist/namespaces/AgentEvent.md#toolexecutionstarted) & `object` \| `object` & [`ToolProgress`](./generalist/namespaces/AgentEvent.md#toolprogress) & `object` \| `object` & [`ToolExecutionCompleted`](./generalist/namespaces/AgentEvent.md#toolexecutioncompleted) & `object` \| `object` & [`ToolExecutionWaiting`](./generalist/namespaces/AgentEvent.md#toolexecutionwaiting) & `object` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `items`: readonly `object`[]; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `runId`: `string`; `sessionId`: `string`; `update`: \{ `artifact`: `string`; `attribution`: \{ `actor`: `string`; `runId`: `string`; \} \| \{ `actor`: `string`; \}; `base`: `number`; `branch?`: `string`; `result`: `number`; \}; \} \| \{ `cursor`: `number`; `event`: \{ `_tag`: `"ApprovalRequested"`; `attemptId?`: `string`; `call`: `ToolCallPart`\<`string`, `unknown`\>; `causationId?`: `string`; `correlationId?`: `string`; `depth`: `number`; `eventId`: `string`; `executableRef`: \{ `active`: `string` & `Brand`\<...\> \| `string` & `Brand`\<...\> \| `string` & `Brand`\<...\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `metadata?`: `Readonly`\<`Record`\<`string`, `Json`\>\>; `occurredAt`: `string`; `parentRunId?`: `string`; `request`: \{ `approvalId`: `string`; `capability`: `string`; `input`: `unknown`; `operation`: `string`; \}; `rootRunId`: `string`; `runId`: `string`; `sequence`: `number`; `specVersion`: `"1"`; `turn`: `number`; \}; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: \{ `_tag`: `"CompactionApplied"`; `appliedAt`: `number`; `attemptId?`: `string`; `causationId?`: `string`; `checkpointId`: `string`; `commit`: \{ `checkpointId`: `string`; `compactionId`: `string`; `contextTokensAfter?`: `number`; `contextTokensBefore?`: `number`; `entriesAfter?`: `number`; `entriesBefore?`: `number`; `summaryModelCallId?`: `string`; \}; `compactionId`: `string`; `correlationId?`: `string`; `deliveryId`: `string`; `depth`: `number`; `eventId`: `string`; `executableRef`: \{ `active`: `string` & `Brand`\<...\> \| `string` & `Brand`\<...\> \| `string` & `Brand`\<...\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `kind`: `"summarize"` \| `"microcompact"`; `occurredAt`: `string`; `parentRunId?`: `string`; `rootRunId`: `string`; `runId`: `string`; `sequence`: `number`; `specVersion`: `"1"`; `turn`: `number`; \}; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `never` \| `object` & `object` & `object` \| `object` & `object` & `object` \| `never` \| `object` & `object` & `object` \| `never` \| `never`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `sessionId`: `string`; `update`: \{ `afterEntryId`: `string` \| `null`; `entries`: readonly `ConversationEntry`[]; `leafId`: `string` \| `null`; `nextLeafId?`: `string`; `previousLeafId`: `string` \| `null`; `reset?`: `true`; \}; \}, [`SessionEventsError`](./runtime/namespaces/HostSession.md#sessioneventserror), `never`\>, [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

<a id="operator"></a>

##### operator

> `readonly` **operator**: `object`

###### explain

> `readonly` **explain**: (`runId`) => `Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`; \}, [`InspectError`](./runtime/namespaces/Runtime.md#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`; \}, [`InspectError`](./runtime/namespaces/Runtime.md#inspecterror)\>

###### extendBudget

> `readonly` **extendBudget**: (`runId`, `delta`, `operator`, `commandId`) => `Effect`\<`void`, [`OperatorExtendBudgetError`](./runtime/namespaces/Runtime.md#operatorextendbudgeterror)\>

###### Parameters

###### runId

`string`

###### delta

###### children?

`number`

###### duration?

`number`

###### tokens?

`number`

###### toolCalls?

`number`

###### usd?

`number`

###### operator

`string`

###### commandId

`string`

###### Returns

`Effect`\<`void`, [`OperatorExtendBudgetError`](./runtime/namespaces/Runtime.md#operatorextendbudgeterror)\>

###### resolveUnknown

> `readonly` **resolveUnknown**: (`runId`, `operationId`, `resolution`, `operator`, `commandId`) => `Effect`\<`void`, [`OperatorActionError`](./runtime/namespaces/Runtime.md#operatoractionerror)\>

###### Parameters

###### runId

`string`

###### operationId

`string`

###### resolution

\{ `outcome`: `"succeeded"`; `result`: `unknown`; \} \| \{ `error`: `unknown`; `outcome`: `"failed"`; \}

###### operator

`string`

###### commandId

`string`

###### Returns

`Effect`\<`void`, [`OperatorActionError`](./runtime/namespaces/Runtime.md#operatoractionerror)\>

###### retry

> `readonly` **retry**: (`runId`, `operator`, `commandId`) => `Effect`\<`void`, [`OperatorActionError`](./runtime/namespaces/Runtime.md#operatoractionerror)\>

###### Parameters

###### runId

`string`

###### operator

`string`

###### commandId

`string`

###### Returns

`Effect`\<`void`, [`OperatorActionError`](./runtime/namespaces/Runtime.md#operatoractionerror)\>

###### wake

> `readonly` **wake**: (`runId`, `operator`, `commandId`) => `Effect`\<`void`, [`OperatorActionError`](./runtime/namespaces/Runtime.md#operatoractionerror)\>

###### Parameters

###### runId

`string`

###### operator

`string`

###### commandId

`string`

###### Returns

`Effect`\<`void`, [`OperatorActionError`](./runtime/namespaces/Runtime.md#operatoractionerror)\>

<a id="runs"></a>

##### runs

> `readonly` **runs**: `object`

###### cancel

> `readonly` **cancel**: (`runId`, `commandId`, `reason?`) => `Effect`\<`void`, [`CancelError`](./runtime/namespaces/Runtime.md#cancelerror)\>

###### Parameters

###### runId

`string`

###### commandId

`string`

###### reason?

`string`

###### Returns

`Effect`\<`void`, [`CancelError`](./runtime/namespaces/Runtime.md#cancelerror)\>

###### get

> `readonly` **get**: (`runId`) => `Effect`\<[`HostRun`](#hostrun)\<`unknown`\>, [`InspectError`](./runtime/namespaces/Runtime.md#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`HostRun`](#hostrun)\<`unknown`\>, [`InspectError`](./runtime/namespaces/Runtime.md#inspecterror)\>

###### inspect

> `readonly` **inspect**: (`runId`) => `Effect`\<[`RuntimeInspection`](./runtime/namespaces/Runtime.md#runtimeinspection), [`InspectError`](./runtime/namespaces/Runtime.md#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RuntimeInspection`](./runtime/namespaces/Runtime.md#runtimeinspection), [`InspectError`](./runtime/namespaces/Runtime.md#inspecterror)\>

###### list

> `readonly` **list**: (`sessionId`) => `Effect`\<readonly [`RunInspection`](./runtime/namespaces/Run.md#runinspection)[], [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<readonly [`RunInspection`](./runtime/namespaces/Run.md#runinspection)[], [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

###### rewind

> `readonly` **rewind**: (`runId`, `options`) => `Effect`\<`void`, `RewindError`\>

###### Parameters

###### runId

`string`

###### options

[`RewindOptions`](./runtime/namespaces/Fork.md#rewindoptions)

###### Returns

`Effect`\<`void`, `RewindError`\>

###### send

> `readonly` **send**: `RunSend`

###### start

> `readonly` **start**: \<`Selected`\>(`sessionId`, `agent`, `input`, `options?`) => `Effect`\<[`HostRun`](#hostrun)\<[`Output`](./generalist/namespaces/Agent.md#output-5)\<`Selected`\>\>, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ChildDepthExceeded`](./runtime/namespaces/Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./runtime/namespaces/Errors.md#childlimitexceeded) \| [`IdempotencyConflict`](./runtime/namespaces/Errors.md#idempotencyconflict) \| [`RunIdConflict`](./runtime/namespaces/Errors.md#runidconflict) \| [`ExecutableIdentityMismatch`](./runtime/namespaces/Errors.md#executableidentitymismatch) \| [`ExecutablePinMissing`](./runtime/namespaces/Errors.md#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./runtime/namespaces/Errors.md#executableregistrationinvalid) \| [`ExecutableRegistrationConflict`](./runtime/namespaces/Errors.md#executableregistrationconflict) \| [`ExecutableRegistrationMissing`](./runtime/namespaces/Errors.md#executableregistrationmissing) \| [`ChildSelectionMissing`](./runtime/namespaces/Errors.md#childselectionmissing) \| [`StartInvalid`](./runtime/namespaces/Errors.md#startinvalid) \| [`FanOutConflict`](./runtime/namespaces/Errors.md#fanoutconflict) \| [`FanOutInvalid`](./runtime/namespaces/Errors.md#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./runtime/namespaces/Errors.md#fanoutremainderunsupported) \| [`TreePolicyInvalid`](./runtime/namespaces/Errors.md#treepolicyinvalid) \| [`Exhausted`](./generalist/namespaces/RunBudget.md#exhausted) \| [`AgentNotRegistered`](#agentnotregistered) \| [`UnknownAgent`](./runtime/namespaces/Errors.md#unknownagent) \| [`SessionNotFound`](#sessionnotfound) \| [`AgentError`](./generalist/namespaces/AgentEvent.md#agenterror)\>

###### Type Parameters

###### Selected

`Selected` *extends* [`Any`](./generalist/namespaces/Agent.md#any)

###### Parameters

###### sessionId

`string`

###### agent

`Selected`

###### input

[`Input`](./generalist/namespaces/Agent.md#input-5)\<`Selected`\>

###### options?

[`RunStartOptions`](#runstartoptions)

###### Returns

`Effect`\<[`HostRun`](#hostrun)\<[`Output`](./generalist/namespaces/Agent.md#output-5)\<`Selected`\>\>, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ChildDepthExceeded`](./runtime/namespaces/Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./runtime/namespaces/Errors.md#childlimitexceeded) \| [`IdempotencyConflict`](./runtime/namespaces/Errors.md#idempotencyconflict) \| [`RunIdConflict`](./runtime/namespaces/Errors.md#runidconflict) \| [`ExecutableIdentityMismatch`](./runtime/namespaces/Errors.md#executableidentitymismatch) \| [`ExecutablePinMissing`](./runtime/namespaces/Errors.md#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./runtime/namespaces/Errors.md#executableregistrationinvalid) \| [`ExecutableRegistrationConflict`](./runtime/namespaces/Errors.md#executableregistrationconflict) \| [`ExecutableRegistrationMissing`](./runtime/namespaces/Errors.md#executableregistrationmissing) \| [`ChildSelectionMissing`](./runtime/namespaces/Errors.md#childselectionmissing) \| [`StartInvalid`](./runtime/namespaces/Errors.md#startinvalid) \| [`FanOutConflict`](./runtime/namespaces/Errors.md#fanoutconflict) \| [`FanOutInvalid`](./runtime/namespaces/Errors.md#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./runtime/namespaces/Errors.md#fanoutremainderunsupported) \| [`TreePolicyInvalid`](./runtime/namespaces/Errors.md#treepolicyinvalid) \| [`Exhausted`](./generalist/namespaces/RunBudget.md#exhausted) \| [`AgentNotRegistered`](#agentnotregistered) \| [`UnknownAgent`](./runtime/namespaces/Errors.md#unknownagent) \| [`SessionNotFound`](#sessionnotfound) \| [`AgentError`](./generalist/namespaces/AgentEvent.md#agenterror)\>

###### startByName

> `readonly` **startByName**: (`sessionId`, `agent`, `input`, `options?`) => `Effect`\<[`HostRun`](#hostrun)\<`unknown`\>, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ChildDepthExceeded`](./runtime/namespaces/Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./runtime/namespaces/Errors.md#childlimitexceeded) \| [`IdempotencyConflict`](./runtime/namespaces/Errors.md#idempotencyconflict) \| [`RunIdConflict`](./runtime/namespaces/Errors.md#runidconflict) \| [`ExecutableIdentityMismatch`](./runtime/namespaces/Errors.md#executableidentitymismatch) \| [`ExecutablePinMissing`](./runtime/namespaces/Errors.md#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./runtime/namespaces/Errors.md#executableregistrationinvalid) \| [`ExecutableRegistrationConflict`](./runtime/namespaces/Errors.md#executableregistrationconflict) \| [`ExecutableRegistrationMissing`](./runtime/namespaces/Errors.md#executableregistrationmissing) \| [`ChildSelectionMissing`](./runtime/namespaces/Errors.md#childselectionmissing) \| [`StartInvalid`](./runtime/namespaces/Errors.md#startinvalid) \| [`FanOutConflict`](./runtime/namespaces/Errors.md#fanoutconflict) \| [`FanOutInvalid`](./runtime/namespaces/Errors.md#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./runtime/namespaces/Errors.md#fanoutremainderunsupported) \| [`TreePolicyInvalid`](./runtime/namespaces/Errors.md#treepolicyinvalid) \| [`Exhausted`](./generalist/namespaces/RunBudget.md#exhausted) \| [`AgentNotRegistered`](#agentnotregistered) \| [`UnknownAgent`](./runtime/namespaces/Errors.md#unknownagent) \| [`SessionNotFound`](#sessionnotfound) \| [`AgentError`](./generalist/namespaces/AgentEvent.md#agenterror) \| [`AgentInputInvalid`](#agentinputinvalid)\>

###### Parameters

###### sessionId

`string`

###### agent

`string`

###### input

`Json`

###### options?

[`RunStartOptions`](#runstartoptions)

###### Returns

`Effect`\<[`HostRun`](#hostrun)\<`unknown`\>, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`ChildDepthExceeded`](./runtime/namespaces/Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./runtime/namespaces/Errors.md#childlimitexceeded) \| [`IdempotencyConflict`](./runtime/namespaces/Errors.md#idempotencyconflict) \| [`RunIdConflict`](./runtime/namespaces/Errors.md#runidconflict) \| [`ExecutableIdentityMismatch`](./runtime/namespaces/Errors.md#executableidentitymismatch) \| [`ExecutablePinMissing`](./runtime/namespaces/Errors.md#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./runtime/namespaces/Errors.md#executableregistrationinvalid) \| [`ExecutableRegistrationConflict`](./runtime/namespaces/Errors.md#executableregistrationconflict) \| [`ExecutableRegistrationMissing`](./runtime/namespaces/Errors.md#executableregistrationmissing) \| [`ChildSelectionMissing`](./runtime/namespaces/Errors.md#childselectionmissing) \| [`StartInvalid`](./runtime/namespaces/Errors.md#startinvalid) \| [`FanOutConflict`](./runtime/namespaces/Errors.md#fanoutconflict) \| [`FanOutInvalid`](./runtime/namespaces/Errors.md#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./runtime/namespaces/Errors.md#fanoutremainderunsupported) \| [`TreePolicyInvalid`](./runtime/namespaces/Errors.md#treepolicyinvalid) \| [`Exhausted`](./generalist/namespaces/RunBudget.md#exhausted) \| [`AgentNotRegistered`](#agentnotregistered) \| [`UnknownAgent`](./runtime/namespaces/Errors.md#unknownagent) \| [`SessionNotFound`](#sessionnotfound) \| [`AgentError`](./generalist/namespaces/AgentEvent.md#agenterror) \| [`AgentInputInvalid`](#agentinputinvalid)\>

<a id="sessions"></a>

##### sessions

> `readonly` **sessions**: `SessionReads` & `object`

###### Type Declaration

###### create

> `readonly` **create**: (`options?`) => `Effect`\<[`SessionHandle`](#sessionhandle), [`CreateSessionError`](./runtime/namespaces/HostSession.md#createsessionerror) \| [`AgentNotRegistered`](#agentnotregistered) \| [`UnknownAgent`](./runtime/namespaces/Errors.md#unknownagent)\>

###### Parameters

###### options?

[`SessionCreateOptions`](#sessioncreateoptions)

###### Returns

`Effect`\<[`SessionHandle`](#sessionhandle), [`CreateSessionError`](./runtime/namespaces/HostSession.md#createsessionerror) \| [`AgentNotRegistered`](#agentnotregistered) \| [`UnknownAgent`](./runtime/namespaces/Errors.md#unknownagent)\>

###### family

> `readonly` **family**: (`sessionId`, `input`) => `Effect`\<\{ `at`: `number`; `nextBefore`: `number` \| `null`; `rootSessionId`: `string`; `sessions`: readonly `object`[]; \}, [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror) \| [`SessionPageInvalid`](#sessionpageinvalid)\>

###### Parameters

###### sessionId

`string`

###### input

###### at?

`number`

###### before?

`number`

###### limit

`number`

###### Returns

`Effect`\<\{ `at`: `number`; `nextBefore`: `number` \| `null`; `rootSessionId`: `string`; `sessions`: readonly `object`[]; \}, [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror) \| [`SessionPageInvalid`](#sessionpageinvalid)\>

###### fork

> `readonly` **fork**: (`runId`, `options`) => `Effect`\<[`HostRun`](#hostrun)\<`unknown`\>, `ForkError`\>

###### Parameters

###### runId

`string`

###### options

[`ForkOptions`](./runtime/namespaces/Fork.md#forkoptions)

###### Returns

`Effect`\<[`HostRun`](#hostrun)\<`unknown`\>, `ForkError`\>

###### get

> `readonly` **get**: (`sessionId`) => `Effect`\<[`SessionHandle`](#sessionhandle), [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<[`SessionHandle`](#sessionhandle), [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

###### list

> `readonly` **list**: () => `Effect`\<readonly [`HostSession`](#hostsession-1)[], [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable), `never`\>

###### Returns

`Effect`\<readonly [`HostSession`](#hostsession-1)[], [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable), `never`\>

<a id="tools-2"></a>

##### tools

> `readonly` **tools**: `Tools`

***

<a id="hostsession"></a>

### HostSession

Durable product-facing Session metadata owned by a Runtime driver.

#### Properties

<a id="activerunid"></a>

##### activeRunId?

> `readonly` `optional` **activeRunId?**: `string`

<a id="createdat"></a>

##### createdAt

> `readonly` **createdAt**: `string`

<a id="id"></a>

##### id

> `readonly` **id**: `string`

<a id="lifecycle"></a>

##### lifecycle?

> `readonly` `optional` **lifecycle?**: `"closed"` \| `"stopped"`

<a id="queue"></a>

##### queue

> `readonly` **queue**: readonly `object`[]

<a id="retainedsession"></a>

##### retainedSession?

> `readonly` `optional` **retainedSession?**: `object`

###### depth

> `readonly` **depth**: `number`

###### id

> `readonly` **id**: `string`

###### initialRunId

> `readonly` **initialRunId**: `string`

###### parentRunId

> `readonly` **parentRunId**: `string` \| `null`

###### parentSessionId

> `readonly` **parentSessionId**: `string` \| `null`

###### rootSessionId

> `readonly` **rootSessionId**: `string`

<a id="selection"></a>

##### selection?

> `readonly` `optional` **selection?**: `object`

###### budget?

> `readonly` `optional` **budget?**: `object`

###### budget.children?

> `readonly` `optional` **children?**: `number`

###### budget.duration?

> `readonly` `optional` **duration?**: `number`

###### budget.tokens?

> `readonly` `optional` **tokens?**: `number`

###### budget.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### budget.usd?

> `readonly` `optional` **usd?**: `number`

###### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### executableRef

> `readonly` **executableRef**: `object`

###### executableRef.active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\> \| `string` & `Brand`\<`"generalist/tool-pin"`\>

###### executableRef.executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### registrations

> `readonly` **registrations**: readonly `object`[]

###### treePolicy?

> `readonly` `optional` **treePolicy?**: `object`

###### treePolicy.concurrency

> `readonly` **concurrency**: `object`

###### treePolicy.concurrency.agents

> `readonly` **agents**: `number`

###### treePolicy.concurrency.tools

> `readonly` **tools**: `number`

###### treePolicy.maxDepth

> `readonly` **maxDepth**: `number`

###### treePolicy.maxSessions

> `readonly` **maxSessions**: `number`

<a id="sponsorrunid"></a>

##### sponsorRunId?

> `readonly` `optional` **sponsorRunId?**: `string`

<a id="title"></a>

##### title?

> `readonly` `optional` **title?**: `string`

***

<a id="plugin"></a>

### Plugin

One deterministic collection of host-owned Agent contributions.

#### Type Parameters

##### Tools

`Tools` *extends* `ReadonlyArray`\<`Tool.Any`\> = `ReadonlyArray`\<`never`\>

#### Properties

<a id="hooks"></a>

##### hooks?

> `readonly` `optional` **hooks?**: readonly [`Declaration`](./hooks.md#declaration)[]

<a id="instructions"></a>

##### instructions?

> `readonly` `optional` **instructions?**: readonly [`Provider`](./instructions/index.md#provider)\<`never`\>[]

<a id="name-4"></a>

##### name

> `readonly` **name**: `string`

<a id="skills"></a>

##### skills?

> `readonly` `optional` **skills?**: readonly [`Skill`](./generalist/namespaces/SkillCatalog.md#skill)[]

<a id="tools-4"></a>

##### tools?

> `readonly` `optional` **tools?**: `Tools`

***

<a id="pluginoptions"></a>

### PluginOptions

#### Type Parameters

##### Tools

`Tools` *extends* `ReadonlyArray`\<`Tool.Any`\> = `ReadonlyArray`\<`never`\>

#### Properties

<a id="hooks-1"></a>

##### hooks?

> `readonly` `optional` **hooks?**: readonly [`Declaration`](./hooks.md#declaration)[]

<a id="instructions-1"></a>

##### instructions?

> `readonly` `optional` **instructions?**: readonly [`Provider`](./instructions/index.md#provider)\<`never`\>[]

<a id="name-5"></a>

##### name

> `readonly` **name**: `string`

<a id="skills-1"></a>

##### skills?

> `readonly` `optional` **skills?**: readonly [`Skill`](./generalist/namespaces/SkillCatalog.md#skill)[]

<a id="tools-6"></a>

##### tools?

> `readonly` `optional` **tools?**: `Tools`

***

<a id="queuecommandoptions"></a>

### QueueCommandOptions

#### Extended by

- [`QueueEditOptions`](#queueeditoptions)

#### Properties

<a id="commandid-1"></a>

##### commandId

> `readonly` **commandId**: `string`

***

<a id="queueeditoptions"></a>

### QueueEditOptions

#### Extends

- [`QueueCommandOptions`](#queuecommandoptions)

#### Properties

<a id="agent"></a>

##### agent?

> `readonly` `optional` **agent?**: `string`

<a id="commandid-2"></a>

##### commandId

> `readonly` **commandId**: `string`

###### Inherited from

[`QueueCommandOptions`](#queuecommandoptions).[`commandId`](#commandid-1)

<a id="expectedrevision"></a>

##### expectedRevision

> `readonly` **expectedRevision**: `number`

***

<a id="sessioncreateoptions"></a>

### SessionCreateOptions

#### Properties

<a id="agent-1"></a>

##### agent?

> `readonly` `optional` **agent?**: `string`

<a id="id-1"></a>

##### id?

> `readonly` `optional` **id?**: `string`

<a id="title-1"></a>

##### title?

> `readonly` `optional` **title?**: `string`

***

<a id="sessionhandle"></a>

### SessionHandle

#### Extends

- `Omit`\<[`HostSession`](#hostsession-1), `"queue"`\>

#### Properties

<a id="activerunid-1"></a>

##### activeRunId?

> `readonly` `optional` **activeRunId?**: `string`

###### Inherited from

[`HostSession`](#hostsession).[`activeRunId`](#activerunid)

<a id="close"></a>

##### close

> `readonly` **close**: (`options`) => `Effect`\<`void`, [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

###### Parameters

###### options

[`QueueCommandOptions`](#queuecommandoptions)

###### Returns

`Effect`\<`void`, [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

<a id="createdat-1"></a>

##### createdAt

> `readonly` **createdAt**: `string`

###### Inherited from

[`HostSession`](#hostsession).[`createdAt`](#createdat)

<a id="id-2"></a>

##### id

> `readonly` **id**: `string`

###### Inherited from

[`HostSession`](#hostsession).[`id`](#id)

<a id="inspect"></a>

##### inspect

> `readonly` **inspect**: `Effect`\<[`HostSession`](#hostsession-1), [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

<a id="lifecycle-1"></a>

##### lifecycle?

> `readonly` `optional` **lifecycle?**: `"closed"` \| `"stopped"`

###### Inherited from

[`HostSession`](#hostsession).[`lifecycle`](#lifecycle)

<a id="message-1"></a>

##### message

> `readonly` **message**: (`input`, `options`) => `Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`QueueError`](#queueerror), [`SessionSender`](./runtime/index.md#sessionsender)\>

###### Parameters

###### input

`string` \| `Prompt`

###### options

[`QueueCommandOptions`](#queuecommandoptions)

###### Returns

`Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`QueueError`](#queueerror), [`SessionSender`](./runtime/index.md#sessionsender)\>

<a id="queue-1"></a>

##### queue

> `readonly` **queue**: `object`

###### list

> `readonly` **list**: () => `Effect`\<readonly `object`[], [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

###### Returns

`Effect`\<readonly `object`[], [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

###### remove

> `readonly` **remove**: (`id`, `options`) => `Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`QueueError`](#queueerror)\>

###### Parameters

###### id

`string`

###### options

`Omit`\<[`QueueEditOptions`](#queueeditoptions), `"agent"`\>

###### Returns

`Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`QueueError`](#queueerror)\>

###### update

> `readonly` **update**: (`id`, `input`, `options`) => `Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`QueueError`](#queueerror)\>

###### Parameters

###### id

`string`

###### input

`string` \| `Prompt`

###### options

[`QueueEditOptions`](#queueeditoptions)

###### Returns

`Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`QueueError`](#queueerror)\>

<a id="resume"></a>

##### resume

> `readonly` **resume**: (`options`) => `Effect`\<`void`, [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

###### Parameters

###### options

[`QueueCommandOptions`](#queuecommandoptions)

###### Returns

`Effect`\<`void`, [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

<a id="retainedsession-1"></a>

##### retainedSession?

> `readonly` `optional` **retainedSession?**: `object`

###### depth

> `readonly` **depth**: `number`

###### id

> `readonly` **id**: `string`

###### initialRunId

> `readonly` **initialRunId**: `string`

###### parentRunId

> `readonly` **parentRunId**: `string` \| `null`

###### parentSessionId

> `readonly` **parentSessionId**: `string` \| `null`

###### rootSessionId

> `readonly` **rootSessionId**: `string`

###### Inherited from

[`HostSession`](#hostsession).[`retainedSession`](#retainedsession)

<a id="selection-1"></a>

##### selection?

> `readonly` `optional` **selection?**: `object`

###### budget?

> `readonly` `optional` **budget?**: `object`

###### budget.children?

> `readonly` `optional` **children?**: `number`

###### budget.duration?

> `readonly` `optional` **duration?**: `number`

###### budget.tokens?

> `readonly` `optional` **tokens?**: `number`

###### budget.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### budget.usd?

> `readonly` `optional` **usd?**: `number`

###### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifest`](./generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### executableRef

> `readonly` **executableRef**: `object`

###### executableRef.active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\> \| `string` & `Brand`\<`"generalist/tool-pin"`\>

###### executableRef.executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### registrations

> `readonly` **registrations**: readonly `object`[]

###### treePolicy?

> `readonly` `optional` **treePolicy?**: `object`

###### treePolicy.concurrency

> `readonly` **concurrency**: `object`

###### treePolicy.concurrency.agents

> `readonly` **agents**: `number`

###### treePolicy.concurrency.tools

> `readonly` **tools**: `number`

###### treePolicy.maxDepth

> `readonly` **maxDepth**: `number`

###### treePolicy.maxSessions

> `readonly` **maxSessions**: `number`

###### Inherited from

[`HostSession`](#hostsession).[`selection`](#selection)

<a id="snapshot"></a>

##### snapshot

> `readonly` **snapshot**: `Effect`\<[`HostSessionSnapshot`](./runtime/namespaces/HostSession.md#hostsessionsnapshot), [`SessionSnapshotError`](./runtime/namespaces/HostSession.md#sessionsnapshoterror)\>

<a id="sponsorrunid-1"></a>

##### sponsorRunId?

> `readonly` `optional` **sponsorRunId?**: `string`

###### Inherited from

[`HostSession`](#hostsession).[`sponsorRunId`](#sponsorrunid)

<a id="stop"></a>

##### stop

> `readonly` **stop**: (`options`) => `Effect`\<`void`, [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

###### Parameters

###### options

[`QueueCommandOptions`](#queuecommandoptions)

###### Returns

`Effect`\<`void`, [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

<a id="submit"></a>

##### submit

> `readonly` **submit**: (`input`, `options`) => `Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`QueueError`](#queueerror)\>

###### Parameters

###### input

`string` \| `Prompt`

###### options

[`QueueCommandOptions`](#queuecommandoptions)

###### Returns

`Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`QueueError`](#queueerror)\>

<a id="title-2"></a>

##### title?

> `readonly` `optional` **title?**: `string`

###### Inherited from

[`HostSession`](#hostsession).[`title`](#title)

***

<a id="sessionhistorypage"></a>

### SessionHistoryPage

**`Experimental`**

Follow nextLeafId until null; pages contain chronological entries.

#### Properties

<a id="entries"></a>

##### entries

> `readonly` **entries**: readonly `ConversationEntry`[]

**`Experimental`**

<a id="leafid"></a>

##### leafId

> `readonly` **leafId**: `string` \| `null`

**`Experimental`**

<a id="nextleafid"></a>

##### nextLeafId

> `readonly` **nextLeafId**: `string` \| `null`

**`Experimental`**

***

<a id="sessionrunspage"></a>

### SessionRunsPage

**`Experimental`**

Scan at most 256 events, including empty filtered pages with a continuation.

#### Properties

<a id="at"></a>

##### at

> `readonly` **at**: `number`

**`Experimental`**

<a id="nextbefore"></a>

##### nextBefore

> `readonly` **nextBefore**: `number` \| `null`

**`Experimental`**

<a id="runs-1"></a>

##### runs

> `readonly` **runs**: readonly [`SessionRunSummary`](#sessionrunsummary)[]

**`Experimental`**

***

<a id="sessionrunsummary"></a>

### SessionRunSummary

**`Experimental`**

Run metadata without retained manifests, results, or event history.

#### Properties

<a id="approval"></a>

##### approval?

> `readonly` `optional` **approval?**: `object`

**`Experimental`**

###### approvalId

> `readonly` **approvalId**: `string`

###### capability

> `readonly` **capability**: `string`

###### input

> `readonly` **input**: `unknown`

###### operation

> `readonly` **operation**: `string`

<a id="cursor-1"></a>

##### cursor

> `readonly` **cursor**: `number`

**`Experimental`**

<a id="parentrunid"></a>

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

**`Experimental`**

<a id="rootrunid"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

**`Experimental`**

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

**`Experimental`**

<a id="status"></a>

##### status

> `readonly` **status**: `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`

**`Experimental`**

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

**`Experimental`**

## Type Aliases

<a id="approvalrequested"></a>

### ApprovalRequested

> **ApprovalRequested** = *typeof* `ApprovalRequested.Type`

***

<a id="artifactupdated"></a>

### ArtifactUpdated

> **ArtifactUpdated** = *typeof* `ArtifactUpdated.Type`

One Agent-authored shared artifact edit committed by this Run.

***

<a id="compacted"></a>

### Compacted

> **Compacted** = *typeof* `Compacted.Type`

***

<a id="completed"></a>

### Completed

> **Completed** = *typeof* `Completed.Type`

***

<a id="createerror"></a>

### CreateError

> **CreateError** = [`DuplicateAgent`](./runtime/namespaces/Errors.md#duplicateagent) \| [`PluginNameConflict`](#pluginnameconflict) \| [`PluginToolConflict`](#plugintoolconflict) \| [`ExecutableRegistrationInvalid`](./runtime/namespaces/Errors.md#executableregistrationinvalid) \| [`TreePolicyInvalid`](./runtime/namespaces/Errors.md#treepolicyinvalid) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`DurabilityFailure`](./durability.md#durabilityfailure)

***

<a id="createrequirements"></a>

### CreateRequirements

> **CreateRequirements**\<`Agents`, `Plugins`, `Tools`\> = [`Runtime`](./runtime/namespaces/Runtime.md#runtime) \| `Agents`\[`number`\] *extends* `never` ? `never` : `LanguageModel.LanguageModel` \| [`Approvals`](./approvals.md#approvals) \| [`Permissions`](./permissions.md#permissions) \| `AgentServices`\<`Agents`\[`number`\]\> \| `PluginServices`\<`Plugins`\> \| `ToolServices`\<`Tools`\[`number`\]\>

#### Type Parameters

##### Agents

`Agents` *extends* `ReadonlyArray`\<[`Any`](./generalist/namespaces/Agent.md#any)\>

##### Plugins

`Plugins` *extends* `ReadonlyArray`\<[`Plugin`](#plugin)\<`ReadonlyArray`\<`Tool.Any`\>\>\>

##### Tools

`Tools` *extends* `ReadonlyArray`\<`Tool.Any`\> = `ReadonlyArray`\<`never`\>

***

<a id="encodedagentinput"></a>

### EncodedAgentInput

> **EncodedAgentInput** = `Schema.Json`

***

<a id="hostevent"></a>

### HostEvent

> **HostEvent** = *typeof* `HostEvent.Type`

One product-facing event at its exclusive Session cursor.

***

<a id="hostrun"></a>

### HostRun

> **HostRun**\<`Output`\> = `Omit`\<[`RunHandle`](./runtime/namespaces/Runtime.md#runhandle)\<`Output`\>, `"runId"`\> & `object`

#### Type Declaration

##### id

> `readonly` **id**: [`RunHandle`](./runtime/namespaces/Runtime.md#runhandle)\<`Output`\>\[`"runId"`\]

##### spawn

> `readonly` **spawn**: (`selection`, `prompt`, `options`) => `Effect.Effect`\<[`ChildHandle`](#childhandle), [`SpawnError`](./runtime/namespaces/Runtime.md#spawnerror) \| [`InspectError`](./runtime/namespaces/Runtime.md#inspecterror) \| [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

###### Parameters

###### selection

`string`

###### prompt

`Prompt.Prompt` \| `string`

###### options

[`ChildSpawnOptions`](#childspawnoptions)

###### Returns

`Effect.Effect`\<[`ChildHandle`](#childhandle), [`SpawnError`](./runtime/namespaces/Runtime.md#spawnerror) \| [`InspectError`](./runtime/namespaces/Runtime.md#inspecterror) \| [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror)\>

#### Type Parameters

##### Output

`Output`

***

<a id="hostsession-1"></a>

### HostSession

> **HostSession** = `Codec`\<[`HostSession`](#hostsession-1), `unknown`, `never`, `never`\>

***

<a id="hosttoolrun"></a>

### HostToolRun

> **HostToolRun**\<`Output`, `Failure`\> = `Omit`\<[`ToolRunHandle`](./runtime/namespaces/Runtime.md#toolrunhandle)\<`Output`, `Failure`\>, `"runId"`\> & `object`

#### Type Declaration

##### id

> `readonly` **id**: [`ToolRunHandle`](./runtime/namespaces/Runtime.md#toolrunhandle)\<`Output`, `Failure`\>\[`"runId"`\]

#### Type Parameters

##### Output

`Output`

##### Failure

`Failure`

***

<a id="previewdelivery"></a>

### PreviewDelivery

> **PreviewDelivery** = *typeof* `PreviewDelivery.Type`

One memory-only preview admitted by the Host against current storage authority.

***

<a id="queueerror"></a>

### QueueError

> **QueueError** = [`SessionError`](./runtime/namespaces/HostSession.md#sessionerror) \| [`SessionQueueConflict`](./runtime/namespaces/SessionQueue.md#sessionqueueconflict) \| [`AgentNotRegistered`](#agentnotregistered) \| [`UnknownAgent`](./runtime/namespaces/Errors.md#unknownagent)

***

<a id="runstarted"></a>

### RunStarted

> **RunStarted** = *typeof* `RunStarted.Type`

***

<a id="runstartoptions"></a>

### RunStartOptions

> **RunStartOptions** = `Pick`\<[`StartOptions`](./generalist/namespaces/Agent.md#startoptions), `"idempotencyKey"`\>

***

<a id="sessionfamilyinput"></a>

### SessionFamilyInput

> **SessionFamilyInput** = *typeof* `SessionFamilyInput.Type`

**`Experimental`**

Omit at on the first page; retain it on every continuation.

***

<a id="sessionfamilypage"></a>

### SessionFamilyPage

> **SessionFamilyPage** = *typeof* `SessionFamilyPage.Type`

**`Experimental`**

First-admission membership with at most 64 members per 256-event scan.

***

<a id="sessionhistoryinput"></a>

### SessionHistoryInput

> **SessionHistoryInput** = *typeof* `SessionHistoryInput.Type`

**`Experimental`**

A bounded selector over one immutable conversation path.

***

<a id="sessionrunsinput"></a>

### SessionRunsInput

> **SessionRunsInput** = *typeof* `SessionRunsInput.Type`

**`Experimental`**

Membership is pinned to at; summaries report current committed status.

***

<a id="tasksupdated"></a>

### TasksUpdated

> **TasksUpdated** = *typeof* `TasksUpdated.Type`

The authoritative journaled task list changed.

***

<a id="toolcall"></a>

### ToolCall

> **ToolCall** = *typeof* `ToolCall.Type`

***

<a id="turn-1"></a>

### Turn

> **Turn** = *typeof* `Turn.Type`

## Variables

<a id="artifactupdated-1"></a>

### ArtifactUpdated

> `const` **ArtifactUpdated**: `Schema.TaggedStruct`\<`"ArtifactUpdated"`, \{ `cursor`: `Schema.Int`; `runId`: `Schema.String`; `sessionId`: `Schema.String`; `update`: `Schema.Struct`\<\{ `artifact`: `Schema.String`; `attribution`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Agent"`, \{ `actor`: `Schema.String`; `runId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Human"`, \{ `actor`: `Schema.String`; \}\>\]\>; `base`: `Schema.Int`; `branch`: `Schema.optionalKey`\<`Schema.String`\>; `result`: `Schema.Int`; \}\>; \}\>

One Agent-authored shared artifact edit committed by this Run.

***

<a id="generalist"></a>

### Generalist

> `const` **Generalist**: `object`

Stable process-local product host.

#### Type Declaration

<a id="create"></a>

##### create

> `readonly` **create**: *typeof* `create`

<a id="plugin-1"></a>

##### plugin

> `readonly` **plugin**: *typeof* `plugin`

***

<a id="hostevent-1"></a>

### HostEvent

> `const` **HostEvent**: `Schema.Union`\<readonly \[*typeof* `RunStarted`, *typeof* `Turn`, *typeof* `ToolCall`, *typeof* [`TasksUpdated`](#tasksupdated-1), *typeof* [`ArtifactUpdated`](#artifactupdated-1), *typeof* `ApprovalRequested`, *typeof* `Compacted`, *typeof* `Completed`, *typeof* `Conversation`\]\>

One product-facing event at its exclusive Session cursor.

***

<a id="previewdelivery-1"></a>

### PreviewDelivery

> `const` **PreviewDelivery**: `Schema.TaggedStruct`\<`"PreviewDelivery"`, \{ `authorityAttemptFence`: `Schema.Int`; `event`: `Schema.Union`\<readonly \[`Schema.refine`\<\{ `_tag`: `"ModelPreview"`; `attempt`: `number`; `attemptFence`: `number`; `changes`: readonly \[\{ `channel`: ... \| ...; `delta`: `string`; `offset`: `number`; \}, `...(...)[]`\]; `generation`: `number`; `modelAttemptId`: `string`; `modelCallId`: `string`; `runId`: `string`; `sequence`: `number`; `turn`: `number`; \}, `Schema.TaggedStruct`\<`"ModelPreview"`, \{ `attempt`: `Schema.Int`; `attemptFence`: `Schema.Int`; `changes`: `Schema.NonEmptyArray`\<`Schema.Struct`\<\{ `channel`: ...; `delta`: ...; `offset`: ...; \}\>\>; `generation`: `Schema.Int`; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `runId`: `Schema.String`; `sequence`: `Schema.Int`; `turn`: `Schema.Int`; \}\>\>, `Schema.TaggedStruct`\<`"ModelPreviewCleared"`, \{ `attemptFence`: `Schema.Int`; `generation`: `Schema.Int`; `runId`: `Schema.String`; \}\>\]\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>

One memory-only preview admitted by the Host against current storage authority.

***

<a id="sessionfamilyinput-1"></a>

### SessionFamilyInput

> `const` **SessionFamilyInput**: `Schema.Struct`\<\{ `at`: `Schema.optionalKey`\<`Schema.Int`\>; `before`: `Schema.optionalKey`\<`Schema.Int`\>; `limit`: `Schema.Int`; \}\>

**`Experimental`**

Omit at on the first page; retain it on every continuation.

***

<a id="sessionfamilypage-1"></a>

### SessionFamilyPage

> `const` **SessionFamilyPage**: `Schema.Struct`\<\{ `at`: `Schema.Int`; `nextBefore`: `Schema.NullOr`\<`Schema.Int`\>; `rootSessionId`: `Schema.String`; `sessions`: `Schema.$Array`\<`Schema.Struct`\<\{ `depth`: `Schema.Int`; `id`: `Schema.String`; `initialRunId`: `Schema.String`; `parentRunId`: `Schema.NullOr`\<`Schema.String`\>; `parentSessionId`: `Schema.NullOr`\<`Schema.String`\>; `rootSessionId`: `Schema.String`; \}\>\>; \}\>

**`Experimental`**

First-admission membership with at most 64 members per 256-event scan.

***

<a id="sessionhistoryinput-1"></a>

### SessionHistoryInput

> `const` **SessionHistoryInput**: `Schema.Struct`\<\{ `leafId`: `Schema.NullOr`\<`Schema.String`\>; `limit`: `Schema.Int`; \}\>

**`Experimental`**

A bounded selector over one immutable conversation path.

***

<a id="sessionhistorypage-1"></a>

### SessionHistoryPage

> **SessionHistoryPage**: `Codec`\<[`SessionHistoryPage`](#sessionhistorypage), `unknown`, `never`, `never`\>

***

<a id="sessionrunsinput-1"></a>

### SessionRunsInput

> `const` **SessionRunsInput**: `Schema.Struct`\<\{ `at`: `Schema.Int`; `before`: `Schema.optionalKey`\<`Schema.Int`\>; `limit`: `Schema.Int`; `rootRunId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

**`Experimental`**

Membership is pinned to at; summaries report current committed status.

***

<a id="sessionrunspage-1"></a>

### SessionRunsPage

> **SessionRunsPage**: `Codec`\<[`SessionRunsPage`](#sessionrunspage), `unknown`, `never`, `never`\>

***

<a id="sessionrunsummary-1"></a>

### SessionRunSummary

> **SessionRunSummary**: `Codec`\<[`SessionRunSummary`](#sessionrunsummary), `unknown`, `never`, `never`\>

***

<a id="tasksupdated-1"></a>

### TasksUpdated

> `const` **TasksUpdated**: `Schema.TaggedStruct`\<`"TasksUpdated"`, \{ `cursor`: `Schema.Int`; `items`: `Schema.$Array`\<`Schema.Struct`\<\{ `id`: `Schema.String`; `note`: `Schema.optionalKey`\<`Schema.String`\>; `status`: `Schema.Literals`\<readonly \[`"todo"`, `"doing"`, `"done"`\]\>; `title`: `Schema.String`; \}\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>

The authoritative journaled task list changed.
