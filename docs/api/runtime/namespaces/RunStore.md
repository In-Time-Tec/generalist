[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / RunStore

# RunStore

## Classes

<a id="runstore"></a>

### RunStore

RunStore public contract and process-local memory layer.

#### Extends

- `RunStore_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new RunStore**(`_`): [`RunStore`](#runstore)

###### Parameters

###### \_

`never`

###### Returns

[`RunStore`](#runstore)

###### Inherited from

`RunStore_base.constructor`

## Interfaces

<a id="admitsendinput"></a>

### AdmitSendInput

#### Extended by

- [`AdmitStartInput`](#admitstartinput)

#### Properties

<a id="budget"></a>

##### budget?

> `readonly` `optional` **budget?**: `object`

###### children?

> `readonly` `optional` **children?**: `number`

###### duration?

> `readonly` `optional` **duration?**: `number`

###### tokens?

> `readonly` `optional` **tokens?**: `number`

###### toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### usd?

> `readonly` `optional` **usd?**: `number`

<a id="executablemanifest"></a>

##### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

<a id="executableref"></a>

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

<a id="message"></a>

##### message

> `readonly` **message**: `object`

###### causationId?

> `readonly` `optional` **causationId?**: `string`

###### correlationId

> `readonly` **correlationId**: `string`

###### from?

> `readonly` `optional` **from?**: `string` & `Brand`\<`"Address"`\>

###### id

> `readonly` **id**: `string`

###### idempotencyKey

> `readonly` **idempotencyKey**: `string`

###### inReplyTo?

> `readonly` `optional` **inReplyTo?**: `string`

###### metadata

> `readonly` **metadata**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### prompt

> `readonly` **prompt**: `Prompt`

###### sessionId

> `readonly` **sessionId**: `string`

###### to

> `readonly` **to**: `string` & `Brand`\<`"Address"`\>

<a id="registrations"></a>

##### registrations

> `readonly` **registrations**: readonly `object`[]

<a id="runid"></a>

##### runId?

> `readonly` `optional` **runId?**: `string`

<a id="treepolicy"></a>

##### treePolicy?

> `readonly` `optional` **treePolicy?**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

***

<a id="admitstartinput"></a>

### AdmitStartInput

#### Extends

- [`AdmitSendInput`](#admitsendinput)

#### Properties

<a id="budget-1"></a>

##### budget?

> `readonly` `optional` **budget?**: `object`

###### children?

> `readonly` `optional` **children?**: `number`

###### duration?

> `readonly` `optional` **duration?**: `number`

###### tokens?

> `readonly` `optional` **tokens?**: `number`

###### toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### usd?

> `readonly` `optional` **usd?**: `number`

###### Inherited from

[`AdmitSendInput`](#admitsendinput).[`budget`](#budget)

<a id="executablemanifest-1"></a>

##### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

###### Inherited from

[`AdmitSendInput`](#admitsendinput).[`executableManifest`](#executablemanifest)

<a id="executableref-1"></a>

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

[`AdmitSendInput`](#admitsendinput).[`executableRef`](#executableref)

<a id="initialchildren"></a>

##### initialChildren

> `readonly` **initialChildren**: readonly `Omit`\<[`InitialChildInput`](./Runtime#initialchildinput), `"prompt"`\> & `object`[]

<a id="initialfanouts"></a>

##### initialFanOuts

> `readonly` **initialFanOuts**: readonly `Omit`\<`InitialFanOutInput`, `"members"`\> & `object`[]

<a id="message-1"></a>

##### message

> `readonly` **message**: `object`

###### causationId?

> `readonly` `optional` **causationId?**: `string`

###### correlationId

> `readonly` **correlationId**: `string`

###### from?

> `readonly` `optional` **from?**: `string` & `Brand`\<`"Address"`\>

###### id

> `readonly` **id**: `string`

###### idempotencyKey

> `readonly` **idempotencyKey**: `string`

###### inReplyTo?

> `readonly` `optional` **inReplyTo?**: `string`

###### metadata

> `readonly` **metadata**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### prompt

> `readonly` **prompt**: `Prompt`

###### sessionId

> `readonly` **sessionId**: `string`

###### to

> `readonly` **to**: `string` & `Brand`\<`"Address"`\>

###### Inherited from

[`AdmitSendInput`](#admitsendinput).[`message`](#message)

<a id="registrations-1"></a>

##### registrations

> `readonly` **registrations**: readonly `object`[]

###### Inherited from

[`AdmitSendInput`](#admitsendinput).[`registrations`](#registrations)

<a id="runid-1"></a>

##### runId?

> `readonly` `optional` **runId?**: `string`

###### Inherited from

[`AdmitSendInput`](#admitsendinput).[`runId`](#runid)

<a id="treepolicy-1"></a>

##### treePolicy?

> `readonly` `optional` **treePolicy?**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

###### Inherited from

[`AdmitSendInput`](#admitsendinput).[`treePolicy`](#treepolicy)

***

<a id="admitsteeringinput"></a>

### AdmitSteeringInput

#### Properties

<a id="addressed"></a>

##### addressed?

> `readonly` `optional` **addressed?**: `object`

###### causationId?

> `readonly` `optional` **causationId?**: `string`

###### correlationId

> `readonly` **correlationId**: `string`

###### from?

> `readonly` `optional` **from?**: `string` & `Brand`\<`"Address"`\>

###### id

> `readonly` **id**: `string`

###### idempotencyKey

> `readonly` **idempotencyKey**: `string`

###### inReplyTo?

> `readonly` `optional` **inReplyTo?**: `string`

###### metadata

> `readonly` **metadata**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### prompt

> `readonly` **prompt**: `Prompt`

###### sessionId

> `readonly` **sessionId**: `string`

###### to

> `readonly` **to**: `string` & `Brand`\<`"Address"`\>

<a id="digest"></a>

##### digest

> `readonly` **digest**: `string`

<a id="from"></a>

##### from

> `readonly` **from**: \{ `runId`: `string`; \} \| \{ `user`: `string`; \} \| \{ `system`: `true`; \}

<a id="idempotencykey"></a>

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

<a id="policy"></a>

##### policy

> `readonly` **policy**: `"enqueue"` \| `"interrupt"` \| `"reject"` \| `"rollback"` \| `"steer"`

<a id="prompt"></a>

##### prompt

> `readonly` **prompt**: `Prompt`

<a id="runid-2"></a>

##### runId

> `readonly` **runId**: `string`

***

<a id="recordoperationinput"></a>

### RecordOperationInput

#### Extends

- `ExecutionClaim`

#### Properties

<a id="attempt"></a>

##### attempt

> `readonly` **attempt**: `number`

<a id="attemptfence"></a>

##### attemptFence

> `readonly` **attemptFence**: `number`

###### Inherited from

`ExecutionClaim.attemptFence`

<a id="checkpoint"></a>

##### checkpoint?

> `readonly` `optional` **checkpoint?**: \{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \} \| \{ `version`: `"1"`; \}

<a id="continuation"></a>

##### continuation?

> `readonly` `optional` **continuation?**: \{ `nextTurn`: `number`; `prompt`: `Prompt`; `queue?`: `"steering"` \| `"followUp"`; `schemaVersion`: `1`; `steeringEntryIds`: readonly `string`[]; \} \| `null`

<a id="input"></a>

##### input

> `readonly` **input**: `unknown`

<a id="inputdigest"></a>

##### inputDigest

> `readonly` **inputDigest**: `string`

<a id="kind"></a>

##### kind

> `readonly` **kind**: `"compaction"` \| `"tool"` \| `"send"` \| `"model"` \| `"structured-output"` \| `"operator"` \| `"memory"` \| `"wait"` \| `"log"` \| `"handoff"` \| `"nested"`

<a id="operationkey"></a>

##### operationKey

> `readonly` **operationKey**: `string`

<a id="ownerid"></a>

##### ownerId

> `readonly` **ownerId**: `string`

###### Inherited from

`ExecutionClaim.ownerId`

<a id="replaypolicy"></a>

##### replayPolicy

> `readonly` **replayPolicy**: `"pure"` \| `"provider-idempotent"` \| `"never"`

<a id="runid-3"></a>

##### runId

> `readonly` **runId**: `string`

###### Overrides

`ExecutionClaim.runId`

<a id="session"></a>

##### session

> `readonly` **session**: `SessionWriteClaim`

###### Inherited from

`ExecutionClaim.session`

<a id="steeringentryids"></a>

##### steeringEntryIds?

> `readonly` `optional` **steeringEntryIds?**: readonly `string`[]

<a id="steeringevents"></a>

##### steeringEvents?

> `readonly` `optional` **steeringEvents?**: readonly `DurableAgentLoopEvent`[]

***

<a id="service"></a>

### Service

#### Properties

<a id="acknowledge"></a>

##### acknowledge

> `readonly` **acknowledge**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`AckInvalid`](./Errors#ackinvalid) \| [`AckBeyondCommitted`](./Errors#ackbeyondcommitted)\>

Durably advance the host processed-through point to an exact committed model cycle.

###### Parameters

###### input

###### runId

`string`

###### sequence

`number`

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`AckInvalid`](./Errors#ackinvalid) \| [`AckBeyondCommitted`](./Errors#ackbeyondcommitted)\>

<a id="acknowledged"></a>

##### acknowledged

> `readonly` **acknowledged**: (`runId`) => `Effect`\<\{ `acknowledgedAt?`: `string`; `runId`: `string`; `sequence`: `number`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

Read the durable host processed-through point; -1 means no cycle is acknowledged.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `acknowledgedAt?`: `string`; `runId`: `string`; `sequence`: `number`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="acknowledgeoperationcancellation"></a>

##### acknowledgeOperationCancellation

> `readonly` **acknowledgeOperationCancellation**: (`input`) => `Effect`\<`OperationRecord`, `WorkerMutationError`\>

Persist one definitive semantic cancellation acknowledgement under the current claim.

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<`OperationRecord`, `WorkerMutationError`\>

<a id="activate"></a>

##### activate

> `readonly` **activate**: (`input`) => `Effect`\<[`RunInspection`](./Run#runinspection), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### input

###### runId

`string`

###### Returns

`Effect`\<[`RunInspection`](./Run#runinspection), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="admitfanout"></a>

##### admitFanOut

> `readonly` **admitFanOut**: (`input`) => `Effect`\<\{ `childRunIds`: readonly `string`[]; `duplicate`: `boolean`; `fanOutId`: `string`; `parentRunId`: `string`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`FanOutConflict`](./Errors#fanoutconflict) \| [`FanOutInvalid`](./Errors#fanoutinvalid) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal)\>

###### Parameters

###### input

`AdmitFanOutInput`

###### Returns

`Effect`\<\{ `childRunIds`: readonly `string`[]; `duplicate`: `boolean`; `fanOutId`: `string`; `parentRunId`: `string`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`FanOutConflict`](./Errors#fanoutconflict) \| [`FanOutInvalid`](./Errors#fanoutinvalid) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal)\>

<a id="admitprogramagents"></a>

##### admitProgramAgents

> `readonly` **admitProgramAgents**: (`input`) => `Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`FanOutConflict`](./Errors#fanoutconflict) \| [`FanOutInvalid`](./Errors#fanoutinvalid) \| `WorkerMutationError` \| `ProgramStoreFailure`\>

###### Parameters

###### input

`AdmitProgramAgentsInput`

###### Returns

`Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`FanOutConflict`](./Errors#fanoutconflict) \| [`FanOutInvalid`](./Errors#fanoutinvalid) \| `WorkerMutationError` \| `ProgramStoreFailure`\>

<a id="admitprogramchild"></a>

##### admitProgramChild

> `readonly` **admitProgramChild**: (`input`) => `Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal) \| [`StaleClaim`](./Errors#staleclaim) \| `StaleSessionClaim`\>

###### Parameters

###### input

`AdmitProgramChildInput`

###### Returns

`Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal) \| [`StaleClaim`](./Errors#staleclaim) \| `StaleSessionClaim`\>

<a id="admitprogramchildandsuspend"></a>

##### admitProgramChildAndSuspend

> `readonly` **admitProgramChildAndSuspend**: (`input`) => `Effect`\<readonly [`RunReceipt`](./Run#runreceipt)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal) \| [`StaleClaim`](./Errors#staleclaim) \| `StaleSessionClaim`\>

###### Parameters

###### input

`AdmitProgramChildAndSuspendInput`

###### Returns

`Effect`\<readonly [`RunReceipt`](./Run#runreceipt)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal) \| [`StaleClaim`](./Errors#staleclaim) \| `StaleSessionClaim`\>

<a id="admitrollback"></a>

##### admitRollback

> `readonly` **admitRollback**: (`input`) => `Effect`\<`SteeringAdmission`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot) \| [`RunTerminal`](./Errors#runterminal) \| [`InboxFull`](../../generalist/namespaces/Steering#inboxfull) \| [`RunBusy`](./Errors#runbusy) \| [`SteeringConflict`](./Errors#steeringconflict)\>

###### Parameters

###### input

`AdmitRollbackInput`

###### Returns

`Effect`\<`SteeringAdmission`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot) \| [`RunTerminal`](./Errors#runterminal) \| [`InboxFull`](../../generalist/namespaces/Steering#inboxfull) \| [`RunBusy`](./Errors#runbusy) \| [`SteeringConflict`](./Errors#steeringconflict)\>

<a id="admitsend"></a>

##### admitSend

> `readonly` **admitSend**: (`input`) => `Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`ExecutableRegistrationConflict`](./Errors#executableregistrationconflict) \| [`TreePolicyInvalid`](./Errors#treepolicyinvalid) \| [`AddressNotFound`](./Errors#addressnotfound)\>

###### Parameters

###### input

[`AdmitSendInput`](#admitsendinput)

###### Returns

`Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`ExecutableRegistrationConflict`](./Errors#executableregistrationconflict) \| [`TreePolicyInvalid`](./Errors#treepolicyinvalid) \| [`AddressNotFound`](./Errors#addressnotfound)\>

<a id="admitspawn"></a>

##### admitSpawn

> `readonly` **admitSpawn**: (`input`) => `Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal)\>

###### Parameters

###### input

[`SpawnInput`](./Runtime#spawninput) & `object`

###### Returns

`Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal)\>

<a id="admitstart"></a>

##### admitStart

> `readonly` **admitStart**: (`input`, `options?`) => `Effect`\<[`StartReceipt`](./Runtime#startreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`ExecutableRegistrationConflict`](./Errors#executableregistrationconflict) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`StartInvalid`](./Errors#startinvalid) \| [`FanOutConflict`](./Errors#fanoutconflict) \| [`FanOutInvalid`](./Errors#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./Errors#fanoutremainderunsupported) \| [`TreePolicyInvalid`](./Errors#treepolicyinvalid) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted)\>

###### Parameters

###### input

[`AdmitStartInput`](#admitstartinput)

###### options?

###### activate?

`boolean`

###### Returns

`Effect`\<[`StartReceipt`](./Runtime#startreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`ExecutableRegistrationConflict`](./Errors#executableregistrationconflict) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`StartInvalid`](./Errors#startinvalid) \| [`FanOutConflict`](./Errors#fanoutconflict) \| [`FanOutInvalid`](./Errors#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./Errors#fanoutremainderunsupported) \| [`TreePolicyInvalid`](./Errors#treepolicyinvalid) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted)\>

<a id="admitsteering"></a>

##### admitSteering

> `readonly` **admitSteering**: (`input`) => `Effect`\<`SteeringAdmission`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`InboxFull`](../../generalist/namespaces/Steering#inboxfull) \| [`RunBusy`](./Errors#runbusy) \| [`SteeringConflict`](./Errors#steeringconflict)\>

###### Parameters

###### input

[`AdmitSteeringInput`](#admitsteeringinput)

###### Returns

`Effect`\<`SteeringAdmission`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`InboxFull`](../../generalist/namespaces/Steering#inboxfull) \| [`RunBusy`](./Errors#runbusy) \| [`SteeringConflict`](./Errors#steeringconflict)\>

<a id="advanceschedule"></a>

##### advanceSchedule

> `readonly` **advanceSchedule**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### input

###### nextAt

`string`

###### now

`number`

###### occurrence

`number`

###### ownerId

`string`

###### scheduleId

`string`

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

<a id="cancel"></a>

##### cancel

> `readonly` **cancel**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### input

[`CancelInput`](./Runtime#cancelinput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="cancelsession"></a>

##### cancelSession

> `readonly` **cancelSession**: (`input`) => `Effect`\<readonly `string`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### input

###### reason?

`string`

###### sessionId

`string`

###### Returns

`Effect`\<readonly `string`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

<a id="claimedsessionstore"></a>

##### claimedSessionStore

> `readonly` **claimedSessionStore**: (`claim`) => `Effect`\<`Option`\<[`SessionStore`](../../generalist/namespaces/Session#sessionstore)\>\>

Session writer bound to one storage-issued execution claim.

###### Parameters

###### claim

`ExecutionClaim`

###### Returns

`Effect`\<`Option`\<[`SessionStore`](../../generalist/namespaces/Session#sessionstore)\>\>

<a id="claimexecution"></a>

##### claimExecution

> `readonly` **claimExecution**: (`input`) => `Effect`\<`ExecutionRecord` & `ExecutionClaim`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`StaleClaim`](./Errors#staleclaim)\>

###### Parameters

###### input

###### ownerId

`string`

###### runId

`string`

###### Returns

`Effect`\<`ExecutionRecord` & `ExecutionClaim`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`StaleClaim`](./Errors#staleclaim)\>

<a id="claimschedules"></a>

##### claimSchedules

> `readonly` **claimSchedules**: (`input`) => `Effect`\<readonly `ClaimedSchedule`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### input

###### leaseMillis

`number`

###### limit

`number`

###### now

`number`

###### ownerId

`string`

###### Returns

`Effect`\<readonly `ClaimedSchedule`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

<a id="commitinterruptedmodelresponse"></a>

##### commitInterruptedModelResponse

> `readonly` **commitInterruptedModelResponse**: (`input`) => `Effect`\<`OperationRecord`, `WorkerMutationError`\>

###### Parameters

###### input

`CommitInterruptedModelResponseInput`

###### Returns

`Effect`\<`OperationRecord`, `WorkerMutationError`\>

<a id="commitmodelresponse"></a>

##### commitModelResponse

> `readonly` **commitModelResponse**: (`input`) => `Effect`\<`OperationRecord`, `WorkerMutationError`\>

###### Parameters

###### input

`CommitModelResponseInput`

###### Returns

`Effect`\<`OperationRecord`, `WorkerMutationError`\>

<a id="commitprogramlog"></a>

##### commitProgramLog

> `readonly` **commitProgramLog**: (`input`) => `Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

###### Parameters

###### input

`CommitProgramLogInput`

###### Returns

`Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

<a id="complete"></a>

##### complete

> `readonly` **complete**: (`input`) => `Effect`\<[`CompletionOutcome`](#completionoutcome), `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<[`CompletionOutcome`](#completionoutcome), `WorkerMutationError`\>

<a id="completeoperation"></a>

##### completeOperation

> `readonly` **completeOperation**: (`input`) => `Effect`\<`OperationRecord`, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<`OperationRecord`, `WorkerMutationError`\>

<a id="completeprogram"></a>

##### completeProgram

> `readonly` **completeProgram**: (`input`) => `Effect`\<[`CompletionOutcome`](#completionoutcome), [`ProgramBudgetExhausted`](../../generalist/namespaces/ProgramCapabilities#programbudgetexhausted) \| `WorkerMutationError`\>

###### Parameters

###### input

`CompleteProgramInput`

###### Returns

`Effect`\<[`CompletionOutcome`](#completionoutcome), [`ProgramBudgetExhausted`](../../generalist/namespaces/ProgramCapabilities#programbudgetexhausted) \| `WorkerMutationError`\>

<a id="createhostsession"></a>

##### createHostSession

> `readonly` **createHostSession**: (`input`) => `Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`SessionConflict`](../../host#sessionconflict) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

Persist one product-facing Session identity and metadata.

###### Parameters

###### input

###### id

`string`

###### title?

`string`

###### Returns

`Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`SessionConflict`](../../host#sessionconflict) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

<a id="directory"></a>

##### directory

> `readonly` **directory**: (`runId`) => `Effect`\<[`DirectoryEntry`](./AgentDirectory#directoryentry), `DirectoryLookupError`\>

The authoritative directory record for one Run.

Identity, parentage, and session membership are read from the durable Run record. Nothing is
derived by parsing an Address or a Run id.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`DirectoryEntry`](./AgentDirectory#directoryentry), `DirectoryLookupError`\>

<a id="dueawaitevents"></a>

##### dueAwaitEvents

> `readonly` **dueAwaitEvents**: (`input`) => `Effect`\<readonly `DueAwaitEvent`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### input

###### limit

`number`

###### now

`number`

###### Returns

`Effect`\<readonly `DueAwaitEvent`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

<a id="emitagentevent"></a>

##### emitAgentEvent

> `readonly` **emitAgentEvent**: (`input`) => `Effect`\<`void`, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<`void`, `WorkerMutationError`\>

<a id="events"></a>

##### events

> `readonly` **events**: (`input`) => `Stream`\<[`RunEvent`](./RunEvent#runevent), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`CursorExpired`](./Errors#cursorexpired) \| [`SubscriberLagged`](./Errors#subscriberlagged)\>

###### Parameters

###### input

###### cursor

`number`

###### runId

`string`

###### Returns

`Stream`\<[`RunEvent`](./RunEvent#runevent), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`CursorExpired`](./Errors#cursorexpired) \| [`SubscriberLagged`](./Errors#subscriberlagged)\>

<a id="expirerunningoperation"></a>

##### expireRunningOperation

> `readonly` **expireRunningOperation**: (`input`) => `Effect`\<\{ `outcome`: `"unknown"` \| `"running"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"requested"` \| `"retried"`; `record`: `OperationRecord`; \}, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<\{ `outcome`: `"unknown"` \| `"running"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"requested"` \| `"retried"`; `record`: `OperationRecord`; \}, `WorkerMutationError`\>

<a id="extendbudget"></a>

##### extendBudget

> `readonly` **extendBudget**: (`runId`, `delta`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

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

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="extendbudgetrecovery"></a>

##### extendBudgetRecovery

> `readonly` **extendBudgetRecovery**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)\>

###### Parameters

###### input

###### delta

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### delta.children?

`number`

###### delta.duration?

`number`

###### delta.tokens?

`number`

###### delta.toolCalls?

`number`

###### delta.usd?

`number`

###### operator

`string`

###### runId

`string`

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)\>

<a id="fail"></a>

##### fail

> `readonly` **fail**: (`input`) => `Effect`\<`void`, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<`void`, `WorkerMutationError`\>

<a id="fork"></a>

##### fork

> `readonly` **fork**: (`input`) => `Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot) \| [`SubstitutionInvalid`](./Errors#substitutioninvalid)\>

###### Parameters

###### input

`ForkRunInput`

###### Returns

`Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot) \| [`SubstitutionInvalid`](./Errors#substitutioninvalid)\>

<a id="getoperation"></a>

##### getOperation

> `readonly` **getOperation**: (`input`) => `Effect`\<`OperationRecord`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### input

###### operationId

`string`

###### runId

`string`

###### Returns

`Effect`\<`OperationRecord`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="getoperationbykey"></a>

##### getOperationByKey

> `readonly` **getOperationByKey**: (`input`) => `Effect`\<`OperationRecord` \| `undefined`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### input

###### operationKey

`string`

###### runId

`string`

###### Returns

`Effect`\<`OperationRecord` \| `undefined`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="getprogramoperation"></a>

##### getProgramOperation

> `readonly` **getProgramOperation**: (`input`) => `Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \} \| `undefined`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### input

###### operation

`string`

###### runId

`string`

###### Returns

`Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \} \| `undefined`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="hasadmission"></a>

##### hasAdmission

> `readonly` **hasAdmission**: (`input`) => `Effect`\<`boolean`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### input

###### address

`string` & `Brand`\<`"Address"`\>

###### idempotencyKey

`string`

###### sessionId

`string`

###### Returns

`Effect`\<`boolean`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

<a id="history"></a>

##### history

> `readonly` **history**: (`input`) => `Effect`\<readonly [`RunEvent`](./RunEvent#runevent)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`CursorExpired`](./Errors#cursorexpired)\>

###### Parameters

###### input

###### cursor

`number`

###### limit

`number`

###### runId

`string`

###### Returns

`Effect`\<readonly [`RunEvent`](./RunEvent#runevent)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`CursorExpired`](./Errors#cursorexpired)\>

<a id="hostsession"></a>

##### hostSession

> `readonly` **hostSession**: (`sessionId`) => `Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`SessionNotFound`](../../host#sessionnotfound)\>

Read one product-facing Session by identity.

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`SessionNotFound`](../../host#sessionnotfound)\>

<a id="hostsessionevents"></a>

##### hostSessionEvents

> `readonly` **hostSessionEvents**: (`input`) => `Stream`\<[`HostSessionEvent`](./HostSession#hostsessionevent), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`SessionNotFound`](../../host#sessionnotfound) \| [`SessionCursorExpired`](../../host#sessioncursorexpired) \| [`SessionSubscriberLagged`](../../host#sessionsubscriberlagged)\>

Replay then follow one product-facing Session's authoritative event cursor.

###### Parameters

###### input

###### cursor

`number`

###### sessionId

`string`

###### Returns

`Stream`\<[`HostSessionEvent`](./HostSession#hostsessionevent), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`SessionNotFound`](../../host#sessionnotfound) \| [`SessionCursorExpired`](../../host#sessioncursorexpired) \| [`SessionSubscriberLagged`](../../host#sessionsubscriberlagged)\>

<a id="hostsessionruns"></a>

##### hostSessionRuns

> `readonly` **hostSessionRuns**: (`sessionId`) => `Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`SessionNotFound`](../../host#sessionnotfound)\>

List root Runs admitted through one product-facing Session.

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`SessionNotFound`](../../host#sessionnotfound)\>

<a id="info"></a>

##### info

> `readonly` **info**: `Effect`\<[`StoreInfo`](#storeinfo)\>

<a id="inspect"></a>

##### inspect

> `readonly` **inspect**: (`runId`) => `Effect`\<[`RunInspection`](./Run#runinspection), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RunInspection`](./Run#runinspection), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="inspectfanout"></a>

##### inspectFanOut

> `readonly` **inspectFanOut**: (`fanOutId`) => `Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"abandon"` \| `"request-cancel"` \| `"terminate"`; `status`: `"running"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`FanOutNotFound`](./Errors#fanoutnotfound)\>

###### Parameters

###### fanOutId

`string`

###### Returns

`Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"abandon"` \| `"request-cancel"` \| `"terminate"`; `status`: `"running"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`FanOutNotFound`](./Errors#fanoutnotfound)\>

<a id="list"></a>

##### list

> `readonly` **list**: (`input`) => `Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### input

###### afterRunId?

`string`

Return only Runs strictly after this Run in the ordering direction.

###### limit

`number`

###### order?

`"newest"` \| `"oldest"`

Order of the returned Runs. Defaults to "newest".

###### status?

`"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`

###### Returns

`Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

<a id="listhostsessions"></a>

##### listHostSessions

> `readonly` **listHostSessions**: `Effect`\<readonly `object`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

List product-facing Sessions in creation order.

<a id="listrelated"></a>

##### listRelated

> `readonly` **listRelated**: (`runId`) => `Effect`\<readonly [`DirectoryEntry`](./AgentDirectory#directoryentry)[], `DirectoryLookupError`\>

Parent, direct children, and siblings under one parent, from durable links only.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<readonly [`DirectoryEntry`](./AgentDirectory#directoryentry)[], `DirectoryLookupError`\>

<a id="loadexecution"></a>

##### loadExecution

> `readonly` **loadExecution**: (`runId`) => `Effect`\<`ExecutionRecord`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`ExecutionRecord`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="loadprogramstate"></a>

##### loadProgramState

> `readonly` **loadProgramState**: (`runId`) => `Effect`\<\{ `activeSlots`: `number`; `agentRuns`: `number`; `budget`: \{ `agentRuns`: `number`; `concurrency`: `number`; `logBytes`: `number`; `outputBytes`: `number`; `tokens`: `number`; `toolCalls`: `number`; `wallClockMillis`: `number`; \}; `deadlineMillis`: `number`; `logBytes`: `number`; `programPin`: `string`; `runId`: `string`; `tokens`: `number`; `toolCalls`: `number`; \} \| `undefined`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `activeSlots`: `number`; `agentRuns`: `number`; `budget`: \{ `agentRuns`: `number`; `concurrency`: `number`; `logBytes`: `number`; `outputBytes`: `number`; `tokens`: `number`; `toolCalls`: `number`; `wallClockMillis`: `number`; \}; `deadlineMillis`: `number`; `logBytes`: `number`; `programPin`: `string`; `runId`: `string`; `tokens`: `number`; `toolCalls`: `number`; \} \| `undefined`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="operationcancellations"></a>

##### operationCancellations

> `readonly` **operationCancellations**: (`input`) => `Effect`\<readonly `OperationRecord`[], `WorkerMutationError`\>

Cancellable tool operations awaiting a definitive concrete-executor acknowledgement.

###### Parameters

###### input

`ExecutionClaim`

###### Returns

`Effect`\<readonly `OperationRecord`[], `WorkerMutationError`\>

<a id="pendingsteering"></a>

##### pendingSteering

> `readonly` **pendingSteering**: (`input`) => `Effect`\<readonly `object`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

Read pending inbox entries without claiming execution ownership.

###### Parameters

###### input

###### limit

`number`

###### runId

`string`

###### Returns

`Effect`\<readonly `object`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="readsteering"></a>

##### readSteering

> `readonly` **readSteering**: (`input`) => `Effect`\<readonly `object`[], `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim`

###### Returns

`Effect`\<readonly `object`[], `WorkerMutationError`\>

<a id="recordoperation"></a>

##### recordOperation

> `readonly` **recordOperation**: (`input`) => `Effect`\<`OperationRecord`, `WorkerMutationError`\>

###### Parameters

###### input

[`RecordOperationInput`](#recordoperationinput)

###### Returns

`Effect`\<`OperationRecord`, `WorkerMutationError`\>

<a id="recordreward"></a>

##### recordReward

> `readonly` **recordReward**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### input

[`RewardInput`](./RunEvent#rewardinput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="recoverrunningoperations"></a>

##### recoverRunningOperations

> `readonly` **recoverRunningOperations**: (`input`) => `Effect`\<`"ready"` \| `"blocked"`, `WorkerMutationError`\>

Reconcile operations left running by the prior owner before execution resumes.

###### Parameters

###### input

`ExecutionClaim`

###### Returns

`Effect`\<`"ready"` \| `"blocked"`, `WorkerMutationError`\>

<a id="recoveryjournal"></a>

##### recoveryJournal

> `readonly` **recoveryJournal**: (`runId`) => `Effect`\<[`Journal`](./Recovery#journal), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

Read the normalized durable facts from which operator recovery is derived.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`Journal`](./Recovery#journal), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="registeragentname"></a>

##### registerAgentName

> `readonly` **registerAgentName**: (`input`) => `Effect`\<[`DirectoryEntry`](./AgentDirectory#directoryentry), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`AgentNameConflict`](./Errors#agentnameconflict)\>

Bind one host-assigned name, unique inside the naming scope that owns the Run.

###### Parameters

###### input

###### name

`string` & `Brand`\<`"generalist/runtime/AgentName"`\>

###### runId

`string`

###### Returns

`Effect`\<[`DirectoryEntry`](./AgentDirectory#directoryentry), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`AgentNameConflict`](./Errors#agentnameconflict)\>

<a id="registerschedule"></a>

##### registerSchedule

> `readonly` **registerSchedule**: (`record`) => `Effect`\<\{ `nextAt`: `string`; `scheduleId`: `string`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### record

`ScheduleRecord`

###### Returns

`Effect`\<\{ `nextAt`: `string`; `scheduleId`: `string`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

<a id="releaseexecution"></a>

##### releaseExecution

> `readonly` **releaseExecution**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### input

`ExecutionClaim`

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

<a id="reserveprogramoperation"></a>

##### reserveProgramOperation

> `readonly` **reserveProgramOperation**: (`input`) => `Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

###### Parameters

###### input

`ReserveProgramOperationInput`

###### Returns

`Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

<a id="resolveaddress"></a>

##### resolveAddress

> `readonly` **resolveAddress**: (`address`) => `Effect`\<[`DirectoryEntry`](./AgentDirectory#directoryentry), `ResolveAddressError`\>

###### Parameters

###### address

`string` & `Brand`\<`"Address"`\>

###### Returns

`Effect`\<[`DirectoryEntry`](./AgentDirectory#directoryentry), `ResolveAddressError`\>

<a id="resolveoperation"></a>

##### resolveOperation

> `readonly` **resolveOperation**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`OperationResolutionConflict`](./Errors#operationresolutionconflict)\>

###### Parameters

###### input

###### idempotencyKey

`string`

###### operationId

`string`

###### resolution

\{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}

###### runId

`string`

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`OperationResolutionConflict`](./Errors#operationresolutionconflict)\>

<a id="resolveunknown"></a>

##### resolveUnknown

> `readonly` **resolveUnknown**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)\>

###### Parameters

###### input

[`ResolveUnknownInput`](./Recovery#resolveunknowninput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)\>

<a id="respond"></a>

##### respond

> `readonly` **respond**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`WaitNotOpen`](./Errors#waitnotopen) \| [`ResponseConflict`](./Errors#responseconflict)\>

###### Parameters

###### input

[`RespondInput`](./Runtime#respondinput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`WaitNotOpen`](./Errors#waitnotopen) \| [`ResponseConflict`](./Errors#responseconflict)\>

<a id="respondapproval"></a>

##### respondApproval

> `readonly` **respondApproval**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ApprovalStale`](./Errors#approvalstale) \| [`ApprovalMismatch`](./Errors#approvalmismatch)\>

###### Parameters

###### input

###### approvalId

`string`

###### decision

\{ \} \| \{ `reason?`: `string`; \}

###### operator?

`string`

###### runId

`string`

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ApprovalStale`](./Errors#approvalstale) \| [`ApprovalMismatch`](./Errors#approvalmismatch)\>

<a id="resume"></a>

##### resume

> `readonly` **resume**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`WaitNotOpen`](./Errors#waitnotopen) \| [`ResponseConflict`](./Errors#responseconflict)\>

###### Parameters

###### input

###### resolution

\{ \} \| \{ `reason?`: `string`; \} \| \{ `encodedResult`: `unknown`; `result`: `unknown`; \} \| \{ `name`: `string`; `payload?`: `unknown`; \}

###### runId

`string`

###### waitId

`string`

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`WaitNotOpen`](./Errors#waitnotopen) \| [`ResponseConflict`](./Errors#responseconflict)\>

<a id="retryexecution"></a>

##### retryExecution

> `readonly` **retryExecution**: (`input`) => `Effect`\<`ExecutionRecord`, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim`

###### Returns

`Effect`\<`ExecutionRecord`, `WorkerMutationError`\>

<a id="retryrecovery"></a>

##### retryRecovery

> `readonly` **retryRecovery**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)\>

###### Parameters

###### input

[`RetryInput`](./Recovery#retryinput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)\>

<a id="rewind"></a>

##### rewind

> `readonly` **rewind**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot)\>

###### Parameters

###### input

`RewindRunInput`

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot)\>

<a id="saveexecution"></a>

##### saveExecution

> `readonly` **saveExecution**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`StaleClaim`](./Errors#staleclaim) \| `StaleSessionClaim`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`StaleClaim`](./Errors#staleclaim) \| `StaleSessionClaim`\>

<a id="sessionreader"></a>

##### sessionReader

> `readonly` **sessionReader**: (`sessionId`) => `Effect`\<`Option`\<`SessionReader`\>\>

Read-only durable conversation history for one Session identity.

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<`Option`\<`SessionReader`\>\>

<a id="sessionroots"></a>

##### sessionRoots

> `readonly` **sessionRoots**: (`sessionId`) => `Effect`\<readonly `string`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<readonly `string`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

<a id="settlementnotifications"></a>

##### settlementNotifications

> `readonly` **settlementNotifications**: (`input`) => `Effect`\<readonly `object`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

Ordered durable child settlements addressed to one exact parent Run.

###### Parameters

###### input

###### afterSequence

`number`

###### limit

`number`

###### parentRunId

`string`

###### Returns

`Effect`\<readonly `object`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="settleprogramoperation"></a>

##### settleProgramOperation

> `readonly` **settleProgramOperation**: (`input`) => `Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

###### Parameters

###### input

`SettleProgramOperationInput`

###### Returns

`Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

<a id="signal"></a>

##### signal

> `readonly` **signal**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal)\>

###### Parameters

###### input

[`SignalInput`](./Runtime#signalinput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal)\>

<a id="snapshot"></a>

##### snapshot

> `readonly` **snapshot**: (`runId`) => `Effect`\<[`RunSnapshot`](./Run#runsnapshot), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RunSnapshot`](./Run#runsnapshot), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="startoperation"></a>

##### startOperation

> `readonly` **startOperation**: (`input`) => `Effect`\<`OperationRecord`, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<`OperationRecord`, `WorkerMutationError`\>

<a id="startprogramoperation"></a>

##### startProgramOperation

> `readonly` **startProgramOperation**: (`input`) => `Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError`\>

<a id="suspend"></a>

##### suspend

> `readonly` **suspend**: (`input`) => `Effect`\<`void`, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<`void`, `WorkerMutationError`\>

<a id="suspendprogramoperation"></a>

##### suspendProgramOperation

> `readonly` **suspendProgramOperation**: (`input`) => `Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

###### Parameters

###### input

`SuspendProgramOperationInput`

###### Returns

`Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

<a id="timeoutawaitevent"></a>

##### timeoutAwaitEvent

> `readonly` **timeoutAwaitEvent**: (`input`) => `Effect`\<`boolean`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal)\>

###### Parameters

###### input

###### deadline

`string`

###### now

`number`

###### runId

`string`

###### waitId

`string`

###### Returns

`Effect`\<`boolean`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal)\>

<a id="treechanges"></a>

##### treeChanges

> `readonly` **treeChanges**: (`rootRunId`) => `Stream`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### rootRunId

`string`

###### Returns

`Stream`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="treecheckpoint"></a>

##### treeCheckpoint

> `readonly` **treeCheckpoint**: (`rootRunId`) => `Effect`\<[`Checkpoint`](./RunTree#checkpoint), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### rootRunId

`string`

###### Returns

`Effect`\<[`Checkpoint`](./RunTree#checkpoint), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

<a id="treereplay"></a>

##### treeReplay

> `readonly` **treeReplay**: (`input`) => `Effect`\<[`ReplayPage`](./RunTree#replaypage), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`TreeCursorExpired`](./Errors#treecursorexpired) \| [`TreeCursorFuture`](./Errors#treecursorfuture) \| [`TreeReplayLimitInvalid`](./Errors#treereplaylimitinvalid)\>

###### Parameters

###### input

###### limit

`number`

###### position

`number`

###### rootRunId

`string`

###### Returns

`Effect`\<[`ReplayPage`](./RunTree#replaypage), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`TreeCursorExpired`](./Errors#treecursorexpired) \| [`TreeCursorFuture`](./Errors#treecursorfuture) \| [`TreeReplayLimitInvalid`](./Errors#treereplaylimitinvalid)\>

<a id="wake"></a>

##### wake

> `readonly` **wake**: (`input`) => `Effect`\<\{ `waitId`: `string`; \} \| \{ \} \| \{ \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal)\>

###### Parameters

###### input

###### event

\{ `dedupeKey`: `string`; `payload`: `Json`; `scheduledAt`: `string`; `scheduleId`: `string`; \} \| \{ `dedupeKey`: `string`; `headers`: \{\[`key`: `string`\]: `string`; \}; `payload`: `Json`; `source`: `string`; \} \| \{ `childRunId`: `string`; `dedupeKey`: `string`; `terminalEventId`: `string`; \} \| \{ `dedupeKey`: `string`; `kind`: `"create"` \| `"remove"` \| `"update"`; `path`: `string`; \} \| \{ `approvalId`: `string`; `decision`: \{ \} \| \{ `reason?`: `string`; \}; `dedupeKey`: `string`; \}

###### now

`number`

###### runId

`string`

###### Returns

`Effect`\<\{ `waitId`: `string`; \} \| \{ \} \| \{ \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal)\>

<a id="wakerecovery"></a>

##### wakeRecovery

> `readonly` **wakeRecovery**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)\>

###### Parameters

###### input

[`OperatorActionInput`](./Recovery#operatoractioninput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)\>

***

<a id="storeinfo"></a>

### StoreInfo

#### Properties

<a id="backend"></a>

##### backend

> `readonly` **backend**: [`StoreBackend`](#storebackend)

<a id="durability"></a>

##### durability

> `readonly` **durability**: [`Durability`](#durability-1)

<a id="multiworker"></a>

##### multiWorker

> `readonly` **multiWorker**: `boolean`

## Type Aliases

<a id="completionoutcome"></a>

### CompletionOutcome

> **CompletionOutcome** = \{ `_tag`: `"Completed"`; \} \| \{ `_tag`: `"SteeringPending"`; `continuation`: [`ExecutionContinuation`](./Steering#executioncontinuation); \}

***

<a id="durability-1"></a>

### Durability

> **Durability** = `"ephemeral"` \| `"durable"`

***

<a id="storebackend"></a>

### StoreBackend

> **StoreBackend** = `"memory"` \| `"sqlite"` \| `"postgres"` \| `"mysql"`

## Variables

<a id="layermemory"></a>

### layerMemory

> `const` **layerMemory**: (`options`) => `Layer.Layer`\<[`RunStore`](#runstore) \| [`ExternalChildStore`](../../unstable.runtime.external-child-store#externalchildstore)\>

#### Parameters

##### options

[`LayerOptions`](./Runtime#layeroptions)

#### Returns

`Layer.Layer`\<[`RunStore`](#runstore) \| [`ExternalChildStore`](../../unstable.runtime.external-child-store#externalchildstore)\>

## References

<a id="executioncontinuation"></a>

### ExecutionContinuation

Re-exports [ExecutionContinuation](./Steering#executioncontinuation-1)

***

<a id="steeringentry"></a>

### SteeringEntry

Re-exports [SteeringEntry](./Steering#steeringentry-1)

***

<a id="steeringreceipt"></a>

### SteeringReceipt

Re-exports [SteeringReceipt](./Steering#steeringreceipt-1)
