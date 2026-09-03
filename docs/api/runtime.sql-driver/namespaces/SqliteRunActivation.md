[**generalist**](../../index)

***

[generalist](../../index) / [runtime.sql-driver](../index) / SqliteRunActivation

# SqliteRunActivation

## Interfaces

### DrainOptions

#### Properties

##### cancelRetryMillis?

> `readonly` `optional` **cancelRetryMillis?**: `number`

##### fuel

> `readonly` **fuel**: `number`

##### ownerId

> `readonly` **ownerId**: `string`

##### rearm

> `readonly` **rearm**: [`Rearm`](#rearm-1)

***

### DrainResult

#### Properties

##### hasMore

> `readonly` **hasMore**: `boolean`

##### nextDueAt?

> `readonly` `optional` **nextDueAt?**: `number`

##### outcomes

> `readonly` **outcomes**: readonly `object`[]

##### processed

> `readonly` **processed**: `number`

## Type Aliases

### Rearm

> **Rearm** = `Effect.Effect`\<`void`, [`RuntimeUnavailable`](../../runtime/namespaces/Errors#runtimeunavailable)\>

Transaction-local callback which rearms a host wake mechanism.

## Variables

### createSchema

> `const` **createSchema**: `Effect.Effect`\<`void`, `SqlError.SqlError`, `SqlClient.SqlClient`\>

Create the durable candidate projection schema for an exclusive SQLite Runtime host.

***

### drain

> `const` **drain**: (`options`) => `Effect.Effect`\<[`DrainResult`](#drainresult), [`RuntimeUnavailable`](../../runtime/namespaces/Errors#runtimeunavailable) \| `SqlError.SqlError`, `SqlClient.SqlClient` \| [`RunStore`](../../runtime/namespaces/RunStore#runstore) \| [`RunExecutor`](../../runtime/namespaces/RunExecutor#runexecutor) \| [`LocalScheduler`](../../runtime/namespaces/LocalScheduler#localscheduler)\>

Drain a deterministic bounded batch; authoritative claiming follows candidate reads.

#### Parameters

##### options

[`DrainOptions`](#drainoptions)

#### Returns

`Effect.Effect`\<[`DrainResult`](#drainresult), [`RuntimeUnavailable`](../../runtime/namespaces/Errors#runtimeunavailable) \| `SqlError.SqlError`, `SqlClient.SqlClient` \| [`RunStore`](../../runtime/namespaces/RunStore#runstore) \| [`RunExecutor`](../../runtime/namespaces/RunExecutor#runexecutor) \| [`LocalScheduler`](../../runtime/namespaces/LocalScheduler#localscheduler)\>

***

### initialize

> `const` **initialize**: (`rearm`) => `Effect.Effect`\<`void`, [`RuntimeUnavailable`](../../runtime/namespaces/Errors#runtimeunavailable), `SqlClient.SqlClient`\>

Create, backfill, and rearm durable candidates in the caller's transaction.

#### Parameters

##### rearm

[`Rearm`](#rearm-1)

#### Returns

`Effect.Effect`\<`void`, [`RuntimeUnavailable`](../../runtime/namespaces/Errors#runtimeunavailable), `SqlClient.SqlClient`\>

***

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

### nextDueAt

> `const` **nextDueAt**: `Effect.Effect`\<`number` \| `undefined`, `SqlError.SqlError`, `SqlClient.SqlClient`\>

Earliest durable candidate wake.
