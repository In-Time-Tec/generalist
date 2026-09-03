[**generalist**](../../index)

***

[generalist](../../index) / [runtime.sql-driver](../index) / SqliteRunActivation

# SqliteRunActivation

## Interfaces

<a id="drainoptions"></a>

### DrainOptions

#### Properties

<a id="cancelretrymillis"></a>

##### cancelRetryMillis?

> `readonly` `optional` **cancelRetryMillis?**: `number`

<a id="fuel"></a>

##### fuel

> `readonly` **fuel**: `number`

<a id="ownerid"></a>

##### ownerId

> `readonly` **ownerId**: `string`

<a id="rearm"></a>

##### rearm

> `readonly` **rearm**: [`Rearm`](#rearm-1)

***

<a id="drainresult"></a>

### DrainResult

#### Properties

<a id="hasmore"></a>

##### hasMore

> `readonly` **hasMore**: `boolean`

<a id="nextdueat"></a>

##### nextDueAt?

> `readonly` `optional` **nextDueAt?**: `number`

<a id="outcomes"></a>

##### outcomes

> `readonly` **outcomes**: readonly `object`[]

<a id="processed"></a>

##### processed

> `readonly` **processed**: `number`

## Type Aliases

<a id="rearm-1"></a>

### Rearm

> **Rearm** = `Effect.Effect`\<`void`, [`RuntimeUnavailable`](../../runtime/namespaces/Errors#runtimeunavailable)\>

Transaction-local callback which rearms a host wake mechanism.

## Variables

<a id="createschema"></a>

### createSchema

> `const` **createSchema**: `Effect.Effect`\<`void`, `SqlError.SqlError`, `SqlClient.SqlClient`\>

Create the durable candidate projection schema for an exclusive SQLite Runtime host.

***

<a id="drain"></a>

### drain

> `const` **drain**: (`options`) => `Effect.Effect`\<[`DrainResult`](#drainresult), [`RuntimeUnavailable`](../../runtime/namespaces/Errors#runtimeunavailable) \| `SqlError.SqlError`, `SqlClient.SqlClient` \| [`RunStore`](../../runtime/namespaces/RunStore#runstore) \| [`RunExecutor`](../../runtime/namespaces/RunExecutor#runexecutor) \| [`LocalScheduler`](../../runtime/namespaces/LocalScheduler#localscheduler)\>

Drain a deterministic bounded batch; authoritative claiming follows candidate reads.

#### Parameters

##### options

[`DrainOptions`](#drainoptions)

#### Returns

`Effect.Effect`\<[`DrainResult`](#drainresult), [`RuntimeUnavailable`](../../runtime/namespaces/Errors#runtimeunavailable) \| `SqlError.SqlError`, `SqlClient.SqlClient` \| [`RunStore`](../../runtime/namespaces/RunStore#runstore) \| [`RunExecutor`](../../runtime/namespaces/RunExecutor#runexecutor) \| [`LocalScheduler`](../../runtime/namespaces/LocalScheduler#localscheduler)\>

***

<a id="initialize"></a>

### initialize

> `const` **initialize**: (`rearm`) => `Effect.Effect`\<`void`, [`RuntimeUnavailable`](../../runtime/namespaces/Errors#runtimeunavailable), `SqlClient.SqlClient`\>

Create, backfill, and rearm durable candidates in the caller's transaction.

#### Parameters

##### rearm

[`Rearm`](#rearm-1)

#### Returns

`Effect.Effect`\<`void`, [`RuntimeUnavailable`](../../runtime/namespaces/Errors#runtimeunavailable), `SqlClient.SqlClient`\>

***

<a id="makeprojection"></a>

### makeProjection

> `const` **makeProjection**: \{(`sqlClient`, `rearm`): [`RunActivationProjection`](../index#runactivationprojection); (`rearm`): (`sqlClient`) => [`RunActivationProjection`](../index#runactivationprojection); \}

Construct the durable candidate projection over the current SQL transaction.

#### Call Signature

> (`sqlClient`, `rearm`): [`RunActivationProjection`](../index#runactivationprojection)

##### Parameters

###### sqlClient

`SqlClient`

###### rearm

[`Rearm`](#rearm-1)

##### Returns

[`RunActivationProjection`](../index#runactivationprojection)

#### Call Signature

> (`rearm`): (`sqlClient`) => [`RunActivationProjection`](../index#runactivationprojection)

##### Parameters

###### rearm

[`Rearm`](#rearm-1)

##### Returns

(`sqlClient`) => [`RunActivationProjection`](../index#runactivationprojection)

***

<a id="nextdueat-1"></a>

### nextDueAt

> `const` **nextDueAt**: `Effect.Effect`\<`number` \| `undefined`, `SqlError.SqlError`, `SqlClient.SqlClient`\>

Earliest durable candidate wake.
