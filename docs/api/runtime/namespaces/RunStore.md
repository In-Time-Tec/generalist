[**generalist**](../../index.md)

***

[generalist](../../index.md) / [runtime](../index.md) / RunStore

# RunStore

## Classes

<a id="runstore"></a>

### RunStore

RunStore public contract and canonical object-backed layer.

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

> `readonly` **executableManifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

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

###### concurrency

> `readonly` **concurrency**: `object`

###### concurrency.agents

> `readonly` **agents**: `number`

###### concurrency.tools

> `readonly` **tools**: `number`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSessions

> `readonly` **maxSessions**: `number`

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

> `readonly` **executableManifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

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

> `readonly` **initialChildren**: readonly `Omit`\<[`InitialChildInput`](./Runtime.md#initialchildinput), `"prompt"`\> & `object`[]

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

###### concurrency

> `readonly` **concurrency**: `object`

###### concurrency.agents

> `readonly` **agents**: `number`

###### concurrency.tools

> `readonly` **tools**: `number`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSessions

> `readonly` **maxSessions**: `number`

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

> `readonly` **policy**: `"steer"` \| `"interrupt"` \| `"rollback"` \| `"reject"`

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

> `readonly` `optional` **checkpoint?**: \{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \} \| \{ `branch?`: \{ `namespace`: `string`; `replay`: \{\[`key`: `string`\]: `string`; \}; \}; `version`: `"1"`; \}

<a id="continuation"></a>

##### continuation?

> `readonly` `optional` **continuation?**: \{ `nextTurn`: `number`; `prompt`: `Prompt`; `queue?`: `"steering"`; `schemaVersion`: `1`; `steeringEntryIds`: readonly `string`[]; \} \| `null`

<a id="input"></a>

##### input

> `readonly` **input**: `unknown`

<a id="inputdigest"></a>

##### inputDigest

> `readonly` **inputDigest**: `string`

<a id="kind"></a>

##### kind

> `readonly` **kind**: `"compaction"` \| `"tool"` \| `"hook"` \| `"send"` \| `"model"` \| `"structured-output"` \| `"wait"` \| `"operator"` \| `"memory"` \| `"log"` \| `"handoff"` \| `"nested"`

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

> `readonly` **acknowledge**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`AckInvalid`](./Errors.md#ackinvalid) \| [`AckBeyondCommitted`](./Errors.md#ackbeyondcommitted)\>

Durably advance the host processed-through point to an exact committed model cycle.

###### Parameters

###### input

###### runId

`string`

###### sequence

`number`

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`AckInvalid`](./Errors.md#ackinvalid) \| [`AckBeyondCommitted`](./Errors.md#ackbeyondcommitted)\>

<a id="acknowledged"></a>

##### acknowledged

> `readonly` **acknowledged**: (`runId`) => `Effect`\<\{ `acknowledgedAt?`: `string`; `runId`: `string`; `sequence`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

Read the durable host processed-through point; -1 means no cycle is acknowledged.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `acknowledgedAt?`: `string`; `runId`: `string`; `sequence`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

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

> `readonly` **activate**: (`input`) => `Effect`\<[`RunInspection`](./Run.md#runinspection), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

###### Parameters

###### input

`CommandIdentity` & `object`

###### Returns

`Effect`\<[`RunInspection`](./Run.md#runinspection), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="admitfanout"></a>

##### admitFanOut

> `readonly` **admitFanOut**: (`input`) => `Effect`\<\{ `childRunIds`: readonly `string`[]; `duplicate`: `boolean`; `fanOutId`: `string`; `parentRunId`: `string`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ChildDepthExceeded`](./Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors.md#childlimitexceeded) \| [`ChildSelectionMissing`](./Errors.md#childselectionmissing) \| [`FanOutConflict`](./Errors.md#fanoutconflict) \| [`FanOutInvalid`](./Errors.md#fanoutinvalid) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal)\>

###### Parameters

###### input

`AdmitFanOutInput`

###### Returns

`Effect`\<\{ `childRunIds`: readonly `string`[]; `duplicate`: `boolean`; `fanOutId`: `string`; `parentRunId`: `string`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ChildDepthExceeded`](./Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors.md#childlimitexceeded) \| [`ChildSelectionMissing`](./Errors.md#childselectionmissing) \| [`FanOutConflict`](./Errors.md#fanoutconflict) \| [`FanOutInvalid`](./Errors.md#fanoutinvalid) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal)\>

<a id="admitprogramagents"></a>

##### admitProgramAgents

> `readonly` **admitProgramAgents**: (`input`) => `Effect`\<\{ `authoredOperation`: `string`; `capability`: `string`; `childRunIds`: readonly `string`[]; `completedSequence?`: `number`; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"running"` \| `"waiting"` \| `"reserved"`; `waitId?`: `string`; \}, [`ChildDepthExceeded`](./Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors.md#childlimitexceeded) \| [`ChildSelectionMissing`](./Errors.md#childselectionmissing) \| [`FanOutConflict`](./Errors.md#fanoutconflict) \| [`FanOutInvalid`](./Errors.md#fanoutinvalid) \| `WorkerMutationError` \| `ProgramStoreFailure`\>

###### Parameters

###### input

`AdmitProgramAgentsInput`

###### Returns

`Effect`\<\{ `authoredOperation`: `string`; `capability`: `string`; `childRunIds`: readonly `string`[]; `completedSequence?`: `number`; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"running"` \| `"waiting"` \| `"reserved"`; `waitId?`: `string`; \}, [`ChildDepthExceeded`](./Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors.md#childlimitexceeded) \| [`ChildSelectionMissing`](./Errors.md#childselectionmissing) \| [`FanOutConflict`](./Errors.md#fanoutconflict) \| [`FanOutInvalid`](./Errors.md#fanoutinvalid) \| `WorkerMutationError` \| `ProgramStoreFailure`\>

<a id="admitprogramchild"></a>

##### admitProgramChild

> `readonly` **admitProgramChild**: (`input`) => `Effect`\<[`RunReceipt`](./Run.md#runreceipt), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ChildDepthExceeded`](./Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors.md#childlimitexceeded) \| [`IdempotencyConflict`](./Errors.md#idempotencyconflict) \| [`RunIdConflict`](./Errors.md#runidconflict) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`StaleClaim`](./Errors.md#staleclaim) \| `StaleSessionClaim`\>

###### Parameters

###### input

`AdmitProgramChildInput`

###### Returns

`Effect`\<[`RunReceipt`](./Run.md#runreceipt), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ChildDepthExceeded`](./Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors.md#childlimitexceeded) \| [`IdempotencyConflict`](./Errors.md#idempotencyconflict) \| [`RunIdConflict`](./Errors.md#runidconflict) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`StaleClaim`](./Errors.md#staleclaim) \| `StaleSessionClaim`\>

<a id="admitprogramchildandsuspend"></a>

##### admitProgramChildAndSuspend

> `readonly` **admitProgramChildAndSuspend**: (`input`) => `Effect`\<readonly [`RunReceipt`](./Run.md#runreceipt)[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ChildDepthExceeded`](./Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors.md#childlimitexceeded) \| [`IdempotencyConflict`](./Errors.md#idempotencyconflict) \| [`RunIdConflict`](./Errors.md#runidconflict) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`StaleClaim`](./Errors.md#staleclaim) \| `StaleSessionClaim`\>

###### Parameters

###### input

`AdmitProgramChildAndSuspendInput`

###### Returns

`Effect`\<readonly [`RunReceipt`](./Run.md#runreceipt)[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ChildDepthExceeded`](./Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors.md#childlimitexceeded) \| [`IdempotencyConflict`](./Errors.md#idempotencyconflict) \| [`RunIdConflict`](./Errors.md#runidconflict) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`StaleClaim`](./Errors.md#staleclaim) \| `StaleSessionClaim`\>

<a id="admitrollback"></a>

##### admitRollback

> `readonly` **admitRollback**: (`input`) => `Effect`\<`SteeringAdmission`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`ForkSequenceInvalid`](./Errors.md#forksequenceinvalid) \| [`NoSnapshot`](./Errors.md#nosnapshot) \| [`Invalid`](../../generalist/namespaces/RunBudget.md#invalid) \| [`RunTerminal`](./Errors.md#runterminal) \| [`InboxFull`](../../generalist/namespaces/Steering.md#inboxfull) \| [`RunBusy`](./Errors.md#runbusy) \| [`SteeringConflict`](./Errors.md#steeringconflict)\>

###### Parameters

###### input

`AdmitRollbackInput`

###### Returns

`Effect`\<`SteeringAdmission`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`ForkSequenceInvalid`](./Errors.md#forksequenceinvalid) \| [`NoSnapshot`](./Errors.md#nosnapshot) \| [`Invalid`](../../generalist/namespaces/RunBudget.md#invalid) \| [`RunTerminal`](./Errors.md#runterminal) \| [`InboxFull`](../../generalist/namespaces/Steering.md#inboxfull) \| [`RunBusy`](./Errors.md#runbusy) \| [`SteeringConflict`](./Errors.md#steeringconflict)\>

<a id="admitsend"></a>

##### admitSend

> `readonly` **admitSend**: (`input`) => `Effect`\<[`RunReceipt`](./Run.md#runreceipt), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`IdempotencyConflict`](./Errors.md#idempotencyconflict) \| [`RunIdConflict`](./Errors.md#runidconflict) \| [`ExecutableRegistrationConflict`](./Errors.md#executableregistrationconflict) \| [`TreePolicyInvalid`](./Errors.md#treepolicyinvalid) \| [`AddressNotFound`](./Errors.md#addressnotfound)\>

###### Parameters

###### input

[`AdmitSendInput`](#admitsendinput)

###### Returns

`Effect`\<[`RunReceipt`](./Run.md#runreceipt), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`IdempotencyConflict`](./Errors.md#idempotencyconflict) \| [`RunIdConflict`](./Errors.md#runidconflict) \| [`ExecutableRegistrationConflict`](./Errors.md#executableregistrationconflict) \| [`TreePolicyInvalid`](./Errors.md#treepolicyinvalid) \| [`AddressNotFound`](./Errors.md#addressnotfound)\>

<a id="admitspawn"></a>

##### admitSpawn

> `readonly` **admitSpawn**: (`input`) => `Effect`\<[`RunReceipt`](./Run.md#runreceipt), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ChildDepthExceeded`](./Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors.md#childlimitexceeded) \| [`IdempotencyConflict`](./Errors.md#idempotencyconflict) \| [`ChildSelectionMissing`](./Errors.md#childselectionmissing) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal)\>

###### Parameters

###### input

`Omit`\<[`SpawnInput`](./Runtime.md#spawninput), `"prompt"`\> & `object`

###### Returns

`Effect`\<[`RunReceipt`](./Run.md#runreceipt), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ChildDepthExceeded`](./Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors.md#childlimitexceeded) \| [`IdempotencyConflict`](./Errors.md#idempotencyconflict) \| [`ChildSelectionMissing`](./Errors.md#childselectionmissing) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal)\>

<a id="admitstart"></a>

##### admitStart

> `readonly` **admitStart**: (`input`, `options?`) => `Effect`\<[`StartReceipt`](./Runtime.md#startreceipt), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ChildDepthExceeded`](./Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors.md#childlimitexceeded) \| [`IdempotencyConflict`](./Errors.md#idempotencyconflict) \| [`RunIdConflict`](./Errors.md#runidconflict) \| [`ExecutableRegistrationConflict`](./Errors.md#executableregistrationconflict) \| [`ChildSelectionMissing`](./Errors.md#childselectionmissing) \| [`StartInvalid`](./Errors.md#startinvalid) \| [`FanOutConflict`](./Errors.md#fanoutconflict) \| [`FanOutInvalid`](./Errors.md#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./Errors.md#fanoutremainderunsupported) \| [`TreePolicyInvalid`](./Errors.md#treepolicyinvalid) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted)\>

###### Parameters

###### input

[`AdmitStartInput`](#admitstartinput)

###### options?

###### activate?

`boolean`

###### Returns

`Effect`\<[`StartReceipt`](./Runtime.md#startreceipt), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ChildDepthExceeded`](./Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors.md#childlimitexceeded) \| [`IdempotencyConflict`](./Errors.md#idempotencyconflict) \| [`RunIdConflict`](./Errors.md#runidconflict) \| [`ExecutableRegistrationConflict`](./Errors.md#executableregistrationconflict) \| [`ChildSelectionMissing`](./Errors.md#childselectionmissing) \| [`StartInvalid`](./Errors.md#startinvalid) \| [`FanOutConflict`](./Errors.md#fanoutconflict) \| [`FanOutInvalid`](./Errors.md#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./Errors.md#fanoutremainderunsupported) \| [`TreePolicyInvalid`](./Errors.md#treepolicyinvalid) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted)\>

<a id="admitsteering"></a>

##### admitSteering

> `readonly` **admitSteering**: (`input`) => `Effect`\<`SteeringAdmission`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`InboxFull`](../../generalist/namespaces/Steering.md#inboxfull) \| [`RunBusy`](./Errors.md#runbusy) \| [`SteeringConflict`](./Errors.md#steeringconflict)\>

###### Parameters

###### input

[`AdmitSteeringInput`](#admitsteeringinput)

###### Returns

`Effect`\<`SteeringAdmission`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`InboxFull`](../../generalist/namespaces/Steering.md#inboxfull) \| [`RunBusy`](./Errors.md#runbusy) \| [`SteeringConflict`](./Errors.md#steeringconflict)\>

<a id="advanceschedule"></a>

##### advanceSchedule

> `readonly` **advanceSchedule**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

###### Parameters

###### input

`CommandIdentity` & `object`

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

<a id="appendartifact"></a>

##### appendArtifact

> `readonly` **appendArtifact**: (`input`) => `Effect`\<\{ `artifact`: `string`; `attribution`: \{ `actor`: `string`; `runId`: `string`; \} \| \{ `actor`: `string`; \}; `base`: `number`; `branch?`: `string`; `operation`: \{ `at`: `number`; `text`: `string`; \} \| \{ `from`: `number`; `to`: `number`; \} \| \{ `from`: `number`; `text`: `string`; `to`: `number`; \}; `result`: `number`; `snapshot`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; `update`: `Uint8Array`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ArtifactCrdtMismatch`](../../unstable.artifact.md#artifactcrdtmismatch) \| [`ArtifactNotFound`](../../unstable.artifact.md#artifactnotfound) \| [`ArtifactVersionConflict`](../../unstable.artifact.md#artifactversionconflict) \| [`ArtifactVersionNotFound`](../../unstable.artifact.md#artifactversionnotfound)\>

Append one CRDT operation if the expected branch head still matches.

###### Parameters

###### input

`ArtifactAppend`

###### Returns

`Effect`\<\{ `artifact`: `string`; `attribution`: \{ `actor`: `string`; `runId`: `string`; \} \| \{ `actor`: `string`; \}; `base`: `number`; `branch?`: `string`; `operation`: \{ `at`: `number`; `text`: `string`; \} \| \{ `from`: `number`; `to`: `number`; \} \| \{ `from`: `number`; `text`: `string`; `to`: `number`; \}; `result`: `number`; `snapshot`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; `update`: `Uint8Array`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ArtifactCrdtMismatch`](../../unstable.artifact.md#artifactcrdtmismatch) \| [`ArtifactNotFound`](../../unstable.artifact.md#artifactnotfound) \| [`ArtifactVersionConflict`](../../unstable.artifact.md#artifactversionconflict) \| [`ArtifactVersionNotFound`](../../unstable.artifact.md#artifactversionnotfound)\>

<a id="artifactappendreceipt"></a>

##### artifactAppendReceipt

> `readonly` **artifactAppendReceipt**: (`input`) => `Effect`\<\{ `commandId`: `string`; `crdt`: `string`; `update`: \{ `artifact`: `string`; `attribution`: \{ `actor`: `string`; `runId`: `string`; \} \| \{ `actor`: `string`; \}; `base`: `number`; `branch?`: `string`; `operation`: \{ `at`: `number`; `text`: `string`; \} \| \{ `from`: `number`; `to`: `number`; \} \| \{ `from`: `number`; `text`: `string`; `to`: `number`; \}; `result`: `number`; `snapshot`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; `update`: `Uint8Array`; \}; \} \| `undefined`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

Look up one persisted append receipt without mutating artifact state.

###### Parameters

###### input

###### artifact

`string`

###### branch?

`string`

###### commandId

`string`

###### Returns

`Effect`\<\{ `commandId`: `string`; `crdt`: `string`; `update`: \{ `artifact`: `string`; `attribution`: \{ `actor`: `string`; `runId`: `string`; \} \| \{ `actor`: `string`; \}; `base`: `number`; `branch?`: `string`; `operation`: \{ `at`: `number`; `text`: `string`; \} \| \{ `from`: `number`; `to`: `number`; \} \| \{ `from`: `number`; `text`: `string`; `to`: `number`; \}; `result`: `number`; `snapshot`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; `update`: `Uint8Array`; \}; \} \| `undefined`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

<a id="artifacthead"></a>

##### artifactHead

> `readonly` **artifactHead**: (`input`) => `Effect`\<\{ `artifact`: `string`; `branch?`: `string`; `crdt`: `string`; `snapshot`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; `version`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ArtifactNotFound`](../../unstable.artifact.md#artifactnotfound)\>

Load the current head of one artifact branch.

###### Parameters

###### input

###### artifact

`string`

###### branch?

`string`

###### Returns

`Effect`\<\{ `artifact`: `string`; `branch?`: `string`; `crdt`: `string`; `snapshot`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; `version`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ArtifactNotFound`](../../unstable.artifact.md#artifactnotfound)\>

<a id="artifactrunisfork"></a>

##### artifactRunIsFork

> `readonly` **artifactRunIsFork**: (`runId`) => `Effect`\<`boolean`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

Whether this Run was created by Runtime fork or rewind branch retention.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`boolean`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="artifactsnapshot"></a>

##### artifactSnapshot

> `readonly` **artifactSnapshot**: (`input`) => `Effect`\<\{ `artifact`: `string`; `branch?`: `string`; `crdt`: `string`; `snapshot`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; `version`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ArtifactNotFound`](../../unstable.artifact.md#artifactnotfound) \| [`ArtifactVersionNotFound`](../../unstable.artifact.md#artifactversionnotfound)\>

Load one exact historical snapshot from the artifact operation log.

###### Parameters

###### input

###### artifact

`string`

###### branch?

`string`

###### version

`number`

###### Returns

`Effect`\<\{ `artifact`: `string`; `branch?`: `string`; `crdt`: `string`; `snapshot`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; `version`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ArtifactNotFound`](../../unstable.artifact.md#artifactnotfound) \| [`ArtifactVersionNotFound`](../../unstable.artifact.md#artifactversionnotfound)\>

<a id="artifactupdates"></a>

##### artifactUpdates

> `readonly` **artifactUpdates**: (`input`) => `Stream`\<\{ `artifact`: `string`; `attribution`: \{ `actor`: `string`; `runId`: `string`; \} \| \{ `actor`: `string`; \}; `base`: `number`; `branch?`: `string`; `operation`: \{ `at`: `number`; `text`: `string`; \} \| \{ `from`: `number`; `to`: `number`; \} \| \{ `from`: `number`; `text`: `string`; `to`: `number`; \}; `result`: `number`; `snapshot`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; `update`: `Uint8Array`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ArtifactNotFound`](../../unstable.artifact.md#artifactnotfound) \| [`ArtifactSubscriberLagged`](../../unstable.artifact.md#artifactsubscriberlagged) \| [`ArtifactVersionNotFound`](../../unstable.artifact.md#artifactversionnotfound)\>

Replay then follow committed artifact operations after an exclusive version.

###### Parameters

###### input

###### artifact

`string`

###### branch?

`string`

###### version

`number`

###### Returns

`Stream`\<\{ `artifact`: `string`; `attribution`: \{ `actor`: `string`; `runId`: `string`; \} \| \{ `actor`: `string`; \}; `base`: `number`; `branch?`: `string`; `operation`: \{ `at`: `number`; `text`: `string`; \} \| \{ `from`: `number`; `to`: `number`; \} \| \{ `from`: `number`; `text`: `string`; `to`: `number`; \}; `result`: `number`; `snapshot`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; `update`: `Uint8Array`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ArtifactNotFound`](../../unstable.artifact.md#artifactnotfound) \| [`ArtifactSubscriberLagged`](../../unstable.artifact.md#artifactsubscriberlagged) \| [`ArtifactVersionNotFound`](../../unstable.artifact.md#artifactversionnotfound)\>

<a id="cancel"></a>

##### cancel

> `readonly` **cancel**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

###### Parameters

###### input

`CommandIdentity` & [`CancelInput`](./Runtime.md#cancelinput)

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="cancelsession"></a>

##### cancelSession

> `readonly` **cancelSession**: (`input`) => `Effect`\<readonly `string`[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

###### Parameters

###### input

`CommandIdentity` & `object`

###### Returns

`Effect`\<readonly `string`[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

<a id="claimedsessionstore"></a>

##### claimedSessionStore

> `readonly` **claimedSessionStore**: (`claim`) => `Effect`\<`Option`\<[`SessionStore`](../../generalist/namespaces/Session.md#sessionstore)\>, [`DurabilityFailure`](../../durability.md#durabilityfailure)\>

Session writer bound to one storage-issued execution claim.

###### Parameters

###### claim

`ExecutionClaim`

###### Returns

`Effect`\<`Option`\<[`SessionStore`](../../generalist/namespaces/Session.md#sessionstore)\>, [`DurabilityFailure`](../../durability.md#durabilityfailure)\>

<a id="claimexecution"></a>

##### claimExecution

> `readonly` **claimExecution**: (`input`) => `Effect`\<`ExecutionRecord` & `ExecutionClaim`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`StaleClaim`](./Errors.md#staleclaim)\>

###### Parameters

###### input

`CommandIdentity` & `object`

###### Returns

`Effect`\<`ExecutionRecord` & `ExecutionClaim`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`StaleClaim`](./Errors.md#staleclaim)\>

<a id="claimschedules"></a>

##### claimSchedules

> `readonly` **claimSchedules**: (`input`) => `Effect`\<readonly `ClaimedSchedule`[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

###### Parameters

###### input

`CommandIdentity` & `object`

###### Returns

`Effect`\<readonly `ClaimedSchedule`[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

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

> `readonly` **commitProgramLog**: (`input`) => `Effect`\<\{ `authoredOperation`: `string`; `capability`: `string`; `childRunIds`: readonly `string`[]; `completedSequence?`: `number`; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"running"` \| `"waiting"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

###### Parameters

###### input

`CommitProgramLogInput`

###### Returns

`Effect`\<\{ `authoredOperation`: `string`; `capability`: `string`; `childRunIds`: readonly `string`[]; `completedSequence?`: `number`; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"running"` \| `"waiting"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

<a id="complete"></a>

##### complete

> `readonly` **complete**: (`input`) => `Effect`\<[`CompletionOutcome`](#completionoutcome), `WorkerMutationError`\>

###### Parameters

###### input

`CommandIdentity` & `ExecutionClaim` & `object`

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

> `readonly` **completeProgram**: (`input`) => `Effect`\<[`CompletionOutcome`](#completionoutcome), [`ProgramBudgetExhausted`](../../generalist/namespaces/ProgramCapabilities.md#programbudgetexhausted) \| `WorkerMutationError`\>

###### Parameters

###### input

`CompleteProgramInput`

###### Returns

`Effect`\<[`CompletionOutcome`](#completionoutcome), [`ProgramBudgetExhausted`](../../generalist/namespaces/ProgramCapabilities.md#programbudgetexhausted) \| `WorkerMutationError`\>

<a id="configuredelegationpolicy"></a>

##### configureDelegationPolicy

> `readonly` **configureDelegationPolicy**: (`policy`) => `Effect`\<\{ `concurrency`: \{ `agents`: `number`; `tools`: `number`; \}; `maxDepth`: `number`; `maxSessions`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`TreePolicyInvalid`](./Errors.md#treepolicyinvalid)\>

###### Parameters

###### policy

###### concurrency

\{ `agents`: `number`; `tools`: `number`; \}

###### concurrency.agents

`number`

###### concurrency.tools

`number`

###### maxDepth

`number`

###### maxSessions

`number`

###### Returns

`Effect`\<\{ `concurrency`: \{ `agents`: `number`; `tools`: `number`; \}; `maxDepth`: `number`; `maxSessions`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`TreePolicyInvalid`](./Errors.md#treepolicyinvalid)\>

<a id="createhostsession"></a>

##### createHostSession

> `readonly` **createHostSession**: (`input`) => `Effect`\<[`HostSession`](../../host.md#hostsession-1), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionConflict`](../../host.md#sessionconflict)\>

Persist one product-facing Session identity and metadata.

###### Parameters

###### input

###### id

`string`

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

###### title?

`string`

###### Returns

`Effect`\<[`HostSession`](../../host.md#hostsession-1), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionConflict`](../../host.md#sessionconflict)\>

<a id="directory"></a>

##### directory

> `readonly` **directory**: (`runId`) => `Effect`\<[`DirectoryEntry`](./AgentDirectory.md#directoryentry), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| `DirectoryLookupError`\>

The authoritative directory record for one Run.

Identity, parentage, and session membership are read from the durable Run record. Nothing is
derived by parsing an Address or a Run id.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`DirectoryEntry`](./AgentDirectory.md#directoryentry), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| `DirectoryLookupError`\>

<a id="dueawaitevents"></a>

##### dueAwaitEvents

> `readonly` **dueAwaitEvents**: (`input`) => `Effect`\<readonly `DueAwaitEvent`[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

###### Parameters

###### input

###### limit

`number`

###### now

`number`

###### Returns

`Effect`\<readonly `DueAwaitEvent`[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

<a id="emitagentevent"></a>

##### emitAgentEvent

> `readonly` **emitAgentEvent**: (`input`) => `Effect`\<`void`, `WorkerMutationError`\>

###### Parameters

###### input

`CommandIdentity` & `ExecutionClaim` & `object`

###### Returns

`Effect`\<`void`, `WorkerMutationError`\>

<a id="ensureartifact"></a>

##### ensureArtifact

> `readonly` **ensureArtifact**: (`input`) => `Effect`\<\{ `artifact`: `string`; `branch?`: `string`; `crdt`: `string`; `snapshot`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; `version`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ArtifactCrdtMismatch`](../../unstable.artifact.md#artifactcrdtmismatch)\>

Create or load the main head for one shared artifact.

###### Parameters

###### input

###### artifact

`string`

###### crdt

`string`

###### snapshot

\{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}

###### snapshot.bytes

`number`

###### snapshot.filename?

`string`

###### snapshot.mediaType

`string`

###### snapshot.sha256

`string`

###### Returns

`Effect`\<\{ `artifact`: `string`; `branch?`: `string`; `crdt`: `string`; `snapshot`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; `version`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ArtifactCrdtMismatch`](../../unstable.artifact.md#artifactcrdtmismatch)\>

<a id="events"></a>

##### events

> `readonly` **events**: (`input`) => `Stream`\<[`RunEvent`](./RunEvent.md#runevent), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`CursorExpired`](./Errors.md#cursorexpired) \| [`SubscriberLagged`](./Errors.md#subscriberlagged)\>

###### Parameters

###### input

###### cursor

`number`

###### runId

`string`

###### Returns

`Stream`\<[`RunEvent`](./RunEvent.md#runevent), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`CursorExpired`](./Errors.md#cursorexpired) \| [`SubscriberLagged`](./Errors.md#subscriberlagged)\>

<a id="expirerunningoperation"></a>

##### expireRunningOperation

> `readonly` **expireRunningOperation**: (`input`) => `Effect`\<\{ `outcome`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"running"` \| `"cancelling"` \| `"requested"` \| `"retried"`; `record`: `OperationRecord`; \}, `WorkerMutationError`\>

###### Parameters

###### input

`CommandIdentity` & `ExecutionClaim` & `object`

###### Returns

`Effect`\<\{ `outcome`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"running"` \| `"cancelling"` \| `"requested"` \| `"retried"`; `record`: `OperationRecord`; \}, `WorkerMutationError`\>

<a id="extendbudget"></a>

##### extendBudget

> `readonly` **extendBudget**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

###### Parameters

###### input

`CommandIdentity` & `object`

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="extendbudgetrecovery"></a>

##### extendBudgetRecovery

> `readonly` **extendBudgetRecovery**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`IllegalOperatorAction`](./Errors.md#illegaloperatoraction)\>

###### Parameters

###### input

`CommandIdentity` & `object`

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`IllegalOperatorAction`](./Errors.md#illegaloperatoraction)\>

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

> `readonly` **fork**: (`input`) => `Effect`\<[`RunReceipt`](./Run.md#runreceipt), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`ForkSequenceInvalid`](./Errors.md#forksequenceinvalid) \| [`NoSnapshot`](./Errors.md#nosnapshot) \| [`SubstitutionInvalid`](./Errors.md#substitutioninvalid) \| [`Invalid`](../../generalist/namespaces/RunBudget.md#invalid)\>

###### Parameters

###### input

`ForkRunInput`

###### Returns

`Effect`\<[`RunReceipt`](./Run.md#runreceipt), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`ForkSequenceInvalid`](./Errors.md#forksequenceinvalid) \| [`NoSnapshot`](./Errors.md#nosnapshot) \| [`SubstitutionInvalid`](./Errors.md#substitutioninvalid) \| [`Invalid`](../../generalist/namespaces/RunBudget.md#invalid)\>

<a id="forkartifact"></a>

##### forkArtifact

> `readonly` **forkArtifact**: (`input`) => `Effect`\<\{ `artifact`: `string`; `branch?`: `string`; `crdt`: `string`; `snapshot`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; `version`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ArtifactCrdtMismatch`](../../unstable.artifact.md#artifactcrdtmismatch) \| [`ArtifactNotFound`](../../unstable.artifact.md#artifactnotfound) \| [`ArtifactVersionConflict`](../../unstable.artifact.md#artifactversionconflict) \| [`ArtifactVersionNotFound`](../../unstable.artifact.md#artifactversionnotfound)\>

Lazily create a forked Run's private artifact branch from its copied checkpoint.

###### Parameters

###### input

`ArtifactFork`

###### Returns

`Effect`\<\{ `artifact`: `string`; `branch?`: `string`; `crdt`: `string`; `snapshot`: \{ `bytes`: `number`; `filename?`: `string`; `mediaType`: `string`; `sha256`: `string`; \}; `version`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`ArtifactCrdtMismatch`](../../unstable.artifact.md#artifactcrdtmismatch) \| [`ArtifactNotFound`](../../unstable.artifact.md#artifactnotfound) \| [`ArtifactVersionConflict`](../../unstable.artifact.md#artifactversionconflict) \| [`ArtifactVersionNotFound`](../../unstable.artifact.md#artifactversionnotfound)\>

<a id="getoperation"></a>

##### getOperation

> `readonly` **getOperation**: (`input`) => `Effect`\<`OperationRecord`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

###### Parameters

###### input

###### operationId

`string`

###### runId

`string`

###### Returns

`Effect`\<`OperationRecord`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="getoperationbykey"></a>

##### getOperationByKey

> `readonly` **getOperationByKey**: (`input`) => `Effect`\<`OperationRecord` \| `undefined`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

###### Parameters

###### input

###### operationKey

`string`

###### runId

`string`

###### Returns

`Effect`\<`OperationRecord` \| `undefined`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="getprogramoperation"></a>

##### getProgramOperation

> `readonly` **getProgramOperation**: (`input`) => `Effect`\<\{ `authoredOperation`: `string`; `capability`: `string`; `childRunIds`: readonly `string`[]; `completedSequence?`: `number`; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"running"` \| `"waiting"` \| `"reserved"`; `waitId?`: `string`; \} \| `undefined`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

###### Parameters

###### input

###### operation

`string`

###### runId

`string`

###### Returns

`Effect`\<\{ `authoredOperation`: `string`; `capability`: `string`; `childRunIds`: readonly `string`[]; `completedSequence?`: `number`; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"running"` \| `"waiting"` \| `"reserved"`; `waitId?`: `string`; \} \| `undefined`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="hasadmission"></a>

##### hasAdmission

> `readonly` **hasAdmission**: (`input`) => `Effect`\<`boolean`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

###### Parameters

###### input

###### address

`string` & `Brand`\<`"Address"`\>

###### idempotencyKey

`string`

###### sessionId

`string`

###### Returns

`Effect`\<`boolean`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

<a id="history"></a>

##### history

> `readonly` **history**: (`input`) => `Effect`\<readonly [`RunEvent`](./RunEvent.md#runevent)[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`CursorExpired`](./Errors.md#cursorexpired)\>

###### Parameters

###### input

###### cursor

`number`

###### limit

`number`

###### runId

`string`

###### Returns

`Effect`\<readonly [`RunEvent`](./RunEvent.md#runevent)[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`CursorExpired`](./Errors.md#cursorexpired)\>

<a id="hostsession"></a>

##### hostSession

> `readonly` **hostSession**: (`sessionId`) => `Effect`\<[`HostSession`](../../host.md#hostsession-1), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound)\>

Read one product-facing Session by identity.

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<[`HostSession`](../../host.md#hostsession-1), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound)\>

<a id="hostsessionevents"></a>

##### hostSessionEvents

> `readonly` **hostSessionEvents**: (`input`) => `Stream`\<\{ `cursor`: `number`; `event`: [`RunEvent`](./RunEvent.md#runevent); \} \| \{ `cursor`: `number`; `update`: \{ `afterEntryId`: `string` \| `null`; `entries`: readonly `ConversationEntry`[]; `leafId`: `string` \| `null`; `nextLeafId?`: `string`; `previousLeafId`: `string` \| `null`; `reset?`: `true`; \}; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`SessionCursorExpired`](../../host.md#sessioncursorexpired) \| [`SessionSubscriberLagged`](../../host.md#sessionsubscriberlagged)\>

Replay then follow one product-facing Session's authoritative event cursor.

###### Parameters

###### input

###### cursor

`number`

###### sessionId

`string`

###### Returns

`Stream`\<\{ `cursor`: `number`; `event`: [`RunEvent`](./RunEvent.md#runevent); \} \| \{ `cursor`: `number`; `update`: \{ `afterEntryId`: `string` \| `null`; `entries`: readonly `ConversationEntry`[]; `leafId`: `string` \| `null`; `nextLeafId?`: `string`; `previousLeafId`: `string` \| `null`; `reset?`: `true`; \}; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`SessionCursorExpired`](../../host.md#sessioncursorexpired) \| [`SessionSubscriberLagged`](../../host.md#sessionsubscriberlagged)\>

<a id="hostsessionhistorypage"></a>

##### hostSessionHistoryPage

> `readonly` **hostSessionHistoryPage**: (`sessionId`, `input`) => `Effect`\<[`SessionHistoryPage`](../../host.md#sessionhistorypage), [`SessionPageError`](./HostSession.md#sessionpageerror)\>

###### Parameters

###### sessionId

`string`

###### input

###### leafId

`string` \| `null`

###### limit

`number`

###### Returns

`Effect`\<[`SessionHistoryPage`](../../host.md#sessionhistorypage), [`SessionPageError`](./HostSession.md#sessionpageerror)\>

<a id="hostsessionruns"></a>

##### hostSessionRuns

> `readonly` **hostSessionRuns**: (`sessionId`) => `Effect`\<readonly [`RunInspection`](./Run.md#runinspection)[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound)\>

List root Runs admitted through one product-facing Session.

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<readonly [`RunInspection`](./Run.md#runinspection)[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`SessionNotFound`](../../host.md#sessionnotfound)\>

<a id="hostsessionrunspage"></a>

##### hostSessionRunsPage

> `readonly` **hostSessionRunsPage**: (`sessionId`, `input`) => `Effect`\<[`SessionRunsPage`](../../host.md#sessionrunspage), [`SessionPageError`](./HostSession.md#sessionpageerror)\>

###### Parameters

###### sessionId

`string`

###### input

###### at

`number`

###### before?

`number`

###### limit

`number`

###### rootRunId?

`string`

###### Returns

`Effect`\<[`SessionRunsPage`](../../host.md#sessionrunspage), [`SessionPageError`](./HostSession.md#sessionpageerror)\>

<a id="hostsessionrunsummary"></a>

##### hostSessionRunSummary

> `readonly` **hostSessionRunSummary**: (`sessionId`, `runId`) => `Effect`\<[`SessionRunSummary`](../../host.md#sessionrunsummary), [`SessionPageError`](./HostSession.md#sessionpageerror)\>

###### Parameters

###### sessionId

`string`

###### runId

`string`

###### Returns

`Effect`\<[`SessionRunSummary`](../../host.md#sessionrunsummary), [`SessionPageError`](./HostSession.md#sessionpageerror)\>

<a id="hostsessionsnapshot"></a>

##### hostSessionSnapshot

> `readonly` **hostSessionSnapshot**: (`sessionId`) => `Effect`\<[`HostSessionSnapshot`](./HostSession.md#hostsessionsnapshot), [`SessionSnapshotError`](./HostSession.md#sessionsnapshoterror)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<[`HostSessionSnapshot`](./HostSession.md#hostsessionsnapshot), [`SessionSnapshotError`](./HostSession.md#sessionsnapshoterror)\>

<a id="info"></a>

##### info

> `readonly` **info**: `Effect`\<[`StoreInfo`](#storeinfo), [`DurabilityFailure`](../../durability.md#durabilityfailure)\>

<a id="inspect"></a>

##### inspect

> `readonly` **inspect**: (`runId`) => `Effect`\<[`RunInspection`](./Run.md#runinspection), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RunInspection`](./Run.md#runinspection), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="inspectfanout"></a>

##### inspectFanOut

> `readonly` **inspectFanOut**: (`fanOutId`) => `Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"request-cancel"` \| `"terminate"` \| `"abandon"`; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"running"`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`FanOutNotFound`](./Errors.md#fanoutnotfound)\>

###### Parameters

###### fanOutId

`string`

###### Returns

`Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"request-cancel"` \| `"terminate"` \| `"abandon"`; `status`: `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"running"`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`FanOutNotFound`](./Errors.md#fanoutnotfound)\>

<a id="list"></a>

##### list

> `readonly` **list**: (`input`) => `Effect`\<readonly [`RunInspection`](./Run.md#runinspection)[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

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

`"succeeded"` \| `"failed"` \| `"cancelled"` \| `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`

###### Returns

`Effect`\<readonly [`RunInspection`](./Run.md#runinspection)[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

<a id="listhostsessions"></a>

##### listHostSessions

> `readonly` **listHostSessions**: `Effect`\<readonly [`HostSession`](../../host.md#hostsession-1)[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

List product-facing Sessions in creation order.

<a id="listrelated"></a>

##### listRelated

> `readonly` **listRelated**: (`runId`) => `Effect`\<readonly [`DirectoryEntry`](./AgentDirectory.md#directoryentry)[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| `DirectoryLookupError`\>

Parent, direct children, and siblings under one parent, from durable links only.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<readonly [`DirectoryEntry`](./AgentDirectory.md#directoryentry)[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| `DirectoryLookupError`\>

<a id="loadexecution"></a>

##### loadExecution

> `readonly` **loadExecution**: (`runId`) => `Effect`\<`ExecutionRecord`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`ExecutionRecord`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="loadprogramstate"></a>

##### loadProgramState

> `readonly` **loadProgramState**: (`runId`) => `Effect`\<\{ `activeSlots`: `number`; `agentRuns`: `number`; `budget`: \{ `agentRuns`: `number`; `concurrency`: `number`; `logBytes`: `number`; `outputBytes`: `number`; `tokens`: `number`; `toolCalls`: `number`; `wallClockMillis`: `number`; \}; `concurrencyRoot?`: `string`; `deadlineMillis`: `number`; `logBytes`: `number`; `programPin`: `string`; `runId`: `string`; `tokens`: `number`; `toolCalls`: `number`; \} \| `undefined`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `activeSlots`: `number`; `agentRuns`: `number`; `budget`: \{ `agentRuns`: `number`; `concurrency`: `number`; `logBytes`: `number`; `outputBytes`: `number`; `tokens`: `number`; `toolCalls`: `number`; `wallClockMillis`: `number`; \}; `concurrencyRoot?`: `string`; `deadlineMillis`: `number`; `logBytes`: `number`; `programPin`: `string`; `runId`: `string`; `tokens`: `number`; `toolCalls`: `number`; \} \| `undefined`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="operationcancellations"></a>

##### operationCancellations

> `readonly` **operationCancellations**: (`input`) => `Effect`\<readonly `OperationRecord`[], `WorkerMutationError`\>

Cancellable tool operations awaiting a definitive concrete-executor acknowledgement.

###### Parameters

###### input

`CommandIdentity` & `ExecutionClaim`

###### Returns

`Effect`\<readonly `OperationRecord`[], `WorkerMutationError`\>

<a id="pendingsteering"></a>

##### pendingSteering

> `readonly` **pendingSteering**: (`input`) => `Effect`\<readonly `object`[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

Read pending inbox entries without claiming execution ownership.

###### Parameters

###### input

###### limit

`number`

###### runId

`string`

###### Returns

`Effect`\<readonly `object`[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

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

> `readonly` **recordReward**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

###### Parameters

###### input

`CommandIdentity` & [`RewardInput`](./RunEvent.md#rewardinput)

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="recoverrunningoperations"></a>

##### recoverRunningOperations

> `readonly` **recoverRunningOperations**: (`input`) => `Effect`\<`"ready"` \| `"blocked"`, `WorkerMutationError`\>

Reconcile operations left running by the prior owner before execution resumes.

###### Parameters

###### input

`CommandIdentity` & `ExecutionClaim`

###### Returns

`Effect`\<`"ready"` \| `"blocked"`, `WorkerMutationError`\>

<a id="recoveryjournal"></a>

##### recoveryJournal

> `readonly` **recoveryJournal**: (`runId`) => `Effect`\<[`Journal`](./Recovery.md#journal), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

Read the normalized durable facts from which operator recovery is derived.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`Journal`](./Recovery.md#journal), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="registeragentname"></a>

##### registerAgentName

> `readonly` **registerAgentName**: (`input`) => `Effect`\<[`DirectoryEntry`](./AgentDirectory.md#directoryentry), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`AgentNameConflict`](./Errors.md#agentnameconflict)\>

Bind one host-assigned name, unique inside the naming scope that owns the Run.

###### Parameters

###### input

###### name

`string` & `Brand`\<`"generalist/runtime/AgentName"`\>

###### runId

`string`

###### Returns

`Effect`\<[`DirectoryEntry`](./AgentDirectory.md#directoryentry), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`AgentNameConflict`](./Errors.md#agentnameconflict)\>

<a id="registerschedule"></a>

##### registerSchedule

> `readonly` **registerSchedule**: (`record`) => `Effect`\<\{ `nextAt`: `string`; `scheduleId`: `string`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

###### Parameters

###### record

`ScheduleRecord`

###### Returns

`Effect`\<\{ `nextAt`: `string`; `scheduleId`: `string`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

<a id="releaseexecution"></a>

##### releaseExecution

> `readonly` **releaseExecution**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

###### Parameters

###### input

`ExecutionClaim`

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

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

<a id="reserveprogramoperation"></a>

##### reserveProgramOperation

> `readonly` **reserveProgramOperation**: (`input`) => `Effect`\<\{ `authoredOperation`: `string`; `capability`: `string`; `childRunIds`: readonly `string`[]; `completedSequence?`: `number`; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"running"` \| `"waiting"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

###### Parameters

###### input

`ReserveProgramOperationInput`

###### Returns

`Effect`\<\{ `authoredOperation`: `string`; `capability`: `string`; `childRunIds`: readonly `string`[]; `completedSequence?`: `number`; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"running"` \| `"waiting"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

<a id="resolveaddress"></a>

##### resolveAddress

> `readonly` **resolveAddress**: (`address`) => `Effect`\<[`DirectoryEntry`](./AgentDirectory.md#directoryentry), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| `ResolveAddressError`\>

###### Parameters

###### address

`string` & `Brand`\<`"Address"`\>

###### Returns

`Effect`\<[`DirectoryEntry`](./AgentDirectory.md#directoryentry), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| `ResolveAddressError`\>

<a id="resolveoperation"></a>

##### resolveOperation

> `readonly` **resolveOperation**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`OperationResolutionConflict`](./Errors.md#operationresolutionconflict)\>

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

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`OperationResolutionConflict`](./Errors.md#operationresolutionconflict)\>

<a id="resolveunknown"></a>

##### resolveUnknown

> `readonly` **resolveUnknown**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`IllegalOperatorAction`](./Errors.md#illegaloperatoraction)\>

###### Parameters

###### input

`CommandIdentity` & [`ResolveUnknownInput`](./Recovery.md#resolveunknowninput)

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`IllegalOperatorAction`](./Errors.md#illegaloperatoraction)\>

<a id="respond"></a>

##### respond

> `readonly` **respond**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`WaitNotOpen`](./Errors.md#waitnotopen) \| [`ResponseConflict`](./Errors.md#responseconflict)\>

###### Parameters

###### input

[`RespondInput`](./Runtime.md#respondinput)

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`WaitNotOpen`](./Errors.md#waitnotopen) \| [`ResponseConflict`](./Errors.md#responseconflict)\>

<a id="respondapproval"></a>

##### respondApproval

> `readonly` **respondApproval**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`ApprovalStale`](./Errors.md#approvalstale) \| [`ApprovalMismatch`](./Errors.md#approvalmismatch)\>

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

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`ApprovalStale`](./Errors.md#approvalstale) \| [`ApprovalMismatch`](./Errors.md#approvalmismatch)\>

<a id="resume"></a>

##### resume

> `readonly` **resume**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`WaitNotOpen`](./Errors.md#waitnotopen) \| [`ResponseConflict`](./Errors.md#responseconflict)\>

###### Parameters

###### input

`CommandIdentity` & `object`

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal) \| [`WaitNotOpen`](./Errors.md#waitnotopen) \| [`ResponseConflict`](./Errors.md#responseconflict)\>

<a id="retryexecution"></a>

##### retryExecution

> `readonly` **retryExecution**: (`input`) => `Effect`\<`ExecutionRecord`, `WorkerMutationError`\>

###### Parameters

###### input

`CommandIdentity` & `ExecutionClaim`

###### Returns

`Effect`\<`ExecutionRecord`, `WorkerMutationError`\>

<a id="retryrecovery"></a>

##### retryRecovery

> `readonly` **retryRecovery**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`IllegalOperatorAction`](./Errors.md#illegaloperatoraction)\>

###### Parameters

###### input

`CommandIdentity` & [`OperatorActionInput`](./Recovery.md#operatoractioninput)

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`IllegalOperatorAction`](./Errors.md#illegaloperatoraction)\>

<a id="rewind"></a>

##### rewind

> `readonly` **rewind**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`ForkSequenceInvalid`](./Errors.md#forksequenceinvalid) \| [`NoSnapshot`](./Errors.md#nosnapshot) \| [`Invalid`](../../generalist/namespaces/RunBudget.md#invalid)\>

###### Parameters

###### input

`RewindRunInput`

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`Exhausted`](../../generalist/namespaces/RunBudget.md#exhausted) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`ForkSequenceInvalid`](./Errors.md#forksequenceinvalid) \| [`NoSnapshot`](./Errors.md#nosnapshot) \| [`Invalid`](../../generalist/namespaces/RunBudget.md#invalid)\>

<a id="saveexecution"></a>

##### saveExecution

> `readonly` **saveExecution**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`StaleClaim`](./Errors.md#staleclaim) \| `StaleSessionClaim`\>

###### Parameters

###### input

`CommandIdentity` & `ExecutionClaim` & `object`

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`StaleClaim`](./Errors.md#staleclaim) \| `StaleSessionClaim`\>

<a id="sessionreader"></a>

##### sessionReader

> `readonly` **sessionReader**: (`sessionId`) => `Effect`\<`Option`\<`SessionReader`\>, [`DurabilityFailure`](../../durability.md#durabilityfailure)\>

Read-only durable conversation history for one Session identity.

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<`Option`\<`SessionReader`\>, [`DurabilityFailure`](../../durability.md#durabilityfailure)\>

<a id="sessionroots"></a>

##### sessionRoots

> `readonly` **sessionRoots**: (`sessionId`) => `Effect`\<readonly `string`[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<readonly `string`[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable)\>

<a id="settlementnotifications"></a>

##### settlementNotifications

> `readonly` **settlementNotifications**: (`input`) => `Effect`\<readonly `object`[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

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

`Effect`\<readonly `object`[], [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="settleprogramoperation"></a>

##### settleProgramOperation

> `readonly` **settleProgramOperation**: (`input`) => `Effect`\<\{ `authoredOperation`: `string`; `capability`: `string`; `childRunIds`: readonly `string`[]; `completedSequence?`: `number`; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"running"` \| `"waiting"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

###### Parameters

###### input

`SettleProgramOperationInput`

###### Returns

`Effect`\<\{ `authoredOperation`: `string`; `capability`: `string`; `childRunIds`: readonly `string`[]; `completedSequence?`: `number`; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"running"` \| `"waiting"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

<a id="signal"></a>

##### signal

> `readonly` **signal**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal)\>

###### Parameters

###### input

`CommandIdentity` & [`SignalInput`](./Runtime.md#signalinput)

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal)\>

<a id="snapshot"></a>

##### snapshot

> `readonly` **snapshot**: (`runId`) => `Effect`\<[`RunSnapshot`](./Run.md#runsnapshot), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RunSnapshot`](./Run.md#runsnapshot), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="startoperation"></a>

##### startOperation

> `readonly` **startOperation**: (`input`) => `Effect`\<`OperationRecord`, `WorkerMutationError`\>

###### Parameters

###### input

`CommandIdentity` & `ExecutionClaim` & `object`

###### Returns

`Effect`\<`OperationRecord`, `WorkerMutationError`\>

<a id="startprogramoperation"></a>

##### startProgramOperation

> `readonly` **startProgramOperation**: (`input`) => `Effect`\<\{ `authoredOperation`: `string`; `capability`: `string`; `childRunIds`: readonly `string`[]; `completedSequence?`: `number`; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"running"` \| `"waiting"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<\{ `authoredOperation`: `string`; `capability`: `string`; `childRunIds`: readonly `string`[]; `completedSequence?`: `number`; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"running"` \| `"waiting"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError`\>

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

> `readonly` **suspendProgramOperation**: (`input`) => `Effect`\<\{ `authoredOperation`: `string`; `capability`: `string`; `childRunIds`: readonly `string`[]; `completedSequence?`: `number`; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"running"` \| `"waiting"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

###### Parameters

###### input

`SuspendProgramOperationInput`

###### Returns

`Effect`\<\{ `authoredOperation`: `string`; `capability`: `string`; `childRunIds`: readonly `string`[]; `completedSequence?`: `number`; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"succeeded"` \| `"failed"` \| `"running"` \| `"waiting"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

<a id="timeoutawaitevent"></a>

##### timeoutAwaitEvent

> `readonly` **timeoutAwaitEvent**: (`input`) => `Effect`\<`boolean`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal)\>

###### Parameters

###### input

`CommandIdentity` & `object`

###### Returns

`Effect`\<`boolean`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal)\>

<a id="treechanges"></a>

##### treeChanges

> `readonly` **treeChanges**: (`rootRunId`) => `Stream`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

###### Parameters

###### rootRunId

`string`

###### Returns

`Stream`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="treecheckpoint"></a>

##### treeCheckpoint

> `readonly` **treeCheckpoint**: (`rootRunId`) => `Effect`\<[`Checkpoint`](./RunTree.md#checkpoint), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

###### Parameters

###### rootRunId

`string`

###### Returns

`Effect`\<[`Checkpoint`](./RunTree.md#checkpoint), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound)\>

<a id="treereplay"></a>

##### treeReplay

> `readonly` **treeReplay**: (`input`) => `Effect`\<[`ReplayPage`](./RunTree.md#replaypage), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`TreeCursorExpired`](./Errors.md#treecursorexpired) \| [`TreeCursorFuture`](./Errors.md#treecursorfuture) \| [`TreeReplayLimitInvalid`](./Errors.md#treereplaylimitinvalid)\>

###### Parameters

###### input

###### limit

`number`

###### position

`number`

###### rootRunId

`string`

###### Returns

`Effect`\<[`ReplayPage`](./RunTree.md#replaypage), [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`TreeCursorExpired`](./Errors.md#treecursorexpired) \| [`TreeCursorFuture`](./Errors.md#treecursorfuture) \| [`TreeReplayLimitInvalid`](./Errors.md#treereplaylimitinvalid)\>

<a id="updatesessioninput"></a>

##### updateSessionInput

> `readonly` **updateSessionInput**: (`input`, `resolveSelection?`) => `Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`UnknownAgent`](./Errors.md#unknownagent) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`SessionQueueConflict`](./SessionQueue.md#sessionqueueconflict)\>

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

`Effect`\<\{ `id`: `string`; `revision`: `number`; \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`UnknownAgent`](./Errors.md#unknownagent) \| [`SessionNotFound`](../../host.md#sessionnotfound) \| [`SessionQueueConflict`](./SessionQueue.md#sessionqueueconflict)\>

<a id="wake"></a>

##### wake

> `readonly` **wake**: (`input`) => `Effect`\<\{ `waitId`: `string`; \} \| \{ \} \| \{ \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal)\>

###### Parameters

###### input

`CommandIdentity` & `object`

###### Returns

`Effect`\<\{ `waitId`: `string`; \} \| \{ \} \| \{ \}, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`RunTerminal`](./Errors.md#runterminal)\>

<a id="wakerecovery"></a>

##### wakeRecovery

> `readonly` **wakeRecovery**: (`input`) => `Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`IllegalOperatorAction`](./Errors.md#illegaloperatoraction)\>

###### Parameters

###### input

`CommandIdentity` & [`OperatorActionInput`](./Recovery.md#operatoractioninput)

###### Returns

`Effect`\<`void`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable) \| [`RunNotFound`](./Errors.md#runnotfound) \| [`IllegalOperatorAction`](./Errors.md#illegaloperatoraction)\>

***

<a id="storeinfo"></a>

### StoreInfo

#### Properties

<a id="backend"></a>

##### backend

> `readonly` **backend**: `"object"`

<a id="durability"></a>

##### durability

> `readonly` **durability**: `"durable"`

<a id="multiworker"></a>

##### multiWorker

> `readonly` **multiWorker**: `true`

## Type Aliases

<a id="completionoutcome"></a>

### CompletionOutcome

> **CompletionOutcome** = \{ `_tag`: `"Completed"`; \} \| \{ `_tag`: `"SteeringPending"`; `continuation`: [`ExecutionContinuation`](./Steering.md#executioncontinuation); \}

***

<a id="durability-1"></a>

### Durability

> **Durability** = `"durable"`

## References

<a id="executioncontinuation"></a>

### ExecutionContinuation

Re-exports [ExecutionContinuation](./Steering.md#executioncontinuation-1)

***

<a id="layerrunstore"></a>

### layerRunStore

Re-exports [layerRunStore](../../durability.md#layerrunstore)

***

<a id="steeringentry"></a>

### SteeringEntry

Re-exports [SteeringEntry](./Steering.md#steeringentry-1)

***

<a id="steeringreceipt"></a>

### SteeringReceipt

Re-exports [SteeringReceipt](./Steering.md#steeringreceipt-1)
