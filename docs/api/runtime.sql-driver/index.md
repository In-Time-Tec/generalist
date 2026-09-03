[**generalist**](../index)

***

[generalist](../index) / runtime.sql-driver

# runtime.sql-driver

## Namespaces

- [RuntimeWorker](./namespaces/RuntimeWorker)
- [SqliteRunActivation](./namespaces/SqliteRunActivation)

## Classes

### RunClaims

#### Extends

- `RunClaims_base`

#### Constructors

##### Constructor

> **new RunClaims**(`_`): [`RunClaims`](#runclaims)

###### Parameters

###### \_

`never`

###### Returns

[`RunClaims`](#runclaims)

###### Inherited from

`RunClaims_base.constructor`

***

### SchemaChecksumMismatch

#### Extends

- `SchemaChecksumMismatch_base`

#### Constructors

##### Constructor

> **new SchemaChecksumMismatch**(...`args`): [`SchemaChecksumMismatch`](#schemachecksummismatch)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SchemaChecksumMismatch`](#schemachecksummismatch)

###### Inherited from

`SchemaChecksumMismatch_base.constructor`

#### Properties

##### actual

> `readonly` **actual**: `string`

###### Inherited from

`SchemaChecksumMismatch_base.actual`

##### expected

> `readonly` **expected**: `string`

###### Inherited from

`SchemaChecksumMismatch_base.expected`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SchemaChecksumMismatch_base.hint`

##### source

> `readonly` **source**: `string`

###### Inherited from

`SchemaChecksumMismatch_base.source`

***

### SchemaDirty

#### Extends

- `SchemaDirty_base`

#### Constructors

##### Constructor

> **new SchemaDirty**(...`args`): [`SchemaDirty`](#schemadirty)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SchemaDirty`](#schemadirty)

###### Inherited from

`SchemaDirty_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SchemaDirty_base.hint`

##### source

> `readonly` **source**: `string`

###### Inherited from

`SchemaDirty_base.source`

##### version

> `readonly` **version**: `number`

###### Inherited from

`SchemaDirty_base.version`

***

### SchemaMigrationFailed

#### Extends

- `SchemaMigrationFailed_base`

#### Constructors

##### Constructor

> **new SchemaMigrationFailed**(...`args`): [`SchemaMigrationFailed`](#schemamigrationfailed)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SchemaMigrationFailed`](#schemamigrationfailed)

###### Inherited from

`SchemaMigrationFailed_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SchemaMigrationFailed_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`SchemaMigrationFailed_base.message`

##### source

> `readonly` **source**: `string`

###### Inherited from

`SchemaMigrationFailed_base.source`

***

### SchemaUpgradeRequired

#### Extends

- `SchemaUpgradeRequired_base`

#### Constructors

##### Constructor

> **new SchemaUpgradeRequired**(...`args`): [`SchemaUpgradeRequired`](#schemaupgraderequired)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SchemaUpgradeRequired`](#schemaupgraderequired)

###### Inherited from

`SchemaUpgradeRequired_base.constructor`

#### Properties

##### current

> `readonly` **current**: `number`

###### Inherited from

`SchemaUpgradeRequired_base.current`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SchemaUpgradeRequired_base.hint`

##### required

> `readonly` **required**: `number`

###### Inherited from

`SchemaUpgradeRequired_base.required`

##### source

> `readonly` **source**: `string`

###### Inherited from

`SchemaUpgradeRequired_base.source`

***

### SchemaVersionUnsupported

#### Extends

- `SchemaVersionUnsupported_base`

#### Constructors

##### Constructor

> **new SchemaVersionUnsupported**(...`args`): [`SchemaVersionUnsupported`](#schemaversionunsupported)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SchemaVersionUnsupported`](#schemaversionunsupported)

###### Inherited from

`SchemaVersionUnsupported_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SchemaVersionUnsupported_base.hint`

##### source

> `readonly` **source**: `string`

###### Inherited from

`SchemaVersionUnsupported_base.source`

##### supported

> `readonly` **supported**: `number`

###### Inherited from

`SchemaVersionUnsupported_base.supported`

##### version

> `readonly` **version**: `number`

###### Inherited from

`SchemaVersionUnsupported_base.version`

## Interfaces

### ClaimedRun

#### Properties

##### attemptFence

> `readonly` **attemptFence**: `number`

##### leaseExpiresAt

> `readonly` **leaseExpiresAt**: `Date`

##### run

> `readonly` **run**: [`DecodedRun`](#decodedrun)

##### session

> `readonly` **session**: `SessionWriteClaim`

##### workerId

> `readonly` **workerId**: `string`

***

### DecodedRun

#### Properties

##### acceptedSequence

> `readonly` **acceptedSequence**: `number`

##### address

> `readonly` **address**: `string`

##### admittedAt

> `readonly` **admittedAt**: `string`

##### attempt

> `readonly` **attempt**: `number`

##### attemptFence

> `readonly` **attemptFence**: `number`

##### attemptFenceEpoch?

> `readonly` `optional` **attemptFenceEpoch?**: `number`

##### cancellationRequested

> `readonly` **cancellationRequested**: `boolean`

##### cancelReason?

> `readonly` `optional` **cancelReason?**: `string`

##### continuation?

> `readonly` `optional` **continuation?**: `object`

###### nextTurn

> `readonly` **nextTurn**: `number`

###### prompt

> `readonly` **prompt**: `Prompt`

###### queue?

> `readonly` `optional` **queue?**: `"steering"` \| `"followUp"`

###### schemaVersion

> `readonly` **schemaVersion**: `1`

###### steeringEntryIds

> `readonly` **steeringEntryIds**: readonly `string`[]

##### depth

> `readonly` **depth**: `number`

##### driverCheckpoint?

> `readonly` `optional` **driverCheckpoint?**: \{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \} \| \{ `version`: `"1"`; \}

##### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifest`](../generalist/namespaces/ExecutableManifest#executablemanifest)

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

##### forkedFrom?

> `readonly` `optional` **forkedFrom?**: `string`

##### forkSequence?

> `readonly` `optional` **forkSequence?**: `number`

##### invocationId?

> `readonly` `optional` **invocationId?**: `string`

##### lastSequence

> `readonly` **lastSequence**: `number`

##### lastTurnCompletedSequence

> `readonly` **lastTurnCompletedSequence**: `number`

##### leaseExpiresAt?

> `readonly` `optional` **leaseExpiresAt?**: `string`

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

##### messageDigest

> `readonly` **messageDigest**: `string`

##### ownerWorkerId?

> `readonly` `optional` **ownerWorkerId?**: `string`

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

##### pendingOutcome?

> `readonly` `optional` **pendingOutcome?**: \{ `result`: \{ `output?`: `unknown`; `session`: \{ `leafId`: `string` \| `null`; `sessionId`: `string`; \}; `text`: `string`; `turns`: `number`; \} \| \{ `value`: `unknown`; \}; \} \| \{ `error`: [`RunFailure`](../runtime/namespaces/Run#runfailure); \}

##### rootRunId

> `readonly` **rootRunId**: `string`

##### runId

> `readonly` **runId**: `string`

##### sessionId

> `readonly` **sessionId**: `string`

##### status

> `readonly` **status**: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`

##### suspension?

> `readonly` `optional` **suspension?**: [`ExecutionSuspension`](../runtime/namespaces/ExecutionState#executionsuspension)

##### terminalEventId?

> `readonly` `optional` **terminalEventId?**: `string`

##### treePolicy

> `readonly` **treePolicy**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

***

### EventHub

#### Properties

##### catchUp

> `readonly` **catchUp**: \<`E`, `R`\>(`input`) => `Effect`\<`number`, `E`, `R`\>

**`Internal`**

Load and publish authoritative events after a lossy notification or polling wakeup.

###### Type Parameters

###### E

`E`

###### R

`R`

###### Parameters

###### input

###### cursor

`number`

###### loadAfter

`Effect`\<readonly [`RunEvent`](../runtime/namespaces/RunEvent#runevent)[], `E`, `R`\>

###### runId

`string`

###### Returns

`Effect`\<`number`, `E`, `R`\>

##### catchUpHostSession

> `readonly` **catchUpHostSession**: \<`E`, `R`\>(`input`) => `Effect`\<`number`, `E`, `R`\>

**`Internal`**

Load and publish authoritative Session events after a lossy wakeup.

###### Type Parameters

###### E

`E`

###### R

`R`

###### Parameters

###### input

###### cursor

`number`

###### loadAfter

`Effect`\<readonly [`HostSessionEvent`](../runtime/namespaces/HostSession#hostsessionevent)[], `E`, `R`\>

###### sessionId

`string`

###### Returns

`Effect`\<`number`, `E`, `R`\>

##### publish

> `readonly` **publish**: (`runId`, `event`) => `Effect`\<`void`\>

###### Parameters

###### runId

`string`

###### event

[`RunEvent`](../runtime/namespaces/RunEvent#runevent)

###### Returns

`Effect`\<`void`\>

##### publishHostSession

> `readonly` **publishHostSession**: (`sessionId`, `entry`) => `Effect`\<`void`\>

###### Parameters

###### sessionId

`string`

###### entry

[`HostSessionEvent`](../runtime/namespaces/HostSession#hostsessionevent)

###### Returns

`Effect`\<`void`\>

##### shutdown

> `readonly` **shutdown**: `Effect`\<`void`\>

##### subscribe

> `readonly` **subscribe**: (`input`) => `Stream`\<[`RunEvent`](../runtime/namespaces/RunEvent#runevent), [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| [`RunNotFound`](../runtime/namespaces/Errors#runnotfound) \| [`CursorExpired`](../runtime/namespaces/Errors#cursorexpired) \| [`SubscriberLagged`](../runtime/namespaces/Errors#subscriberlagged)\>

###### Parameters

###### input

###### capacity

`number`

###### cursor

`number`

###### loadReplay

`Effect`\<\{ `lastSequence`: `number`; `replay`: readonly [`RunEvent`](../runtime/namespaces/RunEvent#runevent)[]; \}, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| [`RunNotFound`](../runtime/namespaces/Errors#runnotfound)\>

###### onSubscribed?

`Effect`\<`void`, `never`, `Scope`\>

###### runId

`string`

###### Returns

`Stream`\<[`RunEvent`](../runtime/namespaces/RunEvent#runevent), [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| [`RunNotFound`](../runtime/namespaces/Errors#runnotfound) \| [`CursorExpired`](../runtime/namespaces/Errors#cursorexpired) \| [`SubscriberLagged`](../runtime/namespaces/Errors#subscriberlagged)\>

##### subscribeHostSession

> `readonly` **subscribeHostSession**: (`input`) => `Stream`\<[`HostSessionEvent`](../runtime/namespaces/HostSession#hostsessionevent), [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| [`SessionNotFound`](../host#sessionnotfound) \| [`SessionCursorExpired`](../host#sessioncursorexpired) \| [`SessionSubscriberLagged`](../host#sessionsubscriberlagged)\>

###### Parameters

###### input

###### capacity

`number`

###### cursor

`number`

###### loadReplay

`Effect`\<\{ `lastCursor`: `number`; `replay`: readonly [`HostSessionEvent`](../runtime/namespaces/HostSession#hostsessionevent)[]; \}, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| [`SessionNotFound`](../host#sessionnotfound)\>

###### onSubscribed?

`Effect`\<`void`, `never`, `Scope`\>

###### sessionId

`string`

###### Returns

`Stream`\<[`HostSessionEvent`](../runtime/namespaces/HostSession#hostsessionevent), [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| [`SessionNotFound`](../host#sessionnotfound) \| [`SessionCursorExpired`](../host#sessioncursorexpired) \| [`SessionSubscriberLagged`](../host#sessionsubscriberlagged)\>

##### subscribeTree

> `readonly` **subscribeTree**: (`input`) => `Stream`\<`void`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

###### Parameters

###### input

###### onSubscribed?

`Effect`\<`void`, `never`, `Scope`\>

###### rootRunId

`string`

###### Returns

`Stream`\<`void`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

##### touchRun

> `readonly` **touchRun**: (`runId`) => `Effect`\<`void`\>

**`Internal`**

Mark a Run whose activation state changed without publishing an event on that Run.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`void`\>

##### wakeTree

> `readonly` **wakeTree**: (`rootRunId`) => `Effect`\<`void`\>

###### Parameters

###### rootRunId

`string`

###### Returns

`Effect`\<`void`\>

***

### RunActivationProjection

Transaction-local projection of final Run activation state.

#### Properties

##### applyInTransaction

> `readonly` **applyInTransaction**: (`changes`) => `Effect`\<`void`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

###### Parameters

###### changes

readonly [`RunActivation`](#runactivation)[]

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

***

### RunRow

#### Properties

##### accepted\_sequence

> `readonly` **accepted\_sequence**: `string` \| `number` \| `bigint`

##### address

> `readonly` **address**: `string`

##### attempt

> `readonly` **attempt**: `number`

##### attempt\_fence

> `readonly` **attempt\_fence**: `number`

##### cancel\_reason

> `readonly` **cancel\_reason**: `string` \| `null`

##### cancellation\_requested

> `readonly` **cancellation\_requested**: `string` \| `number` \| `boolean`

##### continuation\_json

> `readonly` **continuation\_json**: `string` \| `null`

##### created\_at

> `readonly` **created\_at**: `string` \| `Date`

##### depth

> `readonly` **depth**: `number`

##### driver\_checkpoint\_json

> `readonly` **driver\_checkpoint\_json**: `string` \| `null`

##### executable\_manifest\_json

> `readonly` **executable\_manifest\_json**: `string`

##### executable\_ref\_json

> `readonly` **executable\_ref\_json**: `string`

##### fork\_sequence

> `readonly` **fork\_sequence**: `number` \| `null`

##### forked\_from

> `readonly` **forked\_from**: `string` \| `null`

##### idempotency\_key

> `readonly` **idempotency\_key**: `string`

##### invocation\_id

> `readonly` **invocation\_id**: `string` \| `null`

##### last\_sequence

> `readonly` **last\_sequence**: `number`

##### last\_turn\_completed\_sequence

> `readonly` **last\_turn\_completed\_sequence**: `number`

##### lease\_expires\_at?

> `readonly` `optional` **lease\_expires\_at?**: `string` \| `Date` \| `null`

##### max\_depth

> `readonly` **max\_depth**: `number`

##### max\_subagents

> `readonly` **max\_subagents**: `number`

##### message\_digest

> `readonly` **message\_digest**: `string`

##### message\_id

> `readonly` **message\_id**: `string`

##### message\_json

> `readonly` **message\_json**: `string`

##### owner\_worker\_id?

> `readonly` `optional` **owner\_worker\_id?**: `string` \| `null`

##### parent\_run\_id

> `readonly` **parent\_run\_id**: `string` \| `null`

##### pending\_outcome\_json

> `readonly` **pending\_outcome\_json**: `string` \| `null`

##### root\_run\_id

> `readonly` **root\_run\_id**: `string`

##### run\_id

> `readonly` **run\_id**: `string`

##### session\_id

> `readonly` **session\_id**: `string`

##### status

> `readonly` **status**: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`

##### suspension\_json

> `readonly` **suspension\_json**: `string` \| `null`

##### terminal\_event\_id

> `readonly` **terminal\_event\_id**: `string` \| `null`

##### updated\_at

> `readonly` **updated\_at**: `string` \| `Date`

***

### SqlClaimMechanics

#### Properties

##### changes

> `readonly` **changes**: `Stream`\<`void`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

##### claimReadyRuns

> `readonly` **claimReadyRuns**: (`input`) => `Effect`\<readonly [`ClaimedRun`](#claimedrun) & `object`[], [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| `SqlError`, `SqlClient`\>

###### Parameters

###### input

###### lease?

`Input`

###### limit

`number`

###### workerId

`string`

###### Returns

`Effect`\<readonly [`ClaimedRun`](#claimedrun) & `object`[], [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| `SqlError`, `SqlClient`\>

##### refreshLease

> `readonly` **refreshLease**: (`input`) => `Effect`\<`boolean`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| `SqlError`, `SqlClient`\>

###### Parameters

###### input

###### attemptFence

`number`

###### cancellationRequested

`boolean`

###### lease?

`Input`

###### runId

`string`

###### workerId

`string`

###### Returns

`Effect`\<`boolean`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| `SqlError`, `SqlClient`\>

***

### SqliteRuntimeOptions

#### Properties

##### options

> `readonly` **options**: [`SqliteStoreOptions`](#sqlitestoreoptions)

##### schedulerMode?

> `readonly` `optional` **schedulerMode?**: `"poll"` \| `"external"`

##### workerId

> `readonly` **workerId**: `string`

***

### SqliteStoreOptions

#### Extends

- [`LayerOptions`](../runtime/namespaces/Runtime#layeroptions)

#### Properties

##### activationProjection?

> `readonly` `optional` **activationProjection?**: [`RunActivationProjection`](#runactivationprojection)

Final-state callback executed synchronously inside each authoritative store transaction.

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`activationProjection`](../runtime/namespaces/Runtime#activationprojection)

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](../runtime/namespaces/Runtime#addressbinding)[]

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`addresses`](../runtime/namespaces/Runtime#addresses)

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](../runtime/namespaces/Messaging/namespaces/MessagingPolicy#service)

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`messagingPolicy`](../runtime/namespaces/Runtime#messagingpolicy)

##### multiWorker?

> `readonly` `optional` **multiWorker?**: `boolean`

##### scheduler?

> `readonly` `optional` **scheduler?**: `object`

###### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`scheduler`](../runtime/namespaces/Runtime#scheduler)

##### source?

> `readonly` `optional` **source?**: `string`

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`subscriberQueueCapacity`](../runtime/namespaces/Runtime#subscriberqueuecapacity)

##### workers?

> `readonly` `optional` **workers?**: `number`

***

### SqlLogicalConstraint

#### Properties

##### columns

> `readonly` **columns**: readonly `string`[]

##### kind

> `readonly` **kind**: `"check"` \| `"foreign-key"` \| `"primary-key"` \| `"unique"`

##### table

> `readonly` **table**: `string`

***

### SqlLogicalIndex

#### Properties

##### columns

> `readonly` **columns**: readonly `string`[]

##### name

> `readonly` **name**: `string`

##### table

> `readonly` **table**: `string`

##### unique?

> `readonly` `optional` **unique?**: `boolean`

***

### SqlLogicalTable

#### Properties

##### columns

> `readonly` **columns**: readonly `string`[]

##### name

> `readonly` **name**: `string`

***

### SqlMigrationRecord

#### Properties

##### migration\_id

> `readonly` **migration\_id**: `number`

##### name

> `readonly` **name**: `string`

***

### SqlSchemaMeta

#### Properties

##### checksum

> `readonly` **checksum**: `string`

##### dirty

> `readonly` **dirty**: `boolean`

##### present

> `readonly` **present**: `boolean`

##### version

> `readonly` **version**: `number`

***

### SqlSchemaPlan

#### Properties

##### checksum

> `readonly` **checksum**: `string`

##### current

> `readonly` **current**: `number`

##### required

> `readonly` **required**: `number`

##### statements

> `readonly` **statements**: readonly `string`[]

##### upgradeRequired

> `readonly` **upgradeRequired**: `boolean`

***

### SqlStoreDriver

#### Type Parameters

##### Error

`Error` = `never`

#### Properties

##### backend

> `readonly` **backend**: `"sqlite"` \| `"postgres"` \| `"mysql"`

##### claims?

> `readonly` `optional` **claims?**: (`input`) => [`SqlClaimMechanics`](#sqlclaimmechanics)

###### Parameters

###### input

###### hub

[`EventHub`](#eventhub)

###### sql

`SqlClient`

###### transactionHub

[`EventHub`](#eventhub)

###### Returns

[`SqlClaimMechanics`](#sqlclaimmechanics)

##### events?

> `readonly` `optional` **events?**: (`input`, `context`) => `Stream`\<[`RunEvent`](../runtime/namespaces/RunEvent#runevent)\>

###### Parameters

###### input

###### cursor

`number`

###### runId

`string`

###### context

###### capacity

`number`

###### hub

[`EventHub`](#eventhub)

###### loadAfter

(`cursor`) => `Effect`\<readonly [`RunEvent`](../runtime/namespaces/RunEvent#runevent)[], [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

###### loadReplay

`Effect`\<\{ `lastSequence`: `number`; `replay`: readonly [`RunEvent`](../runtime/namespaces/RunEvent#runevent)[]; \}, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| [`RunNotFound`](../runtime/namespaces/Errors#runnotfound)\>

###### runNoTransaction

[`SqlStoreRun`](#sqlstorerun)

###### Returns

`Stream`\<[`RunEvent`](../runtime/namespaces/RunEvent#runevent)\>

##### hostSessionEvents?

> `readonly` `optional` **hostSessionEvents?**: (`input`, `context`) => `Stream`\<[`HostSessionEvent`](../runtime/namespaces/HostSession#hostsessionevent)\>

###### Parameters

###### input

###### cursor

`number`

###### sessionId

`string`

###### context

###### capacity

`number`

###### hub

[`EventHub`](#eventhub)

###### loadAfter

(`cursor`) => `Effect`\<readonly [`HostSessionEvent`](../runtime/namespaces/HostSession#hostsessionevent)[], [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| [`SessionNotFound`](../host#sessionnotfound)\>

###### loadReplay

`Effect`\<\{ `lastCursor`: `number`; `replay`: readonly [`HostSessionEvent`](../runtime/namespaces/HostSession#hostsessionevent)[]; \}, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| [`SessionNotFound`](../host#sessionnotfound)\>

###### runNoTransaction

[`SqlStoreRun`](#sqlstorerun)

###### Returns

`Stream`\<[`HostSessionEvent`](../runtime/namespaces/HostSession#hostsessionevent)\>

##### initialize?

> `readonly` `optional` **initialize?**: (`source`) => `Effect`\<`void`, `Error`, `SqlClient` \| `Scope`\>

###### Parameters

###### source

`string`

###### Returns

`Effect`\<`void`, `Error`, `SqlClient` \| `Scope`\>

##### locks

> `readonly` **locks**: [`SqlStoreLocks`](#sqlstorelocks)

##### makeRunner

> `readonly` **makeRunner**: (`input`) => [`SqlStoreRunner`](#sqlstorerunner)

###### Parameters

###### input

###### activationProjection?

[`RunActivationProjection`](#runactivationprojection)

###### eventCommit

`Semaphore`

###### hub

[`EventHub`](#eventhub)

###### sql

`SqlClient`

###### Returns

[`SqlStoreRunner`](#sqlstorerunner)

##### migrate

> `readonly` **migrate**: (`source`) => `Effect`\<`void`, `Error`, `SqlClient` \| `Scope`\>

###### Parameters

###### source

`string`

###### Returns

`Effect`\<`void`, `Error`, `SqlClient` \| `Scope`\>

##### multiWorker

> `readonly` **multiWorker**: `boolean`

##### treeChanges?

> `readonly` `optional` **treeChanges?**: (`rootRunId`, `context`) => `Stream`\<`void`\>

###### Parameters

###### rootRunId

`string`

###### context

###### hub

[`EventHub`](#eventhub)

###### rootForRun

(`runId`) => `Effect`\<`string` \| `undefined`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

###### Returns

`Stream`\<`void`\>

***

### SqlStoreLocks

#### Properties

##### admission

> `readonly` **admission**: (`input`) => `Effect`\<`void`, `SqlError`, `SqlClient`\>

###### Parameters

###### input

###### address

`string`

###### idempotencyKey

`string`

###### runId?

`string`

###### sessionId

`string`

###### Returns

`Effect`\<`void`, `SqlError`, `SqlClient`\>

##### admissionRegistrations

> `readonly` **admissionRegistrations**: `Effect`\<`void`, `SqlError`, `SqlClient`\>

##### fanOut

> `readonly` **fanOut**: (`input`) => `Effect`\<`void`, `SqlError`, `SqlClient`\>

###### Parameters

###### input

###### idempotencyKey

`string`

###### parentRunId

`string`

###### Returns

`Effect`\<`void`, `SqlError`, `SqlClient`\>

##### fence

> `readonly` **fence**: (`runId`) => `Effect`\<`void`, `SqlError`, `SqlClient`\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`void`, `SqlError`, `SqlClient`\>

##### hierarchy

> `readonly` **hierarchy**: (`runId`) => `Effect`\<`void`, `SqlError`, `SqlClient`\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`void`, `SqlError`, `SqlClient`\>

##### mailbox

> `readonly` **mailbox**: (`sessionId`) => `Effect`\<`void`, `SqlError`, `SqlClient`\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<`void`, `SqlError`, `SqlClient`\>

##### registrations

> `readonly` **registrations**: `Effect`\<`void`, `SqlError`, `SqlClient`\>

##### run

> `readonly` **run**: (`runId`) => `Effect`\<`void`, `SqlError`, `SqlClient`\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`void`, `SqlError`, `SqlClient`\>

##### spawn

> `readonly` **spawn**: (`parentRunId`) => `Effect`\<`void`, `SqlError`, `SqlClient`\>

###### Parameters

###### parentRunId

`string`

###### Returns

`Effect`\<`void`, `SqlError`, `SqlClient`\>

***

### SqlStoreOptions

#### Extends

- [`LayerOptions`](../runtime/namespaces/Runtime#layeroptions)

#### Extended by

- [`Options`](../mysql/index#options)
- [`Options`](../pg/index#options)

#### Properties

##### activationProjection?

> `readonly` `optional` **activationProjection?**: [`RunActivationProjection`](#runactivationprojection)

Final-state callback executed synchronously inside each authoritative store transaction.

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`activationProjection`](../runtime/namespaces/Runtime#activationprojection)

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](../runtime/namespaces/Runtime#addressbinding)[]

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`addresses`](../runtime/namespaces/Runtime#addresses)

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](../runtime/namespaces/Messaging/namespaces/MessagingPolicy#service)

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`messagingPolicy`](../runtime/namespaces/Runtime#messagingpolicy)

##### scheduler?

> `readonly` `optional` **scheduler?**: `object`

###### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`scheduler`](../runtime/namespaces/Runtime#scheduler)

##### source?

> `readonly` `optional` **source?**: `string`

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`subscriberQueueCapacity`](../runtime/namespaces/Runtime#subscriberqueuecapacity)

***

### SqlStoreRunner

#### Properties

##### run

> `readonly` **run**: [`SqlStoreRun`](#sqlstorerun)

##### runInspection

> `readonly` **runInspection**: [`SqlStoreRun`](#sqlstorerun)

##### runNoTransaction

> `readonly` **runNoTransaction**: [`SqlStoreRun`](#sqlstorerun)

##### transaction

> `readonly` **transaction**: \<`A`, `E`, `R`\>(`effect`) => `Effect`\<`A`, `SqlError` \| `E`, `R`\>

###### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

###### Parameters

###### effect

`Effect`\<`A`, `E`, `R`\>

###### Returns

`Effect`\<`A`, `SqlError` \| `E`, `R`\>

##### transactionHub

> `readonly` **transactionHub**: [`EventHub`](#eventhub)

## Type Aliases

### RunActivation

> **RunActivation** = \{ `attemptFence`: `number`; `intent`: `"execute"` \| `"cancel"`; `runId`: `string`; `runStatus`: `string`; \} \| \{ `intent`: `"inactive"`; `runId`: `string`; \}

Final executable disposition of a Run at a transaction boundary.

***

### SqlDriverStoreError

> **SqlDriverStoreError** = [`SchemaDirty`](#schemadirty) \| [`SchemaChecksumMismatch`](#schemachecksummismatch) \| [`SchemaVersionUnsupported`](#schemaversionunsupported) \| [`SchemaUpgradeRequired`](#schemaupgraderequired) \| [`SchemaMigrationFailed`](#schemamigrationfailed)

***

### SqliteRuntimeServices

> **SqliteRuntimeServices** = [`Runtime`](../runtime/namespaces/Runtime#runtime) \| [`RunStore`](../runtime/namespaces/RunStore#runstore) \| [`ExternalChildStore`](../unstable.runtime.external-child-store#externalchildstore) \| [`RunExecutor`](../runtime/namespaces/RunExecutor#runexecutor) \| [`LocalScheduler`](../runtime/namespaces/LocalScheduler#localscheduler)

Services constructed by an exclusive SQLite Runtime host.

***

### SqliteStoreError

> **SqliteStoreError** = [`SchemaDirty`](#schemadirty) \| [`SchemaChecksumMismatch`](#schemachecksummismatch) \| [`SchemaVersionUnsupported`](#schemaversionunsupported) \| [`SchemaMigrationFailed`](#schemamigrationfailed) \| [`MultiWorkerUnsupported`](../runtime/namespaces/Errors#multiworkerunsupported)

***

### SqlRuntimeDriver

> **SqlRuntimeDriver**\<`Error`\> = [`SqlStoreDriver`](#sqlstoredriver)\<`Error`\> & `object`

#### Type Declaration

##### claims

> `readonly` **claims**: `NonNullable`\<[`SqlStoreDriver`](#sqlstoredriver)\<`Error`\>\[`"claims"`\]\>

#### Type Parameters

##### Error

`Error`

***

### SqlRuntimeServices

> **SqlRuntimeServices** = [`Runtime`](../runtime/namespaces/Runtime#runtime) \| [`RunStore`](../runtime/namespaces/RunStore#runstore) \| [`RunClaims`](#runclaims) \| [`RunExecutor`](../runtime/namespaces/RunExecutor#runexecutor)

Services constructed by a multi-worker SQL Runtime adapter.

***

### SqlStoreRun

> **SqlStoreRun** = \<`A`, `E`\>(`effect`) => `Effect.Effect`\<`A`, [`WithoutSqlError`](#withoutsqlerror)\<`E` \| `SqlError`\> \| [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

#### Type Parameters

##### A

`A`

##### E

`E`

#### Parameters

##### effect

`Effect.Effect`\<`A`, `E` \| `SqlError`, `SqlClient.SqlClient`\>

#### Returns

`Effect.Effect`\<`A`, [`WithoutSqlError`](#withoutsqlerror)\<`E` \| `SqlError`\> \| [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

***

### WithoutSqlError

> **WithoutSqlError**\<`E`\> = `Exclude`\<`E`, `E` & `object`\>

#### Type Parameters

##### E

`E`

## Variables

### acquireSessionWriteClaim

> `const` **acquireSessionWriteClaim**: (`input`) => `Effect.Effect`\<`SessionWriteClaim`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| `SqlError`, `SqlClient.SqlClient`\>

**`Internal`**

Issue a new storage Session epoch and bind it to one exact Run claim.

#### Parameters

##### input

`ClaimInput`

#### Returns

`Effect.Effect`\<`SessionWriteClaim`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| `SqlError`, `SqlClient.SqlClient`\>

***

### checkSqlMigrationIdentity

> `const` **checkSqlMigrationIdentity**: \{(`migrations`, `source`): `Effect`\<`void`, [`SchemaMigrationFailed`](#schemamigrationfailed)\>; (`source`): (`migrations`) => `Effect`\<`void`, [`SchemaMigrationFailed`](#schemamigrationfailed)\>; \}

Check the single greenfield baseline migration identity.

#### Call Signature

> (`migrations`, `source`): `Effect`\<`void`, [`SchemaMigrationFailed`](#schemamigrationfailed)\>

##### Parameters

###### migrations

readonly [`SqlMigrationRecord`](#sqlmigrationrecord)[]

###### source

`string`

##### Returns

`Effect`\<`void`, [`SchemaMigrationFailed`](#schemamigrationfailed)\>

#### Call Signature

> (`source`): (`migrations`) => `Effect`\<`void`, [`SchemaMigrationFailed`](#schemamigrationfailed)\>

##### Parameters

###### source

`string`

##### Returns

(`migrations`) => `Effect`\<`void`, [`SchemaMigrationFailed`](#schemamigrationfailed)\>

***

### checkSqlSchemaMeta

> `const` **checkSqlSchemaMeta**: \{(`meta`, `source`): `Effect`\<`void`, [`SchemaDirty`](#schemadirty) \| [`SchemaChecksumMismatch`](#schemachecksummismatch) \| [`SchemaVersionUnsupported`](#schemaversionunsupported) \| [`SchemaUpgradeRequired`](#schemaupgraderequired)\>; (`source`): (`meta`) => `Effect`\<`void`, [`SchemaDirty`](#schemadirty) \| [`SchemaChecksumMismatch`](#schemachecksummismatch) \| [`SchemaVersionUnsupported`](#schemaversionunsupported) \| [`SchemaUpgradeRequired`](#schemaupgraderequired)\>; \}

Check the shared version/checksum/dirty state before dialect-owned verification.

#### Call Signature

> (`meta`, `source`): `Effect`\<`void`, [`SchemaDirty`](#schemadirty) \| [`SchemaChecksumMismatch`](#schemachecksummismatch) \| [`SchemaVersionUnsupported`](#schemaversionunsupported) \| [`SchemaUpgradeRequired`](#schemaupgraderequired)\>

##### Parameters

###### meta

[`SqlSchemaMeta`](#sqlschemameta)

###### source

`string`

##### Returns

`Effect`\<`void`, [`SchemaDirty`](#schemadirty) \| [`SchemaChecksumMismatch`](#schemachecksummismatch) \| [`SchemaVersionUnsupported`](#schemaversionunsupported) \| [`SchemaUpgradeRequired`](#schemaupgraderequired)\>

#### Call Signature

> (`source`): (`meta`) => `Effect`\<`void`, [`SchemaDirty`](#schemadirty) \| [`SchemaChecksumMismatch`](#schemachecksummismatch) \| [`SchemaVersionUnsupported`](#schemaversionunsupported) \| [`SchemaUpgradeRequired`](#schemaupgraderequired)\>

##### Parameters

###### source

`string`

##### Returns

(`meta`) => `Effect`\<`void`, [`SchemaDirty`](#schemadirty) \| [`SchemaChecksumMismatch`](#schemachecksummismatch) \| [`SchemaVersionUnsupported`](#schemaversionunsupported) \| [`SchemaUpgradeRequired`](#schemaupgraderequired)\>

***

### decodeRunEffect

> `const` **decodeRunEffect**: (`row`) => `Effect.Effect`\<[`DecodedRun`](#decodedrun), [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

#### Parameters

##### row

[`RunRow`](#runrow)

#### Returns

`Effect.Effect`\<[`DecodedRun`](#decodedrun), [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

***

### layerSqliteRuntime

> `const` **layerSqliteRuntime**: (`input`) => `Layer.Layer`\<[`SqliteRuntimeServices`](#sqliteruntimeservices), [`SqliteStoreError`](#sqlitestoreerror), `SqlClient.SqlClient` \| [`ExecutableResolver`](../runtime/namespaces/ExecutableResolver#executableresolver)\>

Assemble one exclusive SQLite host around Runtime's lifecycle kernel.

#### Parameters

##### input

[`SqliteRuntimeOptions`](#sqliteruntimeoptions)

#### Returns

`Layer.Layer`\<[`SqliteRuntimeServices`](#sqliteruntimeservices), [`SqliteStoreError`](#sqlitestoreerror), `SqlClient.SqlClient` \| [`ExecutableResolver`](../runtime/namespaces/ExecutableResolver#executableresolver)\>

***

### layerSqliteStore

> `const` **layerSqliteStore**: (`options`) => `Layer.Layer`\<[`RunStore`](../runtime/namespaces/RunStore#runstore) \| [`ExternalChildStore`](../unstable.runtime.external-child-store#externalchildstore), [`SqliteStoreError`](#sqlitestoreerror), `SqlClient.SqlClient`\>

#### Parameters

##### options

[`SqliteStoreOptions`](#sqlitestoreoptions)

#### Returns

`Layer.Layer`\<[`RunStore`](../runtime/namespaces/RunStore#runstore) \| [`ExternalChildStore`](../unstable.runtime.external-child-store#externalchildstore), [`SqliteStoreError`](#sqlitestoreerror), `SqlClient.SqlClient`\>

***

### layerSqlRuntime

> `const` **layerSqlRuntime**: (`input`) => `Layer.Layer`\<[`SqlRuntimeServices`](#sqlruntimeservices), [`SqlDriverStoreError`](#sqldriverstoreerror), `SqlClient.SqlClient` \| [`ExecutableResolver`](../runtime/namespaces/ExecutableResolver#executableresolver)\>

Assemble one server SQL driver around Runtime's lifecycle kernel.

#### Parameters

##### input

###### driver

[`SqlRuntimeDriver`](#sqlruntimedriver)\<[`SqlDriverStoreError`](#sqldriverstoreerror)\>

###### options

[`SqlStoreOptions`](#sqlstoreoptions)

#### Returns

`Layer.Layer`\<[`SqlRuntimeServices`](#sqlruntimeservices), [`SqlDriverStoreError`](#sqldriverstoreerror), `SqlClient.SqlClient` \| [`ExecutableResolver`](../runtime/namespaces/ExecutableResolver#executableresolver)\>

***

### loadRun

> `const` **loadRun**: (`runId`) => `Effect.Effect`\<[`DecodedRun`](#decodedrun) \| `undefined`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| `SqlError`, `SqlClient.SqlClient`\>

#### Parameters

##### runId

`string`

#### Returns

`Effect.Effect`\<[`DecodedRun`](#decodedrun) \| `undefined`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| `SqlError`, `SqlClient.SqlClient`\>

***

### makeExclusiveExecutionRecovery

> `const` **makeExclusiveExecutionRecovery**: \{(`sqlClient`, `projection`): `ExclusiveExecutionRecovery`; (`projection`): (`sqlClient`) => `ExclusiveExecutionRecovery`; \}

Recover stale claims after a host proves exclusive ownership of the database.

#### Call Signature

> (`sqlClient`, `projection`): `ExclusiveExecutionRecovery`

##### Parameters

###### sqlClient

`SqlClient`

###### projection

[`RunActivationProjection`](#runactivationprojection)

##### Returns

`ExclusiveExecutionRecovery`

#### Call Signature

> (`projection`): (`sqlClient`) => `ExclusiveExecutionRecovery`

##### Parameters

###### projection

[`RunActivationProjection`](#runactivationprojection)

##### Returns

(`sqlClient`) => `ExclusiveExecutionRecovery`

***

### mapSqlError

> `const` **mapSqlError**: \<`A`, `E`, `R`\>(`effect`) => `Effect.Effect`\<`A`, [`WithoutSqlError`](#withoutsqlerror)\<`E`\> \| [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable), `R`\>

#### Type Parameters

##### A

`A`

##### E

`E`

##### R

`R`

#### Parameters

##### effect

`Effect.Effect`\<`A`, `E`, `R`\>

#### Returns

`Effect.Effect`\<`A`, [`WithoutSqlError`](#withoutsqlerror)\<`E`\> \| [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable), `R`\>

***

### planSqlSchema

> `const` **planSqlSchema**: \{(`meta`, `statements`): [`SqlSchemaPlan`](#sqlschemaplan); (`statements`): (`meta`) => [`SqlSchemaPlan`](#sqlschemaplan); \}

Derive the one logical migration plan from physical metadata and dialect DDL.

#### Call Signature

> (`meta`, `statements`): [`SqlSchemaPlan`](#sqlschemaplan)

##### Parameters

###### meta

[`SqlSchemaMeta`](#sqlschemameta)

###### statements

readonly `string`[]

##### Returns

[`SqlSchemaPlan`](#sqlschemaplan)

#### Call Signature

> (`statements`): (`meta`) => [`SqlSchemaPlan`](#sqlschemaplan)

##### Parameters

###### statements

readonly `string`[]

##### Returns

(`meta`) => [`SqlSchemaPlan`](#sqlschemaplan)

***

### SQL\_LOGICAL\_SCHEMA

> `const` **SQL\_LOGICAL\_SCHEMA**: `SqlLogicalSchemaContract`

Dialect-neutral lifecycle inventory. Physical claim/lock indexes, MySQL's lock
table, and Cloudflare activation tables are deliberately adapter or host mechanics.

***

### SQL\_SCHEMA\_NAME

> `const` **SQL\_SCHEMA\_NAME**: `"generalist_runtime"` = `"generalist_runtime"`

The single logical SQL Runtime schema identity.

***

### SQL\_SCHEMA\_VERSION

> `const` **SQL\_SCHEMA\_VERSION**: `9` = `9`

The single logical SQL Runtime schema version.

***

### sqlSchemaChecksum

> `const` **sqlSchemaChecksum**: () => `string`

Stable checksum of the logical contract, independent of physical dialect DDL.

#### Returns

`string`

***

### withConsistentSnapshot

> `const` **withConsistentSnapshot**: \{\<`A`, `E`, `R`\>(`dialect`, `effect`): (`sql`) => `Effect`\<`A`, `SqlError` \| `E`, `R`\>; \<`A`, `E`, `R`\>(`sql`, `dialect`, `effect`): `Effect`\<`A`, `SqlError` \| `E`, `R`\>; \}

#### Call Signature

> \<`A`, `E`, `R`\>(`dialect`, `effect`): (`sql`) => `Effect`\<`A`, `SqlError` \| `E`, `R`\>

##### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

##### Parameters

###### dialect

`InspectionDialect`

###### effect

`Effect`\<`A`, `E`, `R`\>

##### Returns

(`sql`) => `Effect`\<`A`, `SqlError` \| `E`, `R`\>

#### Call Signature

> \<`A`, `E`, `R`\>(`sql`, `dialect`, `effect`): `Effect`\<`A`, `SqlError` \| `E`, `R`\>

##### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

##### Parameters

###### sql

`SqlClient`

###### dialect

`InspectionDialect`

###### effect

`Effect`\<`A`, `E`, `R`\>

##### Returns

`Effect`\<`A`, `SqlError` \| `E`, `R`\>

***

### withSql

> `const` **withSql**: `WithSql`
