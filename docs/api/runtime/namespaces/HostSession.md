[**generalist**](../../index.md)

***

[generalist](../../index.md) / [runtime](../index.md) / HostSession

# HostSession

## Classes

<a id="sessionsnapshottoolarge"></a>

### SessionSnapshotTooLarge

**`Experimental`**

A Session cannot be projected within the supported work or response budget.

#### Extends

- `SessionSnapshotTooLarge_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new SessionSnapshotTooLarge**(...`args`): [`SessionSnapshotTooLarge`](#sessionsnapshottoolarge)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SessionSnapshotTooLarge`](#sessionsnapshottoolarge)

###### Inherited from

`SessionSnapshotTooLarge_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`SessionSnapshotTooLarge_base.hint`

<a id="limit"></a>

##### limit

> `readonly` **limit**: `"bytes"` \| `"events"` \| `"entries"` \| `"sessions"` \| `"runs"` \| `"scanned-runs"`

**`Experimental`**

###### Inherited from

`SessionSnapshotTooLarge_base.limit`

<a id="maximum"></a>

##### maximum

> `readonly` **maximum**: `number`

**`Experimental`**

###### Inherited from

`SessionSnapshotTooLarge_base.maximum`

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

**`Experimental`**

###### Inherited from

`SessionSnapshotTooLarge_base.sessionId`

## Interfaces

<a id="createsessioninput"></a>

### CreateSessionInput

#### Properties

<a id="id"></a>

##### id

> `readonly` **id**: `string`

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

> `readonly` **executableManifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### executableRef

> `readonly` **executableRef**: `object`

###### executableRef.active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

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

<a id="title"></a>

##### title?

> `readonly` `optional` **title?**: `string`

***

<a id="hostsessionsnapshot"></a>

### HostSessionSnapshot

**`Experimental`**

One bounded committed Session projection and its exact exclusive replay cursor.

#### Properties

<a id="conversation"></a>

##### conversation

> `readonly` **conversation**: `object`

**`Experimental`**

###### entries

> `readonly` **entries**: readonly `object`[]

###### leafId

> `readonly` **leafId**: `string` \| `null`

<a id="cursor"></a>

##### cursor

> `readonly` **cursor**: `number`

**`Experimental`**

<a id="runs"></a>

##### runs

> `readonly` **runs**: readonly [`RunSnapshot`](./Run.md#runsnapshot)[]

**`Experimental`**

<a id="session"></a>

##### session

> `readonly` **session**: [`HostSession`](../../host.md#hostsession-1)

**`Experimental`**

<a id="version"></a>

##### version

> `readonly` **version**: `1`

**`Experimental`**

***

<a id="runtimehostsessions"></a>

### RuntimeHostSessions

Runtime operations that persist and observe product-facing Sessions.

#### Extended by

- [`Service`](./Runtime.md#service)

#### Properties

<a id="createsession"></a>

##### createSession

> `readonly` **createSession**: (`input`) => `Effect`\<[`HostSession`](../../host.md#hostsession-1), [`CreateSessionError`](#createsessionerror)\>

###### Parameters

###### input

[`CreateSessionInput`](#createsessioninput)

###### Returns

`Effect`\<[`HostSession`](../../host.md#hostsession-1), [`CreateSessionError`](#createsessionerror)\>

<a id="listsessions"></a>

##### listSessions

> `readonly` **listSessions**: `Effect`\<readonly [`HostSession`](../../host.md#hostsession-1)[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

<a id="removesessioninput"></a>

##### removeSessionInput

> `readonly` **removeSessionInput**: (`input`) => `Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`SessionQueueConflict`](./SessionQueue.md#sessionqueueconflict)\>

###### Parameters

###### input

###### commandId

`string`

###### expectedRevision

`number`

###### id

`string`

###### sessionId

`string`

###### Returns

`Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`SessionQueueConflict`](./SessionQueue.md#sessionqueueconflict)\>

<a id="session-1"></a>

##### session

> `readonly` **session**: (`sessionId`) => `Effect`\<[`HostSession`](../../host.md#hostsession-1), [`SessionError`](#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<[`HostSession`](../../host.md#hostsession-1), [`SessionError`](#sessionerror)\>

<a id="sessionevents"></a>

##### sessionEvents

> `readonly` **sessionEvents**: (`input`) => `Stream`\<\{ `cursor`: `number`; `event`: [`RunEvent`](./RunEvent.md#runevent); \} \| \{ `cursor`: `number`; `update`: \{ `afterEntryId`: `string` \| `null`; `entries`: readonly `object`[]; `leafId`: `string` \| `null`; `previousLeafId`: `string` \| `null`; \}; \}, [`SessionEventsError`](#sessioneventserror)\>

###### Parameters

###### input

[`SessionEventsInput`](#sessioneventsinput)

###### Returns

`Stream`\<\{ `cursor`: `number`; `event`: [`RunEvent`](./RunEvent.md#runevent); \} \| \{ `cursor`: `number`; `update`: \{ `afterEntryId`: `string` \| `null`; `entries`: readonly `object`[]; `leafId`: `string` \| `null`; `previousLeafId`: `string` \| `null`; \}; \}, [`SessionEventsError`](#sessioneventserror)\>

<a id="sessionfamily"></a>

##### sessionFamily

> `readonly` **sessionFamily**: (`sessionId`) => `Effect`\<readonly [`HostSession`](../../host.md#hostsession-1)[], [`SessionSnapshotError`](#sessionsnapshoterror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<readonly [`HostSession`](../../host.md#hostsession-1)[], [`SessionSnapshotError`](#sessionsnapshoterror)\>

<a id="sessionruns"></a>

##### sessionRuns

> `readonly` **sessionRuns**: (`sessionId`) => `Effect`\<readonly [`RunInspection`](./Run.md#runinspection)[], [`SessionError`](#sessionerror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<readonly [`RunInspection`](./Run.md#runinspection)[], [`SessionError`](#sessionerror)\>

<a id="sessionsnapshot"></a>

##### sessionSnapshot

> `readonly` **sessionSnapshot**: (`sessionId`) => `Effect`\<[`HostSessionSnapshot`](#hostsessionsnapshot), [`SessionSnapshotError`](#sessionsnapshoterror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<[`HostSessionSnapshot`](#hostsessionsnapshot), [`SessionSnapshotError`](#sessionsnapshoterror)\>

<a id="submitsessioninput"></a>

##### submitSessionInput

> `readonly` **submitSessionInput**: (`input`) => `Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`SessionQueueConflict`](./SessionQueue.md#sessionqueueconflict)\>

###### Parameters

###### input

###### commandId

`string`

###### prompt

`Prompt`

###### selection?

\{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `concurrency`: \{ `agents`: `number`; `tools`: `number`; \}; `maxDepth`: `number`; `maxSessions`: `number`; \}; \}

