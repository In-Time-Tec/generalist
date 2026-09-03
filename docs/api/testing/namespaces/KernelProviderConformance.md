[**generalist**](../../index)

***

[generalist](../../index) / [testing](../index) / KernelProviderConformance

# KernelProviderConformance

Reusable KernelPool provider lifecycle and remote ownership conformance.

## Interfaces

<a id="harness"></a>

### Harness

One fresh provider instance used by the shared KernelPool lifecycle guarantees.

#### Extended by

- [`RemoteHarness`](#remoteharness)

#### Properties

<a id="pool"></a>

##### pool

> `readonly` **pool**: [`Service`](../../repl/namespaces/KernelPool#service)

<a id="profile"></a>

##### profile

> `readonly` **profile**: `object`

###### bindingsDigest

> `readonly` **bindingsDigest**: `string`

###### checkpoints

> `readonly` **checkpoints**: `object`

###### checkpoints.filesystem

> `readonly` **filesystem**: `boolean`

###### checkpoints.liveProcess

> `readonly` **liveProcess**: `boolean`

###### checkpoints.namespace

> `readonly` **namespace**: `boolean`

###### contractVersion

> `readonly` **contractVersion**: `2`

###### image

> `readonly` **image**: `object`

###### image.digest

> `readonly` **digest**: `string`

###### image.kind

> `readonly` **kind**: `"image"` \| `"runtime"` \| `"template"`

###### image.reference

> `readonly` **reference**: `string`

###### isolation

> `readonly` **isolation**: `"container"` \| `"microvm"` \| `"host-process"`

###### limits

> `readonly` **limits**: `object`

###### limits.cellDeadlineMillis

> `readonly` **cellDeadlineMillis**: `number`

###### limits.sourceBytes

> `readonly` **sourceBytes**: `number`

###### protocolVersion

> `readonly` **protocolVersion**: `1`

###### provider

> `readonly` **provider**: `string`

###### runtime

> `readonly` **runtime**: `object`

###### runtime.digest

> `readonly` **digest**: `string`

###### runtime.name

> `readonly` **name**: `string`

###### runtime.version

> `readonly` **version**: `string`

###### workspace

> `readonly` **workspace**: `object`

###### workspace.dataRoot

> `readonly` **dataRoot**: `string`

###### workspace.root

> `readonly` **root**: `string`

<a id="resourcecount"></a>

##### resourceCount

> `readonly` **resourceCount**: `Effect`\<`number`\>

Number of live or paused provider resources owned by this isolated fixture.

***

<a id="options"></a>

### Options

Configuration for the reusable provider conformance suite.

#### Type Parameters

##### CommonError

`CommonError` = `never`

##### RemoteError

`RemoteError` = `never`

#### Properties

<a id="live"></a>

##### live?

> `readonly` `optional` **live?**: `boolean`

Use Effect's live clock for providers whose process lifecycle depends on real time.

<a id="make"></a>

##### make

> `readonly` **make**: `Effect`\<[`Harness`](#harness), `CommonError`, `Scope`\>

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="remote"></a>

##### remote?

> `readonly` `optional` **remote?**: `Effect`\<[`RemoteHarness`](#remoteharness), `RemoteError`, `Scope`\>

<a id="skip"></a>

##### skip?

> `readonly` `optional` **skip?**: `boolean`

***

<a id="remoteharness"></a>

### RemoteHarness

Additional two-host and provider lifecycle controls required by remote conformance.

#### Extends

- [`Harness`](#harness)

#### Properties

<a id="authority"></a>

##### authority

> `readonly` **authority**: [`Service`](../../repl/namespaces/KernelResourceAuthority#service)

<a id="changedprofile"></a>

##### changedProfile

> `readonly` **changedProfile**: `object`

###### bindingsDigest

> `readonly` **bindingsDigest**: `string`

###### checkpoints

> `readonly` **checkpoints**: `object`

###### checkpoints.filesystem

> `readonly` **filesystem**: `boolean`

###### checkpoints.liveProcess

> `readonly` **liveProcess**: `boolean`

###### checkpoints.namespace

> `readonly` **namespace**: `boolean`

###### contractVersion

> `readonly` **contractVersion**: `2`

###### image

> `readonly` **image**: `object`

###### image.digest

> `readonly` **digest**: `string`

###### image.kind

> `readonly` **kind**: `"image"` \| `"runtime"` \| `"template"`

###### image.reference

> `readonly` **reference**: `string`

###### isolation

> `readonly` **isolation**: `"container"` \| `"microvm"` \| `"host-process"`

###### limits

> `readonly` **limits**: `object`

###### limits.cellDeadlineMillis

> `readonly` **cellDeadlineMillis**: `number`

###### limits.sourceBytes

> `readonly` **sourceBytes**: `number`

###### protocolVersion

> `readonly` **protocolVersion**: `1`

###### provider

> `readonly` **provider**: `string`

###### runtime

> `readonly` **runtime**: `object`

###### runtime.digest

> `readonly` **digest**: `string`

###### runtime.name

> `readonly` **name**: `string`

###### runtime.version

> `readonly` **version**: `string`

###### workspace

> `readonly` **workspace**: `object`

###### workspace.dataRoot

> `readonly` **dataRoot**: `string`

###### workspace.root

> `readonly` **root**: `string`

<a id="changedprofilehost"></a>

##### changedProfileHost

> `readonly` **changedProfileHost**: [`Service`](../../repl/namespaces/KernelPool#service)

<a id="executioncount"></a>

##### executionCount

> `readonly` **executionCount**: (`sessionId`, `cellId`) => `Effect`\<`number`\>

###### Parameters

###### sessionId

`string`

###### cellId

`string`

###### Returns

`Effect`\<`number`\>

<a id="expire"></a>

##### expire

> `readonly` **expire**: (`sessionId`) => `Effect`\<`void`\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<`void`\>

<a id="failnextdeletion"></a>

##### failNextDeletion

> `readonly` **failNextDeletion**: `Effect`\<`void`\>

<a id="forbiddenmodeltext"></a>

##### forbiddenModelText

> `readonly` **forbiddenModelText**: readonly `string`[]

Exact host-only values that must never occur in a profile, event, failure, or result.

<a id="hostb"></a>

##### hostB

> `readonly` **hostB**: [`Service`](../../repl/namespaces/KernelPool#service)

<a id="losenextconnection"></a>

##### loseNextConnection

> `readonly` **loseNextConnection**: (`loss`) => `Effect`\<`void`\>

###### Parameters

###### loss

[`ConnectionLoss`](#connectionloss)

###### Returns

`Effect`\<`void`\>

<a id="pause"></a>

##### pause

> `readonly` **pause**: (`sessionId`) => `Effect`\<`boolean`, [`CellExecutionFailed`](../../repl/namespaces/Cell#cellexecutionfailed) \| [`KernelUnavailable`](../../repl/namespaces/Cell#kernelunavailable) \| [`KernelProtocolViolation`](../../repl/namespaces/Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](../../repl/namespaces/Cell#celloutcomeunknown)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<`boolean`, [`CellExecutionFailed`](../../repl/namespaces/Cell#cellexecutionfailed) \| [`KernelUnavailable`](../../repl/namespaces/Cell#kernelunavailable) \| [`KernelProtocolViolation`](../../repl/namespaces/Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](../../repl/namespaces/Cell#celloutcomeunknown)\>

<a id="pool-1"></a>

##### pool

> `readonly` **pool**: [`Service`](../../repl/namespaces/KernelPool#service)

###### Inherited from

[`Harness`](#harness).[`pool`](#pool)

<a id="profile-1"></a>

##### profile

> `readonly` **profile**: `object`

###### bindingsDigest

> `readonly` **bindingsDigest**: `string`

###### checkpoints

> `readonly` **checkpoints**: `object`

###### checkpoints.filesystem

> `readonly` **filesystem**: `boolean`

###### checkpoints.liveProcess

> `readonly` **liveProcess**: `boolean`

###### checkpoints.namespace

> `readonly` **namespace**: `boolean`

###### contractVersion

> `readonly` **contractVersion**: `2`

###### image

> `readonly` **image**: `object`

###### image.digest

> `readonly` **digest**: `string`

###### image.kind

> `readonly` **kind**: `"image"` \| `"runtime"` \| `"template"`

###### image.reference

> `readonly` **reference**: `string`

###### isolation

> `readonly` **isolation**: `"container"` \| `"microvm"` \| `"host-process"`

###### limits

> `readonly` **limits**: `object`

###### limits.cellDeadlineMillis

> `readonly` **cellDeadlineMillis**: `number`

###### limits.sourceBytes

> `readonly` **sourceBytes**: `number`

###### protocolVersion

> `readonly` **protocolVersion**: `1`

###### provider

> `readonly` **provider**: `string`

###### runtime

> `readonly` **runtime**: `object`

###### runtime.digest

> `readonly` **digest**: `string`

###### runtime.name

> `readonly` **name**: `string`

###### runtime.version

> `readonly` **version**: `string`

###### workspace

> `readonly` **workspace**: `object`

###### workspace.dataRoot

> `readonly` **dataRoot**: `string`

###### workspace.root

> `readonly` **root**: `string`

###### Inherited from

[`Harness`](#harness).[`profile`](#profile)

<a id="resourcecount-1"></a>

##### resourceCount

> `readonly` **resourceCount**: `Effect`\<`number`\>

Number of live or paused provider resources owned by this isolated fixture.

###### Inherited from

[`Harness`](#harness).[`resourceCount`](#resourcecount)

<a id="retrycleanup"></a>

##### retryCleanup

> `readonly` **retryCleanup**: `Effect`\<`void`, [`CellExecutionFailed`](../../repl/namespaces/Cell#cellexecutionfailed) \| [`KernelUnavailable`](../../repl/namespaces/Cell#kernelunavailable) \| [`KernelProtocolViolation`](../../repl/namespaces/Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](../../repl/namespaces/Cell#celloutcomeunknown)\>

## Type Aliases

<a id="connectionloss"></a>

### ConnectionLoss

> **ConnectionLoss** = `"before-admission"` \| `"after-admission"` \| `"after-result"`

Deterministic failure positions a remote provider harness must be able to inject.

## Variables

<a id="kernelproviderconformance"></a>

### kernelProviderConformance

> `const` **kernelProviderConformance**: \<`CommonError`, `RemoteError`\>(`options`) => `void`

Register the shared KernelPool provider contract and optional remote guarantees.

#### Type Parameters

##### CommonError

`CommonError`

##### RemoteError

`RemoteError`

#### Parameters

##### options

[`Options`](#options)\<`CommonError`, `RemoteError`\>

#### Returns

`void`
