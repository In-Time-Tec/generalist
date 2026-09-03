[**generalist**](../../index)

***

[generalist](../../index) / [repl](../index) / KernelResourceAuthority

# KernelResourceAuthority

## Classes

<a id="kernelresourceauthority"></a>

### KernelResourceAuthority

#### Extends

- `KernelResourceAuthority_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new KernelResourceAuthority**(`_`): [`KernelResourceAuthority`](#kernelresourceauthority)

###### Parameters

###### \_

`never`

###### Returns

[`KernelResourceAuthority`](#kernelresourceauthority)

###### Inherited from

`KernelResourceAuthority_base.constructor`

***

<a id="kernelresourceauthorityunavailable"></a>

### KernelResourceAuthorityUnavailable

The resource authority could not read or commit its durable state.

#### Extends

- `KernelResourceAuthorityUnavailable_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new KernelResourceAuthorityUnavailable**(...`args`): [`KernelResourceAuthorityUnavailable`](#kernelresourceauthorityunavailable)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`KernelResourceAuthorityUnavailable`](#kernelresourceauthorityunavailable)

###### Inherited from

`KernelResourceAuthorityUnavailable_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`KernelResourceAuthorityUnavailable_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`KernelResourceAuthorityUnavailable_base.message`

<a id="sessionid"></a>

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

###### Inherited from

`KernelResourceAuthorityUnavailable_base.sessionId`

***

<a id="kernelresourcerejected"></a>

### KernelResourceRejected

A resource authority rejected an ownership or lifecycle transition atomically.

#### Extends

- `KernelResourceRejected_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new KernelResourceRejected**(...`args`): [`KernelResourceRejected`](#kernelresourcerejected)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`KernelResourceRejected`](#kernelresourcerejected)

###### Inherited from

`KernelResourceRejected_base.constructor`

#### Properties

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`KernelResourceRejected_base.hint`

<a id="message-1"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`KernelResourceRejected_base.message`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `"owned"` \| `"stale-claim"` \| `"resource-missing"` \| `"resource-mismatch"` \| `"cell-active"` \| `"cell-not-active"` \| `"cleanup-pending"`

###### Inherited from

`KernelResourceRejected_base.reason`

<a id="sessionid-1"></a>

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`KernelResourceRejected_base.sessionId`

## Interfaces

<a id="acquirerequest"></a>

### AcquireRequest

Atomically request ownership using the store's authoritative clock.

#### Properties

<a id="leasemillis"></a>

##### leaseMillis

> `readonly` **leaseMillis**: `number`

<a id="ownerid"></a>

##### ownerId

> `readonly` **ownerId**: `string`

<a id="profiledigest"></a>

##### profileDigest

> `readonly` **profileDigest**: `string`

<a id="provider"></a>

##### provider

> `readonly` **provider**: `string`

<a id="sessionid-2"></a>

##### sessionId

> `readonly` **sessionId**: `string`

***

<a id="admitrequest"></a>

### AdmitRequest

Admit a claim-bound command at the provider-side boundary immediately before it acts.

#### Properties

<a id="command"></a>

##### command

> `readonly` **command**: `object`

###### cellId

> `readonly` **cellId**: `string`

###### epoch

> `readonly` **epoch**: `number`

###### generation

> `readonly` **generation**: `number`

###### ownerId

> `readonly` **ownerId**: `string`

###### profileDigest

> `readonly` **profileDigest**: `string`

###### sessionId

> `readonly` **sessionId**: `string`

<a id="expectedcell"></a>

##### expectedCell?

> `readonly` `optional` **expectedCell?**: `object`

###### cellId

> `readonly` **cellId**: `string`

###### epoch

> `readonly` **epoch**: `number`

###### generation

> `readonly` **generation**: `number`

###### ownerId

> `readonly` **ownerId**: `string`

###### profileDigest

> `readonly` **profileDigest**: `string`

###### sessionId

> `readonly` **sessionId**: `string`

<a id="kind"></a>

##### kind

> `readonly` **kind**: `"cell"` \| `"control"`

***

<a id="bindrequest"></a>

### BindRequest

Bind or update the exact current provider resource. A different ID requires deletion first.

#### Properties

<a id="claim"></a>

##### claim

> `readonly` **claim**: `object`

###### generation

> `readonly` **generation**: `number`

###### ownerId

> `readonly` **ownerId**: `string`

###### sessionId

> `readonly` **sessionId**: `string`

<a id="resource"></a>

##### resource

> `readonly` **resource**: `object`

###### checkpoint

> `readonly` **checkpoint**: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`

###### epoch

> `readonly` **epoch**: `number`

###### profileDigest

> `readonly` **profileDigest**: `string`

###### provider

> `readonly` **provider**: `string`

###### resourceId

> `readonly` **resourceId**: `string`

###### state

> `readonly` **state**: `"live"` \| `"paused"` \| `"deleting"`

***

<a id="deletionrequest"></a>

### DeletionRequest

Complete or report cleanup only for the exact resource the provider call targeted.

#### Properties

<a id="claim-1"></a>

##### claim

> `readonly` **claim**: `object`

###### generation

> `readonly` **generation**: `number`

###### ownerId

> `readonly` **ownerId**: `string`

###### sessionId

> `readonly` **sessionId**: `string`

<a id="expectedresource"></a>

##### expectedResource

> `readonly` **expectedResource**: `object`

###### epoch

> `readonly` **epoch**: `number`

###### profileDigest

> `readonly` **profileDigest**: `string`

###### provider

> `readonly` **provider**: `string`

###### resourceId

> `readonly` **resourceId**: `string`

***

<a id="finishrequest"></a>

### FinishRequest

Clear only the exact admitted cell under the current owner's authority.

#### Properties

<a id="claim-2"></a>

##### claim

> `readonly` **claim**: `object`

###### generation

> `readonly` **generation**: `number`

###### ownerId

> `readonly` **ownerId**: `string`

###### sessionId

> `readonly` **sessionId**: `string`

<a id="expectedcell-1"></a>

##### expectedCell

> `readonly` **expectedCell**: `object`

###### cellId

> `readonly` **cellId**: `string`

###### epoch

> `readonly` **epoch**: `number`

###### generation

> `readonly` **generation**: `number`

###### ownerId

> `readonly` **ownerId**: `string`

###### profileDigest

> `readonly` **profileDigest**: `string`

###### sessionId

> `readonly` **sessionId**: `string`

***

<a id="service"></a>

### Service

Durable authority for a live external kernel resource. This is neither Runtime Run
fencing nor KernelSnapshotStore. Implementations must serialize every method per Session. `acquire`
issues a greater generation only after the prior lease expires; `admit` validates the exact
generation/profile/resource/epoch at the boundary that acts on the resource and records the sole
active cell atomically. `expectedCell` lets a new owner interrupt and reconcile an earlier
generation's admitted cell without granting that earlier generation authority. A transition to
`paused` must reject while `activeCell` is present. Store-owned `activeCell` and cleanup fields
cannot be overwritten through `bind`. `revoke` marks a resource deleting before provider
deletion, and only an exact resource compare-and-set in `confirmDeletion` may forget its mutable
ID after deletion is proven. Failed deletion stays visible through `pendingDeletion`.

#### Extended by

- [`MemoryResourceAuthority`](./TestKernel#memoryresourceauthority)

#### Properties

<a id="acquire"></a>

##### acquire

> `readonly` **acquire**: (`request`) => `Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

###### Parameters

###### request

[`AcquireRequest`](#acquirerequest)

###### Returns

`Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

<a id="admit"></a>

##### admit

> `readonly` **admit**: (`request`) => `Effect`\<\{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

###### Parameters

###### request

[`AdmitRequest`](#admitrequest)

###### Returns

`Effect`\<\{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

<a id="bind"></a>

##### bind

> `readonly` **bind**: (`request`) => `Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

###### Parameters

###### request

[`BindRequest`](#bindrequest)

###### Returns

`Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

<a id="confirmdeletion"></a>

##### confirmDeletion

> `readonly` **confirmDeletion**: (`request`) => `Effect`\<`void`, [`KernelResourceFailure`](#kernelresourcefailure)\>

###### Parameters

###### request

[`DeletionRequest`](#deletionrequest)

###### Returns

`Effect`\<`void`, [`KernelResourceFailure`](#kernelresourcefailure)\>

<a id="faildeletion"></a>

##### failDeletion

> `readonly` **failDeletion**: (`request`, `message`) => `Effect`\<\{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

###### Parameters

###### request

[`DeletionRequest`](#deletionrequest)

###### message

`string`

###### Returns

`Effect`\<\{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

<a id="finish"></a>

##### finish

> `readonly` **finish**: (`request`) => `Effect`\<`void`, [`KernelResourceFailure`](#kernelresourcefailure)\>

###### Parameters

###### request

[`FinishRequest`](#finishrequest)

###### Returns

`Effect`\<`void`, [`KernelResourceFailure`](#kernelresourcefailure)\>

<a id="inspect"></a>

##### inspect

> `readonly` **inspect**: (`sessionId`) => `Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \} \| `undefined`, [`KernelResourceAuthorityUnavailable`](#kernelresourceauthorityunavailable)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \} \| `undefined`, [`KernelResourceAuthorityUnavailable`](#kernelresourceauthorityunavailable)\>

<a id="pendingdeletion"></a>

##### pendingDeletion

> `readonly` **pendingDeletion**: `Effect`\<readonly `object`[], [`KernelResourceAuthorityUnavailable`](#kernelresourceauthorityunavailable)\>

<a id="renew"></a>

##### renew

> `readonly` **renew**: (`claim`, `leaseMillis`) => `Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

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

`Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

<a id="revoke"></a>

##### revoke

> `readonly` **revoke**: (`claim`) => `Effect`\<\{ `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; \} \| `undefined`, [`KernelResourceFailure`](#kernelresourcefailure)\>

###### Parameters

###### claim

###### generation

`number`

###### ownerId

`string`

###### sessionId

`string`

###### Returns

`Effect`\<\{ `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; \} \| `undefined`, [`KernelResourceFailure`](#kernelresourcefailure)\>

## Type Aliases

<a id="claim-3"></a>

### Claim

> **Claim** = *typeof* `Claim.Type`

Exact current owner of one Session kernel resource.

***

<a id="cleanupfailure"></a>

### CleanupFailure

> **CleanupFailure** = *typeof* `CleanupFailure.Type`

A cleanup failure kept with the resource until deletion is proven.

***

<a id="commandclaim"></a>

### CommandClaim

> **CommandClaim** = *typeof* `CommandClaim.Type`

Identity every remote command and response carries. `cellId` is also required for
inspect, restart, and close: remote adapters create a private control-cell identity for those
calls so no command can escape the same admission boundary as authored source.

***

<a id="generation"></a>

### Generation

> **Generation** = *typeof* `Generation.Type`

Storage-issued, monotonically increasing ownership generation for one Session.

***

<a id="kernelresourcefailure"></a>

### KernelResourceFailure

> **KernelResourceFailure** = [`KernelResourceRejected`](#kernelresourcerejected) \| [`KernelResourceAuthorityUnavailable`](#kernelresourceauthorityunavailable)

Closed failure union for host-owned resource authority operations.

***

<a id="lease"></a>

### Lease

> **Lease** = *typeof* `Lease.Type`

Current storage-owned lease plus any provider resource the owner must reconcile.

***

<a id="ownerid-1"></a>

### OwnerId

> **OwnerId** = *typeof* `OwnerId.Type`

Identity of one host process competing to own a Session kernel.

***

<a id="resource-1"></a>

### Resource

> **Resource** = *typeof* `Resource.Type`

Host-only binding of one provider resource to its immutable profile and epoch.
Resource IDs and cleanup failures never belong in KernelProfile, CellEvent, or CellResult.

***

<a id="resourcebinding"></a>

### ResourceBinding

> **ResourceBinding** = *typeof* `ResourceBinding.Type`

Host-supplied immutable binding and lifecycle facts; authority fields remain store-owned.

***

<a id="resourceidentity"></a>

### ResourceIdentity

> **ResourceIdentity** = *typeof* `ResourceIdentity.Type`

Exact provider resource targeted by a cleanup or lifecycle compare-and-set.

***

<a id="resourcestate"></a>

### ResourceState

> **ResourceState** = *typeof* `ResourceState.Type`

Mutable provider resource state retained only in the host control authority.

## Variables

<a id="claim-4"></a>

### Claim

> `const` **Claim**: `Schema.Struct`\<\{ `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>

Exact current owner of one Session kernel resource.

***

<a id="cleanupfailure-1"></a>

### CleanupFailure

> `const` **CleanupFailure**: `Schema.Struct`\<\{ `attempts`: `Schema.Int`; `message`: `Schema.String`; \}\>

A cleanup failure kept with the resource until deletion is proven.

***

<a id="commandclaim-1"></a>

### CommandClaim

> `const` **CommandClaim**: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>

Identity every remote command and response carries. `cellId` is also required for
inspect, restart, and close: remote adapters create a private control-cell identity for those
calls so no command can escape the same admission boundary as authored source.

***

<a id="generation-1"></a>

### Generation

> `const` **Generation**: `Schema.Int`

Storage-issued, monotonically increasing ownership generation for one Session.

***

<a id="lease-1"></a>

### Lease

> `const` **Lease**: `Schema.Struct`\<\{ `claim`: `Schema.Struct`\<\{ `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `expiresAtMillis`: `Schema.Int`; `requestedProfileDigest`: `Schema.String`; `requestedProvider`: `Schema.String`; `resource`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `activeCell`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>\>; `checkpoint`: `Schema.Literals`\<readonly \[`"live-process"`, `"filesystem"`, `"namespace"`, `"restart-only"`\]\>; `cleanupFailure`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `attempts`: `Schema.Int`; `message`: `Schema.String`; \}\>\>; `epoch`: `Schema.Int`; `profileDigest`: `Schema.String`; `provider`: `Schema.String`; `resourceId`: `Schema.String`; `state`: `Schema.Literals`\<readonly \[`"live"`, `"paused"`, `"deleting"`\]\>; \}\>\>; \}\>

Current storage-owned lease plus any provider resource the owner must reconcile.

***

<a id="leasemillis-1"></a>

### LeaseMillis

> `const` **LeaseMillis**: `Schema.Int`

Validate a caller-supplied lease duration at an adapter boundary.

***

<a id="ownerid-2"></a>

### OwnerId

> `const` **OwnerId**: `Schema.String`

Identity of one host process competing to own a Session kernel.

***

<a id="resource-2"></a>

### Resource

> `const` **Resource**: `Schema.Struct`\<\{ `activeCell`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>\>; `checkpoint`: `Schema.Literals`\<readonly \[`"live-process"`, `"filesystem"`, `"namespace"`, `"restart-only"`\]\>; `cleanupFailure`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `attempts`: `Schema.Int`; `message`: `Schema.String`; \}\>\>; `epoch`: `Schema.Int`; `profileDigest`: `Schema.String`; `provider`: `Schema.String`; `resourceId`: `Schema.String`; `state`: `Schema.Literals`\<readonly \[`"live"`, `"paused"`, `"deleting"`\]\>; \}\>

Host-only binding of one provider resource to its immutable profile and epoch.
Resource IDs and cleanup failures never belong in KernelProfile, CellEvent, or CellResult.

***

<a id="resourcebinding-1"></a>

### ResourceBinding

> `const` **ResourceBinding**: `Schema.Struct`\<\{ `checkpoint`: `Schema.Literals`\<readonly \[`"live-process"`, `"filesystem"`, `"namespace"`, `"restart-only"`\]\>; `epoch`: `Schema.Int`; `profileDigest`: `Schema.String`; `provider`: `Schema.String`; `resourceId`: `Schema.String`; `state`: `Schema.Literals`\<readonly \[`"live"`, `"paused"`, `"deleting"`\]\>; \}\>

Host-supplied immutable binding and lifecycle facts; authority fields remain store-owned.

***

<a id="resourceidentity-1"></a>

### ResourceIdentity

> `const` **ResourceIdentity**: `Schema.Struct`\<\{ `epoch`: `Schema.Int`; `profileDigest`: `Schema.String`; `provider`: `Schema.String`; `resourceId`: `Schema.String`; \}\>

Exact provider resource targeted by a cleanup or lifecycle compare-and-set.

***

<a id="resourcestate-1"></a>

### ResourceState

> `const` **ResourceState**: `Schema.Literals`\<readonly \[`"live"`, `"paused"`, `"deleting"`\]\>

Mutable provider resource state retained only in the host control authority.
