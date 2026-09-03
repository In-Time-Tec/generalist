[**generalist**](../../index)

***

[generalist](../../index) / [repl](../index) / TestKernel

# TestKernel

## Interfaces

<a id="memoryresourceauthority"></a>

### MemoryResourceAuthority

In-memory resource authority controls used only by deterministic provider tests.

#### Extends

- [`Service`](./KernelResourceAuthority#service)

#### Properties

<a id="acquire"></a>

##### acquire

> `readonly` **acquire**: (`request`) => `Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Parameters

###### request

[`AcquireRequest`](./KernelResourceAuthority#acquirerequest)

###### Returns

`Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Inherited from

[`Service`](./KernelResourceAuthority#service).[`acquire`](./KernelResourceAuthority#acquire)

<a id="admit"></a>

##### admit

> `readonly` **admit**: (`request`) => `Effect`\<\{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Parameters

###### request

[`AdmitRequest`](./KernelResourceAuthority#admitrequest)

###### Returns

`Effect`\<\{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Inherited from

[`Service`](./KernelResourceAuthority#service).[`admit`](./KernelResourceAuthority#admit)

<a id="bind"></a>

##### bind

> `readonly` **bind**: (`request`) => `Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Parameters

###### request

[`BindRequest`](./KernelResourceAuthority#bindrequest)

###### Returns

`Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Inherited from

[`Service`](./KernelResourceAuthority#service).[`bind`](./KernelResourceAuthority#bind)

<a id="confirmdeletion"></a>

##### confirmDeletion

> `readonly` **confirmDeletion**: (`request`) => `Effect`\<`void`, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Parameters

###### request

[`DeletionRequest`](./KernelResourceAuthority#deletionrequest)

###### Returns

`Effect`\<`void`, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Inherited from

[`Service`](./KernelResourceAuthority#service).[`confirmDeletion`](./KernelResourceAuthority#confirmdeletion)

<a id="expire"></a>

##### expire

> `readonly` **expire**: (`sessionId`) => `Effect`\<`void`\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<`void`\>

<a id="faildeletion"></a>

##### failDeletion

> `readonly` **failDeletion**: (`request`, `message`) => `Effect`\<\{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Parameters

###### request

[`DeletionRequest`](./KernelResourceAuthority#deletionrequest)

###### message

`string`

###### Returns

`Effect`\<\{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Inherited from

[`Service`](./KernelResourceAuthority#service).[`failDeletion`](./KernelResourceAuthority#faildeletion)

<a id="finish"></a>

##### finish

> `readonly` **finish**: (`request`) => `Effect`\<`void`, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Parameters

###### request

[`FinishRequest`](./KernelResourceAuthority#finishrequest)

###### Returns

`Effect`\<`void`, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Inherited from

[`Service`](./KernelResourceAuthority#service).[`finish`](./KernelResourceAuthority#finish)

<a id="inspect"></a>

##### inspect

> `readonly` **inspect**: (`sessionId`) => `Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \} \| `undefined`, [`KernelResourceAuthorityUnavailable`](./KernelResourceAuthority#kernelresourceauthorityunavailable)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \} \| `undefined`, [`KernelResourceAuthorityUnavailable`](./KernelResourceAuthority#kernelresourceauthorityunavailable)\>

###### Inherited from

[`Service`](./KernelResourceAuthority#service).[`inspect`](./KernelResourceAuthority#inspect)

<a id="pendingdeletion"></a>

##### pendingDeletion

> `readonly` **pendingDeletion**: `Effect`\<readonly `object`[], [`KernelResourceAuthorityUnavailable`](./KernelResourceAuthority#kernelresourceauthorityunavailable)\>

###### Inherited from

[`Service`](./KernelResourceAuthority#service).[`pendingDeletion`](./KernelResourceAuthority#pendingdeletion)

<a id="renew"></a>

##### renew

> `readonly` **renew**: (`claim`, `leaseMillis`) => `Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Parameters

###### claim

###### generation

`number`

###### ownerId

`string`

###### sessionId

`string`

###### leaseMillis

`number`

###### Returns

`Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Inherited from

[`Service`](./KernelResourceAuthority#service).[`renew`](./KernelResourceAuthority#renew)

<a id="revoke"></a>

##### revoke

> `readonly` **revoke**: (`claim`) => `Effect`\<\{ `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; \} \| `undefined`, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Parameters

###### claim

###### generation

`number`

###### ownerId

`string`

###### sessionId

`string`

###### Returns

`Effect`\<\{ `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; \} \| `undefined`, [`KernelResourceFailure`](./KernelResourceAuthority#kernelresourcefailure)\>

###### Inherited from

[`Service`](./KernelResourceAuthority#service).[`revoke`](./KernelResourceAuthority#revoke)

***

<a id="testpooloptions"></a>

### TestPoolOptions

#### Properties

<a id="bindings"></a>

##### bindings?

> `readonly` `optional` **bindings?**: readonly [`Binding`](./KernelPool#binding)[]

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

<a id="script"></a>

##### script?

> `readonly` `optional` **script?**: (`request`) => [`Script`](#script-1)

###### Parameters

###### request

[`ExecuteRequest`](./KernelPool#executerequest)

###### Returns

[`Script`](#script-1)

## Type Aliases

<a id="script-1"></a>

### Script

> **Script** = \{ `_tag`: `"Value"`; `stderr?`: `string`; `stdout?`: `string`; `value`: `string`; \} \| \{ `_tag`: `"Throw"`; `message`: `string`; `name`: `string`; `stderr?`: `string`; \} \| \{ `_tag`: `"Failure"`; `failure`: [`CellFailure`](./Cell#cellfailure); \}

What the scripted pool does with one cell.

## Variables

<a id="layermemoryresourceauthority"></a>

### layerMemoryResourceAuthority

> `const` **layerMemoryResourceAuthority**: `Layer.Layer`\<[`KernelResourceAuthority`](./KernelResourceAuthority#kernelresourceauthority)\>

***

<a id="layermemorystore"></a>

### layerMemoryStore

> `const` **layerMemoryStore**: `Layer.Layer`\<[`KernelSnapshotStore`](./KernelSnapshotStore#kernelsnapshotstore)\>

***

<a id="layertestpool"></a>

### layerTestPool

> `const` **layerTestPool**: (`options`) => `Layer.Layer`\<[`KernelPool`](./KernelPool#kernelpool)\>

#### Parameters

##### options

[`TestPoolOptions`](#testpooloptions)

#### Returns

`Layer.Layer`\<[`KernelPool`](./KernelPool#kernelpool)\>

***

<a id="layertestsandbox"></a>

### layerTestSandbox

> `const` **layerTestSandbox**: (`options`) => `Layer.Layer`\<[`SandboxProvider`](../../sandbox#sandboxprovider)\>

A process-local Sandbox fake backed by TestKernel. It does not model an independent
security boundary and must not be used to certify a production provider.

#### Parameters

##### options

[`TestPoolOptions`](#testpooloptions)

#### Returns

`Layer.Layer`\<[`SandboxProvider`](../../sandbox#sandboxprovider)\>

***

<a id="makememoryresourceauthority"></a>

### makeMemoryResourceAuthority

> `const` **makeMemoryResourceAuthority**: `Effect.Effect`\<[`MemoryResourceAuthority`](#memoryresourceauthority)\>

An atomic in-memory KernelResourceAuthority. It models ownership, command admission,
takeover reconciliation, and retained cleanup without pretending to be durable storage.

***

<a id="makememorystore"></a>

### makeMemoryStore

> `const` **makeMemoryStore**: `Effect.Effect`\<[`Service`](./KernelSnapshotStore#service)\>

An in-memory snapshot store keyed by Session identity.

***

<a id="maketest"></a>

### makeTest

> `const` **makeTest**: (`options`) => `Effect.Effect`\<[`Service`](./KernelPool#service)\>

A KernelPool that evaluates nothing. It enforces the observable kernel contract —
cell-local monotonic sequences, epochs across restart, closed sessions — so hosts and projections
can be tested without a worker process.

#### Parameters

##### options

[`TestPoolOptions`](#testpooloptions)

#### Returns

`Effect.Effect`\<[`Service`](./KernelPool#service)\>
