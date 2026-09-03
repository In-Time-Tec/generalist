[**generalist**](../../index)

***

[generalist](../../index) / [testing](../index) / KernelProviderConformance

# KernelProviderConformance

Reusable KernelPool provider lifecycle and remote ownership conformance.

## Interfaces

### Harness

One fresh provider instance used by the shared KernelPool lifecycle guarantees.

#### Extended by

- [`RemoteHarness`](#remoteharness)

#### Properties

##### pool

> `readonly` **pool**: [`Service`](../../repl/namespaces/KernelPool#service)

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

##### resourceCount

> `readonly` **resourceCount**: `Effect`\<`number`\>

Number of live or paused provider resources owned by this isolated fixture.

***

### Options

Configuration for the reusable provider conformance suite.

#### Type Parameters

##### CommonError

`CommonError` = `never`

##### RemoteError

`RemoteError` = `never`

#### Properties

##### live?

> `readonly` `optional` **live?**: `boolean`

Use Effect's live clock for providers whose process lifecycle depends on real time.

##### make

> `readonly` **make**: `Effect`\<[`Harness`](#harness), `CommonError`, `Scope`\>

##### name

> `readonly` **name**: `string`

##### remote?

> `readonly` `optional` **remote?**: `Effect`\<[`RemoteHarness`](#remoteharness), `RemoteError`, `Scope`\>

##### skip?

> `readonly` `optional` **skip?**: `boolean`

***

### RemoteHarness

Additional two-host and provider lifecycle controls required by remote conformance.

#### Extends

- [`Harness`](#harness)

#### Properties

##### authority

> `readonly` **authority**: [`Service`](../../repl/namespaces/KernelResourceAuthority#service)

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

##### changedProfileHost

> `readonly` **changedProfileHost**: [`Service`](../../repl/namespaces/KernelPool#service)

##### executionCount

> `readonly` **executionCount**: (`sessionId`, `cellId`) => `Effect`\<`number`\>

###### Parameters

###### sessionId

`string`

###### cellId

`string`

###### Returns

`Effect`\<`number`\>

##### expire

> `readonly` **expire**: (`sessionId`) => `Effect`\<`void`\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<`void`\>

##### failNextDeletion

> `readonly` **failNextDeletion**: `Effect`\<`void`\>

##### forbiddenModelText

> `readonly` **forbiddenModelText**: readonly `string`[]

Exact host-only values that must never occur in a profile, event, failure, or result.

##### hostB

> `readonly` **hostB**: [`Service`](../../repl/namespaces/KernelPool#service)

##### loseNextConnection

> `readonly` **loseNextConnection**: (`loss`) => `Effect`\<`void`\>

###### Parameters

###### loss

[`ConnectionLoss`](#connectionloss)

###### Returns

`Effect`\<`void`\>

##### pause

> `readonly` **pause**: (`sessionId`) => `Effect`\<`boolean`, [`CellExecutionFailed`](../../repl/namespaces/Cell#cellexecutionfailed) \| [`KernelUnavailable`](../../repl/namespaces/Cell#kernelunavailable) \| [`KernelProtocolViolation`](../../repl/namespaces/Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](../../repl/namespaces/Cell#celloutcomeunknown)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<`boolean`, [`CellExecutionFailed`](../../repl/namespaces/Cell#cellexecutionfailed) \| [`KernelUnavailable`](../../repl/namespaces/Cell#kernelunavailable) \| [`KernelProtocolViolation`](../../repl/namespaces/Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](../../repl/namespaces/Cell#celloutcomeunknown)\>

##### pool

> `readonly` **pool**: [`Service`](../../repl/namespaces/KernelPool#service)

###### Inherited from

[`Harness`](#harness).[`pool`](#pool)

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

##### resourceCount

> `readonly` **resourceCount**: `Effect`\<`number`\>

Number of live or paused provider resources owned by this isolated fixture.

###### Inherited from

[`Harness`](#harness).[`resourceCount`](#resourcecount)

##### retryCleanup

> `readonly` **retryCleanup**: `Effect`\<`void`, [`CellExecutionFailed`](../../repl/namespaces/Cell#cellexecutionfailed) \| [`KernelUnavailable`](../../repl/namespaces/Cell#kernelunavailable) \| [`KernelProtocolViolation`](../../repl/namespaces/Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](../../repl/namespaces/Cell#celloutcomeunknown)\>

## Type Aliases

### ConnectionLoss

> **ConnectionLoss** = `"before-admission"` \| `"after-admission"` \| `"after-result"`

Deterministic failure positions a remote provider harness must be able to inject.

## Variables

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
