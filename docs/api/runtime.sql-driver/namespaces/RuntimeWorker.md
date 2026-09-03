[**generalist**](../../index)

***

[generalist](../../index) / [runtime.sql-driver](../index) / RuntimeWorker

# RuntimeWorker

## Classes

### RuntimeWorker

#### Extends

- `RuntimeWorker_base`

#### Constructors

##### Constructor

> **new RuntimeWorker**(`_`): [`RuntimeWorker`](#runtimeworker)

###### Parameters

###### \_

`never`

###### Returns

[`RuntimeWorker`](#runtimeworker)

###### Inherited from

`RuntimeWorker_base.constructor`

## Interfaces

### Failure

#### Properties

##### at

> `readonly` **at**: `number`

##### message

> `readonly` **message**: `string`

***

### Options

#### Properties

##### cancellationInterval?

> `readonly` `optional` **cancellationInterval?**: `Input`

##### concurrency?

> `readonly` `optional` **concurrency?**: `number`

##### fallbackInterval?

> `readonly` `optional` **fallbackInterval?**: `Input`

##### lease?

> `readonly` `optional` **lease?**: `Input`

##### onClaim?

> `readonly` `optional` **onClaim?**: (`claim`) => `Effect`\<`void`\>

###### Parameters

###### claim

[`ClaimedRun`](../index#claimedrun)

###### Returns

`Effect`\<`void`\>

##### workerId

> `readonly` **workerId**: `string`

***

### Service

#### Properties

##### active

> `readonly` **active**: `Effect`\<`number`\>

##### idle

> `readonly` **idle**: `Effect`\<`void`\>

##### poll

> `readonly` **poll**: `Effect`\<readonly [`ClaimedRun`](../index#claimedrun)[], [`RuntimeUnavailable`](../../runtime/namespaces/Errors#runtimeunavailable)\>

##### run

> `readonly` **run**: `Effect`\<`never`\>

##### status

> `readonly` **status**: `Effect`\<[`Status`](#status-1)\>

##### workerId

> `readonly` **workerId**: `string`

***

### Status

#### Properties

##### active

> `readonly` **active**: `number`

##### capacity

> `readonly` **capacity**: `number`

##### lastFailure

> `readonly` **lastFailure**: [`Failure`](#failure) \| `undefined`

##### lastFallbackAt

> `readonly` **lastFallbackAt**: `number` \| `undefined`

##### oldestClaimAt

> `readonly` **oldestClaimAt**: `number` \| `undefined`

##### scan

> `readonly` **scan**: [`Scan`](#scan-1)

##### wakeup

> `readonly` **wakeup**: [`Wakeup`](#wakeup-1)

## Type Aliases

### Scan

> **Scan** = \{ `_tag`: `"Starting"`; \} \| \{ `_tag`: `"Succeeded"`; `at`: `number`; \} \| \{ `_tag`: `"Failed"`; `at`: `number`; `message`: `string`; \}

***

### Wakeup

> **Wakeup** = \{ `_tag`: `"Starting"`; \} \| \{ `_tag`: `"Ready"`; `at`: `number`; \} \| \{ `_tag`: `"Failed"`; `at`: `number`; `message`: `string`; \}

## Variables

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`RuntimeWorker`](#runtimeworker), `never`, [`RunClaims`](../index#runclaims) \| [`RunExecutor`](../../runtime/namespaces/RunExecutor#runexecutor) \| [`RunStore`](../../runtime/namespaces/RunStore#runstore)\>

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`RuntimeWorker`](#runtimeworker), `never`, [`RunClaims`](../index#runclaims) \| [`RunExecutor`](../../runtime/namespaces/RunExecutor#runexecutor) \| [`RunStore`](../../runtime/namespaces/RunStore#runstore)\>

***

### make

> `const` **make**: (`options`) => `Effect.Effect`\<[`Service`](#service), `never`, [`RunClaims`](../index#runclaims) \| [`RunExecutor`](../../runtime/namespaces/RunExecutor#runexecutor) \| [`RunStore`](../../runtime/namespaces/RunStore#runstore) \| `Scope.Scope`\>

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Effect.Effect`\<[`Service`](#service), `never`, [`RunClaims`](../index#runclaims) \| [`RunExecutor`](../../runtime/namespaces/RunExecutor#runexecutor) \| [`RunStore`](../../runtime/namespaces/RunStore#runstore) \| `Scope.Scope`\>
