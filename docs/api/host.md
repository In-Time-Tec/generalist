[**generalist**](./index)

***

[generalist](./index) / host

# host

## Classes

### AgentInputInvalid

An untyped Host start input did not satisfy the configured Agent's input Schema.

#### Extends

- `AgentInputInvalid_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AgentInputInvalid_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`AgentInputInvalid_base.message`

##### name

> `readonly` **name**: `string`

###### Inherited from

`AgentInputInvalid_base.name`

***

### AgentNotRegistered

A Run start used an Agent that was not configured on this host.

#### Extends

- `AgentNotRegistered_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AgentNotRegistered_base.hint`

##### name

> `readonly` **name**: `string`

###### Inherited from

`AgentNotRegistered_base.name`

***

### PluginNameConflict

A plugin name was declared more than once in one host.

#### Extends

- `PluginNameConflict_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PluginNameConflict_base.hint`

##### name

> `readonly` **name**: `string`

###### Inherited from

`PluginNameConflict_base.name`

***

### PluginToolConflict

Two host declarations attempted to install the same static tool name.

#### Extends

- `PluginToolConflict_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PluginToolConflict_base.hint`

##### name

> `readonly` **name**: `string`

###### Inherited from

`PluginToolConflict_base.name`

##### sources

> `readonly` **sources**: readonly `string`[]

###### Inherited from

`PluginToolConflict_base.sources`

***

### SessionConflict

A host Session already owns the requested identity.

#### Extends

- `SessionConflict_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SessionConflict_base.hint`

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`SessionConflict_base.sessionId`

***

### SessionCursorExpired

A Session replay cursor is outside the driver's retained event range.

#### Extends

- `SessionCursorExpired_base`

#### Constructors

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

##### cursor

> `readonly` **cursor**: `number`

###### Inherited from

`SessionCursorExpired_base.cursor`

##### earliestCursor

> `readonly` **earliestCursor**: `number`

###### Inherited from

`SessionCursorExpired_base.earliestCursor`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SessionCursorExpired_base.hint`

##### latestCursor

> `readonly` **latestCursor**: `number`

###### Inherited from

`SessionCursorExpired_base.latestCursor`

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`SessionCursorExpired_base.sessionId`

***

### SessionNotFound

A requested host Session does not exist.

#### Extends

- `SessionNotFound_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SessionNotFound_base.hint`

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`SessionNotFound_base.sessionId`

***

### SessionSubscriberLagged

A Session event subscriber could not keep up with its bounded live queue.

#### Extends

- `SessionSubscriberLagged_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SessionSubscriberLagged_base.hint`

##### lastDeliveredCursor

> `readonly` **lastDeliveredCursor**: `number`

###### Inherited from

`SessionSubscriberLagged_base.lastDeliveredCursor`

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`SessionSubscriberLagged_base.sessionId`

## Interfaces

### CreateOptions

#### Type Parameters

##### Agents

