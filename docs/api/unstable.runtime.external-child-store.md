[**generalist**](./index)

***

[generalist](./index) / unstable.runtime.external-child-store

# unstable.runtime.external-child-store

## Classes

### ExternalChildStore

Atomic cross-partition child placement capability.

#### Extends

- `ExternalChildStore_base`

#### Constructors

##### Constructor

> **new ExternalChildStore**(`_`): [`ExternalChildStore`](#externalchildstore)

###### Parameters

###### \_

`never`

###### Returns

[`ExternalChildStore`](#externalchildstore)

###### Inherited from

`ExternalChildStore_base.constructor`

## Interfaces

### Service

Cross-partition child placement operations supported by single-partition stores.

#### Properties

##### acknowledge

> `readonly` **acknowledge**: (`placementId`) => `Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalChildPlacementNotFound`](./unstable.runtime.external-child-placement#externalchildplacementnotfound)\>

###### Parameters

###### placementId

`string`

###### Returns

`Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalChildPlacementNotFound`](./unstable.runtime.external-child-placement#externalchildplacementnotfound)\>

##### acknowledgeRootSettlement

> `readonly` **acknowledgeRootSettlement**: (`input`) => `Effect`\<\{ `acknowledged`: `boolean`; `outcome`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `settlementId`: `string`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalChildSettlementConflict`](./unstable.runtime.external-child-placement#externalchildsettlementconflict) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement#externalrootnotfound)\>

Acknowledge exactly the terminal identity received by the parent.

###### Parameters

###### input

###### placementId

`string`

###### settlementId

`string`

###### Returns

`Effect`\<\{ `acknowledged`: `boolean`; `outcome`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `settlementId`: `string`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalChildSettlementConflict`](./unstable.runtime.external-child-placement#externalchildsettlementconflict) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement#externalrootnotfound)\>

##### activateRoot

> `readonly` **activateRoot**: (`placementId`) => `Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement#externalrootnotfound)\>

Release one admitted root's durable execution gate. Exact retries are no-ops.

###### Parameters

###### placementId

`string`

###### Returns

`Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement#externalrootnotfound)\>

##### admitRoot

> `readonly` **admitRoot**: (`input`) => `Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`StartError`](./runtime/namespaces/Runtime#starterror) \| [`ExternalRootConflict`](./unstable.runtime.external-child-placement#externalrootconflict) \| [`ExternalRootExecutableMismatch`](./unstable.runtime.external-child-placement#externalrootexecutablemismatch)\>

Admit an independently executable depth-zero root, initially fenced from execution.

###### Parameters

###### input

###### executableDigest

`string`

###### parent

\{ `partition`: `string`; `runId`: `string`; \}

###### parent.partition

`string`

###### parent.runId

`string`

###### placementId

`string`

###### ref

\{ `partition`: `string`; `runId`: `string`; \}

###### ref.partition

`string`

###### ref.runId

`string`

###### requestDigest

`string`

###### root

`Omit`\<[`AdmitStartInput`](./runtime/namespaces/RunStore#admitstartinput), `"runId"` \| `"initialChildren"` \| `"initialFanOuts"`\>

###### Returns

`Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`StartError`](./runtime/namespaces/Runtime#starterror) \| [`ExternalRootConflict`](./unstable.runtime.external-child-placement#externalrootconflict) \| [`ExternalRootExecutableMismatch`](./unstable.runtime.external-child-placement#externalrootexecutablemismatch)\>

##### cancel

> `readonly` **cancel**: (`placementId`) => `Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalChildPlacementNotFound`](./unstable.runtime.external-child-placement#externalchildplacementnotfound)\>

###### Parameters

###### placementId

`string`

###### Returns

`Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalChildPlacementNotFound`](./unstable.runtime.external-child-placement#externalchildplacementnotfound)\>

##### cancelRoot

> `readonly` **cancelRoot**: (`placementId`, `reason?`) => `Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement#externalrootnotfound)\>

Request authoritative cancellation on the child partition, including before activation.

###### Parameters

###### placementId

`string`

###### reason?

`string`

###### Returns

`Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement#externalrootnotfound)\>

##### inspectRoot

> `readonly` **inspectRoot**: (`placementId`) => `Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement#externalrootnotfound)\>

###### Parameters

###### placementId

`string`

###### Returns

`Effect`\<\{ `activated`: `boolean`; `admissionDigest`: `string`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parent`: \{ `partition`: `string`; `runId`: `string`; \}; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `sessionId`: `string`; `settlementAcknowledged`: `boolean`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement#externalrootnotfound)\>

##### reserve

> `readonly` **reserve**: (`input`) => `Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`RunNotFound`](./runtime/namespaces/Errors#runnotfound) \| [`ExternalChildCapacityUnavailable`](./unstable.runtime.external-child-placement#externalchildcapacityunavailable) \| [`ExternalChildPlacementConflict`](./unstable.runtime.external-child-placement#externalchildplacementconflict) \| [`RunTerminal`](./runtime/namespaces/Errors#runterminal) \| [`StaleClaim`](./runtime/namespaces/Errors#staleclaim) \| `StaleSessionClaim`\>

###### Parameters

###### input

###### attemptFence

`number`

###### executableDigest

`string`

###### invocationId

`string`

###### ownerId

`string`

###### parentSuspension?

\{ `checkpoint?`: \{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<...\> \| `string` & `Brand`\<...\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \} \| \{ `version`: `"1"`; \}; `continuation?`: \{ `nextTurn`: `number`; `prompt`: `Prompt`; `queue?`: `"steering"` \| `"followUp"`; `schemaVersion`: `1`; `steeringEntryIds`: readonly `string`[]; \} \| `null`; `suspension`: [`ExecutionSuspension`](./runtime/namespaces/ExecutionState#executionsuspension); `wait`: \{ `closedAt?`: `string`; `openedAt`: `string`; `reason`: \{ \} \| \{ `request`: \{ `approvalId`: `string`; `capability`: `string`; `input`: `unknown`; `operation`: `string`; \}; \} \| \{ `name`: `string`; \} \| \{ `dueAt?`: `string`; \} \| \{ `capability?`: `string`; \} \| \{ `deadline`: `string`; `filter`: \{ `scheduleId?`: `string`; \} \| \{ `source?`: `string`; \} \| \{ `childRunId?`: `string`; \} \| \{ `kind?`: `"create"` \| `"remove"` \| `"update"`; `path?`: `string`; \} \| \{ `approvalId?`: `string`; \}; \}; `resolution?`: \{ \} \| \{ `reason?`: `string`; \} \| \{ `encodedResult`: `unknown`; `result`: `unknown`; \} \| \{ `name`: `string`; `payload?`: `unknown`; \}; `status`: `"cancelled"` \| `"open"` \| `"responded"` \| `"signaled"`; `waitId`: `string`; \}; \}

###### parentSuspension.checkpoint?

\{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<...\> \| `string` & `Brand`\<...\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \} \| \{ `version`: `"1"`; \}

###### parentSuspension.continuation?

\{ `nextTurn`: `number`; `prompt`: `Prompt`; `queue?`: `"steering"` \| `"followUp"`; `schemaVersion`: `1`; `steeringEntryIds`: readonly `string`[]; \} \| `null`

###### parentSuspension.suspension

[`ExecutionSuspension`](./runtime/namespaces/ExecutionState#executionsuspension)

###### parentSuspension.wait

\{ `closedAt?`: `string`; `openedAt`: `string`; `reason`: \{ \} \| \{ `request`: \{ `approvalId`: `string`; `capability`: `string`; `input`: `unknown`; `operation`: `string`; \}; \} \| \{ `name`: `string`; \} \| \{ `dueAt?`: `string`; \} \| \{ `capability?`: `string`; \} \| \{ `deadline`: `string`; `filter`: \{ `scheduleId?`: `string`; \} \| \{ `source?`: `string`; \} \| \{ `childRunId?`: `string`; \} \| \{ `kind?`: `"create"` \| `"remove"` \| `"update"`; `path?`: `string`; \} \| \{ `approvalId?`: `string`; \}; \}; `resolution?`: \{ \} \| \{ `reason?`: `string`; \} \| \{ `encodedResult`: `unknown`; `result`: `unknown`; \} \| \{ `name`: `string`; `payload?`: `unknown`; \}; `status`: `"cancelled"` \| `"open"` \| `"responded"` \| `"signaled"`; `waitId`: `string`; \}

###### parentSuspension.wait.closedAt?

`string`

###### parentSuspension.wait.openedAt

`string`

###### parentSuspension.wait.reason

\{ \} \| \{ `request`: \{ `approvalId`: `string`; `capability`: `string`; `input`: `unknown`; `operation`: `string`; \}; \} \| \{ `name`: `string`; \} \| \{ `dueAt?`: `string`; \} \| \{ `capability?`: `string`; \} \| \{ `deadline`: `string`; `filter`: \{ `scheduleId?`: `string`; \} \| \{ `source?`: `string`; \} \| \{ `childRunId?`: `string`; \} \| \{ `kind?`: `"create"` \| `"remove"` \| `"update"`; `path?`: `string`; \} \| \{ `approvalId?`: `string`; \}; \}

###### parentSuspension.wait.resolution?

\{ \} \| \{ `reason?`: `string`; \} \| \{ `encodedResult`: `unknown`; `result`: `unknown`; \} \| \{ `name`: `string`; `payload?`: `unknown`; \}

###### parentSuspension.wait.status

`"cancelled"` \| `"open"` \| `"responded"` \| `"signaled"`

###### parentSuspension.wait.waitId

`string`

###### placementId

`string`

###### ref

\{ `partition`: `string`; `runId`: `string`; \}

###### ref.partition

`string`

###### ref.runId

`string`

###### requestDigest

`string`

###### runId

`string`

###### session

\{ `epoch`: `string`; `ownerId`: `string`; `runAttemptFence`: `number`; `runId`: `string`; `sessionId`: `string`; \}

###### session.epoch

`string`

###### session.ownerId

`string`

###### session.runAttemptFence

`number`

###### session.runId

`string`

###### session.sessionId

`string`

###### Returns

`Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`RunNotFound`](./runtime/namespaces/Errors#runnotfound) \| [`ExternalChildCapacityUnavailable`](./unstable.runtime.external-child-placement#externalchildcapacityunavailable) \| [`ExternalChildPlacementConflict`](./unstable.runtime.external-child-placement#externalchildplacementconflict) \| [`RunTerminal`](./runtime/namespaces/Errors#runterminal) \| [`StaleClaim`](./runtime/namespaces/Errors#staleclaim) \| `StaleSessionClaim`\>

##### rootSettlement

> `readonly` **rootSettlement**: (`placementId`) => `Effect`\<`Option`\<\{ `acknowledged`: `boolean`; `outcome`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `settlementId`: `string`; \}\>, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement#externalrootnotfound)\>

Read the stable terminal delivery. None means the root is not terminal yet.

###### Parameters

###### placementId

`string`

###### Returns

`Effect`\<`Option`\<\{ `acknowledged`: `boolean`; `outcome`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `settlementId`: `string`; \}\>, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalRootNotFound`](./unstable.runtime.external-child-placement#externalrootnotfound)\>

##### settle

> `readonly` **settle**: (`input`) => `Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalChildPlacementNotFound`](./unstable.runtime.external-child-placement#externalchildplacementnotfound) \| [`ExternalChildSettlementConflict`](./unstable.runtime.external-child-placement#externalchildsettlementconflict)\>

###### Parameters

###### input

###### outcome

[`RunOutcome`](./runtime/namespaces/Run#runoutcome)

###### placementId

`string`

###### settlementId

`string`

###### Returns

`Effect`\<\{ `acknowledged`: `boolean`; `cancelRequested`: `boolean`; `executableDigest`: `string`; `invocationId`: `string`; `outcome?`: [`RunOutcome`](./runtime/namespaces/Run#runoutcome); `parentRunId`: `string`; `placementId`: `string`; `ref`: \{ `partition`: `string`; `runId`: `string`; \}; `requestDigest`: `string`; `settled`: `boolean`; `settlementId?`: `string`; `suspensionIdentity?`: `string`; `waitId?`: `string`; \}, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`ExternalChildPlacementNotFound`](./unstable.runtime.external-child-placement#externalchildplacementnotfound) \| [`ExternalChildSettlementConflict`](./unstable.runtime.external-child-placement#externalchildsettlementconflict)\>
