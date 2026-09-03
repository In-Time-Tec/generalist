[**generalist**](./index)

***

[generalist](./index) / testing.runtime-driver

# testing.runtime-driver

## Interfaces

### ApprovalSuspendCapability

Durable approval suspension and recovery capability.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

##### recovery

> `readonly` **recovery**: `"rebuild"` \| `"reclaim"`

Persistent drivers rebuild their Runtime; process-memory drivers reclaim through a fresh owner.

***

### AwaitEventCapability

Durable environmental wait conformance, including reopen where the driver persists.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

##### recovery

> `readonly` **recovery**: `"rebuild"` \| `"reclaim"`

***

### Capabilities

Independently selectable Runtime driver conformance capabilities.

#### Type Parameters

##### ClaimsLayerError

`ClaimsLayerError` = `never`

#### Properties

##### admission?

> `readonly` `optional` **admission?**: `true`

##### approval-suspend?

> `readonly` `optional` **approval-suspend?**: [`ApprovalSuspendCapability`](#approvalsuspendcapability)

##### await-event?

> `readonly` `optional` **await-event?**: [`AwaitEventCapability`](#awaiteventcapability)

##### child-runs?

> `readonly` `optional` **child-runs?**: [`ChildRunsCapability`](#childrunscapability)

##### fork-rewind?

> `readonly` `optional` **fork-rewind?**: [`ForkRewindCapability`](#forkrewindcapability)

##### host-sessions?

> `readonly` `optional` **host-sessions?**: [`HostSessionsCapability`](#hostsessionscapability)

##### idempotent-start?

> `readonly` `optional` **idempotent-start?**: [`IdempotentStartCapability`](#idempotentstartcapability)

##### multiWorkerClaims?

> `readonly` `optional` **multiWorkerClaims?**: [`MultiWorkerClaimCapability`](#multiworkerclaimcapability)\<`ClaimsLayerError`\>

##### notificationRecovery?

> `readonly` `optional` **notificationRecovery?**: [`NotificationRecoveryCapability`](#notificationrecoverycapability)

##### operator-explain?

> `readonly` `optional` **operator-explain?**: `true`

##### operator-resolve-unknown?

> `readonly` `optional` **operator-resolve-unknown?**: [`OperatorResolveUnknownCapability`](#operatorresolveunknowncapability)

##### operator-retry?

> `readonly` `optional` **operator-retry?**: [`OperatorRetryCapability`](#operatorretrycapability)

##### operator-scan?

> `readonly` `optional` **operator-scan?**: [`OperatorScanCapability`](#operatorscancapability)

##### runtime?

> `readonly` `optional` **runtime?**: [`RuntimeCapability`](#runtimecapability)

##### runTree?

> `readonly` `optional` **runTree?**: [`RunTreeCapability`](#runtreecapability)

##### schedules?

> `readonly` `optional` **schedules?**: [`SchedulesCapability`](#schedulescapability)

##### sqlTransactions?

> `readonly` `optional` **sqlTransactions?**: [`SqlTransactionCapability`](#sqltransactioncapability)

##### start-by-agent?

> `readonly` `optional` **start-by-agent?**: [`StartByAgentCapability`](#startbyagentcapability)

##### steering?

> `readonly` `optional` **steering?**: [`SteeringCapability`](#steeringcapability)

##### unknown-agent-on-recovery?

> `readonly` `optional` **unknown-agent-on-recovery?**: [`UnknownAgentOnRecoveryCapability`](#unknownagentonrecoverycapability)

***

### ChildRunsCapability

Durable Agent fan-out recovery and journal-budget conformance capability.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

##### recovery

> `readonly` **recovery**: `"rebuild"` \| `"reclaim"`

Persistent drivers rebuild their Runtime; process-memory drivers reclaim through a fresh owner.

***

### ForkRewindCapability

Journal-prefix fork and retained rewind branch capability.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

### HostSessionsCapability

Product-facing Session persistence and replay capability.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

### IdempotentStartCapability

Typed Agent idempotent-start capability exercised with one storage-issued execution claim.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

### ModelResponseFaultOptions

#### Type Parameters

##### LayerError

`LayerError` = `never`

#### Properties

##### address

> `readonly` **address**: `string` & `Brand`\<`"Address"`\>

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

##### layer

> `readonly` **layer**: `Layer`\<[`Runtime`](./runtime/namespaces/Runtime#runtime) \| [`RunStore`](./runtime/namespaces/RunStore#runstore), `LayerError`, `never`\>

##### name

> `readonly` **name**: `string`

##### remove

> `readonly` **remove**: (`boundary`) => `Effect`\<`void`\>

###### Parameters

###### boundary

`"after-claim-validation"` \| `"after-session-entry"` \| `"after-session-leaf"` \| `"after-operation"` \| `"after-checkpoint"` \| `"after-event"` \| `"after-tree-position"` \| `"after-tree-index"` \| `"before-commit"`

###### Returns

`Effect`\<`void`\>

##### skip?

> `readonly` `optional` **skip?**: `boolean`

***

### MultiWorkerClaimCapability

Multi-worker claim and fencing conformance capability.

#### Type Parameters

##### E

`E` = `never`

#### Properties

##### expire

> `readonly` **expire**: (`claim`) => `Effect`\<`void`\>

###### Parameters

###### claim

[`WorkerClaim`](#workerclaim)

###### Returns

`Effect`\<`void`\>

##### layer

> `readonly` **layer**: `Layer`\<[`Runtime`](./runtime/namespaces/Runtime#runtime) \| [`RunClaims`](./runtime.sql-driver/index#runclaims) \| [`RunStore`](./runtime/namespaces/RunStore#runstore), `E`, `never`\>

***

### NotificationRecoveryCapability

Durable notification recovery conformance capability.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

### OperatorResolveUnknownCapability

Unknown-outcome operator resolution conformance capability.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

### OperatorRetryCapability

Safe-operation operator retry conformance capability.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

### OperatorScanCapability

Store-wide operator obligation scan conformance capability.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

### Options

Configuration for the authoritative Runtime driver conformance suites.

#### Type Parameters

##### LayerError

`LayerError` = `never`

##### ClaimsLayerError

`ClaimsLayerError` = `never`

#### Properties

##### address

> `readonly` **address**: `string` & `Brand`\<`"Address"`\>

##### capabilities

> `readonly` **capabilities**: [`Capabilities`](#capabilities)\<`ClaimsLayerError`\>

##### layer

> `readonly` **layer**: `Layer`\<[`Runtime`](./runtime/namespaces/Runtime#runtime) \| [`RunStore`](./runtime/namespaces/RunStore#runstore), `LayerError`, `never`\>

##### name

> `readonly` **name**: `string`

##### setup?

> `readonly` `optional` **setup?**: `Effect`\<`void`, `never`, `never`\>

##### skip?

> `readonly` `optional` **skip?**: `boolean`

***

### RuntimeCapability

Runtime control and durable-event conformance capability.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

### RunTreeCapability

RunTree finite replay conformance capability.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

### SchedulesCapability

Durable recurring admission and per-occurrence claim conformance.

#### Properties

##### definition

> `readonly` **definition**: `ScheduleDefinition`

##### recovery

> `readonly` **recovery**: `"rebuild"` \| `"reclaim"`

***

### Services

Runtime services passed to driver-specific conformance operations.

#### Properties

##### claims?

> `readonly` `optional` **claims?**: `Service`

##### executor?

> `readonly` `optional` **executor?**: [`Service`](./runtime/namespaces/RunExecutor#service)

##### runtime

> `readonly` **runtime**: [`Service`](./runtime/namespaces/Runtime#service)

##### store

> `readonly` **store**: [`Service`](./runtime/namespaces/RunStore#service)

***

### SqlTransactionCapability

SQL transaction conformance capability.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

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

### SqlTransactionFaultOptions

#### Type Parameters

##### LayerError

`LayerError` = `never`

#### Properties

##### layer

> `readonly` **layer**: `Layer`\<`SqlClient`, `LayerError`, `never`\>

##### name

> `readonly` **name**: `string`

##### skip?

> `readonly` `optional` **skip?**: `boolean`

***

### StartByAgentCapability

Typed Agent start capability exercised with one storage-issued execution claim.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

### SteeringCapability

Inbox persistence and exactly-once delivery capability.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

##### recovery

> `readonly` **recovery**: `"rebuild"` \| `"reclaim"`

Persistent drivers rebuild their Runtime; process-memory drivers retain one open store.

***

### UnknownAgentOnRecoveryCapability

Missing-registration recovery capability exercised with one storage-issued execution claim.

#### Properties

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

### WorkerClaim

A multi-worker claim without the driver's decoded persisted Run representation.

#### Properties

##### attemptFence

> `readonly` **attemptFence**: `number`

##### runId

> `readonly` **runId**: `string`

##### session

> `readonly` **session**: `SessionWriteClaim`

##### workerId

> `readonly` **workerId**: `string`

## Type Aliases

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

### ModelResponseFaultBoundary

> **ModelResponseFaultBoundary** = *typeof* [`modelResponseFaultBoundaries`](#modelresponsefaultboundaries)\[`number`\]

***

### OperatorExplainCapability

> **OperatorExplainCapability** = `true`

Read-only recovery projection conformance capability.

## Variables

### modelResponseFaultBoundaries

> `const` **modelResponseFaultBoundaries**: readonly \[`"after-claim-validation"`, `"after-session-entry"`, `"after-session-leaf"`, `"after-operation"`, `"after-checkpoint"`, `"after-event"`, `"after-tree-position"`, `"after-tree-index"`, `"before-commit"`\]

A failure point after each durable statement in the completed-model-response projection.

***

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
