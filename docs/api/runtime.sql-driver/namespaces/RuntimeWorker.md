[**generalist**](../../index)

***

[generalist](../../index) / [runtime.sql-driver](../index) / RuntimeWorker

# RuntimeWorker

## Classes

<a id="runtimeworker"></a>

### RuntimeWorker

#### Extends

- `RuntimeWorker_base`

#### Constructors

<a id="constructor"></a>

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

<a id="failure"></a>

### Failure

#### Properties

<a id="at"></a>

##### at

> `readonly` **at**: `number`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

***

<a id="options"></a>

### Options

#### Properties

<a id="cancellationinterval"></a>

##### cancellationInterval?

> `readonly` `optional` **cancellationInterval?**: `Input`

<a id="concurrency"></a>

##### concurrency?

> `readonly` `optional` **concurrency?**: `number`

<a id="fallbackinterval"></a>

##### fallbackInterval?

> `readonly` `optional` **fallbackInterval?**: `Input`

<a id="lease"></a>

##### lease?

> `readonly` `optional` **lease?**: `Input`

<a id="onclaim"></a>

##### onClaim?

> `readonly` `optional` **onClaim?**: (`claim`) => `Effect`\<`void`\>

###### Parameters

###### claim

[`ClaimedRun`](../index#claimedrun)

###### Returns

`Effect`\<`void`\>

<a id="workerid"></a>

##### workerId

> `readonly` **workerId**: `string`

***

<a id="service"></a>

### Service

#### Properties

<a id="active"></a>

##### active

> `readonly` **active**: `Effect`\<`number`\>

<a id="idle"></a>

##### idle

> `readonly` **idle**: `Effect`\<`void`\>

<a id="poll"></a>

##### poll

> `readonly` **poll**: `Effect`\<readonly [`ClaimedRun`](../index#claimedrun)[], [`RuntimeUnavailable`](../../runtime/namespaces/Errors#runtimeunavailable)\>

<a id="run"></a>

##### run

> `readonly` **run**: `Effect`\<`never`\>

<a id="status"></a>

##### status

> `readonly` **status**: `Effect`\<[`Status`](#status-1)\>

<a id="workerid-1"></a>

##### workerId

> `readonly` **workerId**: `string`

***

<a id="status-1"></a>

### Status

#### Properties

<a id="active-1"></a>

##### active

> `readonly` **active**: `number`

<a id="capacity"></a>

##### capacity

> `readonly` **capacity**: `number`

<a id="lastfailure"></a>

##### lastFailure

> `readonly` **lastFailure**: [`Failure`](#failure) \| `undefined`

<a id="lastfallbackat"></a>

##### lastFallbackAt

> `readonly` **lastFallbackAt**: `number` \| `undefined`

<a id="oldestclaimat"></a>

##### oldestClaimAt

> `readonly` **oldestClaimAt**: `number` \| `undefined`

<a id="scan"></a>

##### scan

> `readonly` **scan**: [`Scan`](#scan-1)

<a id="wakeup"></a>

##### wakeup

> `readonly` **wakeup**: [`Wakeup`](#wakeup-1)

## Type Aliases

<a id="scan-1"></a>

### Scan

> **Scan** = \{ `_tag`: `"Starting"`; \} \| \{ `_tag`: `"Succeeded"`; `at`: `number`; \} \| \{ `_tag`: `"Failed"`; `at`: `number`; `message`: `string`; \}

***

<a id="wakeup-1"></a>

### Wakeup

> **Wakeup** = \{ `_tag`: `"Starting"`; \} \| \{ `_tag`: `"Ready"`; `at`: `number`; \} \| \{ `_tag`: `"Failed"`; `at`: `number`; `message`: `string`; \}

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`RuntimeWorker`](#runtimeworker), `never`, [`RunClaims`](../index#runclaims) \| [`RunExecutor`](../../runtime/namespaces/RunExecutor#runexecutor) \| [`RunStore`](../../runtime/namespaces/RunStore#runstore)\>

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`RuntimeWorker`](#runtimeworker), `never`, [`RunClaims`](../index#runclaims) \| [`RunExecutor`](../../runtime/namespaces/RunExecutor#runexecutor) \| [`RunStore`](../../runtime/namespaces/RunStore#runstore)\>

***

<a id="make"></a>

### make

> `const` **make**: (`options`) => `Effect.Effect`\<[`Service`](#service), `never`, [`RunClaims`](../index#runclaims) \| [`RunExecutor`](../../runtime/namespaces/RunExecutor#runexecutor) \| [`RunStore`](../../runtime/namespaces/RunStore#runstore) \| `Scope.Scope`\>

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Effect.Effect`\<[`Service`](#service), `never`, [`RunClaims`](../index#runclaims) \| [`RunExecutor`](../../runtime/namespaces/RunExecutor#runexecutor) \| [`RunStore`](../../runtime/namespaces/RunStore#runstore) \| `Scope.Scope`\>
