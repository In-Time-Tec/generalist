[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / LocalScheduler

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

<a id="idle"></a>

##### idle

> `readonly` **idle**: `Effect`\<`void`\>

Awaits every execution this scheduler admitted and has not yet observed finish.

<a id="reconcilecancellation"></a>

##### reconcileCancellation

> `readonly` **reconcileCancellation**: (`runId`) => `Effect`\<`"settled"` \| `"deferred"` \| `"inactive"` \| `"stale"`, [`RuntimeUnavailable`](./Errors#runtimeunavailable), [`RunStore`](./RunStore#runstore)\>

Reconcile one cancellation without scanning the store.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`"settled"` \| `"deferred"` \| `"inactive"` \| `"stale"`, [`RuntimeUnavailable`](./Errors#runtimeunavailable), [`RunStore`](./RunStore#runstore)\>

<a id="tick"></a>

##### tick

> `readonly` **tick**: `Effect`\<`void`, `never`, [`RunStore`](./RunStore#runstore)\>
