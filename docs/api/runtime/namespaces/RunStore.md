[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / RunStore

# RunStore

## Classes

### RunStore

RunStore public contract and process-local memory layer.

#### Extends

- `RunStore_base`

#### Constructors

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

### AdmitSendInput

#### Extended by

- [`AdmitStartInput`](#admitstartinput)

#### Properties

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

##### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

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

##### registrations

> `readonly` **registrations**: readonly `object`[]

##### runId?

> `readonly` `optional` **runId?**: `string`

##### treePolicy?

> `readonly` `optional` **treePolicy?**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

***

### AdmitStartInput

#### Extends

- [`AdmitSendInput`](#admitsendinput)

#### Properties

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

##### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

###### Inherited from

[`AdmitSendInput`](#admitsendinput).[`executableManifest`](#executablemanifest)

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

[`AdmitSendInput`](#admitsendinput).[`executableRef`](#executableref)

##### initialChildren

> `readonly` **initialChildren**: readonly `Omit`\<[`InitialChildInput`](./Runtime#initialchildinput), `"prompt"`\> & `object`[]

##### initialFanOuts

> `readonly` **initialFanOuts**: readonly `Omit`\<`InitialFanOutInput`, `"members"`\> & `object`[]

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

##### registrations

> `readonly` **registrations**: readonly `object`[]

###### Inherited from

[`AdmitSendInput`](#admitsendinput).[`registrations`](#registrations)

##### runId?

> `readonly` `optional` **runId?**: `string`

###### Inherited from

[`AdmitSendInput`](#admitsendinput).[`runId`](#runid)

##### treePolicy?

> `readonly` `optional` **treePolicy?**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

###### Inherited from

[`AdmitSendInput`](#admitsendinput).[`treePolicy`](#treepolicy)

***

### AdmitSteeringInput

#### Properties

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

##### digest

> `readonly` **digest**: `string`

##### from

> `readonly` **from**: \{ `runId`: `string`; \} \| \{ `user`: `string`; \} \| \{ `system`: `true`; \}

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

##### policy

> `readonly` **policy**: `"enqueue"` \| `"interrupt"` \| `"reject"` \| `"rollback"` \| `"steer"`

##### prompt

> `readonly` **prompt**: `Prompt`

##### runId

> `readonly` **runId**: `string`

***

### RecordOperationInput

#### Extends

- `ExecutionClaim`

#### Properties

##### attempt

> `readonly` **attempt**: `number`

##### attemptFence

> `readonly` **attemptFence**: `number`

###### Inherited from

`ExecutionClaim.attemptFence`

##### checkpoint?

> `readonly` `optional` **checkpoint?**: \{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \} \| \{ `version`: `"1"`; \}

##### continuation?

> `readonly` `optional` **continuation?**: \{ `nextTurn`: `number`; `prompt`: `Prompt`; `queue?`: `"steering"` \| `"followUp"`; `schemaVersion`: `1`; `steeringEntryIds`: readonly `string`[]; \} \| `null`

##### input

> `readonly` **input**: `unknown`

##### inputDigest

> `readonly` **inputDigest**: `string`

##### kind

> `readonly` **kind**: `"compaction"` \| `"send"` \| `"model"` \| `"structured-output"` \| `"tool"` \| `"operator"` \| `"memory"` \| `"wait"` \| `"log"` \| `"handoff"` \| `"nested"`

##### operationKey

> `readonly` **operationKey**: `string`

##### ownerId

> `readonly` **ownerId**: `string`

###### Inherited from

`ExecutionClaim.ownerId`

##### replayPolicy

> `readonly` **replayPolicy**: `"pure"` \| `"provider-idempotent"` \| `"never"`

##### runId

> `readonly` **runId**: `string`

###### Overrides

`ExecutionClaim.runId`

##### session

> `readonly` **session**: `SessionWriteClaim`

###### Inherited from

`ExecutionClaim.session`

##### steeringEntryIds?

> `readonly` `optional` **steeringEntryIds?**: readonly `string`[]

##### steeringEvents?

> `readonly` `optional` **steeringEvents?**: readonly `DurableAgentLoopEvent`[]

***

### Service

#### Properties

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

##### acknowledged

> `readonly` **acknowledged**: (`runId`) => `Effect`\<\{ `acknowledgedAt?`: `string`; `runId`: `string`; `sequence`: `number`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

Read the durable host processed-through point; -1 means no cycle is acknowledged.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `acknowledgedAt?`: `string`; `runId`: `string`; `sequence`: `number`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

##### acknowledgeOperationCancellation

> `readonly` **acknowledgeOperationCancellation**: (`input`) => `Effect`\<`OperationRecord`, `WorkerMutationError`\>

Persist one definitive semantic cancellation acknowledgement under the current claim.

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<`OperationRecord`, `WorkerMutationError`\>

##### activate

> `readonly` **activate**: (`input`) => `Effect`\<[`RunInspection`](./Run#runinspection), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### input

###### runId

`string`

###### Returns

`Effect`\<[`RunInspection`](./Run#runinspection), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

##### admitFanOut

> `readonly` **admitFanOut**: (`input`) => `Effect`\<\{ `childRunIds`: readonly `string`[]; `duplicate`: `boolean`; `fanOutId`: `string`; `parentRunId`: `string`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`FanOutConflict`](./Errors#fanoutconflict) \| [`FanOutInvalid`](./Errors#fanoutinvalid) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal)\>

###### Parameters

###### input

`AdmitFanOutInput`

###### Returns

`Effect`\<\{ `childRunIds`: readonly `string`[]; `duplicate`: `boolean`; `fanOutId`: `string`; `parentRunId`: `string`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`FanOutConflict`](./Errors#fanoutconflict) \| [`FanOutInvalid`](./Errors#fanoutinvalid) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal)\>

##### admitProgramAgents

> `readonly` **admitProgramAgents**: (`input`) => `Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`FanOutConflict`](./Errors#fanoutconflict) \| [`FanOutInvalid`](./Errors#fanoutinvalid) \| `WorkerMutationError` \| `ProgramStoreFailure`\>

###### Parameters

###### input

`AdmitProgramAgentsInput`

###### Returns

`Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`FanOutConflict`](./Errors#fanoutconflict) \| [`FanOutInvalid`](./Errors#fanoutinvalid) \| `WorkerMutationError` \| `ProgramStoreFailure`\>

##### admitProgramChild

> `readonly` **admitProgramChild**: (`input`) => `Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal) \| [`StaleClaim`](./Errors#staleclaim) \| `StaleSessionClaim`\>

###### Parameters

###### input

`AdmitProgramChildInput`

###### Returns

`Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal) \| [`StaleClaim`](./Errors#staleclaim) \| `StaleSessionClaim`\>

##### admitProgramChildAndSuspend

> `readonly` **admitProgramChildAndSuspend**: (`input`) => `Effect`\<readonly [`RunReceipt`](./Run#runreceipt)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal) \| [`StaleClaim`](./Errors#staleclaim) \| `StaleSessionClaim`\>

###### Parameters

###### input

`AdmitProgramChildAndSuspendInput`

###### Returns

`Effect`\<readonly [`RunReceipt`](./Run#runreceipt)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal) \| [`StaleClaim`](./Errors#staleclaim) \| `StaleSessionClaim`\>

##### admitRollback

> `readonly` **admitRollback**: (`input`) => `Effect`\<`SteeringAdmission`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot) \| [`RunTerminal`](./Errors#runterminal) \| [`InboxFull`](../../generalist/namespaces/Steering#inboxfull) \| [`RunBusy`](./Errors#runbusy) \| [`SteeringConflict`](./Errors#steeringconflict)\>

###### Parameters

###### input

`AdmitRollbackInput`

###### Returns

`Effect`\<`SteeringAdmission`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot) \| [`RunTerminal`](./Errors#runterminal) \| [`InboxFull`](../../generalist/namespaces/Steering#inboxfull) \| [`RunBusy`](./Errors#runbusy) \| [`SteeringConflict`](./Errors#steeringconflict)\>

##### admitSend

> `readonly` **admitSend**: (`input`) => `Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`ExecutableRegistrationConflict`](./Errors#executableregistrationconflict) \| [`TreePolicyInvalid`](./Errors#treepolicyinvalid) \| [`AddressNotFound`](./Errors#addressnotfound)\>

###### Parameters

###### input

[`AdmitSendInput`](#admitsendinput)

###### Returns

`Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`ExecutableRegistrationConflict`](./Errors#executableregistrationconflict) \| [`TreePolicyInvalid`](./Errors#treepolicyinvalid) \| [`AddressNotFound`](./Errors#addressnotfound)\>

##### admitSpawn

> `readonly` **admitSpawn**: (`input`) => `Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal)\>

###### Parameters

###### input

[`SpawnInput`](./Runtime#spawninput) & `object`

###### Returns

`Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`RunTerminal`](./Errors#runterminal)\>

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

##### admitSteering

> `readonly` **admitSteering**: (`input`) => `Effect`\<`SteeringAdmission`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`InboxFull`](../../generalist/namespaces/Steering#inboxfull) \| [`RunBusy`](./Errors#runbusy) \| [`SteeringConflict`](./Errors#steeringconflict)\>

###### Parameters

###### input

[`AdmitSteeringInput`](#admitsteeringinput)

###### Returns

`Effect`\<`SteeringAdmission`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`InboxFull`](../../generalist/namespaces/Steering#inboxfull) \| [`RunBusy`](./Errors#runbusy) \| [`SteeringConflict`](./Errors#steeringconflict)\>

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

##### cancel

> `readonly` **cancel**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### input

[`CancelInput`](./Runtime#cancelinput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

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

##### claimedSessionStore

> `readonly` **claimedSessionStore**: (`claim`) => `Effect`\<`Option`\<[`SessionStore`](../../generalist/namespaces/Session#sessionstore)\>\>

Session writer bound to one storage-issued execution claim.

###### Parameters

###### claim

`ExecutionClaim`

###### Returns

`Effect`\<`Option`\<[`SessionStore`](../../generalist/namespaces/Session#sessionstore)\>\>

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

##### commitInterruptedModelResponse

> `readonly` **commitInterruptedModelResponse**: (`input`) => `Effect`\<`OperationRecord`, `WorkerMutationError`\>

###### Parameters

###### input

`CommitInterruptedModelResponseInput`

###### Returns

`Effect`\<`OperationRecord`, `WorkerMutationError`\>

##### commitModelResponse

> `readonly` **commitModelResponse**: (`input`) => `Effect`\<`OperationRecord`, `WorkerMutationError`\>

###### Parameters

###### input

`CommitModelResponseInput`

###### Returns

`Effect`\<`OperationRecord`, `WorkerMutationError`\>

##### commitProgramLog

> `readonly` **commitProgramLog**: (`input`) => `Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

###### Parameters

###### input

`CommitProgramLogInput`

###### Returns

`Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

##### complete

> `readonly` **complete**: (`input`) => `Effect`\<[`CompletionOutcome`](#completionoutcome), `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<[`CompletionOutcome`](#completionoutcome), `WorkerMutationError`\>

##### completeOperation

> `readonly` **completeOperation**: (`input`) => `Effect`\<`OperationRecord`, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<`OperationRecord`, `WorkerMutationError`\>

##### completeProgram

> `readonly` **completeProgram**: (`input`) => `Effect`\<[`CompletionOutcome`](#completionoutcome), [`ProgramBudgetExhausted`](../../generalist/namespaces/ProgramCapabilities#programbudgetexhausted) \| `WorkerMutationError`\>

###### Parameters

###### input

`CompleteProgramInput`

###### Returns

`Effect`\<[`CompletionOutcome`](#completionoutcome), [`ProgramBudgetExhausted`](../../generalist/namespaces/ProgramCapabilities#programbudgetexhausted) \| `WorkerMutationError`\>

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

##### emitAgentEvent

> `readonly` **emitAgentEvent**: (`input`) => `Effect`\<`void`, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<`void`, `WorkerMutationError`\>

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

##### expireRunningOperation

> `readonly` **expireRunningOperation**: (`input`) => `Effect`\<\{ `outcome`: `"unknown"` \| `"running"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"requested"` \| `"retried"`; `record`: `OperationRecord`; \}, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<\{ `outcome`: `"unknown"` \| `"running"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"requested"` \| `"retried"`; `record`: `OperationRecord`; \}, `WorkerMutationError`\>

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

##### fail

> `readonly` **fail**: (`input`) => `Effect`\<`void`, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<`void`, `WorkerMutationError`\>

##### fork

> `readonly` **fork**: (`input`) => `Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot) \| [`SubstitutionInvalid`](./Errors#substitutioninvalid)\>

###### Parameters

###### input

`ForkRunInput`

###### Returns

`Effect`\<[`RunReceipt`](./Run#runreceipt), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot) \| [`SubstitutionInvalid`](./Errors#substitutioninvalid)\>

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

##### hostSession

> `readonly` **hostSession**: (`sessionId`) => `Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`SessionNotFound`](../../host#sessionnotfound)\>

Read one product-facing Session by identity.

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<\{ `createdAt`: `string`; `id`: `string`; `title?`: `string`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`SessionNotFound`](../../host#sessionnotfound)\>

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

##### hostSessionRuns

> `readonly` **hostSessionRuns**: (`sessionId`) => `Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`SessionNotFound`](../../host#sessionnotfound)\>

List root Runs admitted through one product-facing Session.

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<readonly [`RunInspection`](./Run#runinspection)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`SessionNotFound`](../../host#sessionnotfound)\>

##### info

> `readonly` **info**: `Effect`\<[`StoreInfo`](#storeinfo)\>

##### inspect

> `readonly` **inspect**: (`runId`) => `Effect`\<[`RunInspection`](./Run#runinspection), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RunInspection`](./Run#runinspection), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

##### inspectFanOut

> `readonly` **inspectFanOut**: (`fanOutId`) => `Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"abandon"` \| `"request-cancel"` \| `"terminate"`; `status`: `"running"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`FanOutNotFound`](./Errors#fanoutnotfound)\>

###### Parameters

###### fanOutId

`string`

###### Returns

`Effect`\<\{ `concurrency`: `number`; `fanOutId`: `string`; `idempotencyKey`: `string`; `join`: \{ \} \| \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \}; `members`: readonly `object`[]; `parentRunId`: `string`; `remainder`: `"await"` \| `"abandon"` \| `"request-cancel"` \| `"terminate"`; `status`: `"running"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`FanOutNotFound`](./Errors#fanoutnotfound)\>

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

##### listHostSessions

> `readonly` **listHostSessions**: `Effect`\<readonly `object`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

List product-facing Sessions in creation order.

##### listRelated

> `readonly` **listRelated**: (`runId`) => `Effect`\<readonly [`DirectoryEntry`](./AgentDirectory#directoryentry)[], `DirectoryLookupError`\>

Parent, direct children, and siblings under one parent, from durable links only.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<readonly [`DirectoryEntry`](./AgentDirectory#directoryentry)[], `DirectoryLookupError`\>

##### loadExecution

> `readonly` **loadExecution**: (`runId`) => `Effect`\<`ExecutionRecord`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`ExecutionRecord`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

##### loadProgramState

> `readonly` **loadProgramState**: (`runId`) => `Effect`\<\{ `activeSlots`: `number`; `agentRuns`: `number`; `budget`: \{ `agentRuns`: `number`; `concurrency`: `number`; `logBytes`: `number`; `outputBytes`: `number`; `tokens`: `number`; `toolCalls`: `number`; `wallClockMillis`: `number`; \}; `deadlineMillis`: `number`; `logBytes`: `number`; `programPin`: `string`; `runId`: `string`; `tokens`: `number`; `toolCalls`: `number`; \} \| `undefined`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<\{ `activeSlots`: `number`; `agentRuns`: `number`; `budget`: \{ `agentRuns`: `number`; `concurrency`: `number`; `logBytes`: `number`; `outputBytes`: `number`; `tokens`: `number`; `toolCalls`: `number`; `wallClockMillis`: `number`; \}; `deadlineMillis`: `number`; `logBytes`: `number`; `programPin`: `string`; `runId`: `string`; `tokens`: `number`; `toolCalls`: `number`; \} \| `undefined`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

##### operationCancellations

> `readonly` **operationCancellations**: (`input`) => `Effect`\<readonly `OperationRecord`[], `WorkerMutationError`\>

Cancellable tool operations awaiting a definitive concrete-executor acknowledgement.

###### Parameters

###### input

`ExecutionClaim`

###### Returns

`Effect`\<readonly `OperationRecord`[], `WorkerMutationError`\>

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

##### readSteering

> `readonly` **readSteering**: (`input`) => `Effect`\<readonly `object`[], `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim`

###### Returns

`Effect`\<readonly `object`[], `WorkerMutationError`\>

##### recordOperation

> `readonly` **recordOperation**: (`input`) => `Effect`\<`OperationRecord`, `WorkerMutationError`\>

###### Parameters

###### input

[`RecordOperationInput`](#recordoperationinput)

###### Returns

`Effect`\<`OperationRecord`, `WorkerMutationError`\>

##### recordReward

> `readonly` **recordReward**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### input

[`RewardInput`](./RunEvent#rewardinput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

##### recoverRunningOperations

> `readonly` **recoverRunningOperations**: (`input`) => `Effect`\<`"ready"` \| `"blocked"`, `WorkerMutationError`\>

Reconcile operations left running by the prior owner before execution resumes.

###### Parameters

###### input

`ExecutionClaim`

###### Returns

`Effect`\<`"ready"` \| `"blocked"`, `WorkerMutationError`\>

##### recoveryJournal

> `readonly` **recoveryJournal**: (`runId`) => `Effect`\<[`Journal`](./Recovery#journal), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

Read the normalized durable facts from which operator recovery is derived.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`Journal`](./Recovery#journal), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

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

##### registerSchedule

> `readonly` **registerSchedule**: (`record`) => `Effect`\<\{ `nextAt`: `string`; `scheduleId`: `string`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### record

`ScheduleRecord`

###### Returns

`Effect`\<\{ `nextAt`: `string`; `scheduleId`: `string`; \}, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

##### releaseExecution

> `readonly` **releaseExecution**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### input

`ExecutionClaim`

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

##### reserveProgramOperation

> `readonly` **reserveProgramOperation**: (`input`) => `Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

###### Parameters

###### input

`ReserveProgramOperationInput`

###### Returns

`Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

##### resolveAddress

> `readonly` **resolveAddress**: (`address`) => `Effect`\<[`DirectoryEntry`](./AgentDirectory#directoryentry), `ResolveAddressError`\>

###### Parameters

###### address

`string` & `Brand`\<`"Address"`\>

###### Returns

`Effect`\<[`DirectoryEntry`](./AgentDirectory#directoryentry), `ResolveAddressError`\>

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

##### resolveUnknown

> `readonly` **resolveUnknown**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)\>

###### Parameters

###### input

[`ResolveUnknownInput`](./Recovery#resolveunknowninput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)\>

##### respond

> `readonly` **respond**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`WaitNotOpen`](./Errors#waitnotopen) \| [`ResponseConflict`](./Errors#responseconflict)\>

###### Parameters

###### input

[`RespondInput`](./Runtime#respondinput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`WaitNotOpen`](./Errors#waitnotopen) \| [`ResponseConflict`](./Errors#responseconflict)\>

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

##### retryExecution

> `readonly` **retryExecution**: (`input`) => `Effect`\<`ExecutionRecord`, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim`

###### Returns

`Effect`\<`ExecutionRecord`, `WorkerMutationError`\>

##### retryRecovery

> `readonly` **retryRecovery**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)\>

###### Parameters

###### input

[`RetryInput`](./Recovery#retryinput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)\>

##### rewind

> `readonly` **rewind**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot)\>

###### Parameters

###### input

`RewindRunInput`

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`ForkSequenceInvalid`](./Errors#forksequenceinvalid) \| [`NoSnapshot`](./Errors#nosnapshot)\>

##### saveExecution

> `readonly` **saveExecution**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`StaleClaim`](./Errors#staleclaim) \| `StaleSessionClaim`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`StaleClaim`](./Errors#staleclaim) \| `StaleSessionClaim`\>

##### sessionReader

> `readonly` **sessionReader**: (`sessionId`) => `Effect`\<`Option`\<`SessionReader`\>\>

Read-only durable conversation history for one Session identity.

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<`Option`\<`SessionReader`\>\>

##### sessionRoots

> `readonly` **sessionRoots**: (`sessionId`) => `Effect`\<readonly `string`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<readonly `string`[], [`RuntimeUnavailable`](./Errors#runtimeunavailable)\>

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

##### settleProgramOperation

> `readonly` **settleProgramOperation**: (`input`) => `Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

###### Parameters

###### input

`SettleProgramOperationInput`

###### Returns

`Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

##### signal

> `readonly` **signal**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal)\>

###### Parameters

###### input

[`SignalInput`](./Runtime#signalinput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal)\>

##### snapshot

> `readonly` **snapshot**: (`runId`) => `Effect`\<[`RunSnapshot`](./Run#runsnapshot), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`RunSnapshot`](./Run#runsnapshot), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

##### startOperation

> `readonly` **startOperation**: (`input`) => `Effect`\<`OperationRecord`, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<`OperationRecord`, `WorkerMutationError`\>

##### startProgramOperation

> `readonly` **startProgramOperation**: (`input`) => `Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError`\>

##### suspend

> `readonly` **suspend**: (`input`) => `Effect`\<`void`, `WorkerMutationError`\>

###### Parameters

###### input

`ExecutionClaim` & `object`

###### Returns

`Effect`\<`void`, `WorkerMutationError`\>

##### suspendProgramOperation

> `readonly` **suspendProgramOperation**: (`input`) => `Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

###### Parameters

###### input

`SuspendProgramOperationInput`

###### Returns

`Effect`\<\{ `capability`: `string`; `childRunIds`: readonly `string`[]; `error?`: `unknown`; `fanOutId?`: `string`; `input`: `unknown`; `inputDigest`: `string`; `kind`: `"agent"` \| `"tool"` \| `"step"` \| `"log"` \| `"agent-map"` \| `"agent-fan-out"`; `operation`: `string`; `replay`: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`; `resolution?`: \{ \} \| \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \}; `resolutionIdempotencyKey?`: `string`; `result?`: `unknown`; `runId`: `string`; `status`: `"unknown"` \| `"running"` \| `"waiting"` \| `"succeeded"` \| `"failed"` \| `"reserved"`; `waitId?`: `string`; \}, `WorkerMutationError` \| `ProgramStoreFailure`\>

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

##### treeChanges

> `readonly` **treeChanges**: (`rootRunId`) => `Stream`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### rootRunId

`string`

###### Returns

`Stream`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

##### treeCheckpoint

> `readonly` **treeCheckpoint**: (`rootRunId`) => `Effect`\<[`Checkpoint`](./RunTree#checkpoint), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### rootRunId

`string`

###### Returns

`Effect`\<[`Checkpoint`](./RunTree#checkpoint), [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

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

##### wakeRecovery

> `readonly` **wakeRecovery**: (`input`) => `Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)\>

###### Parameters

###### input

[`OperatorActionInput`](./Recovery#operatoractioninput)

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound) \| [`IllegalOperatorAction`](./Errors#illegaloperatoraction)\>

***

### StoreInfo

#### Properties

##### backend

> `readonly` **backend**: [`StoreBackend`](#storebackend)

##### durability

> `readonly` **durability**: [`Durability`](#durability-1)

##### multiWorker

> `readonly` **multiWorker**: `boolean`

## Type Aliases

### CompletionOutcome

> **CompletionOutcome** = \{ `_tag`: `"Completed"`; \} \| \{ `_tag`: `"SteeringPending"`; `continuation`: [`ExecutionContinuation`](./Steering#executioncontinuation); \}

***

### Durability

> **Durability** = `"ephemeral"` \| `"durable"`

***

### StoreBackend

> **StoreBackend** = `"memory"` \| `"sqlite"` \| `"postgres"` \| `"mysql"`

## Variables

### layerMemory

> `const` **layerMemory**: (`options`) => `Layer.Layer`\<[`RunStore`](#runstore) \| [`ExternalChildStore`](../../unstable.runtime.external-child-store#externalchildstore)\>

#### Parameters

##### options

[`LayerOptions`](./Runtime#layeroptions)

#### Returns

`Layer.Layer`\<[`RunStore`](#runstore) \| [`ExternalChildStore`](../../unstable.runtime.external-child-store#externalchildstore)\>

## References

### ExecutionContinuation

Re-exports [ExecutionContinuation](./Steering#executioncontinuation-1)

***

### SteeringEntry

Re-exports [SteeringEntry](./Steering#steeringentry-1)

***

### SteeringReceipt

Re-exports [SteeringReceipt](./Steering#steeringreceipt-1)
