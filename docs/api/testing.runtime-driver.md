[**generalist**](./index)

***

[generalist](./index) / testing.runtime-driver

# testing.runtime-driver

## Interfaces

<a id="approvalsuspendcapability"></a>

### ApprovalSuspendCapability

Durable approval suspension and recovery capability.

#### Properties

<a id="claim"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

<a id="recovery"></a>

##### recovery

> `readonly` **recovery**: `"rebuild"` \| `"reclaim"`

Persistent drivers rebuild their Runtime; process-memory drivers reclaim through a fresh owner.

***

<a id="awaiteventcapability"></a>

### AwaitEventCapability

Durable environmental wait conformance, including reopen where the driver persists.

#### Properties

<a id="claim-1"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

<a id="recovery-1"></a>

##### recovery

> `readonly` **recovery**: `"rebuild"` \| `"reclaim"`

***

<a id="capabilities"></a>

### Capabilities

Independently selectable Runtime driver conformance capabilities.

#### Type Parameters

##### ClaimsLayerError

`ClaimsLayerError` = `never`

#### Properties

<a id="admission"></a>

##### admission?

> `readonly` `optional` **admission?**: `true`

<a id="approval-suspend"></a>

##### approval-suspend?

> `readonly` `optional` **approval-suspend?**: [`ApprovalSuspendCapability`](#approvalsuspendcapability)

<a id="await-event"></a>

##### await-event?

> `readonly` `optional` **await-event?**: [`AwaitEventCapability`](#awaiteventcapability)

<a id="child-runs"></a>

##### child-runs?

> `readonly` `optional` **child-runs?**: [`ChildRunsCapability`](#childrunscapability)

<a id="fork-rewind"></a>

##### fork-rewind?

> `readonly` `optional` **fork-rewind?**: [`ForkRewindCapability`](#forkrewindcapability)

<a id="host-sessions"></a>

##### host-sessions?

> `readonly` `optional` **host-sessions?**: [`HostSessionsCapability`](#hostsessionscapability)

<a id="idempotent-start"></a>

##### idempotent-start?

> `readonly` `optional` **idempotent-start?**: [`IdempotentStartCapability`](#idempotentstartcapability)

<a id="multiworkerclaims"></a>

##### multiWorkerClaims?

> `readonly` `optional` **multiWorkerClaims?**: [`MultiWorkerClaimCapability`](#multiworkerclaimcapability)\<`ClaimsLayerError`\>

<a id="notificationrecovery"></a>

##### notificationRecovery?

> `readonly` `optional` **notificationRecovery?**: [`NotificationRecoveryCapability`](#notificationrecoverycapability)

<a id="operator-explain"></a>

##### operator-explain?

> `readonly` `optional` **operator-explain?**: `true`

<a id="operator-resolve-unknown"></a>

##### operator-resolve-unknown?

> `readonly` `optional` **operator-resolve-unknown?**: [`OperatorResolveUnknownCapability`](#operatorresolveunknowncapability)

<a id="operator-retry"></a>

##### operator-retry?

> `readonly` `optional` **operator-retry?**: [`OperatorRetryCapability`](#operatorretrycapability)

<a id="operator-scan"></a>

##### operator-scan?

> `readonly` `optional` **operator-scan?**: [`OperatorScanCapability`](#operatorscancapability)

<a id="runtime"></a>

##### runtime?

> `readonly` `optional` **runtime?**: [`RuntimeCapability`](#runtimecapability)

<a id="runtree"></a>

##### runTree?

> `readonly` `optional` **runTree?**: [`RunTreeCapability`](#runtreecapability)

<a id="schedules"></a>

##### schedules?

> `readonly` `optional` **schedules?**: [`SchedulesCapability`](#schedulescapability)

<a id="sqltransactions"></a>

##### sqlTransactions?

> `readonly` `optional` **sqlTransactions?**: [`SqlTransactionCapability`](#sqltransactioncapability)

<a id="start-by-agent"></a>

##### start-by-agent?

> `readonly` `optional` **start-by-agent?**: [`StartByAgentCapability`](#startbyagentcapability)

<a id="steering"></a>

##### steering?

> `readonly` `optional` **steering?**: [`SteeringCapability`](#steeringcapability)

<a id="unknown-agent-on-recovery"></a>

##### unknown-agent-on-recovery?

> `readonly` `optional` **unknown-agent-on-recovery?**: [`UnknownAgentOnRecoveryCapability`](#unknownagentonrecoverycapability)

***

<a id="childrunscapability"></a>

### ChildRunsCapability

Durable Agent fan-out recovery and journal-budget conformance capability.

#### Properties

<a id="claim-2"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

<a id="recovery-2"></a>

##### recovery

> `readonly` **recovery**: `"rebuild"` \| `"reclaim"`

Persistent drivers rebuild their Runtime; process-memory drivers reclaim through a fresh owner.

***

<a id="forkrewindcapability"></a>

### ForkRewindCapability

Journal-prefix fork and retained rewind branch capability.

#### Properties

<a id="claim-3"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="hostsessionscapability"></a>

### HostSessionsCapability

Product-facing Session persistence and replay capability.

#### Properties

<a id="claim-4"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="idempotentstartcapability"></a>

### IdempotentStartCapability

Typed Agent idempotent-start capability exercised with one storage-issued execution claim.

#### Properties

<a id="claim-5"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="modelresponsefaultoptions"></a>

### ModelResponseFaultOptions

#### Type Parameters

##### LayerError

`LayerError` = `never`

#### Properties

<a id="address"></a>

##### address

> `readonly` **address**: `string` & `Brand`\<`"Address"`\>

<a id="claim-6"></a>

##### claim

> `readonly` **claim**: (`input`) => `Effect`\<`ExecutionClaim`\>

###### Parameters

###### input

###### claims?

`Service`

###### runId

`string`

###### store

[`Service`](./runtime/namespaces/RunStore#service)

###### workerId

`string`

###### Returns

`Effect`\<`ExecutionClaim`\>

<a id="install"></a>

##### install

> `readonly` **install**: (`input`) => `Effect`\<`void`\>

###### Parameters

###### input

###### boundary

`"after-claim-validation"` \| `"after-session-entry"` \| `"after-session-leaf"` \| `"after-operation"` \| `"after-checkpoint"` \| `"after-event"` \| `"after-tree-position"` \| `"after-tree-index"` \| `"before-commit"`

###### runId

`string`

###### sessionId

`string`

###### Returns

`Effect`\<`void`\>

<a id="layer"></a>

##### layer

> `readonly` **layer**: `Layer`\<[`Runtime`](./runtime/namespaces/Runtime#runtime) \| [`RunStore`](./runtime/namespaces/RunStore#runstore), `LayerError`, `never`\>

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="remove"></a>

##### remove

> `readonly` **remove**: (`boundary`) => `Effect`\<`void`\>

###### Parameters

###### boundary

`"after-claim-validation"` \| `"after-session-entry"` \| `"after-session-leaf"` \| `"after-operation"` \| `"after-checkpoint"` \| `"after-event"` \| `"after-tree-position"` \| `"after-tree-index"` \| `"before-commit"`

###### Returns

`Effect`\<`void`\>

<a id="skip"></a>

##### skip?

> `readonly` `optional` **skip?**: `boolean`

***

<a id="multiworkerclaimcapability"></a>

### MultiWorkerClaimCapability

Multi-worker claim and fencing conformance capability.

#### Type Parameters

##### E

`E` = `never`

#### Properties

<a id="expire"></a>

##### expire

> `readonly` **expire**: (`claim`) => `Effect`\<`void`\>

###### Parameters

###### claim

[`WorkerClaim`](#workerclaim)

###### Returns

`Effect`\<`void`\>

<a id="layer-1"></a>

##### layer

> `readonly` **layer**: `Layer`\<[`Runtime`](./runtime/namespaces/Runtime#runtime) \| [`RunClaims`](./runtime.sql-driver/index#runclaims) \| [`RunStore`](./runtime/namespaces/RunStore#runstore), `E`, `never`\>

***

<a id="notificationrecoverycapability"></a>

### NotificationRecoveryCapability

Durable notification recovery conformance capability.

#### Properties

<a id="claim-7"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="operatorresolveunknowncapability"></a>

### OperatorResolveUnknownCapability

Unknown-outcome operator resolution conformance capability.

#### Properties

<a id="claim-8"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="operatorretrycapability"></a>

### OperatorRetryCapability

Safe-operation operator retry conformance capability.

#### Properties

<a id="claim-9"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="operatorscancapability"></a>

### OperatorScanCapability

Store-wide operator obligation scan conformance capability.

#### Properties

<a id="claim-10"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="options"></a>

### Options

Configuration for the authoritative Runtime driver conformance suites.

#### Type Parameters

##### LayerError

`LayerError` = `never`

##### ClaimsLayerError

`ClaimsLayerError` = `never`

#### Properties

<a id="address-1"></a>

##### address

> `readonly` **address**: `string` & `Brand`\<`"Address"`\>

<a id="capabilities-1"></a>

##### capabilities

> `readonly` **capabilities**: [`Capabilities`](#capabilities)\<`ClaimsLayerError`\>

<a id="layer-2"></a>

##### layer

> `readonly` **layer**: `Layer`\<[`Runtime`](./runtime/namespaces/Runtime#runtime) \| [`RunStore`](./runtime/namespaces/RunStore#runstore), `LayerError`, `never`\>

<a id="name-1"></a>

##### name

> `readonly` **name**: `string`

<a id="setup"></a>

##### setup?

> `readonly` `optional` **setup?**: `Effect`\<`void`, `never`, `never`\>

<a id="skip-1"></a>

##### skip?

> `readonly` `optional` **skip?**: `boolean`

***

<a id="runtimecapability"></a>

### RuntimeCapability

Runtime control and durable-event conformance capability.

#### Properties

<a id="claim-11"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="runtreecapability"></a>

### RunTreeCapability

RunTree finite replay conformance capability.

#### Properties

<a id="claim-12"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="schedulescapability"></a>

### SchedulesCapability

Durable recurring admission and per-occurrence claim conformance.

#### Properties

<a id="definition"></a>

##### definition

> `readonly` **definition**: `ScheduleDefinition`

<a id="recovery-3"></a>

##### recovery

> `readonly` **recovery**: `"rebuild"` \| `"reclaim"`

***

<a id="services"></a>

### Services

Runtime services passed to driver-specific conformance operations.

#### Properties

<a id="claims"></a>

##### claims?

> `readonly` `optional` **claims?**: `Service`

<a id="executor"></a>

##### executor?

> `readonly` `optional` **executor?**: [`Service`](./runtime/namespaces/RunExecutor#service)

<a id="runtime-1"></a>

##### runtime

> `readonly` **runtime**: [`Service`](./runtime/namespaces/Runtime#service)

<a id="store"></a>

##### store

> `readonly` **store**: [`Service`](./runtime/namespaces/RunStore#service)

***

<a id="sqltransactioncapability"></a>

### SqlTransactionCapability

SQL transaction conformance capability.

#### Properties

<a id="claim-13"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

<a id="forcerollback"></a>

##### forceRollback

> `readonly` **forceRollback**: \<`A`, `E`\>(`effect`) => `Effect`\<`A`, `E`\>

###### Type Parameters

###### A

`A`

###### E

`E`

###### Parameters

###### effect

`Effect`\<`A`, `E`\>

###### Returns

`Effect`\<`A`, `E`\>

***

<a id="sqltransactionfaultoptions"></a>

### SqlTransactionFaultOptions

#### Type Parameters

##### LayerError

`LayerError` = `never`

#### Properties

<a id="layer-3"></a>

##### layer

> `readonly` **layer**: `Layer`\<`SqlClient`, `LayerError`, `never`\>

<a id="name-2"></a>

##### name

> `readonly` **name**: `string`

<a id="skip-2"></a>

##### skip?

> `readonly` `optional` **skip?**: `boolean`

***

<a id="startbyagentcapability"></a>

### StartByAgentCapability

Typed Agent start capability exercised with one storage-issued execution claim.

#### Properties

<a id="claim-14"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="steeringcapability"></a>

### SteeringCapability

Inbox persistence and exactly-once delivery capability.

#### Properties

<a id="claim-15"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

<a id="recovery-4"></a>

##### recovery

> `readonly` **recovery**: `"rebuild"` \| `"reclaim"`

Persistent drivers rebuild their Runtime; process-memory drivers retain one open store.

***

<a id="unknownagentonrecoverycapability"></a>

### UnknownAgentOnRecoveryCapability

Missing-registration recovery capability exercised with one storage-issued execution claim.

#### Properties

<a id="claim-16"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="workerclaim"></a>

### WorkerClaim

A multi-worker claim without the driver's decoded persisted Run representation.

#### Properties

<a id="attemptfence"></a>

##### attemptFence

> `readonly` **attemptFence**: `number`

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

<a id="session"></a>

##### session

> `readonly` **session**: `SessionWriteClaim`

<a id="workerid"></a>

##### workerId

> `readonly` **workerId**: `string`

## Type Aliases

<a id="claimexecution"></a>

### ClaimExecution

> **ClaimExecution** = (`services`, `input`) => `Effect.Effect`\<`ExecutionClaim`\>

Driver-specific activation or worker claim needed before a fenced mutation.

#### Parameters

##### services

[`Services`](#services)

##### input

###### runId

`string`

###### workerId

`string`

#### Returns

`Effect.Effect`\<`ExecutionClaim`\>

***

<a id="modelresponsefaultboundary"></a>

### ModelResponseFaultBoundary

> **ModelResponseFaultBoundary** = *typeof* [`modelResponseFaultBoundaries`](#modelresponsefaultboundaries)\[`number`\]

***

<a id="operatorexplaincapability"></a>

### OperatorExplainCapability

> **OperatorExplainCapability** = `true`

Read-only recovery projection conformance capability.

## Variables

<a id="modelresponsefaultboundaries"></a>

### modelResponseFaultBoundaries

> `const` **modelResponseFaultBoundaries**: readonly \[`"after-claim-validation"`, `"after-session-entry"`, `"after-session-leaf"`, `"after-operation"`, `"after-checkpoint"`, `"after-event"`, `"after-tree-position"`, `"after-tree-index"`, `"before-commit"`\]

A failure point after each durable statement in the completed-model-response projection.

***

<a id="modelresponsefaultconformance"></a>

### modelResponseFaultConformance

> `const` **modelResponseFaultConformance**: \<`LayerError`\>(`options`) => `void`

Register one reusable atomic-projection fault matrix for a physical SQL driver.

#### Type Parameters

##### LayerError

`LayerError`

#### Parameters

##### options

[`ModelResponseFaultOptions`](#modelresponsefaultoptions)\<`LayerError`\>

#### Returns

`void`

***

<a id="runtimedriver"></a>

### runtimeDriver

> `const` **runtimeDriver**: \<`LayerError`, `ClaimsLayerError`\>(`options`) => `void`

Registers only the conformance suites selected by the supplied driver capabilities.

#### Type Parameters

##### LayerError

`LayerError`

##### ClaimsLayerError

`ClaimsLayerError`

#### Parameters

##### options

[`Options`](#options)\<`LayerError`, `ClaimsLayerError`\>

#### Returns

`void`

***

<a id="sqltransactionfaultconformance"></a>

### sqlTransactionFaultConformance

> `const` **sqlTransactionFaultConformance**: \<`LayerError`\>(`options`) => `void`

Register interruption and lock-wait rollback tests for a server SQL transaction strategy.

#### Type Parameters

##### LayerError

`LayerError`

#### Parameters

##### options

[`SqlTransactionFaultOptions`](#sqltransactionfaultoptions)\<`LayerError`\>

#### Returns

`void`