`Agents` *extends* `ReadonlyArray`\<[`Any`](./generalist/namespaces/Agent#any)\>

##### Plugins

`Plugins` *extends* `ReadonlyArray`\<[`Plugin`](#plugin)\<`ReadonlyArray`\<`Tool.Any`\>\>\> = `ReadonlyArray`\<`never`\>

#### Properties

##### agents

> `readonly` **agents**: `Agents`

##### plugins?

> `readonly` `optional` **plugins?**: `Plugins`

***

### Host

#### Type Parameters

##### Agents

`Agents` *extends* `ReadonlyArray`\<[`Any`](./generalist/namespaces/Agent#any)\>

#### Properties

##### approvals

> `readonly` **approvals**: `object`

###### resolve

> `readonly` **resolve**: (`runId`, `token`, `decision`, `operator`) => `Effect`\<`void`, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`RunNotFound`](./runtime/namespaces/Errors#runnotfound) \| [`ApprovalStale`](./runtime/namespaces/Errors#approvalstale) \| [`ApprovalMismatch`](./runtime/namespaces/Errors#approvalmismatch) \| [`IllegalOperatorAction`](./runtime/namespaces/Errors#illegaloperatoraction)\>

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

`Effect`\<`void`, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`RunNotFound`](./runtime/namespaces/Errors#runnotfound) \| [`ApprovalStale`](./runtime/namespaces/Errors#approvalstale) \| [`ApprovalMismatch`](./runtime/namespaces/Errors#approvalmismatch) \| [`IllegalOperatorAction`](./runtime/namespaces/Errors#illegaloperatoraction)\>

##### attachments

> `readonly` **attachments**: `Attachments`

##### events

> `readonly` **events**: `object`

###### subscribe

> `readonly` **subscribe**: (`sessionId`, `cursor?`) => `Effect`\<`Stream`\<\{ `cursor`: `number`; `event`: `object` & `object` & `object`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `object` & `TurnCompleted` & `object` \| `object` & [`TurnStarted`](./generalist/namespaces/AgentEvent#turnstarted) & `object`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `object` & [`ToolExecutionCompleted`](./generalist/namespaces/AgentEvent#toolexecutioncompleted) & `object` \| `object` & [`ToolExecutionStarted`](./generalist/namespaces/AgentEvent#toolexecutionstarted) & `object` \| `object` & [`ToolExecutionWaiting`](./generalist/namespaces/AgentEvent#toolexecutionwaiting) & `object` \| `object` & [`ToolProgress`](./generalist/namespaces/AgentEvent#toolprogress) & `object`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `items`: readonly `object`[]; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `object` & [`ApprovalRequested`](./generalist/namespaces/AgentEvent#approvalrequested) & `object`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `object` & `object` & `object`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `object` & `object` & `object` \| `object` & `object` & `object` \| `object` & `object` & `object`; `runId`: `string`; `sessionId`: `string`; \}, [`SessionEventsError`](./runtime/namespaces/HostSession#sessioneventserror), `never`\>, [`SessionError`](./runtime/namespaces/HostSession#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### cursor?

`number`

###### Returns

`Effect`\<`Stream`\<\{ `cursor`: `number`; `event`: `object` & `object` & `object`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `object` & `TurnCompleted` & `object` \| `object` & [`TurnStarted`](./generalist/namespaces/AgentEvent#turnstarted) & `object`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `object` & [`ToolExecutionCompleted`](./generalist/namespaces/AgentEvent#toolexecutioncompleted) & `object` \| `object` & [`ToolExecutionStarted`](./generalist/namespaces/AgentEvent#toolexecutionstarted) & `object` \| `object` & [`ToolExecutionWaiting`](./generalist/namespaces/AgentEvent#toolexecutionwaiting) & `object` \| `object` & [`ToolProgress`](./generalist/namespaces/AgentEvent#toolprogress) & `object`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `items`: readonly `object`[]; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `object` & [`ApprovalRequested`](./generalist/namespaces/AgentEvent#approvalrequested) & `object`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `object` & `object` & `object`; `runId`: `string`; `sessionId`: `string`; \} \| \{ `cursor`: `number`; `event`: `object` & `object` & `object` \| `object` & `object` & `object` \| `object` & `object` & `object`; `runId`: `string`; `sessionId`: `string`; \}, [`SessionEventsError`](./runtime/namespaces/HostSession#sessioneventserror), `never`\>, [`SessionError`](./runtime/namespaces/HostSession#sessionerror)\>

##### operator

> `readonly` **operator**: `object`

###### explain

> `readonly` **explain**: (`runId`) => `Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`InspectError`](./runtime/namespaces/Runtime#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `decision`: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}; `lastSequence`: `number`; `obligations`: readonly (\{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \})[]; `status`: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`InspectError`](./runtime/namespaces/Runtime#inspecterror)\>

###### extendBudget

> `readonly` **extendBudget**: (`runId`, `delta`, `operator`) => `Effect`\<`void`, [`OperatorExtendBudgetError`](./runtime/namespaces/Runtime#operatorextendbudgeterror)\>

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

###### Returns

`Effect`\<`void`, [`OperatorExtendBudgetError`](./runtime/namespaces/Runtime#operatorextendbudgeterror)\>

###### resolveUnknown

> `readonly` **resolveUnknown**: (`runId`, `operationId`, `resolution`, `operator`) => `Effect`\<`void`, [`OperatorActionError`](./runtime/namespaces/Runtime#operatoractionerror)\>

###### Parameters

###### runId

`string`

###### operationId

`string`

###### resolution

\{ `outcome`: `"succeeded"`; `result`: `unknown`; \} \| \{ `error`: `unknown`; `outcome`: `"failed"`; \}

###### operator

`string`

###### Returns

`Effect`\<`void`, [`OperatorActionError`](./runtime/namespaces/Runtime#operatoractionerror)\>

###### retry

> `readonly` **retry**: (`runId`, `operator`) => `Effect`\<`void`, [`OperatorActionError`](./runtime/namespaces/Runtime#operatoractionerror)\>

###### Parameters

###### runId

`string`

###### operator

`string`

###### Returns

`Effect`\<`void`, [`OperatorActionError`](./runtime/namespaces/Runtime#operatoractionerror)\>

###### wake

> `readonly` **wake**: (`runId`, `operator`) => `Effect`\<`void`, [`OperatorActionError`](./runtime/namespaces/Runtime#operatoractionerror)\>

###### Parameters

###### runId

`string`

###### operator

`string`

###### Returns

`Effect`\<`void`, [`OperatorActionError`](./runtime/namespaces/Runtime#operatoractionerror)\>

##### runs

> `readonly` **runs**: `object`

###### cancel

> `readonly` **cancel**: (`runId`, `reason?`) => `Effect`\<`void`, [`CancelError`](./runtime/namespaces/Runtime#cancelerror)\>

###### Parameters

###### runId

`string`

###### reason?

`string`

###### Returns

`Effect`\<`void`, [`CancelError`](./runtime/namespaces/Runtime#cancelerror)\>

###### inspect

> `readonly` **inspect**: (`runId`) => `Effect`\<[`RuntimeInspection`](./runtime/namespaces/Runtime#runtimeinspection), [`InspectError`](./runtime/namespaces/Runtime#inspecterror)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RuntimeInspection`](./runtime/namespaces/Runtime#runtimeinspection), [`InspectError`](./runtime/namespaces/Runtime#inspecterror)\>

###### list

> `readonly` **list**: (`sessionId`) => `Effect`\<readonly [`RunInspection`](./runtime/namespaces/Run#runinspection)[], [`SessionError`](./runtime/namespaces/HostSession#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<readonly [`RunInspection`](./runtime/namespaces/Run#runinspection)[], [`SessionError`](./runtime/namespaces/HostSession#sessionerror)\>

###### rewind

> `readonly` **rewind**: (`runId`, `options`) => `Effect`\<`void`, `RewindError`\>

###### Parameters

###### runId

`string`

###### options

[`RewindOptions`](./runtime/namespaces/Fork#rewindoptions)

###### Returns

`Effect`\<`void`, `RewindError`\>

###### send

> `readonly` **send**: `RunSend`

###### start

> `readonly` **start**: \<`Selected`\>(`sessionId`, `agent`, `input`, `options?`) => `Effect`\<[`HostRun`](#hostrun)\<[`Output`](./generalist/namespaces/Agent#output-5)\<`Selected`\>\>, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`SessionNotFound`](#sessionnotfound) \| [`ChildDepthExceeded`](./runtime/namespaces/Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./runtime/namespaces/Errors#childlimitexceeded) \| [`IdempotencyConflict`](./runtime/namespaces/Errors#idempotencyconflict) \| [`RunIdConflict`](./runtime/namespaces/Errors#runidconflict) \| [`ExecutableIdentityMismatch`](./runtime/namespaces/Errors#executableidentitymismatch) \| [`ExecutablePinMissing`](./runtime/namespaces/Errors#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./runtime/namespaces/Errors#executableregistrationinvalid) \| [`ExecutableRegistrationConflict`](./runtime/namespaces/Errors#executableregistrationconflict) \| [`ExecutableRegistrationMissing`](./runtime/namespaces/Errors#executableregistrationmissing) \| [`ChildSelectionMissing`](./runtime/namespaces/Errors#childselectionmissing) \| [`StartInvalid`](./runtime/namespaces/Errors#startinvalid) \| [`FanOutConflict`](./runtime/namespaces/Errors#fanoutconflict) \| [`FanOutInvalid`](./runtime/namespaces/Errors#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./runtime/namespaces/Errors#fanoutremainderunsupported) \| [`TreePolicyInvalid`](./runtime/namespaces/Errors#treepolicyinvalid) \| [`Exhausted`](./generalist/namespaces/RunBudget#exhausted) \| [`UnknownAgent`](./runtime/namespaces/Errors#unknownagent) \| [`AgentError`](./generalist/namespaces/AgentEvent#agenterror) \| [`AgentNotRegistered`](#agentnotregistered)\>

###### Type Parameters

###### Selected

`Selected` *extends* [`Any`](./generalist/namespaces/Agent#any)

###### Parameters

###### sessionId

`string`

###### agent

`Selected`

###### input

[`Input`](./generalist/namespaces/Agent#input-5)\<`Selected`\>

###### options?

[`RunStartOptions`](#runstartoptions)

###### Returns

`Effect`\<[`HostRun`](#hostrun)\<[`Output`](./generalist/namespaces/Agent#output-5)\<`Selected`\>\>, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`SessionNotFound`](#sessionnotfound) \| [`ChildDepthExceeded`](./runtime/namespaces/Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./runtime/namespaces/Errors#childlimitexceeded) \| [`IdempotencyConflict`](./runtime/namespaces/Errors#idempotencyconflict) \| [`RunIdConflict`](./runtime/namespaces/Errors#runidconflict) \| [`ExecutableIdentityMismatch`](./runtime/namespaces/Errors#executableidentitymismatch) \| [`ExecutablePinMissing`](./runtime/namespaces/Errors#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./runtime/namespaces/Errors#executableregistrationinvalid) \| [`ExecutableRegistrationConflict`](./runtime/namespaces/Errors#executableregistrationconflict) \| [`ExecutableRegistrationMissing`](./runtime/namespaces/Errors#executableregistrationmissing) \| [`ChildSelectionMissing`](./runtime/namespaces/Errors#childselectionmissing) \| [`StartInvalid`](./runtime/namespaces/Errors#startinvalid) \| [`FanOutConflict`](./runtime/namespaces/Errors#fanoutconflict) \| [`FanOutInvalid`](./runtime/namespaces/Errors#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./runtime/namespaces/Errors#fanoutremainderunsupported) \| [`TreePolicyInvalid`](./runtime/namespaces/Errors#treepolicyinvalid) \| [`Exhausted`](./generalist/namespaces/RunBudget#exhausted) \| [`UnknownAgent`](./runtime/namespaces/Errors#unknownagent) \| [`AgentError`](./generalist/namespaces/AgentEvent#agenterror) \| [`AgentNotRegistered`](#agentnotregistered)\>

###### startByName

> `readonly` **startByName**: (`sessionId`, `agent`, `input`, `options?`) => `Effect`\<[`HostRun`](#hostrun)\<`unknown`\>, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`SessionNotFound`](#sessionnotfound) \| [`ChildDepthExceeded`](./runtime/namespaces/Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./runtime/namespaces/Errors#childlimitexceeded) \| [`IdempotencyConflict`](./runtime/namespaces/Errors#idempotencyconflict) \| [`RunIdConflict`](./runtime/namespaces/Errors#runidconflict) \| [`ExecutableIdentityMismatch`](./runtime/namespaces/Errors#executableidentitymismatch) \| [`ExecutablePinMissing`](./runtime/namespaces/Errors#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./runtime/namespaces/Errors#executableregistrationinvalid) \| [`ExecutableRegistrationConflict`](./runtime/namespaces/Errors#executableregistrationconflict) \| [`ExecutableRegistrationMissing`](./runtime/namespaces/Errors#executableregistrationmissing) \| [`ChildSelectionMissing`](./runtime/namespaces/Errors#childselectionmissing) \| [`StartInvalid`](./runtime/namespaces/Errors#startinvalid) \| [`FanOutConflict`](./runtime/namespaces/Errors#fanoutconflict) \| [`FanOutInvalid`](./runtime/namespaces/Errors#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./runtime/namespaces/Errors#fanoutremainderunsupported) \| [`TreePolicyInvalid`](./runtime/namespaces/Errors#treepolicyinvalid) \| [`Exhausted`](./generalist/namespaces/RunBudget#exhausted) \| [`UnknownAgent`](./runtime/namespaces/Errors#unknownagent) \| [`AgentError`](./generalist/namespaces/AgentEvent#agenterror) \| [`AgentNotRegistered`](#agentnotregistered) \| [`AgentInputInvalid`](#agentinputinvalid)\>

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

`Effect`\<[`HostRun`](#hostrun)\<`unknown`\>, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`SessionNotFound`](#sessionnotfound) \| [`ChildDepthExceeded`](./runtime/namespaces/Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./runtime/namespaces/Errors#childlimitexceeded) \| [`IdempotencyConflict`](./runtime/namespaces/Errors#idempotencyconflict) \| [`RunIdConflict`](./runtime/namespaces/Errors#runidconflict) \| [`ExecutableIdentityMismatch`](./runtime/namespaces/Errors#executableidentitymismatch) \| [`ExecutablePinMissing`](./runtime/namespaces/Errors#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./runtime/namespaces/Errors#executableregistrationinvalid) \| [`ExecutableRegistrationConflict`](./runtime/namespaces/Errors#executableregistrationconflict) \| [`ExecutableRegistrationMissing`](./runtime/namespaces/Errors#executableregistrationmissing) \| [`ChildSelectionMissing`](./runtime/namespaces/Errors#childselectionmissing) \| [`StartInvalid`](./runtime/namespaces/Errors#startinvalid) \| [`FanOutConflict`](./runtime/namespaces/Errors#fanoutconflict) \| [`FanOutInvalid`](./runtime/namespaces/Errors#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./runtime/namespaces/Errors#fanoutremainderunsupported) \| [`TreePolicyInvalid`](./runtime/namespaces/Errors#treepolicyinvalid) \| [`Exhausted`](./generalist/namespaces/RunBudget#exhausted) \| [`UnknownAgent`](./runtime/namespaces/Errors#unknownagent) \| [`AgentError`](./generalist/namespaces/AgentEvent#agenterror) \| [`AgentNotRegistered`](#agentnotregistered) \| [`AgentInputInvalid`](#agentinputinvalid)\>

##### sessions

> `readonly` **sessions**: `object`

###### create

> `readonly` **create**: (`options?`) => `Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`CreateSessionError`](./runtime/namespaces/HostSession#createsessionerror)\>

###### Parameters

###### options?

[`SessionCreateOptions`](#sessioncreateoptions)

###### Returns

`Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`CreateSessionError`](./runtime/namespaces/HostSession#createsessionerror)\>

###### fork

> `readonly` **fork**: (`runId`, `options`) => `Effect`\<[`HostRun`](#hostrun)\<`unknown`\>, `ForkError`\>

###### Parameters

###### runId

`string`

###### options

[`ForkOptions`](./runtime/namespaces/Fork#forkoptions)

###### Returns

`Effect`\<[`HostRun`](#hostrun)\<`unknown`\>, `ForkError`\>

###### get

> `readonly` **get**: (`sessionId`) => `Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`SessionError`](./runtime/namespaces/HostSession#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`SessionError`](./runtime/namespaces/HostSession#sessionerror)\>

###### list

> `readonly` **list**: () => `Effect`\<readonly `object`[], [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable)\>

###### Returns

`Effect`\<readonly `object`[], [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable)\>

***

### Plugin

One deterministic collection of host-owned Agent contributions.

#### Type Parameters

##### Tools

`Tools` *extends* `ReadonlyArray`\<`Tool.Any`\> = `ReadonlyArray`\<`never`\>

#### Properties

##### hooks?

> `readonly` `optional` **hooks?**: readonly [`Declaration`](./hooks#declaration)[]

##### instructions?

> `readonly` `optional` **instructions?**: readonly [`Provider`](./instructions/index#provider)\<`never`\>[]

##### name

> `readonly` **name**: `string`

##### skills?

> `readonly` `optional` **skills?**: readonly [`Skill`](./generalist/namespaces/SkillCatalog#skill)[]

##### tools?

> `readonly` `optional` **tools?**: `Tools`

***

### PluginOptions

#### Type Parameters

##### Tools

`Tools` *extends* `ReadonlyArray`\<`Tool.Any`\> = `ReadonlyArray`\<`never`\>

#### Properties

##### hooks?

> `readonly` `optional` **hooks?**: readonly [`Declaration`](./hooks#declaration)[]

##### instructions?

> `readonly` `optional` **instructions?**: readonly [`Provider`](./instructions/index#provider)\<`never`\>[]

##### name

> `readonly` **name**: `string`

##### skills?

> `readonly` `optional` **skills?**: readonly [`Skill`](./generalist/namespaces/SkillCatalog#skill)[]

##### tools?

> `readonly` `optional` **tools?**: `Tools`

***

### RunStartOptions

#### Properties

##### idempotencyKey?

> `readonly` `optional` **idempotencyKey?**: `string`

***

### SessionCreateOptions

#### Properties

##### id?

> `readonly` `optional` **id?**: `string`

##### title?

> `readonly` `optional` **title?**: `string`

## Type Aliases

### ApprovalRequested

> **ApprovalRequested** = *typeof* `ApprovalRequested.Type`

***

### Compacted

> **Compacted** = *typeof* `Compacted.Type`

***

### Completed

> **Completed** = *typeof* `Completed.Type`

***

### CreateError

> **CreateError** = [`DuplicateAgent`](./runtime/namespaces/Errors#duplicateagent) \| [`PluginNameConflict`](#pluginnameconflict) \| [`PluginToolConflict`](#plugintoolconflict)

***

### CreateRequirements

> **CreateRequirements**\<`Agents`, `Plugins`\> = [`Runtime`](./runtime/namespaces/Runtime#runtime) \| `LanguageModel.LanguageModel` \| [`Approvals`](./approvals#approvals) \| [`Permissions`](./permissions#permissions) \| `AgentServices`\<`Agents`\[`number`\]\> \| `PluginServices`\<`Plugins`\>

#### Type Parameters

##### Agents

`Agents` *extends* `ReadonlyArray`\<[`Any`](./generalist/namespaces/Agent#any)\>

##### Plugins

`Plugins` *extends* `ReadonlyArray`\<[`Plugin`](#plugin)\<`ReadonlyArray`\<`Tool.Any`\>\>\>

***

### EncodedAgentInput

> **EncodedAgentInput** = `Schema.Json`

***

### HostEvent

> **HostEvent** = *typeof* `HostEvent.Type`

One product-facing event at its exclusive Session cursor.

***

### HostRun

> **HostRun**\<`Output`\> = `Omit`\<[`RunHandle`](./runtime/namespaces/Runtime#runhandle)\<`Output`\>, `"runId"`\> & `object`

#### Type Declaration

##### id

> `readonly` **id**: [`RunHandle`](./runtime/namespaces/Runtime#runhandle)\<`Output`\>\[`"runId"`\]

#### Type Parameters

##### Output

`Output`

***

### HostSession

> **HostSession** = `Struct`\<\{ `createdAt`: `String`; `id`: `String`; `title`: `optionalKey`\<`String`\>; \}\>

Durable product-facing Session metadata owned by a Runtime driver.

***

### HostSession

> **HostSession** = *typeof* `HostSession.Type`

Durable product-facing Session metadata owned by a Runtime driver.

***

### RunStarted

> **RunStarted** = *typeof* `RunStarted.Type`

***

### TasksUpdated

> **TasksUpdated** = *typeof* `TasksUpdated.Type`

The authoritative journaled task list changed.

***

### ToolCall

> **ToolCall** = *typeof* `ToolCall.Type`

***

### Turn

> **Turn** = *typeof* `Turn.Type`

## Variables

### Generalist

> `const` **Generalist**: `object`

Stable process-local product host.

#### Type Declaration

##### create

> `readonly` **create**: *typeof* `create`

##### plugin

> `readonly` **plugin**: *typeof* `plugin`

***

### HostEvent

> `const` **HostEvent**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"RunStarted"`, \{ `cursor`: `Schema.Int`; `event`: `Schema.refine`\<`object` & `object` & `object`, `Schema.Codec`\<[`RunEvent`](./runtime/namespaces/RunEvent#runevent), `object` & \{ `_tag`: ...; `compactionId?`: ...; `deliveryId`: ...; `model?`: ...; `modelCallId`: ...; `provider?`: ...; `purpose`: ...; `startedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `deliveryId`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `registrationKey?`: ...; `startedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `deliveryId`: ...; `kind`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `category`: ...; `classification`: ...; `deliveryId`: ...; `disposition`: ...; `failedAt`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `providerUsage?`: ...; `registrationKey?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `category`: ...; `delayMillis`: ...; `deliveryId`: ...; `modelCallId`: ...; `reason`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `category`: ...; `deliveryId`: ...; `fromCandidate`: ...; `fromModel`: ...; `fromProvider`: ...; `fromRegistrationKey?`: ...; `modelCallId`: ...; `toCandidate`: ...; `toModel`: ...; `toProvider`: ...; `toRegistrationKey?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempts`: ...; `category`: ...; `classification`: ...; `deliveryId`: ...; `failedAt`: ...; `failedAttemptUsage?`: ...; `modelCallId`: ...; `purpose`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `contextTokensBefore?`: ...; `deliveryId`: ...; `entriesBefore?`: ...; `startedAt`: ...; `trigger`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `deliveryId`: ...; `skippedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `appliedAt`: ...; `checkpointId`: ...; `commit`: ...; `compactionId`: ...; `deliveryId`: ...; `kind`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `deliveryId`: ...; `failedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `metadata?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `budgetCharge`: ...; `digest`: ...; `finishReason?`: ...; `metadata?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `operationKey`: ...; `sessionEntryId`: ...; `sessionId`: ...; `sessionParentId`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `digest`: ...; `finishReason?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `operationKey`: ...; `reason`: ...; `sessionEntryId`: ...; `sessionId`: ...; `sessionParentId`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `data?`: ...; `message?`: ...; `metadata?`: ...; `toolCallId`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `result`: ...; `tasksUpdated?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `awaitEvent?`: ...; `call`: ...; `metadata?`: ...; `token`: ...; `turn`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `reason?`: ...; `source`: ...; `target`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `source`: ...; `target`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `reason`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `request`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `count`: ...; `metadata?`: ...; `queue`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `finishReason?`: ...; `metadata?`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `evidence`: ...; `name`: ...; `turn`: ...; `verdict`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `completedAt`: ...; `deliveryId`: ...; `finishReason`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `providerMetadata?`: ...; `registrationKey?`: ...; `requestId?`: ...; `responseModel?`: ...; `serviceTier?`: ...; `turn`: ...; `usage`: ...; `usageAt`: ...; \} \| \{ `_tag`: ...; `attempts`: ...; `completedAt`: ...; `deliveryId`: ...; `failedAttemptUsage?`: ...; `finishReason?`: ...; `modelCallId`: ...; `purpose`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `deadline`: ...; `filter`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `dedupeKey`: ...; \} \| \{ `_tag`: ...; `deadline`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `event`: ...; \} \| \{ `_tag`: ...; `address`: ...; `budget?`: ...; `messageId`: ...; \} \| \{ `_tag`: ...; `delta`: ...; \} \| \{ `_tag`: ...; `budget`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; \} \| \{ `_tag`: ...; `wait`: ...; \} \| \{ `_tag`: ...; `resolution`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `addressed?`: ...; `digest`: ...; `entryId`: ...; `from`: ...; `idempotencyKey`: ...; `inboxSequence`: ...; `message`: ...; `policy`: ...; \} \| \{ `_tag`: ...; `digest`: ...; `entryId`: ...; `idempotencyKey`: ...; `prompt`: ...; `steeringSequence`: ...; \} \| \{ `_tag`: ...; `entryIds`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `entryIds`: ...; `reason`: ...; \} \| \{ `_tag`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `budget?`: ...; `childDepth`: ...; `childRunId`: ...; `inherit`: ...; `invocationId`: ...; `key?`: ...; `label?`: ...; `origin?`: ...; `prompt`: ...; `readiness`: ...; `selection`: ...; \} \| \{ `_tag`: ...; `childRunId`: ...; `readiness`: ...; \} \| \{ `_tag`: ...; `childRunId`: ...; `spend?`: ...; `terminalEventId`: ...; \} \| \{ `_tag`: ...; `concurrency`: ...; `fanOutId`: ...; `join`: ...; `memberCount`: ...; `remainder`: ...; \} \| \{ `_tag`: ...; `abandoned`: ...; `cancelled`: ...; `failed`: ...; `fanOutId`: ...; `remainder`: ...; `status`: ...; `succeeded`: ...; \} \| \{ `_tag`: ...; `result`: ...; \} \| \{ `_tag`: ...; `error`: ...; \} \| \{ `_tag`: ...; `reason?`: ...; \} \| \{ `_tag`: ...; `reason?`: ...; \} \| \{ `_tag`: ...; `data?`: ...; `level`: ...; `message`: ...; `operation`: ...; \} \| \{ `_tag`: ...; `leaf`: ...; `source`: ...; `value`: ...; \}, `never`, `never`\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Turn"`, \{ `cursor`: `Schema.Int`; `event`: `Schema.refine`\<`object` & `TurnCompleted` & `object` \| `object` & [`TurnStarted`](./generalist/namespaces/AgentEvent#turnstarted) & `object`, `Schema.Codec`\<[`RunEvent`](./runtime/namespaces/RunEvent#runevent), `object` & \{ `_tag`: ...; `compactionId?`: ...; `deliveryId`: ...; `model?`: ...; `modelCallId`: ...; `provider?`: ...; `purpose`: ...; `startedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `deliveryId`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `registrationKey?`: ...; `startedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `deliveryId`: ...; `kind`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `category`: ...; `classification`: ...; `deliveryId`: ...; `disposition`: ...; `failedAt`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `providerUsage?`: ...; `registrationKey?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `category`: ...; `delayMillis`: ...; `deliveryId`: ...; `modelCallId`: ...; `reason`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `category`: ...; `deliveryId`: ...; `fromCandidate`: ...; `fromModel`: ...; `fromProvider`: ...; `fromRegistrationKey?`: ...; `modelCallId`: ...; `toCandidate`: ...; `toModel`: ...; `toProvider`: ...; `toRegistrationKey?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempts`: ...; `category`: ...; `classification`: ...; `deliveryId`: ...; `failedAt`: ...; `failedAttemptUsage?`: ...; `modelCallId`: ...; `purpose`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `contextTokensBefore?`: ...; `deliveryId`: ...; `entriesBefore?`: ...; `startedAt`: ...; `trigger`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `deliveryId`: ...; `skippedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `appliedAt`: ...; `checkpointId`: ...; `commit`: ...; `compactionId`: ...; `deliveryId`: ...; `kind`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `deliveryId`: ...; `failedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `metadata?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `budgetCharge`: ...; `digest`: ...; `finishReason?`: ...; `metadata?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `operationKey`: ...; `sessionEntryId`: ...; `sessionId`: ...; `sessionParentId`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `digest`: ...; `finishReason?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `operationKey`: ...; `reason`: ...; `sessionEntryId`: ...; `sessionId`: ...; `sessionParentId`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `data?`: ...; `message?`: ...; `metadata?`: ...; `toolCallId`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `result`: ...; `tasksUpdated?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `awaitEvent?`: ...; `call`: ...; `metadata?`: ...; `token`: ...; `turn`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `reason?`: ...; `source`: ...; `target`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `source`: ...; `target`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `reason`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `request`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `count`: ...; `metadata?`: ...; `queue`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `finishReason?`: ...; `metadata?`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `evidence`: ...; `name`: ...; `turn`: ...; `verdict`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `completedAt`: ...; `deliveryId`: ...; `finishReason`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `providerMetadata?`: ...; `registrationKey?`: ...; `requestId?`: ...; `responseModel?`: ...; `serviceTier?`: ...; `turn`: ...; `usage`: ...; `usageAt`: ...; \} \| \{ `_tag`: ...; `attempts`: ...; `completedAt`: ...; `deliveryId`: ...; `failedAttemptUsage?`: ...; `finishReason?`: ...; `modelCallId`: ...; `purpose`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `deadline`: ...; `filter`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `dedupeKey`: ...; \} \| \{ `_tag`: ...; `deadline`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `event`: ...; \} \| \{ `_tag`: ...; `address`: ...; `budget?`: ...; `messageId`: ...; \} \| \{ `_tag`: ...; `delta`: ...; \} \| \{ `_tag`: ...; `budget`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; \} \| \{ `_tag`: ...; `wait`: ...; \} \| \{ `_tag`: ...; `resolution`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `addressed?`: ...; `digest`: ...; `entryId`: ...; `from`: ...; `idempotencyKey`: ...; `inboxSequence`: ...; `message`: ...; `policy`: ...; \} \| \{ `_tag`: ...; `digest`: ...; `entryId`: ...; `idempotencyKey`: ...; `prompt`: ...; `steeringSequence`: ...; \} \| \{ `_tag`: ...; `entryIds`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `entryIds`: ...; `reason`: ...; \} \| \{ `_tag`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `budget?`: ...; `childDepth`: ...; `childRunId`: ...; `inherit`: ...; `invocationId`: ...; `key?`: ...; `label?`: ...; `origin?`: ...; `prompt`: ...; `readiness`: ...; `selection`: ...; \} \| \{ `_tag`: ...; `childRunId`: ...; `readiness`: ...; \} \| \{ `_tag`: ...; `childRunId`: ...; `spend?`: ...; `terminalEventId`: ...; \} \| \{ `_tag`: ...; `concurrency`: ...; `fanOutId`: ...; `join`: ...; `memberCount`: ...; `remainder`: ...; \} \| \{ `_tag`: ...; `abandoned`: ...; `cancelled`: ...; `failed`: ...; `fanOutId`: ...; `remainder`: ...; `status`: ...; `succeeded`: ...; \} \| \{ `_tag`: ...; `result`: ...; \} \| \{ `_tag`: ...; `error`: ...; \} \| \{ `_tag`: ...; `reason?`: ...; \} \| \{ `_tag`: ...; `reason?`: ...; \} \| \{ `_tag`: ...; `data?`: ...; `level`: ...; `message`: ...; `operation`: ...; \} \| \{ `_tag`: ...; `leaf`: ...; `source`: ...; `value`: ...; \}, `never`, `never`\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ToolCall"`, \{ `cursor`: `Schema.Int`; `event`: `Schema.refine`\<`object` & [`ToolExecutionCompleted`](./generalist/namespaces/AgentEvent#toolexecutioncompleted) & `object` \| `object` & [`ToolExecutionStarted`](./generalist/namespaces/AgentEvent#toolexecutionstarted) & `object` \| `object` & [`ToolExecutionWaiting`](./generalist/namespaces/AgentEvent#toolexecutionwaiting) & `object` \| `object` & [`ToolProgress`](./generalist/namespaces/AgentEvent#toolprogress) & `object`, `Schema.Codec`\<[`RunEvent`](./runtime/namespaces/RunEvent#runevent), `object` & \{ `_tag`: ...; `compactionId?`: ...; `deliveryId`: ...; `model?`: ...; `modelCallId`: ...; `provider?`: ...; `purpose`: ...; `startedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `deliveryId`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `registrationKey?`: ...; `startedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `deliveryId`: ...; `kind`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `category`: ...; `classification`: ...; `deliveryId`: ...; `disposition`: ...; `failedAt`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `providerUsage?`: ...; `registrationKey?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `category`: ...; `delayMillis`: ...; `deliveryId`: ...; `modelCallId`: ...; `reason`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `category`: ...; `deliveryId`: ...; `fromCandidate`: ...; `fromModel`: ...; `fromProvider`: ...; `fromRegistrationKey?`: ...; `modelCallId`: ...; `toCandidate`: ...; `toModel`: ...; `toProvider`: ...; `toRegistrationKey?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempts`: ...; `category`: ...; `classification`: ...; `deliveryId`: ...; `failedAt`: ...; `failedAttemptUsage?`: ...; `modelCallId`: ...; `purpose`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `contextTokensBefore?`: ...; `deliveryId`: ...; `entriesBefore?`: ...; `startedAt`: ...; `trigger`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `deliveryId`: ...; `skippedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `appliedAt`: ...; `checkpointId`: ...; `commit`: ...; `compactionId`: ...; `deliveryId`: ...; `kind`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `deliveryId`: ...; `failedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `metadata?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `budgetCharge`: ...; `digest`: ...; `finishReason?`: ...; `metadata?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `operationKey`: ...; `sessionEntryId`: ...; `sessionId`: ...; `sessionParentId`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `digest`: ...; `finishReason?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `operationKey`: ...; `reason`: ...; `sessionEntryId`: ...; `sessionId`: ...; `sessionParentId`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `data?`: ...; `message?`: ...; `metadata?`: ...; `toolCallId`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `result`: ...; `tasksUpdated?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `awaitEvent?`: ...; `call`: ...; `metadata?`: ...; `token`: ...; `turn`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `reason?`: ...; `source`: ...; `target`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `source`: ...; `target`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `reason`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `request`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `count`: ...; `metadata?`: ...; `queue`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `finishReason?`: ...; `metadata?`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `evidence`: ...; `name`: ...; `turn`: ...; `verdict`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `completedAt`: ...; `deliveryId`: ...; `finishReason`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `providerMetadata?`: ...; `registrationKey?`: ...; `requestId?`: ...; `responseModel?`: ...; `serviceTier?`: ...; `turn`: ...; `usage`: ...; `usageAt`: ...; \} \| \{ `_tag`: ...; `attempts`: ...; `completedAt`: ...; `deliveryId`: ...; `failedAttemptUsage?`: ...; `finishReason?`: ...; `modelCallId`: ...; `purpose`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `deadline`: ...; `filter`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `dedupeKey`: ...; \} \| \{ `_tag`: ...; `deadline`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `event`: ...; \} \| \{ `_tag`: ...; `address`: ...; `budget?`: ...; `messageId`: ...; \} \| \{ `_tag`: ...; `delta`: ...; \} \| \{ `_tag`: ...; `budget`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; \} \| \{ `_tag`: ...; `wait`: ...; \} \| \{ `_tag`: ...; `resolution`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `addressed?`: ...; `digest`: ...; `entryId`: ...; `from`: ...; `idempotencyKey`: ...; `inboxSequence`: ...; `message`: ...; `policy`: ...; \} \| \{ `_tag`: ...; `digest`: ...; `entryId`: ...; `idempotencyKey`: ...; `prompt`: ...; `steeringSequence`: ...; \} \| \{ `_tag`: ...; `entryIds`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `entryIds`: ...; `reason`: ...; \} \| \{ `_tag`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `budget?`: ...; `childDepth`: ...; `childRunId`: ...; `inherit`: ...; `invocationId`: ...; `key?`: ...; `label?`: ...; `origin?`: ...; `prompt`: ...; `readiness`: ...; `selection`: ...; \} \| \{ `_tag`: ...; `childRunId`: ...; `readiness`: ...; \} \| \{ `_tag`: ...; `childRunId`: ...; `spend?`: ...; `terminalEventId`: ...; \} \| \{ `_tag`: ...; `concurrency`: ...; `fanOutId`: ...; `join`: ...; `memberCount`: ...; `remainder`: ...; \} \| \{ `_tag`: ...; `abandoned`: ...; `cancelled`: ...; `failed`: ...; `fanOutId`: ...; `remainder`: ...; `status`: ...; `succeeded`: ...; \} \| \{ `_tag`: ...; `result`: ...; \} \| \{ `_tag`: ...; `error`: ...; \} \| \{ `_tag`: ...; `reason?`: ...; \} \| \{ `_tag`: ...; `reason?`: ...; \} \| \{ `_tag`: ...; `data?`: ...; `level`: ...; `message`: ...; `operation`: ...; \} \| \{ `_tag`: ...; `leaf`: ...; `source`: ...; `value`: ...; \}, `never`, `never`\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"TasksUpdated"`, \{ `cursor`: `Schema.Int`; `items`: `Schema.$Array`\<`Schema.Struct`\<\{ `id`: `Schema.String`; `note`: `Schema.optionalKey`\<`Schema.String`\>; `status`: `Schema.Literals`\<readonly \[..., ..., ...\]\>; `title`: `Schema.String`; \}\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ApprovalRequested"`, \{ `cursor`: `Schema.Int`; `event`: `Schema.refine`\<`object` & [`ApprovalRequested`](./generalist/namespaces/AgentEvent#approvalrequested) & `object`, `Schema.Codec`\<[`RunEvent`](./runtime/namespaces/RunEvent#runevent), `object` & \{ `_tag`: ...; `compactionId?`: ...; `deliveryId`: ...; `model?`: ...; `modelCallId`: ...; `provider?`: ...; `purpose`: ...; `startedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `deliveryId`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `registrationKey?`: ...; `startedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `deliveryId`: ...; `kind`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `category`: ...; `classification`: ...; `deliveryId`: ...; `disposition`: ...; `failedAt`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `providerUsage?`: ...; `registrationKey?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `category`: ...; `delayMillis`: ...; `deliveryId`: ...; `modelCallId`: ...; `reason`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `category`: ...; `deliveryId`: ...; `fromCandidate`: ...; `fromModel`: ...; `fromProvider`: ...; `fromRegistrationKey?`: ...; `modelCallId`: ...; `toCandidate`: ...; `toModel`: ...; `toProvider`: ...; `toRegistrationKey?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempts`: ...; `category`: ...; `classification`: ...; `deliveryId`: ...; `failedAt`: ...; `failedAttemptUsage?`: ...; `modelCallId`: ...; `purpose`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `contextTokensBefore?`: ...; `deliveryId`: ...; `entriesBefore?`: ...; `startedAt`: ...; `trigger`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `deliveryId`: ...; `skippedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `appliedAt`: ...; `checkpointId`: ...; `commit`: ...; `compactionId`: ...; `deliveryId`: ...; `kind`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `deliveryId`: ...; `failedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `metadata?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `budgetCharge`: ...; `digest`: ...; `finishReason?`: ...; `metadata?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `operationKey`: ...; `sessionEntryId`: ...; `sessionId`: ...; `sessionParentId`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `digest`: ...; `finishReason?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `operationKey`: ...; `reason`: ...; `sessionEntryId`: ...; `sessionId`: ...; `sessionParentId`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `data?`: ...; `message?`: ...; `metadata?`: ...; `toolCallId`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `result`: ...; `tasksUpdated?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `awaitEvent?`: ...; `call`: ...; `metadata?`: ...; `token`: ...; `turn`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `reason?`: ...; `source`: ...; `target`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `source`: ...; `target`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `reason`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `request`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `count`: ...; `metadata?`: ...; `queue`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `finishReason?`: ...; `metadata?`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `evidence`: ...; `name`: ...; `turn`: ...; `verdict`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `completedAt`: ...; `deliveryId`: ...; `finishReason`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `providerMetadata?`: ...; `registrationKey?`: ...; `requestId?`: ...; `responseModel?`: ...; `serviceTier?`: ...; `turn`: ...; `usage`: ...; `usageAt`: ...; \} \| \{ `_tag`: ...; `attempts`: ...; `completedAt`: ...; `deliveryId`: ...; `failedAttemptUsage?`: ...; `finishReason?`: ...; `modelCallId`: ...; `purpose`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `deadline`: ...; `filter`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `dedupeKey`: ...; \} \| \{ `_tag`: ...; `deadline`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `event`: ...; \} \| \{ `_tag`: ...; `address`: ...; `budget?`: ...; `messageId`: ...; \} \| \{ `_tag`: ...; `delta`: ...; \} \| \{ `_tag`: ...; `budget`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; \} \| \{ `_tag`: ...; `wait`: ...; \} \| \{ `_tag`: ...; `resolution`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `addressed?`: ...; `digest`: ...; `entryId`: ...; `from`: ...; `idempotencyKey`: ...; `inboxSequence`: ...; `message`: ...; `policy`: ...; \} \| \{ `_tag`: ...; `digest`: ...; `entryId`: ...; `idempotencyKey`: ...; `prompt`: ...; `steeringSequence`: ...; \} \| \{ `_tag`: ...; `entryIds`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `entryIds`: ...; `reason`: ...; \} \| \{ `_tag`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `budget?`: ...; `childDepth`: ...; `childRunId`: ...; `inherit`: ...; `invocationId`: ...; `key?`: ...; `label?`: ...; `origin?`: ...; `prompt`: ...; `readiness`: ...; `selection`: ...; \} \| \{ `_tag`: ...; `childRunId`: ...; `readiness`: ...; \} \| \{ `_tag`: ...; `childRunId`: ...; `spend?`: ...; `terminalEventId`: ...; \} \| \{ `_tag`: ...; `concurrency`: ...; `fanOutId`: ...; `join`: ...; `memberCount`: ...; `remainder`: ...; \} \| \{ `_tag`: ...; `abandoned`: ...; `cancelled`: ...; `failed`: ...; `fanOutId`: ...; `remainder`: ...; `status`: ...; `succeeded`: ...; \} \| \{ `_tag`: ...; `result`: ...; \} \| \{ `_tag`: ...; `error`: ...; \} \| \{ `_tag`: ...; `reason?`: ...; \} \| \{ `_tag`: ...; `reason?`: ...; \} \| \{ `_tag`: ...; `data?`: ...; `level`: ...; `message`: ...; `operation`: ...; \} \| \{ `_tag`: ...; `leaf`: ...; `source`: ...; `value`: ...; \}, `never`, `never`\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Compacted"`, \{ `cursor`: `Schema.Int`; `event`: `Schema.refine`\<`object` & `object` & `object`, `Schema.Codec`\<[`RunEvent`](./runtime/namespaces/RunEvent#runevent), `object` & \{ `_tag`: ...; `compactionId?`: ...; `deliveryId`: ...; `model?`: ...; `modelCallId`: ...; `provider?`: ...; `purpose`: ...; `startedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `deliveryId`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `registrationKey?`: ...; `startedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `deliveryId`: ...; `kind`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `category`: ...; `classification`: ...; `deliveryId`: ...; `disposition`: ...; `failedAt`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `providerUsage?`: ...; `registrationKey?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `category`: ...; `delayMillis`: ...; `deliveryId`: ...; `modelCallId`: ...; `reason`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `category`: ...; `deliveryId`: ...; `fromCandidate`: ...; `fromModel`: ...; `fromProvider`: ...; `fromRegistrationKey?`: ...; `modelCallId`: ...; `toCandidate`: ...; `toModel`: ...; `toProvider`: ...; `toRegistrationKey?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempts`: ...; `category`: ...; `classification`: ...; `deliveryId`: ...; `failedAt`: ...; `failedAttemptUsage?`: ...; `modelCallId`: ...; `purpose`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `contextTokensBefore?`: ...; `deliveryId`: ...; `entriesBefore?`: ...; `startedAt`: ...; `trigger`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `deliveryId`: ...; `skippedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `appliedAt`: ...; `checkpointId`: ...; `commit`: ...; `compactionId`: ...; `deliveryId`: ...; `kind`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `deliveryId`: ...; `failedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `metadata?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `budgetCharge`: ...; `digest`: ...; `finishReason?`: ...; `metadata?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `operationKey`: ...; `sessionEntryId`: ...; `sessionId`: ...; `sessionParentId`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `digest`: ...; `finishReason?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `operationKey`: ...; `reason`: ...; `sessionEntryId`: ...; `sessionId`: ...; `sessionParentId`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `data?`: ...; `message?`: ...; `metadata?`: ...; `toolCallId`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `result`: ...; `tasksUpdated?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `awaitEvent?`: ...; `call`: ...; `metadata?`: ...; `token`: ...; `turn`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `reason?`: ...; `source`: ...; `target`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `source`: ...; `target`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `reason`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `request`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `count`: ...; `metadata?`: ...; `queue`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `finishReason?`: ...; `metadata?`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `evidence`: ...; `name`: ...; `turn`: ...; `verdict`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `completedAt`: ...; `deliveryId`: ...; `finishReason`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `providerMetadata?`: ...; `registrationKey?`: ...; `requestId?`: ...; `responseModel?`: ...; `serviceTier?`: ...; `turn`: ...; `usage`: ...; `usageAt`: ...; \} \| \{ `_tag`: ...; `attempts`: ...; `completedAt`: ...; `deliveryId`: ...; `failedAttemptUsage?`: ...; `finishReason?`: ...; `modelCallId`: ...; `purpose`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `deadline`: ...; `filter`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `dedupeKey`: ...; \} \| \{ `_tag`: ...; `deadline`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `event`: ...; \} \| \{ `_tag`: ...; `address`: ...; `budget?`: ...; `messageId`: ...; \} \| \{ `_tag`: ...; `delta`: ...; \} \| \{ `_tag`: ...; `budget`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; \} \| \{ `_tag`: ...; `wait`: ...; \} \| \{ `_tag`: ...; `resolution`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `addressed?`: ...; `digest`: ...; `entryId`: ...; `from`: ...; `idempotencyKey`: ...; `inboxSequence`: ...; `message`: ...; `policy`: ...; \} \| \{ `_tag`: ...; `digest`: ...; `entryId`: ...; `idempotencyKey`: ...; `prompt`: ...; `steeringSequence`: ...; \} \| \{ `_tag`: ...; `entryIds`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `entryIds`: ...; `reason`: ...; \} \| \{ `_tag`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `budget?`: ...; `childDepth`: ...; `childRunId`: ...; `inherit`: ...; `invocationId`: ...; `key?`: ...; `label?`: ...; `origin?`: ...; `prompt`: ...; `readiness`: ...; `selection`: ...; \} \| \{ `_tag`: ...; `childRunId`: ...; `readiness`: ...; \} \| \{ `_tag`: ...; `childRunId`: ...; `spend?`: ...; `terminalEventId`: ...; \} \| \{ `_tag`: ...; `concurrency`: ...; `fanOutId`: ...; `join`: ...; `memberCount`: ...; `remainder`: ...; \} \| \{ `_tag`: ...; `abandoned`: ...; `cancelled`: ...; `failed`: ...; `fanOutId`: ...; `remainder`: ...; `status`: ...; `succeeded`: ...; \} \| \{ `_tag`: ...; `result`: ...; \} \| \{ `_tag`: ...; `error`: ...; \} \| \{ `_tag`: ...; `reason?`: ...; \} \| \{ `_tag`: ...; `reason?`: ...; \} \| \{ `_tag`: ...; `data?`: ...; `level`: ...; `message`: ...; `operation`: ...; \} \| \{ `_tag`: ...; `leaf`: ...; `source`: ...; `value`: ...; \}, `never`, `never`\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Completed"`, \{ `cursor`: `Schema.Int`; `event`: `Schema.refine`\<`object` & `object` & `object` \| `object` & `object` & `object` \| `object` & `object` & `object`, `Schema.Codec`\<[`RunEvent`](./runtime/namespaces/RunEvent#runevent), `object` & \{ `_tag`: ...; `compactionId?`: ...; `deliveryId`: ...; `model?`: ...; `modelCallId`: ...; `provider?`: ...; `purpose`: ...; `startedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `deliveryId`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `registrationKey?`: ...; `startedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `deliveryId`: ...; `kind`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `category`: ...; `classification`: ...; `deliveryId`: ...; `disposition`: ...; `failedAt`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `providerUsage?`: ...; `registrationKey?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `category`: ...; `delayMillis`: ...; `deliveryId`: ...; `modelCallId`: ...; `reason`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `at`: ...; `attempt`: ...; `category`: ...; `deliveryId`: ...; `fromCandidate`: ...; `fromModel`: ...; `fromProvider`: ...; `fromRegistrationKey?`: ...; `modelCallId`: ...; `toCandidate`: ...; `toModel`: ...; `toProvider`: ...; `toRegistrationKey?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempts`: ...; `category`: ...; `classification`: ...; `deliveryId`: ...; `failedAt`: ...; `failedAttemptUsage?`: ...; `modelCallId`: ...; `purpose`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `contextTokensBefore?`: ...; `deliveryId`: ...; `entriesBefore?`: ...; `startedAt`: ...; `trigger`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `deliveryId`: ...; `skippedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `appliedAt`: ...; `checkpointId`: ...; `commit`: ...; `compactionId`: ...; `deliveryId`: ...; `kind`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `compactionId`: ...; `deliveryId`: ...; `failedAt`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `metadata?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `budgetCharge`: ...; `digest`: ...; `finishReason?`: ...; `metadata?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `operationKey`: ...; `sessionEntryId`: ...; `sessionId`: ...; `sessionParentId`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `digest`: ...; `finishReason?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `operationKey`: ...; `reason`: ...; `sessionEntryId`: ...; `sessionId`: ...; `sessionParentId`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `data?`: ...; `message?`: ...; `metadata?`: ...; `toolCallId`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `result`: ...; `tasksUpdated?`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `awaitEvent?`: ...; `call`: ...; `metadata?`: ...; `token`: ...; `turn`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `reason?`: ...; `source`: ...; `target`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `source`: ...; `target`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `handoffId`: ...; `metadata?`: ...; `reason`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `call`: ...; `metadata?`: ...; `request`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `count`: ...; `metadata?`: ...; `queue`: ...; `turn`: ...; \} \| \{ `_tag`: ...; `finishReason?`: ...; `metadata?`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `evidence`: ...; `name`: ...; `turn`: ...; `verdict`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; `candidate?`: ...; `completedAt`: ...; `deliveryId`: ...; `finishReason`: ...; `model?`: ...; `modelAttemptId`: ...; `modelCallId`: ...; `provider?`: ...; `providerMetadata?`: ...; `registrationKey?`: ...; `requestId?`: ...; `responseModel?`: ...; `serviceTier?`: ...; `turn`: ...; `usage`: ...; `usageAt`: ...; \} \| \{ `_tag`: ...; `attempts`: ...; `completedAt`: ...; `deliveryId`: ...; `failedAttemptUsage?`: ...; `finishReason?`: ...; `modelCallId`: ...; `purpose`: ...; `turn`: ...; `usage?`: ...; \} \| \{ `_tag`: ...; `deadline`: ...; `filter`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `dedupeKey`: ...; \} \| \{ `_tag`: ...; `deadline`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `event`: ...; \} \| \{ `_tag`: ...; `address`: ...; `budget?`: ...; `messageId`: ...; \} \| \{ `_tag`: ...; `delta`: ...; \} \| \{ `_tag`: ...; `budget`: ...; \} \| \{ `_tag`: ...; `attempt`: ...; \} \| \{ `_tag`: ...; `wait`: ...; \} \| \{ `_tag`: ...; `resolution`: ...; `waitId`: ...; \} \| \{ `_tag`: ...; `addressed?`: ...; `digest`: ...; `entryId`: ...; `from`: ...; `idempotencyKey`: ...; `inboxSequence`: ...; `message`: ...; `policy`: ...; \} \| \{ `_tag`: ...; `digest`: ...; `entryId`: ...; `idempotencyKey`: ...; `prompt`: ...; `steeringSequence`: ...; \} \| \{ `_tag`: ...; `entryIds`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `entryIds`: ...; `reason`: ...; \} \| \{ `_tag`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `operationId`: ...; \} \| \{ `_tag`: ...; `budget?`: ...; `childDepth`: ...; `childRunId`: ...; `inherit`: ...; `invocationId`: ...; `key?`: ...; `label?`: ...; `origin?`: ...; `prompt`: ...; `readiness`: ...; `selection`: ...; \} \| \{ `_tag`: ...; `childRunId`: ...; `readiness`: ...; \} \| \{ `_tag`: ...; `childRunId`: ...; `spend?`: ...; `terminalEventId`: ...; \} \| \{ `_tag`: ...; `concurrency`: ...; `fanOutId`: ...; `join`: ...; `memberCount`: ...; `remainder`: ...; \} \| \{ `_tag`: ...; `abandoned`: ...; `cancelled`: ...; `failed`: ...; `fanOutId`: ...; `remainder`: ...; `status`: ...; `succeeded`: ...; \} \| \{ `_tag`: ...; `result`: ...; \} \| \{ `_tag`: ...; `error`: ...; \} \| \{ `_tag`: ...; `reason?`: ...; \} \| \{ `_tag`: ...; `reason?`: ...; \} \| \{ `_tag`: ...; `data?`: ...; `level`: ...; `message`: ...; `operation`: ...; \} \| \{ `_tag`: ...; `leaf`: ...; `source`: ...; `value`: ...; \}, `never`, `never`\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>\]\>

One product-facing event at its exclusive Session cursor.

***

### TasksUpdated

> `const` **TasksUpdated**: `Schema.TaggedStruct`\<`"TasksUpdated"`, \{ `cursor`: `Schema.Int`; `items`: `Schema.$Array`\<`Schema.Struct`\<\{ `id`: `Schema.String`; `note`: `Schema.optionalKey`\<`Schema.String`\>; `status`: `Schema.Literals`\<readonly \[`"todo"`, `"doing"`, `"done"`\]\>; `title`: `Schema.String`; \}\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>

The authoritative journaled task list changed.
