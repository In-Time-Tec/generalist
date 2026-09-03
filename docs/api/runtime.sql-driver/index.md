[**generalist**](../index)

***

[generalist](../index) / runtime.sql-driver

# runtime.sql-driver

## Namespaces

- [RuntimeWorker](./namespaces/RuntimeWorker)
- [SqliteRunActivation](./namespaces/SqliteRunActivation)

## Classes

<a id="runclaims"></a>

### RunClaims

#### Extends

- `RunClaims_base`

#### Constructors

<a id="constructor"></a>

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

<a id="schemachecksummismatch"></a>

### SchemaChecksumMismatch

#### Extends

- `SchemaChecksumMismatch_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="actual"></a>

##### actual

> `readonly` **actual**: `string`

###### Inherited from

`SchemaChecksumMismatch_base.actual`

<a id="expected"></a>

##### expected

> `readonly` **expected**: `string`

###### Inherited from

`SchemaChecksumMismatch_base.expected`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SchemaChecksumMismatch_base.hint`

<a id="source"></a>

##### source

> `readonly` **source**: `string`

###### Inherited from

`SchemaChecksumMismatch_base.source`

***

<a id="schemadirty"></a>

### SchemaDirty

#### Extends

- `SchemaDirty_base`

#### Constructors

<a id="constructor-2"></a>

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

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SchemaDirty_base.hint`

<a id="source-1"></a>

##### source

> `readonly` **source**: `string`

###### Inherited from

`SchemaDirty_base.source`

<a id="version"></a>

##### version

> `readonly` **version**: `number`

###### Inherited from

`SchemaDirty_base.version`

***

<a id="schemamigrationfailed"></a>

### SchemaMigrationFailed

#### Extends

- `SchemaMigrationFailed_base`

#### Constructors

<a id="constructor-3"></a>

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

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SchemaMigrationFailed_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`SchemaMigrationFailed_base.message`

<a id="source-2"></a>

##### source

> `readonly` **source**: `string`

###### Inherited from

`SchemaMigrationFailed_base.source`

***

<a id="schemaupgraderequired"></a>

### SchemaUpgradeRequired

#### Extends

- `SchemaUpgradeRequired_base`

#### Constructors

<a id="constructor-4"></a>

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

<a id="current"></a>

##### current

> `readonly` **current**: `number`

###### Inherited from

`SchemaUpgradeRequired_base.current`

<a id="hint-3"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SchemaUpgradeRequired_base.hint`

<a id="required"></a>

##### required

> `readonly` **required**: `number`

###### Inherited from

`SchemaUpgradeRequired_base.required`

<a id="source-3"></a>

##### source

> `readonly` **source**: `string`

###### Inherited from

`SchemaUpgradeRequired_base.source`

***

<a id="schemaversionunsupported"></a>

### SchemaVersionUnsupported

#### Extends

- `SchemaVersionUnsupported_base`

#### Constructors

<a id="constructor-5"></a>

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

