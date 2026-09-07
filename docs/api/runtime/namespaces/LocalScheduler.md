[**generalist**](../../index.md)

***

[generalist](../../index.md) / [runtime](../index.md) / LocalScheduler

# LocalScheduler

## Classes

<a id="localscheduler"></a>

### LocalScheduler

#### Extends

- `LocalScheduler_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new LocalScheduler**(`_`): [`LocalScheduler`](#localscheduler)

###### Parameters

###### \_

`never`

###### Returns

[`LocalScheduler`](#localscheduler)

###### Inherited from

`LocalScheduler_base.constructor`

## Interfaces

<a id="drainresult"></a>

### DrainResult

#### Properties

<a id="hasmore"></a>

##### hasMore

> `readonly` **hasMore**: `boolean`

More work may remain; a full fuel window requires another drain.

<a id="nextdueat"></a>

##### nextDueAt?

> `readonly` `optional` **nextDueAt?**: `number`

Earliest canonical timeout, schedule, or ownership expiry when known.

<a id="processed"></a>

##### processed

> `readonly` **processed**: `number`

Authoritative candidates examined, bounded by the supplied fuel.

***

<a id="options"></a>

### Options

#### Properties

<a id="concurrency"></a>

##### concurrency?

> `readonly` `optional` **concurrency?**: `number`

<a id="pollinterval"></a>

##### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

<a id="workerid"></a>

##### workerId

> `readonly` **workerId**: `string`

***

<a id="service"></a>

### Service

#### Properties

<a id="drain"></a>

##### drain

> `readonly` **drain**: (`options?`) => `Effect`\<[`DrainResult`](#drainresult), [`StartExecutionError`](./Runtime.md#startexecutionerror), [`RunStore`](./RunStore.md#runstore)\>

###### Parameters

###### options?

###### fuel?

`number`

###### Returns

`Effect`\<[`DrainResult`](#drainresult), [`StartExecutionError`](./Runtime.md#startexecutionerror), [`RunStore`](./RunStore.md#runstore)\>

<a id="idle"></a>

##### idle

> `readonly` **idle**: `Effect`\<`void`, [`StartExecutionError`](./Runtime.md#startexecutionerror)\>

Awaits every execution this scheduler admitted and has not yet observed finish.

<a id="reconcilecancellation"></a>

##### reconcileCancellation

> `readonly` **reconcileCancellation**: (`runId`) => `Effect`\<`"settled"` \| `"deferred"` \| `"inactive"` \| `"stale"`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable), [`RunStore`](./RunStore.md#runstore)\>

Reconcile one cancellation without scanning the store.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`"settled"` \| `"deferred"` \| `"inactive"` \| `"stale"`, [`DurabilityFailure`](../../durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./Errors.md#runtimeunavailable), [`RunStore`](./RunStore.md#runstore)\>

<a id="tick"></a>

##### tick

> `readonly` **tick**: `Effect`\<`void`, [`StartExecutionError`](./Runtime.md#startexecutionerror), [`RunStore`](./RunStore.md#runstore)\>
