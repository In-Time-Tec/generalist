[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / LocalScheduler

# LocalScheduler

## Classes

### LocalScheduler

#### Extends

- `LocalScheduler_base`

#### Constructors

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

### Options

#### Properties

##### concurrency?

> `readonly` `optional` **concurrency?**: `number`

##### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

##### workerId

> `readonly` **workerId**: `string`

***

### Service

#### Properties

##### idle

> `readonly` **idle**: `Effect`\<`void`\>

Awaits every execution this scheduler admitted and has not yet observed finish.

##### reconcileCancellation

> `readonly` **reconcileCancellation**: (`runId`) => `Effect`\<`"settled"` \| `"deferred"` \| `"inactive"` \| `"stale"`, [`RuntimeUnavailable`](./Errors#runtimeunavailable), [`RunStore`](./RunStore#runstore)\>

Reconcile one cancellation without scanning the store.

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`"settled"` \| `"deferred"` \| `"inactive"` \| `"stale"`, [`RuntimeUnavailable`](./Errors#runtimeunavailable), [`RunStore`](./RunStore#runstore)\>

##### tick

> `readonly` **tick**: `Effect`\<`void`, `never`, [`RunStore`](./RunStore#runstore)\>
