[**generalist**](./index.md)

***

[generalist](./index.md) / testing.runtime-driver

# testing.runtime-driver

## Interfaces

<a id="approvalsuspendcapability"></a>

### ApprovalSuspendCapability

Durable approval suspension and recovery capability.

#### Properties

<a id="claim"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="atomiccommitcapability"></a>

### AtomicCommitCapability

Atomic journal publication conformance capability.

#### Properties

<a id="claim-1"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

<a id="failnextcommit"></a>

##### failNextCommit

> `readonly` **failNextCommit**: (`services`) => `Effect`\<`void`\>

###### Parameters

###### services

[`Services`](#services)

###### Returns

`Effect`\<`void`\>

<a id="pausenextcommit"></a>

##### pauseNextCommit

> `readonly` **pauseNextCommit**: (`services`) => `Effect`\<\{ `entered`: `Effect`\<`void`\>; `release`: `Effect`\<`void`\>; \}\>

###### Parameters

###### services

[`Services`](#services)

###### Returns

`Effect`\<\{ `entered`: `Effect`\<`void`\>; `release`: `Effect`\<`void`\>; \}\>

***

<a id="awaiteventcapability"></a>

### AwaitEventCapability

Durable environmental wait conformance, including reopen where the driver persists.

#### Properties

<a id="claim-2"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

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

<a id="artifacts"></a>

##### artifacts?

> `readonly` `optional` **artifacts?**: `true`

<a id="atomiccommits"></a>

##### atomicCommits?

> `readonly` `optional` **atomicCommits?**: [`AtomicCommitCapability`](#atomiccommitcapability)

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

<a id="start-by-agent"></a>

##### start-by-agent?

> `readonly` `optional` **start-by-agent?**: [`StartByAgentCapability`](#startbyagentcapability)

<a id="steering"></a>

##### steering?

> `readonly` `optional` **steering?**: [`SteeringCapability`](#steeringcapability)

<a id="tool-runs"></a>

##### tool-runs?

> `readonly` `optional` **tool-runs?**: [`ToolRunsCapability`](#toolrunscapability)

<a id="unknown-agent-on-recovery"></a>

##### unknown-agent-on-recovery?

> `readonly` `optional` **unknown-agent-on-recovery?**: [`UnknownAgentOnRecoveryCapability`](#unknownagentonrecoverycapability)

***

<a id="childrunscapability"></a>

### ChildRunsCapability

Durable Agent fan-out recovery and journal-budget conformance capability.

#### Properties

<a id="claim-3"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="forkrewindcapability"></a>

### ForkRewindCapability

Journal-prefix fork and retained rewind branch capability.

#### Properties

<a id="claim-4"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="hostsessionscapability"></a>

### HostSessionsCapability

Product-facing Session persistence and replay capability.

#### Properties

<a id="claim-5"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="idempotentstartcapability"></a>

### IdempotentStartCapability

Typed Agent idempotent-start capability exercised with one storage-issued execution claim.

#### Properties

<a id="claim-6"></a>

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

<a id="claim-7"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

<a id="install"></a>

##### install

> `readonly` **install**: (`services`, `boundary`) => `Effect`\<`void`\>

###### Parameters

###### services

[`Services`](#services)

###### boundary

`"before-publication"` \| `"after-publication-lost-ack"` \| `"before-publication-unreadable"` \| `"after-publication-unreadable"`

###### Returns

`Effect`\<`void`\>

<a id="layer"></a>

##### layer

> `readonly` **layer**: `Layer`\<[`Runtime`](./runtime/namespaces/Runtime.md#runtime) \| [`RunStore`](./runtime/namespaces/RunStore.md#runstore), `LayerError`, `never`\>

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="readlayer"></a>

##### readLayer

> `readonly` **readLayer**: `Layer`\<[`Runtime`](./runtime/namespaces/Runtime.md#runtime) \| [`RunStore`](./runtime/namespaces/RunStore.md#runstore), `LayerError`, `never`\>

A genuinely fresh, read-only host over the same objects.

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

<a id="claim-8"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

<a id="layer-1"></a>

##### layer

> `readonly` **layer**: `Layer`\<[`Runtime`](./runtime/namespaces/Runtime.md#runtime) \| [`RunStore`](./runtime/namespaces/RunStore.md#runstore), `E`, `never`\>

***

<a id="notificationrecoverycapability"></a>

### NotificationRecoveryCapability

Durable notification recovery conformance capability.

#### Properties

<a id="claim-9"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="operatorresolveunknowncapability"></a>

### OperatorResolveUnknownCapability

Unknown-outcome operator resolution conformance capability.

#### Properties

<a id="claim-10"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="operatorretrycapability"></a>

### OperatorRetryCapability

Safe-operation operator retry conformance capability.

#### Properties

<a id="claim-11"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="operatorscancapability"></a>

### OperatorScanCapability

Store-wide operator obligation scan conformance capability.

#### Properties

<a id="claim-12"></a>

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

> `readonly` **layer**: `Layer`\<[`Runtime`](./runtime/namespaces/Runtime.md#runtime) \| [`RunStore`](./runtime/namespaces/RunStore.md#runstore), `LayerError`, `never`\>

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

<a id="claim-13"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="runtreecapability"></a>

### RunTreeCapability

RunTree finite replay conformance capability.

#### Properties

<a id="claim-14"></a>

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

***

<a id="services"></a>

### Services

Runtime services passed to driver-specific conformance operations.

#### Properties

<a id="executor"></a>

##### executor?

> `readonly` `optional` **executor?**: [`Service`](./runtime/namespaces/RunExecutor.md#service)

<a id="runtime-1"></a>

##### runtime

> `readonly` **runtime**: [`Service`](./runtime/namespaces/Runtime.md#service)

<a id="store"></a>

##### store

> `readonly` **store**: [`Service`](./runtime/namespaces/RunStore.md#service)

***

<a id="startbyagentcapability"></a>

### StartByAgentCapability

Typed Agent start capability exercised with one storage-issued execution claim.

#### Properties

<a id="claim-15"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="steeringcapability"></a>

### SteeringCapability

Inbox persistence and exactly-once delivery capability.

#### Properties

<a id="claim-16"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="toolrunscapability"></a>

### ToolRunsCapability

Independently scheduled Tool Run lifecycle and capacity conformance capability.

#### Properties

<a id="claim-17"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

***

<a id="unknownagentonrecoverycapability"></a>

### UnknownAgentOnRecoveryCapability

Missing-registration recovery capability exercised with one storage-issued execution claim.

#### Properties

<a id="claim-18"></a>

##### claim

> `readonly` **claim**: [`ClaimExecution`](#claimexecution)

## Type Aliases

<a id="artifactscapability"></a>

### ArtifactsCapability

> **ArtifactsCapability** = `true`

Shared Artifact head, operation-log, subscription, and branch capability.

***

<a id="claimexecution"></a>

### ClaimExecution

> **ClaimExecution** = (`services`, `input`) => `Effect.Effect`\<`ExecutionClaim`\>

Claim through the fixture's activated host using a stable logical action identity, not a fabricated worker.

#### Parameters

##### services

[`Services`](#services)

##### input

###### commandId

`string`

###### runId

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

> `const` **modelResponseFaultBoundaries**: readonly \[`"before-publication"`, `"after-publication-lost-ack"`, `"before-publication-unreadable"`, `"after-publication-unreadable"`\]

The atomic projection has one publication boundary, not independently durable statement stages.

***

<a id="modelresponsefaultconformance"></a>

### modelResponseFaultConformance

> `const` **modelResponseFaultConformance**: \<`LayerError`\>(`options`) => `void`

Retains Session, outcome, checkpoint, run-event and tree-index atomicity through real transport faults.

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