###### selection.budget?

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### selection.budget.children?

`number`

###### selection.budget.duration?

`number`

###### selection.budget.tokens?

`number`

###### selection.budget.toolCalls?

`number`

###### selection.budget.usd?

`number`

###### selection.executableManifest

[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### selection.executableRef

\{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}

###### selection.executableRef.active

`string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### selection.executableRef.executable

`string` & `Brand`\<`"generalist/executable-pin"`\>

###### selection.registrations

readonly `object`[]

###### selection.treePolicy?

\{ `concurrency`: \{ `agents`: `number`; `tools`: `number`; \}; `maxDepth`: `number`; `maxSessions`: `number`; \}

###### selection.treePolicy.concurrency

\{ `agents`: `number`; `tools`: `number`; \}

###### selection.treePolicy.concurrency.agents

`number`

###### selection.treePolicy.concurrency.tools

`number`

###### selection.treePolicy.maxDepth

`number`

###### selection.treePolicy.maxSessions

`number`

###### sessionId

`string`

###### Returns

`Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`SessionQueueConflict`](./SessionQueue.md#sessionqueueconflict)\>

<a id="updatesessioninput"></a>

##### updateSessionInput

> `readonly` **updateSessionInput**: (`input`, `resolveSelection?`) => `Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`UnknownAgent`](./Errors.md#unknownagent) \| [`SessionQueueConflict`](./SessionQueue.md#sessionqueueconflict)\>

###### Parameters

###### input

###### agent?

`string`

###### commandId

`string`

###### expectedRevision

`number`

###### id

`string`

###### prompt

`Prompt`

###### selection?

\{ `budget?`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `executableManifest`: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest); `executableRef`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `registrations`: readonly `object`[]; `treePolicy?`: \{ `concurrency`: \{ `agents`: `number`; `tools`: `number`; \}; `maxDepth`: `number`; `maxSessions`: `number`; \}; \}

###### selection.budget?

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### selection.budget.children?

`number`

###### selection.budget.duration?

`number`

###### selection.budget.tokens?

`number`

###### selection.budget.toolCalls?

`number`

###### selection.budget.usd?

`number`

###### selection.executableManifest

[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### selection.executableRef

\{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}

###### selection.executableRef.active

`string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### selection.executableRef.executable

`string` & `Brand`\<`"generalist/executable-pin"`\>

###### selection.registrations

readonly `object`[]

###### selection.treePolicy?

\{ `concurrency`: \{ `agents`: `number`; `tools`: `number`; \}; `maxDepth`: `number`; `maxSessions`: `number`; \}

###### selection.treePolicy.concurrency

\{ `agents`: `number`; `tools`: `number`; \}

###### selection.treePolicy.concurrency.agents

`number`

###### selection.treePolicy.concurrency.tools

`number`

###### selection.treePolicy.maxDepth

`number`

###### selection.treePolicy.maxSessions

`number`

###### sessionId

`string`

###### resolveSelection?

[`SelectionResolver`](./SessionQueue.md#selectionresolver)

###### Returns

`Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`UnknownAgent`](./Errors.md#unknownagent) \| [`SessionQueueConflict`](./SessionQueue.md#sessionqueueconflict)\>

***

<a id="sessioneventsinput"></a>

### SessionEventsInput

#### Properties

<a id="cursor-1"></a>

##### cursor?

> `readonly` `optional` **cursor?**: `number`

<a id="sessionid-1"></a>

##### sessionId

> `readonly` **sessionId**: `string`

## Type Aliases

<a id="createsessionerror"></a>

### CreateSessionError

> **CreateSessionError** = [`SessionConflict`](../../host.md#sessionconflict) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="hostsessionevent"></a>

### HostSessionEvent

> **HostSessionEvent** = *typeof* `HostSessionEvent.Type`

One Runtime event at its exclusive Session replay cursor.

***

<a id="sessionerror"></a>

### SessionError

> **SessionError** = [`SessionNotFound`](../../host.md#sessionnotfound) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="sessioneventserror"></a>

### SessionEventsError

> **SessionEventsError** = [`SessionNotFound`](../../host.md#sessionnotfound) \| [`SessionCursorExpired`](../../host.md#sessioncursorexpired) \| [`SessionSubscriberLagged`](../../host.md#sessionsubscriberlagged) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../durability.md#durabilityfailure)

***

<a id="sessionsnapshoterror"></a>

### SessionSnapshotError

> **SessionSnapshotError** = [`SessionError`](#sessionerror) \| [`SessionSnapshotTooLarge`](#sessionsnapshottoolarge)

## Variables

<a id="hostsessionevent-1"></a>

### HostSessionEvent

> `const` **HostSessionEvent**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Run"`, \{ `cursor`: `Schema.Int`; `event`: `Schema.Codec`\<[`RunEvent`](./RunEvent.md#runevent), `object` & \{ `_tag`: `"TurnStarted"`; `metadata?`: \{\[`x`: ...\]: ...; \}; `turn`: `number`; \} \| \{ `_tag`: `"ModelResponseCommitted"`; `attempt`: `number`; `budgetCharge`: `number`; `digest`: `string`; `finishReason?`: ... \| ... \| ... \| ... \| ... \| ... \| ... \| ...; `metadata?`: \{\[`x`: ...\]: ...; \}; `modelAttemptId`: `string`; `modelCallId`: `string`; `operationKey`: `string`; `originOperationKey`: `string`; `originRunId`: `string`; `sessionEntryId`: `string`; `sessionId`: `string`; `sessionParentId`: ... \| ...; `turn`: `number`; `usage?`: \{ `inputTokens`: ...; `outputTokens`: ...; \}; \} \| \{ `_tag`: `"ModelResponseInterrupted"`; `attempt`: `number`; `digest`: `string`; `finishReason?`: ... \| ... \| ... \| ... \| ... \| ... \| ... \| ...; `modelAttemptId`: `string`; `modelCallId`: `string`; `operationKey`: `string`; `originOperationKey`: `string`; `originRunId`: `string`; `reason`: ... \| ...; `sessionEntryId`: `string`; `sessionId`: `string`; `sessionParentId`: ... \| ...; `turn`: `number`; `usage?`: \{ `inputTokens`: ...; `outputTokens`: ...; \}; \} \| \{ `_tag`: `"ToolExecutionStarted"`; `call`: \{ `~effect/ai/Content/Part?`: ...; `id`: ...; `metadata`: ...; `name`: ...; `params`: ...; `providerExecuted`: ...; `type`: ...; \}; `metadata?`: \{\[`x`: ...\]: ...; \}; `turn`: `number`; \} \| \{ `_tag`: `"ToolProgress"`; `data?`: \{\[`x`: ...\]: ...; \}; `message?`: `string`; `metadata?`: \{\[`x`: ...\]: ...; \}; `toolCallId`: `string`; `turn`: `number`; \} \| \{ `_tag`: `"ToolExecutionCompleted"`; `artifactRead?`: \{ `artifact`: ...; `branch?`: ...; `version`: ...; \}; `artifactUpdated?`: \{ `artifact`: ...; `attribution`: ...; `base`: ...; `branch?`: ...; `result`: ...; \}; `call`: \{ `~effect/ai/Content/Part?`: ...; `id`: ...; `metadata`: ...; `name`: ...; `params`: ...; `providerExecuted`: ...; `type`: ...; \}; `metadata?`: \{\[`x`: ...\]: ...; \}; `result`: \{ `~effect/ai/Content/Part?`: ...; `encodedResult`: ...; `id`: ...; `isFailure`: ...; `memoized?`: ...; `metadata`: ...; `name`: ...; `preliminary`: ...; `providerExecuted`: ...; `result`: ...; `taint`: ...; `type`: ...; \}; `tasksUpdated?`: readonly ...; `turn`: `number`; \} \| \{ `_tag`: `"ToolExecutionWaiting"`; `awaitEvent?`: \{ `deadline`: ...; `filter`: ...; \}; `call`: \{ `~effect/ai/Content/Part?`: ...; `id`: ...; `metadata`: ...; `name`: ...; `params`: ...; `providerExecuted`: ...; `type`: ...; \}; `metadata?`: \{\[`x`: ...\]: ...; \}; `token`: `string`; `turn`: `number`; `waitId`: `string`; \} \| \{ `_tag`: `"HandoffRequested"`; `handoffId`: `string`; `metadata?`: \{\[`x`: ...\]: ...; \}; `reason?`: `string`; `source`: `string`; `target`: `string`; `turn`: `number`; \} \| \{ `_tag`: `"HandoffCompleted"`; `handoffId`: `string`; `metadata?`: \{\[`x`: ...\]: ...; \}; `source`: `string`; `target`: `string`; `turn`: `number`; \} \| \{ `_tag`: `"Rejected"`; `handoffId`: `string`; `metadata?`: \{\[`x`: ...\]: ...; \}; `reason`: `string`; `turn`: `number`; \} \| \{ `_tag`: `"ApprovalRequested"`; `call`: \{ `~effect/ai/Content/Part?`: ...; `id`: ...; `metadata`: ...; `name`: ...; `params`: ...; `providerExecuted`: ...; `type`: ...; \}; `metadata?`: \{\[`x`: ...\]: ...; \}; `request`: \{ `approvalId`: ...; `capability`: ...; `input`: ...; `operation`: ...; \}; `turn`: `number`; \} \| \{ `_tag`: `"SteeringDrained"`; `count`: `number`; `metadata?`: \{\[`x`: ...\]: ...; \}; `queue`: ... \| ...; `turn`: `number`; \} \| \{ `_tag`: `"TurnCompleted"`; `finishReason?`: ... \| ... \| ... \| ... \| ... \| ... \| ... \| ...; `metadata?`: \{\[`x`: ...\]: ...; \}; `turn`: `number`; `usage?`: \{ `inputTokens`: ...; `outputTokens`: ...; \}; \} \| \{ `_tag`: `"GateResult"`; `evidence`: `Schema.Json`; `name`: `string`; `turn`: `number`; `verdict`: ... \| ...; \} \| \{ `_tag`: `"ModelCallStarted"`; `compactionId?`: `string`; `deliveryId`: `string`; `model?`: `string`; `modelCallId`: `string`; `provider?`: `string`; `purpose`: ... \| ... \| ...; `startedAt`: `number`; `turn`: `number`; \} \| \{ `_tag`: `"ModelAttemptStarted"`; `attempt`: `number`; `candidate?`: `number`; `deliveryId`: `string`; `model?`: `string`; `modelAttemptId`: `string`; `modelCallId`: `string`; `provider?`: `string`; `registrationKey?`: `string`; `startedAt`: `number`; `turn`: `number`; \} \| \{ `_tag`: `"ModelAttemptFirstOutput"`; `at`: `number`; `attempt`: `number`; `deliveryId`: `string`; `kind`: ... \| ... \| ...; `modelAttemptId`: `string`; `modelCallId`: `string`; `turn`: `number`; \} \| \{ `_tag`: `"ModelAttemptCompleted"`; `attempt`: `number`; `candidate?`: `number`; `completedAt`: `number`; `deliveryId`: `string`; `finishReason`: ... \| ... \| ... \| ... \| ... \| ... \| ... \| ...; `model?`: `string`; `modelAttemptId`: `string`; `modelCallId`: `string`; `provider?`: `string`; `providerMetadata?`: \{\[`x`: ...\]: ...; \}; `registrationKey?`: `string`; `requestId?`: `string`; `responseModel?`: `string`; `serviceTier?`: `string`; `turn`: `number`; `usage`: \{ `inputTokens`: ...; `outputTokens`: ...; \}; `usageAt`: `number`; \} \| \{ `_tag`: `"ModelAttemptFailed"`; `attempt`: `number`; `candidate?`: `number`; `category`: ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ...; `classification`: ... \| ...; `deliveryId`: `string`; `disposition`: ... \| ... \| ...; `failedAt`: `number`; `model?`: `string`; `modelAttemptId`: `string`; `modelCallId`: `string`; `provider?`: `string`; `providerUsage?`: \{ `inputTokens?`: ...; `outputTokens?`: ...; `totalTokens?`: ...; \}; `registrationKey?`: `string`; `turn`: `number`; \} \| \{ `_tag`: `"ModelRetryScheduled"`; `at`: `number`; `attempt`: `number`; `category`: ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ...; `delayMillis`: `number`; `deliveryId`: `string`; `modelCallId`: `string`; `reason`: ... \| ...; `turn`: `number`; \} \| \{ `_tag`: `"ModelFallbackScheduled"`; `at`: `number`; `attempt`: `number`; `category`: ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ...; `deliveryId`: `string`; `fromCandidate`: `number`; `fromModel`: `string`; `fromProvider`: `string`; `fromRegistrationKey?`: `string`; `modelCallId`: `string`; `toCandidate`: `number`; `toModel`: `string`; `toProvider`: `string`; `toRegistrationKey?`: `string`; `turn`: `number`; \} \| \{ `_tag`: `"ModelCallCompleted"`; `attempts`: `number`; `completedAt`: `number`; `deliveryId`: `string`; `failedAttemptUsage?`: \{ `inputTokens?`: ...; `outputTokens?`: ...; `totalTokens?`: ...; \}; `finishReason?`: ... \| ... \| ... \| ... \| ... \| ... \| ... \| ...; `modelCallId`: `string`; `purpose`: ... \| ... \| ...; `turn`: `number`; `usage?`: \{ `inputTokens`: ...; `outputTokens`: ...; \}; \} \| \{ `_tag`: `"ModelCallFailed"`; `attempts`: `number`; `category`: ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ... \| ...; `classification`: ... \| ...; `deliveryId`: `string`; `failedAt`: `number`; `failedAttemptUsage?`: \{ `inputTokens?`: ...; `outputTokens?`: ...; `totalTokens?`: ...; \}; `modelCallId`: `string`; `purpose`: ... \| ... \| ...; `turn`: `number`; \} \| \{ `_tag`: `"CompactionStarted"`; `compactionId`: `string`; `contextTokensBefore?`: `number`; `deliveryId`: `string`; `entriesBefore?`: `number`; `startedAt`: `number`; `trigger`: ... \| ...; `turn`: `number`; \} \| \{ `_tag`: `"CompactionSkipped"`; `compactionId`: `string`; `deliveryId`: `string`; `skippedAt`: `number`; `turn`: `number`; \} \| \{ `_tag`: `"CompactionApplied"`; `appliedAt`: `number`; `checkpointId`: `string`; `commit`: \{ `checkpointId`: ...; `compactionId`: ...; `contextTokensAfter?`: ...; `contextTokensBefore?`: ...; `entriesAfter?`: ...; `entriesBefore?`: ...; `summaryModelCallId?`: ...; \}; `compactionId`: `string`; `deliveryId`: `string`; `kind`: ... \| ...; `turn`: `number`; \} \| \{ `_tag`: `"CompactionFailed"`; `compactionId`: `string`; `deliveryId`: `string`; `failedAt`: `number`; `turn`: `number`; \} \| \{ `_tag`: `"Awaiting"`; `deadline`: `string`; `filter`: ... \| ... \| ... \| ... \| ...; `waitId`: `string`; \} \| \{ `_tag`: `"Duplicate"`; `dedupeKey`: `string`; \} \| \{ `_tag`: `"TimedOut"`; `deadline`: `string`; `waitId`: `string`; \} \| \{ `_tag`: `"WakeReceived"`; `event`: ... \| ... \| ... \| ... \| ...; \} \| \{ `_tag`: `"RunAccepted"`; `address`: `string`; `budget?`: \{ `children?`: ...; `duration?`: ...; `tokens?`: ...; `toolCalls?`: ...; `usd?`: ...; \}; `messageId`: `string`; \} \| \{ `_tag`: `"BudgetExtended"`; `delta`: \{ `children?`: ...; `duration?`: ...; `tokens?`: ...; `toolCalls?`: ...; `usd?`: ...; \}; \} \| \{ `_tag`: `"RunForked"`; `allocationRunId`: `string`; `atSequence`: `number`; `budget`: \{ `children?`: ...; `duration?`: ...; `tokens?`: ...; `toolCalls?`: ...; `usd?`: ...; \}; `forkRunId`: `string`; `programBudget?`: \{ `agentRuns`: ...; `concurrency`: ...; `logBytes`: ...; `outputBytes`: ...; `tokens`: ...; `toolCalls`: ...; `wallClockMillis`: ...; \}; `role`: ... \| ... \| ...; `sourceRunId`: `string`; \} \| \{ `_tag`: `"RunRewound"`; `allocation?`: \{ `baseline`: ...; `budget`: ...; `runId`: ...; \}; `branchRunId`: `string`; `toSequence`: `number`; \} \| \{ `_tag`: `"ProgramOperationSettled"`; `operation`: `string`; `status`: ... \| ... \| ...; \} \| \{ `_tag`: `"BudgetSuspended"`; `budget`: ... \| ... \| ... \| ... \| ...; \} \| \{ `_tag`: `"RunAttemptStarted"`; `attempt`: `number`; \} \| \{ `_tag`: `"RunWaiting"`; `wait`: \{ `closedAt?`: ...; `openedAt`: ...; `reason`: ...; `resolution?`: ...; `status`: ...; `waitId`: ...; \}; \} \| \{ `_tag`: `"RunResumed"`; `resolution`: ... \| ... \| ... \| ...; `waitId`: `string`; \} \| \{ `_tag`: `"Inbox"`; `addressed?`: \{ `causationId?`: ...; `correlationId`: ...; `from?`: ...; `id`: ...; `idempotencyKey`: ...; `inReplyTo?`: ...; `metadata`: ...; `prompt`: ...; `sessionId`: ...; `to`: ...; \}; `digest`: `string`; `entryId`: `string`; `from`: ... \| ... \| ...; `idempotencyKey`: `string`; `inboxSequence`: `number`; `message`: `PromptEncoded`; `policy`: ... \| ... \| ... \| ...; \} \| \{ `_tag`: `"SteeringAccepted"`; `digest`: `string`; `entryId`: `string`; `idempotencyKey`: `string`; `prompt`: `PromptEncoded`; `steeringSequence`: `number`; \} \| \{ `_tag`: `"SteeringConsumed"`; `entryIds`: readonly ...; `operationId`: `string`; \} \| \{ `_tag`: `"SteeringDiscarded"`; `entryIds`: readonly ...; `reason`: ... \| ... \| ...; \} \| \{ `_tag`: `"OperationUnknown"`; `operationId`: `string`; \} \| \{ `_tag`: `"Substituted"`; `operationId`: `string`; \} \| \{ `_tag`: `"ChildLinked"`; `budget?`: \{ `children?`: ...; `duration?`: ...; `tokens?`: ...; `toolCalls?`: ...; `usd?`: ...; \}; `childDepth`: `number`; `childRunId`: `string`; `inherit`: \{ `budget?`: ...; `history`: ...; `instructions`: ...; `memory`: ...; `permissions`: ...; `sandbox`: ...; `tasks`: ...; `tools`: ...; \}; `invocationId`: `string`; `key?`: `string`; `label?`: `string`; `origin?`: \{ `operationKey?`: ...; `parentToolCallId?`: ...; \}; `prompt`: `PromptEncoded`; `readiness`: ... \| ... \| ...; `selection`: `string`; \} \| \{ `_tag`: `"ChildReadinessChanged"`; `childRunId`: `string`; `readiness`: ... \| ... \| ...; \} \| \{ `_tag`: `"ChildSettled"`; `childRunId`: `string`; `spend?`: \{ `children`: ...; `duration`: ...; `tokens`: ...; `toolCalls`: ...; `usd`: ...; \}; `terminalEventId`: `string`; \} \| \{ `_tag`: `"FanOutAdmitted"`; `concurrency`: `number`; `fanOutId`: `string`; `join`: ... \| ... \| ... \| ... \| ...; `memberCount`: `number`; `remainder`: ... \| ... \| ... \| ...; \} \| \{ `_tag`: `"FanOutJoined"`; `abandoned`: `number`; `cancelled`: `number`; `failed`: `number`; `fanOutId`: `string`; `remainder`: readonly ...; `status`: ... \| ... \| ...; `succeeded`: `number`; \} \| \{ `_tag`: `"RunCompleted"`; `result`: ... \| ...; \} \| \{ `_tag`: `"RunFailed"`; `error`: `unknown`; \} \| \{ `_tag`: `"RunCancellationRequested"`; `reason?`: `string`; \} \| \{ `_tag`: `"RunCancelled"`; `reason?`: `string`; \} \| \{ `_tag`: `"ProgramLog"`; `data?`: \{\[`x`: ...\]: ...; \}; `level`: ... \| ... \| ... \| ...; `message`: `string`; `operation`: `string`; \} \| \{ `_tag`: `"Rewarded"`; `leaf`: `string`; `source`: `string`; `value`: `number`; \}, `never`, `never`\>; \}\>, `Schema.TaggedStruct`\<`"Conversation"`, \{ `cursor`: `Schema.Int`; `update`: `Schema.Struct`\<\{ `afterEntryId`: `Schema.NullOr`\<`Schema.String`\>; `entries`: `Schema.$Array`\<`Schema.Struct`\<\{ `id`: `Schema.String`; `messages`: `Schema.$Array`\<...\>; `parentId`: `Schema.NullOr`\<...\>; \}\>\>; `leafId`: `Schema.NullOr`\<`Schema.String`\>; `previousLeafId`: `Schema.NullOr`\<`Schema.String`\>; \}\>; \}\>\]\>

One Runtime event at its exclusive Session replay cursor.

***

<a id="hostsessionsnapshot-1"></a>

### HostSessionSnapshot

> **HostSessionSnapshot**: `Codec`\<[`HostSessionSnapshot`](#hostsessionsnapshot), `unknown`, `never`, `never`\>

## References

<a id="hostsession"></a>

### HostSession

Re-exports [HostSession](../../host.md#hostsession-1)

***

<a id="sessionconflict"></a>

### SessionConflict

Re-exports [SessionConflict](../../host.md#sessionconflict)

***

<a id="sessioncursorexpired"></a>

### SessionCursorExpired

Re-exports [SessionCursorExpired](../../host.md#sessioncursorexpired)

***

<a id="sessionnotfound"></a>

### SessionNotFound

Re-exports [SessionNotFound](../../host.md#sessionnotfound)

***

<a id="sessionsubscriberlagged"></a>

### SessionSubscriberLagged

Re-exports [SessionSubscriberLagged](../../host.md#sessionsubscriberlagged)