<a id="hint-4"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SchemaVersionUnsupported_base.hint`

<a id="source-4"></a>

##### source

> `readonly` **source**: `string`

###### Inherited from

`SchemaVersionUnsupported_base.source`

<a id="supported"></a>

##### supported

> `readonly` **supported**: `number`

###### Inherited from

`SchemaVersionUnsupported_base.supported`

<a id="version-1"></a>

##### version

> `readonly` **version**: `number`

###### Inherited from

`SchemaVersionUnsupported_base.version`

## Interfaces

<a id="claimedrun"></a>

### ClaimedRun

#### Properties

<a id="attemptfence"></a>

##### attemptFence

> `readonly` **attemptFence**: `number`

<a id="leaseexpiresat"></a>

##### leaseExpiresAt

> `readonly` **leaseExpiresAt**: `Date`

<a id="run"></a>

##### run

> `readonly` **run**: [`DecodedRun`](#decodedrun)

<a id="session"></a>

##### session

> `readonly` **session**: `SessionWriteClaim`

<a id="workerid"></a>

##### workerId

> `readonly` **workerId**: `string`

***

<a id="decodedrun"></a>

### DecodedRun

#### Properties

<a id="acceptedsequence"></a>

##### acceptedSequence

> `readonly` **acceptedSequence**: `number`

<a id="address"></a>

##### address

> `readonly` **address**: `string`

<a id="admittedat"></a>

##### admittedAt

> `readonly` **admittedAt**: `string`

<a id="attempt"></a>

##### attempt

> `readonly` **attempt**: `number`

<a id="attemptfence-1"></a>

##### attemptFence

> `readonly` **attemptFence**: `number`

<a id="attemptfenceepoch"></a>

##### attemptFenceEpoch?

> `readonly` `optional` **attemptFenceEpoch?**: `number`

<a id="cancellationrequested"></a>

##### cancellationRequested

> `readonly` **cancellationRequested**: `boolean`

<a id="cancelreason"></a>

##### cancelReason?

> `readonly` `optional` **cancelReason?**: `string`

<a id="continuation"></a>

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

<a id="depth"></a>

##### depth

> `readonly` **depth**: `number`

<a id="drivercheckpoint"></a>

##### driverCheckpoint?

> `readonly` `optional` **driverCheckpoint?**: \{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \} \| \{ `version`: `"1"`; \}

<a id="executablemanifest"></a>

##### executableManifest

> `readonly` **executableManifest**: [`ExecutableManifest`](../generalist/namespaces/ExecutableManifest#executablemanifest)

<a id="executableref"></a>

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

<a id="forkedfrom"></a>

##### forkedFrom?

> `readonly` `optional` **forkedFrom?**: `string`

<a id="forksequence"></a>

##### forkSequence?

> `readonly` `optional` **forkSequence?**: `number`

<a id="invocationid"></a>

##### invocationId?

> `readonly` `optional` **invocationId?**: `string`

<a id="lastsequence"></a>

##### lastSequence

> `readonly` **lastSequence**: `number`

<a id="lastturncompletedsequence"></a>

##### lastTurnCompletedSequence

> `readonly` **lastTurnCompletedSequence**: `number`

<a id="leaseexpiresat-1"></a>

##### leaseExpiresAt?

> `readonly` `optional` **leaseExpiresAt?**: `string`

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

<a id="messagedigest"></a>

##### messageDigest

> `readonly` **messageDigest**: `string`

<a id="ownerworkerid"></a>

##### ownerWorkerId?

> `readonly` `optional` **ownerWorkerId?**: `string`

<a id="parentrunid"></a>

##### parentRunId?

> `readonly` `optional` **parentRunId?**: `string`

<a id="pendingoutcome"></a>

##### pendingOutcome?

> `readonly` `optional` **pendingOutcome?**: \{ `result`: \{ `output?`: `unknown`; `session`: \{ `leafId`: `string` \| `null`; `sessionId`: `string`; \}; `text`: `string`; `turns`: `number`; \} \| \{ `value`: `unknown`; \}; \} \| \{ `error`: [`RunFailure`](../runtime/namespaces/Run#runfailure); \}

<a id="rootrunid"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

<a id="status"></a>

##### status

> `readonly` **status**: `"failed"` \| `"cancelled"` \| `"queued"` \| `"succeeded"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`

<a id="suspension"></a>

##### suspension?

> `readonly` `optional` **suspension?**: [`ExecutionSuspension`](../runtime/namespaces/ExecutionState#executionsuspension)

<a id="terminaleventid"></a>

##### terminalEventId?

> `readonly` `optional` **terminalEventId?**: `string`

<a id="treepolicy"></a>

##### treePolicy

> `readonly` **treePolicy**: `object`

###### maxDepth

> `readonly` **maxDepth**: `number`

###### maxSubagents

> `readonly` **maxSubagents**: `number`

***

<a id="eventhub"></a>

### EventHub

#### Properties

<a id="catchup"></a>

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

<a id="catchuphostsession"></a>

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

<a id="publish"></a>

##### publish

> `readonly` **publish**: (`runId`, `event`) => `Effect`\<`void`\>

###### Parameters

###### runId

`string`

###### event

[`RunEvent`](../runtime/namespaces/RunEvent#runevent)

###### Returns

`Effect`\<`void`\>

<a id="publishhostsession"></a>

##### publishHostSession

> `readonly` **publishHostSession**: (`sessionId`, `entry`) => `Effect`\<`void`\>

###### Parameters

###### sessionId

`string`

###### entry

[`HostSessionEvent`](../runtime/namespaces/HostSession#hostsessionevent)

###### Returns

`Effect`\<`void`\>

<a id="shutdown"></a>

##### shutdown

> `readonly` **shutdown**: `Effect`\<`void`\>

<a id="subscribe"></a>

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

<a id="subscribehostsession"></a>

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

<a id="subscribetree"></a>

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

<a id="touchrun"></a>

##### touchRun

> `readonly` **touchRun**: (`runId`) => `Effect`\<`void`\>

**`Internal`**

Mark a Run whose activation state changed without publishing an event on that Run.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`void`\>

<a id="waketree"></a>

##### wakeTree

> `readonly` **wakeTree**: (`rootRunId`) => `Effect`\<`void`\>

###### Parameters

###### rootRunId

`string`

###### Returns

`Effect`\<`void`\>

***

<a id="runactivationprojection"></a>

### RunActivationProjection

Transaction-local projection of final Run activation state.

#### Properties

<a id="applyintransaction"></a>

##### applyInTransaction

> `readonly` **applyInTransaction**: (`changes`) => `Effect`\<`void`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

###### Parameters

###### changes

readonly [`RunActivation`](#runactivation)[]

###### Returns

`Effect`\<`void`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

***

<a id="runrow"></a>

### RunRow

#### Properties

<a id="accepted_sequence"></a>

##### accepted\_sequence

> `readonly` **accepted\_sequence**: `string` \| `number` \| `bigint`

<a id="address-1"></a>

##### address

> `readonly` **address**: `string`

<a id="attempt-1"></a>

##### attempt

> `readonly` **attempt**: `number`

<a id="attempt_fence"></a>

##### attempt\_fence

> `readonly` **attempt\_fence**: `number`

<a id="cancel_reason"></a>

##### cancel\_reason

> `readonly` **cancel\_reason**: `string` \| `null`

<a id="cancellation_requested"></a>

##### cancellation\_requested

> `readonly` **cancellation\_requested**: `string` \| `number` \| `boolean`

<a id="continuation_json"></a>

##### continuation\_json

> `readonly` **continuation\_json**: `string` \| `null`

<a id="created_at"></a>

##### created\_at

> `readonly` **created\_at**: `string` \| `Date`

<a id="depth-1"></a>

##### depth

> `readonly` **depth**: `number`

<a id="driver_checkpoint_json"></a>

##### driver\_checkpoint\_json

> `readonly` **driver\_checkpoint\_json**: `string` \| `null`

<a id="executable_manifest_json"></a>

##### executable\_manifest\_json

> `readonly` **executable\_manifest\_json**: `string`

<a id="executable_ref_json"></a>

##### executable\_ref\_json

> `readonly` **executable\_ref\_json**: `string`

<a id="fork_sequence"></a>

##### fork\_sequence

> `readonly` **fork\_sequence**: `number` \| `null`

<a id="forked_from"></a>

##### forked\_from

> `readonly` **forked\_from**: `string` \| `null`

<a id="idempotency_key"></a>

##### idempotency\_key

> `readonly` **idempotency\_key**: `string`

<a id="invocation_id"></a>

##### invocation\_id

> `readonly` **invocation\_id**: `string` \| `null`

<a id="last_sequence"></a>

##### last\_sequence

> `readonly` **last\_sequence**: `number`

<a id="last_turn_completed_sequence"></a>

##### last\_turn\_completed\_sequence

> `readonly` **last\_turn\_completed\_sequence**: `number`

<a id="lease_expires_at"></a>

##### lease\_expires\_at?

> `readonly` `optional` **lease\_expires\_at?**: `string` \| `Date` \| `null`

<a id="max_depth"></a>

##### max\_depth

> `readonly` **max\_depth**: `number`

<a id="max_subagents"></a>

##### max\_subagents

> `readonly` **max\_subagents**: `number`

<a id="message_digest"></a>

##### message\_digest

> `readonly` **message\_digest**: `string`

<a id="message_id"></a>

##### message\_id

> `readonly` **message\_id**: `string`

<a id="message_json"></a>

##### message\_json

> `readonly` **message\_json**: `string`

<a id="owner_worker_id"></a>

##### owner\_worker\_id?

> `readonly` `optional` **owner\_worker\_id?**: `string` \| `null`

<a id="parent_run_id"></a>

##### parent\_run\_id

> `readonly` **parent\_run\_id**: `string` \| `null`

<a id="pending_outcome_json"></a>

##### pending\_outcome\_json

> `readonly` **pending\_outcome\_json**: `string` \| `null`

<a id="root_run_id"></a>

##### root\_run\_id

> `readonly` **root\_run\_id**: `string`

<a id="run_id"></a>

##### run\_id

> `readonly` **run\_id**: `string`

<a id="session_id"></a>

##### session\_id

> `readonly` **session\_id**: `string`

<a id="status-1"></a>

##### status

> `readonly` **status**: `"failed"` \| `"cancelled"` \| `"queued"` \| `"succeeded"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`

<a id="suspension_json"></a>

##### suspension\_json

> `readonly` **suspension\_json**: `string` \| `null`

<a id="terminal_event_id"></a>

##### terminal\_event\_id

> `readonly` **terminal\_event\_id**: `string` \| `null`

<a id="updated_at"></a>

##### updated\_at

> `readonly` **updated\_at**: `string` \| `Date`

***

<a id="sqlclaimmechanics"></a>

### SqlClaimMechanics

#### Properties

<a id="changes"></a>

##### changes

> `readonly` **changes**: `Stream`\<`void`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

<a id="claimreadyruns"></a>

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

<a id="refreshlease"></a>

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

<a id="sqliteruntimeoptions"></a>

### SqliteRuntimeOptions

#### Properties

<a id="options"></a>

##### options

> `readonly` **options**: [`SqliteStoreOptions`](#sqlitestoreoptions)

<a id="schedulermode"></a>

##### schedulerMode?

> `readonly` `optional` **schedulerMode?**: `"poll"` \| `"external"`

<a id="workerid-1"></a>

##### workerId

> `readonly` **workerId**: `string`

***

<a id="sqlitestoreoptions"></a>

### SqliteStoreOptions

#### Extends

- [`LayerOptions`](../runtime/namespaces/Runtime#layeroptions)

#### Properties

<a id="activationprojection"></a>

##### activationProjection?

> `readonly` `optional` **activationProjection?**: [`RunActivationProjection`](#runactivationprojection)

Final-state callback executed synchronously inside each authoritative store transaction.

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`activationProjection`](../runtime/namespaces/Runtime#activationprojection)

<a id="addresses"></a>

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](../runtime/namespaces/Runtime#addressbinding)[]

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`addresses`](../runtime/namespaces/Runtime#addresses)

<a id="messagingpolicy"></a>

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](../runtime/namespaces/Messaging/namespaces/MessagingPolicy#service)

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`messagingPolicy`](../runtime/namespaces/Runtime#messagingpolicy)

<a id="multiworker"></a>

##### multiWorker?

> `readonly` `optional` **multiWorker?**: `boolean`

<a id="scheduler"></a>

##### scheduler?

> `readonly` `optional` **scheduler?**: `object`

###### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`scheduler`](../runtime/namespaces/Runtime#scheduler)

<a id="source-5"></a>

##### source?

> `readonly` `optional` **source?**: `string`

<a id="subscriberqueuecapacity"></a>

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`subscriberQueueCapacity`](../runtime/namespaces/Runtime#subscriberqueuecapacity)

<a id="workers"></a>

##### workers?

> `readonly` `optional` **workers?**: `number`

***

<a id="sqllogicalconstraint"></a>

### SqlLogicalConstraint

#### Properties

<a id="columns"></a>

##### columns

> `readonly` **columns**: readonly `string`[]

<a id="kind"></a>

##### kind

> `readonly` **kind**: `"check"` \| `"foreign-key"` \| `"primary-key"` \| `"unique"`

<a id="table"></a>

##### table

> `readonly` **table**: `string`

***

<a id="sqllogicalindex"></a>

### SqlLogicalIndex

#### Properties

<a id="columns-1"></a>

##### columns

> `readonly` **columns**: readonly `string`[]

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="table-1"></a>

##### table

> `readonly` **table**: `string`

<a id="unique"></a>

##### unique?

> `readonly` `optional` **unique?**: `boolean`

***

<a id="sqllogicaltable"></a>

### SqlLogicalTable

#### Properties

<a id="columns-2"></a>

##### columns

> `readonly` **columns**: readonly `string`[]

<a id="name-1"></a>

##### name

> `readonly` **name**: `string`

***

<a id="sqlmigrationrecord"></a>

### SqlMigrationRecord

#### Properties

<a id="migration_id"></a>

##### migration\_id

> `readonly` **migration\_id**: `number`

<a id="name-2"></a>

##### name

> `readonly` **name**: `string`

***

<a id="sqlschemameta"></a>

### SqlSchemaMeta

#### Properties

<a id="checksum"></a>

##### checksum

> `readonly` **checksum**: `string`

<a id="dirty"></a>

##### dirty

> `readonly` **dirty**: `boolean`

<a id="present"></a>

##### present

> `readonly` **present**: `boolean`

<a id="version-2"></a>

##### version

> `readonly` **version**: `number`

***

<a id="sqlschemaplan"></a>

### SqlSchemaPlan

#### Properties

<a id="checksum-1"></a>

##### checksum

> `readonly` **checksum**: `string`

<a id="current-1"></a>

##### current

> `readonly` **current**: `number`

<a id="required-1"></a>

##### required

> `readonly` **required**: `number`

<a id="statements"></a>

##### statements

> `readonly` **statements**: readonly `string`[]

<a id="upgraderequired"></a>

##### upgradeRequired

> `readonly` **upgradeRequired**: `boolean`

***

<a id="sqlstoredriver"></a>

### SqlStoreDriver

#### Type Parameters

##### Error

`Error` = `never`

#### Properties

<a id="backend"></a>

##### backend

> `readonly` **backend**: `"sqlite"` \| `"postgres"` \| `"mysql"`

<a id="claims"></a>

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

<a id="events"></a>

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

<a id="hostsessionevents"></a>

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

<a id="initialize"></a>

##### initialize?

> `readonly` `optional` **initialize?**: (`source`) => `Effect`\<`void`, `Error`, `SqlClient` \| `Scope`\>

###### Parameters

###### source

`string`

###### Returns

`Effect`\<`void`, `Error`, `SqlClient` \| `Scope`\>

<a id="locks"></a>

##### locks

> `readonly` **locks**: [`SqlStoreLocks`](#sqlstorelocks)

<a id="makerunner"></a>

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

<a id="migrate"></a>

##### migrate

> `readonly` **migrate**: (`source`) => `Effect`\<`void`, `Error`, `SqlClient` \| `Scope`\>

###### Parameters

###### source

`string`

###### Returns

`Effect`\<`void`, `Error`, `SqlClient` \| `Scope`\>

<a id="multiworker-1"></a>

##### multiWorker

> `readonly` **multiWorker**: `boolean`

<a id="treechanges"></a>

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

<a id="sqlstorelocks"></a>

### SqlStoreLocks

#### Properties

<a id="admission"></a>

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

<a id="admissionregistrations"></a>

##### admissionRegistrations

> `readonly` **admissionRegistrations**: `Effect`\<`void`, `SqlError`, `SqlClient`\>

<a id="fanout"></a>

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

<a id="fence"></a>

##### fence

> `readonly` **fence**: (`runId`) => `Effect`\<`void`, `SqlError`, `SqlClient`\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`void`, `SqlError`, `SqlClient`\>

<a id="hierarchy"></a>

##### hierarchy

> `readonly` **hierarchy**: (`runId`) => `Effect`\<`void`, `SqlError`, `SqlClient`\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`void`, `SqlError`, `SqlClient`\>

<a id="mailbox"></a>

##### mailbox

> `readonly` **mailbox**: (`sessionId`) => `Effect`\<`void`, `SqlError`, `SqlClient`\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<`void`, `SqlError`, `SqlClient`\>

<a id="registrations"></a>

##### registrations

> `readonly` **registrations**: `Effect`\<`void`, `SqlError`, `SqlClient`\>

<a id="run-1"></a>

##### run

> `readonly` **run**: (`runId`) => `Effect`\<`void`, `SqlError`, `SqlClient`\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`void`, `SqlError`, `SqlClient`\>

<a id="spawn"></a>

##### spawn

> `readonly` **spawn**: (`parentRunId`) => `Effect`\<`void`, `SqlError`, `SqlClient`\>

###### Parameters

###### parentRunId

`string`

###### Returns

`Effect`\<`void`, `SqlError`, `SqlClient`\>

***

<a id="sqlstoreoptions"></a>

### SqlStoreOptions

#### Extends

- [`LayerOptions`](../runtime/namespaces/Runtime#layeroptions)

#### Extended by

- [`Options`](../mysql/index#options)
- [`Options`](../pg/index#options)

#### Properties

<a id="activationprojection-1"></a>

##### activationProjection?

> `readonly` `optional` **activationProjection?**: [`RunActivationProjection`](#runactivationprojection)

Final-state callback executed synchronously inside each authoritative store transaction.

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`activationProjection`](../runtime/namespaces/Runtime#activationprojection)

<a id="addresses-1"></a>

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](../runtime/namespaces/Runtime#addressbinding)[]

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`addresses`](../runtime/namespaces/Runtime#addresses)

<a id="messagingpolicy-1"></a>

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](../runtime/namespaces/Messaging/namespaces/MessagingPolicy#service)

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`messagingPolicy`](../runtime/namespaces/Runtime#messagingpolicy)

<a id="scheduler-1"></a>

##### scheduler?

> `readonly` `optional` **scheduler?**: `object`

###### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`scheduler`](../runtime/namespaces/Runtime#scheduler)

<a id="source-6"></a>

##### source?

> `readonly` `optional` **source?**: `string`

<a id="subscriberqueuecapacity-1"></a>

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

###### Inherited from

[`LayerOptions`](../runtime/namespaces/Runtime#layeroptions).[`subscriberQueueCapacity`](../runtime/namespaces/Runtime#subscriberqueuecapacity)

***

<a id="sqlstorerunner"></a>

### SqlStoreRunner

#### Properties

<a id="run-2"></a>

##### run

> `readonly` **run**: [`SqlStoreRun`](#sqlstorerun)

<a id="runinspection"></a>

##### runInspection

> `readonly` **runInspection**: [`SqlStoreRun`](#sqlstorerun)

<a id="runnotransaction"></a>

##### runNoTransaction

> `readonly` **runNoTransaction**: [`SqlStoreRun`](#sqlstorerun)

<a id="transaction"></a>

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

<a id="transactionhub"></a>

##### transactionHub

> `readonly` **transactionHub**: [`EventHub`](#eventhub)

## Type Aliases

<a id="runactivation"></a>

### RunActivation

> **RunActivation** = \{ `attemptFence`: `number`; `intent`: `"execute"` \| `"cancel"`; `runId`: `string`; `runStatus`: `string`; \} \| \{ `intent`: `"inactive"`; `runId`: `string`; \}

Final executable disposition of a Run at a transaction boundary.

***

<a id="sqldriverstoreerror"></a>

### SqlDriverStoreError

> **SqlDriverStoreError** = [`SchemaDirty`](#schemadirty) \| [`SchemaChecksumMismatch`](#schemachecksummismatch) \| [`SchemaVersionUnsupported`](#schemaversionunsupported) \| [`SchemaUpgradeRequired`](#schemaupgraderequired) \| [`SchemaMigrationFailed`](#schemamigrationfailed)

***

<a id="sqliteruntimeservices"></a>

### SqliteRuntimeServices

> **SqliteRuntimeServices** = [`Runtime`](../runtime/namespaces/Runtime#runtime) \| [`RunStore`](../runtime/namespaces/RunStore#runstore) \| [`ExternalChildStore`](../unstable.runtime.external-child-store#externalchildstore) \| [`RunExecutor`](../runtime/namespaces/RunExecutor#runexecutor) \| [`LocalScheduler`](../runtime/namespaces/LocalScheduler#localscheduler)

Services constructed by an exclusive SQLite Runtime host.

***

<a id="sqlitestoreerror"></a>

### SqliteStoreError

> **SqliteStoreError** = [`SchemaDirty`](#schemadirty) \| [`SchemaChecksumMismatch`](#schemachecksummismatch) \| [`SchemaVersionUnsupported`](#schemaversionunsupported) \| [`SchemaMigrationFailed`](#schemamigrationfailed) \| [`MultiWorkerUnsupported`](../runtime/namespaces/Errors#multiworkerunsupported)

***

<a id="sqlruntimedriver"></a>

### SqlRuntimeDriver

> **SqlRuntimeDriver**\<`Error`\> = [`SqlStoreDriver`](#sqlstoredriver)\<`Error`\> & `object`

#### Type Declaration

##### claims

> `readonly` **claims**: `NonNullable`\<[`SqlStoreDriver`](#sqlstoredriver)\<`Error`\>\[`"claims"`\]\>

#### Type Parameters

##### Error

`Error`

***

<a id="sqlruntimeservices"></a>

### SqlRuntimeServices

> **SqlRuntimeServices** = [`Runtime`](../runtime/namespaces/Runtime#runtime) \| [`RunStore`](../runtime/namespaces/RunStore#runstore) \| [`RunClaims`](#runclaims) \| [`RunExecutor`](../runtime/namespaces/RunExecutor#runexecutor)

Services constructed by a multi-worker SQL Runtime adapter.

***

<a id="sqlstorerun"></a>

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

<a id="withoutsqlerror"></a>

### WithoutSqlError

> **WithoutSqlError**\<`E`\> = `Exclude`\<`E`, `E` & `object`\>

#### Type Parameters

##### E

`E`

## Variables

<a id="acquiresessionwriteclaim"></a>

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

<a id="checksqlmigrationidentity"></a>

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

<a id="checksqlschemameta"></a>

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

<a id="decoderuneffect"></a>

### decodeRunEffect

> `const` **decodeRunEffect**: (`row`) => `Effect.Effect`\<[`DecodedRun`](#decodedrun), [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

#### Parameters

##### row

[`RunRow`](#runrow)

#### Returns

`Effect.Effect`\<[`DecodedRun`](#decodedrun), [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable)\>

***

<a id="layersqliteruntime"></a>

### layerSqliteRuntime

> `const` **layerSqliteRuntime**: (`input`) => `Layer.Layer`\<[`SqliteRuntimeServices`](#sqliteruntimeservices), [`SqliteStoreError`](#sqlitestoreerror), `SqlClient.SqlClient` \| [`ExecutableResolver`](../runtime/namespaces/ExecutableResolver#executableresolver)\>

Assemble one exclusive SQLite host around Runtime's lifecycle kernel.

#### Parameters

##### input

[`SqliteRuntimeOptions`](#sqliteruntimeoptions)

#### Returns

`Layer.Layer`\<[`SqliteRuntimeServices`](#sqliteruntimeservices), [`SqliteStoreError`](#sqlitestoreerror), `SqlClient.SqlClient` \| [`ExecutableResolver`](../runtime/namespaces/ExecutableResolver#executableresolver)\>

***

<a id="layersqlitestore"></a>

### layerSqliteStore

> `const` **layerSqliteStore**: (`options`) => `Layer.Layer`\<[`RunStore`](../runtime/namespaces/RunStore#runstore) \| [`ExternalChildStore`](../unstable.runtime.external-child-store#externalchildstore), [`SqliteStoreError`](#sqlitestoreerror), `SqlClient.SqlClient`\>

#### Parameters

##### options

[`SqliteStoreOptions`](#sqlitestoreoptions)

#### Returns

`Layer.Layer`\<[`RunStore`](../runtime/namespaces/RunStore#runstore) \| [`ExternalChildStore`](../unstable.runtime.external-child-store#externalchildstore), [`SqliteStoreError`](#sqlitestoreerror), `SqlClient.SqlClient`\>

***

<a id="layersqlruntime"></a>

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

<a id="loadrun"></a>

### loadRun

> `const` **loadRun**: (`runId`) => `Effect.Effect`\<[`DecodedRun`](#decodedrun) \| `undefined`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| `SqlError`, `SqlClient.SqlClient`\>

#### Parameters

##### runId

`string`

#### Returns

`Effect.Effect`\<[`DecodedRun`](#decodedrun) \| `undefined`, [`RuntimeUnavailable`](../runtime/namespaces/Errors#runtimeunavailable) \| `SqlError`, `SqlClient.SqlClient`\>

***

<a id="makeexclusiveexecutionrecovery"></a>

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

<a id="mapsqlerror"></a>

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

<a id="plansqlschema"></a>

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

<a id="sql_logical_schema"></a>

### SQL\_LOGICAL\_SCHEMA

> `const` **SQL\_LOGICAL\_SCHEMA**: `SqlLogicalSchemaContract`

Dialect-neutral lifecycle inventory. Physical claim/lock indexes, MySQL's lock
table, and Cloudflare activation tables are deliberately adapter or host mechanics.

***

<a id="sql_schema_name"></a>

### SQL\_SCHEMA\_NAME

> `const` **SQL\_SCHEMA\_NAME**: `"generalist_runtime"` = `"generalist_runtime"`

The single logical SQL Runtime schema identity.

***

<a id="sql_schema_version"></a>

### SQL\_SCHEMA\_VERSION

> `const` **SQL\_SCHEMA\_VERSION**: `10` = `10`

The single logical SQL Runtime schema version.

***

<a id="sqlschemachecksum"></a>

### sqlSchemaChecksum

> `const` **sqlSchemaChecksum**: () => `string`

Stable checksum of the logical contract, independent of physical dialect DDL.

#### Returns

`string`

***

<a id="withconsistentsnapshot"></a>

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

<a id="withsql"></a>

### withSql

> `const` **withSql**: `WithSql`
