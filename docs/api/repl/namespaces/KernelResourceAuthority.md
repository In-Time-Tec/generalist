[**generalist**](../../index)

***

[generalist](../../index) / [repl](../index) / KernelResourceAuthority

# KernelResourceAuthority

## Classes

### KernelResourceAuthority

#### Extends

- `KernelResourceAuthority_base`

#### Constructors

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

### KernelResourceAuthorityUnavailable

The resource authority could not read or commit its durable state.

#### Extends

- `KernelResourceAuthorityUnavailable_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`KernelResourceAuthorityUnavailable_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`KernelResourceAuthorityUnavailable_base.message`

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

###### Inherited from

`KernelResourceAuthorityUnavailable_base.sessionId`

***

### KernelResourceRejected

A resource authority rejected an ownership or lifecycle transition atomically.

#### Extends

- `KernelResourceRejected_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`KernelResourceRejected_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`KernelResourceRejected_base.message`

##### reason

> `readonly` **reason**: `"owned"` \| `"stale-claim"` \| `"resource-missing"` \| `"resource-mismatch"` \| `"cell-active"` \| `"cell-not-active"` \| `"cleanup-pending"`

###### Inherited from

`KernelResourceRejected_base.reason`

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`KernelResourceRejected_base.sessionId`

## Interfaces

### AcquireRequest

Atomically request ownership using the store's authoritative clock.

#### Properties

##### leaseMillis

> `readonly` **leaseMillis**: `number`

##### ownerId

> `readonly` **ownerId**: `string`

##### profileDigest

> `readonly` **profileDigest**: `string`

##### provider

> `readonly` **provider**: `string`

##### sessionId

> `readonly` **sessionId**: `string`

***

### AdmitRequest

Admit a claim-bound command at the provider-side boundary immediately before it acts.

#### Properties

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

##### kind

> `readonly` **kind**: `"cell"` \| `"control"`

***

### BindRequest

Bind or update the exact current provider resource. A different ID requires deletion first.

#### Properties

##### claim

> `readonly` **claim**: `object`

###### generation

> `readonly` **generation**: `number`

###### ownerId

> `readonly` **ownerId**: `string`

###### sessionId

> `readonly` **sessionId**: `string`

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

### DeletionRequest

Complete or report cleanup only for the exact resource the provider call targeted.

#### Properties

##### claim

> `readonly` **claim**: `object`

###### generation

> `readonly` **generation**: `number`

###### ownerId

> `readonly` **ownerId**: `string`

###### sessionId

> `readonly` **sessionId**: `string`

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

### FinishRequest

Clear only the exact admitted cell under the current owner's authority.

#### Properties

##### claim

> `readonly` **claim**: `object`

###### generation

> `readonly` **generation**: `number`

###### ownerId

> `readonly` **ownerId**: `string`

###### sessionId

> `readonly` **sessionId**: `string`

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

##### acquire

> `readonly` **acquire**: (`request`) => `Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

###### Parameters

###### request

[`AcquireRequest`](#acquirerequest)

###### Returns

`Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

##### admit

> `readonly` **admit**: (`request`) => `Effect`\<\{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

###### Parameters

###### request

[`AdmitRequest`](#admitrequest)

###### Returns

`Effect`\<\{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

##### bind

> `readonly` **bind**: (`request`) => `Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

###### Parameters

###### request

[`BindRequest`](#bindrequest)

###### Returns

`Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

##### confirmDeletion

> `readonly` **confirmDeletion**: (`request`) => `Effect`\<`void`, [`KernelResourceFailure`](#kernelresourcefailure)\>

###### Parameters

###### request

[`DeletionRequest`](#deletionrequest)

###### Returns

`Effect`\<`void`, [`KernelResourceFailure`](#kernelresourcefailure)\>

##### failDeletion

> `readonly` **failDeletion**: (`request`, `message`) => `Effect`\<\{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

###### Parameters

###### request

[`DeletionRequest`](#deletionrequest)

###### message

`string`

###### Returns

`Effect`\<\{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}, [`KernelResourceFailure`](#kernelresourcefailure)\>

##### finish

> `readonly` **finish**: (`request`) => `Effect`\<`void`, [`KernelResourceFailure`](#kernelresourcefailure)\>

###### Parameters

###### request

[`FinishRequest`](#finishrequest)

###### Returns

`Effect`\<`void`, [`KernelResourceFailure`](#kernelresourcefailure)\>

##### inspect

> `readonly` **inspect**: (`sessionId`) => `Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \} \| `undefined`, [`KernelResourceAuthorityUnavailable`](#kernelresourceauthorityunavailable)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<\{ `claim`: \{ `generation`: `number`; `ownerId`: `string`; `sessionId`: `string`; \}; `expiresAtMillis`: `number`; `requestedProfileDigest`: `string`; `requestedProvider`: `string`; `resource?`: \{ `activeCell?`: \{ `cellId`: `string`; `epoch`: `number`; `generation`: `number`; `ownerId`: `string`; `profileDigest`: `string`; `sessionId`: `string`; \}; `checkpoint`: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`; `cleanupFailure?`: \{ `attempts`: `number`; `message`: `string`; \}; `epoch`: `number`; `profileDigest`: `string`; `provider`: `string`; `resourceId`: `string`; `state`: `"live"` \| `"paused"` \| `"deleting"`; \}; \} \| `undefined`, [`KernelResourceAuthorityUnavailable`](#kernelresourceauthorityunavailable)\>

##### pendingDeletion

> `readonly` **pendingDeletion**: `Effect`\<readonly `object`[], [`KernelResourceAuthorityUnavailable`](#kernelresourceauthorityunavailable)\>

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

### Claim

> **Claim** = *typeof* `Claim.Type`

Exact current owner of one Session kernel resource.

***

### CleanupFailure

> **CleanupFailure** = *typeof* `CleanupFailure.Type`

A cleanup failure kept with the resource until deletion is proven.

***

### CommandClaim

> **CommandClaim** = *typeof* `CommandClaim.Type`

Identity every remote command and response carries. `cellId` is also required for
inspect, restart, and close: remote adapters create a private control-cell identity for those
calls so no command can escape the same admission boundary as authored source.

***

### Generation

> **Generation** = *typeof* `Generation.Type`

Storage-issued, monotonically increasing ownership generation for one Session.

***

### KernelResourceFailure

> **KernelResourceFailure** = [`KernelResourceRejected`](#kernelresourcerejected) \| [`KernelResourceAuthorityUnavailable`](#kernelresourceauthorityunavailable)

Closed failure union for host-owned resource authority operations.

***

### Lease

> **Lease** = *typeof* `Lease.Type`

Current storage-owned lease plus any provider resource the owner must reconcile.

***

### OwnerId

> **OwnerId** = *typeof* `OwnerId.Type`

Identity of one host process competing to own a Session kernel.

***

### Resource

> **Resource** = *typeof* `Resource.Type`

Host-only binding of one provider resource to its immutable profile and epoch.
Resource IDs and cleanup failures never belong in KernelProfile, CellEvent, or CellResult.

***

### ResourceBinding

> **ResourceBinding** = *typeof* `ResourceBinding.Type`

Host-supplied immutable binding and lifecycle facts; authority fields remain store-owned.

***

### ResourceIdentity

> **ResourceIdentity** = *typeof* `ResourceIdentity.Type`

Exact provider resource targeted by a cleanup or lifecycle compare-and-set.

***

### ResourceState

> **ResourceState** = *typeof* `ResourceState.Type`

Mutable provider resource state retained only in the host control authority.

## Variables

### Claim

> `const` **Claim**: `Schema.Struct`\<\{ `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>

Exact current owner of one Session kernel resource.

***

### CleanupFailure

> `const` **CleanupFailure**: `Schema.Struct`\<\{ `attempts`: `Schema.Int`; `message`: `Schema.String`; \}\>

A cleanup failure kept with the resource until deletion is proven.

***

### CommandClaim

> `const` **CommandClaim**: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>

Identity every remote command and response carries. `cellId` is also required for
inspect, restart, and close: remote adapters create a private control-cell identity for those
calls so no command can escape the same admission boundary as authored source.

***

### Generation

> `const` **Generation**: `Schema.Int`

Storage-issued, monotonically increasing ownership generation for one Session.

***

### Lease

> `const` **Lease**: `Schema.Struct`\<\{ `claim`: `Schema.Struct`\<\{ `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `expiresAtMillis`: `Schema.Int`; `requestedProfileDigest`: `Schema.String`; `requestedProvider`: `Schema.String`; `resource`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `activeCell`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>\>; `checkpoint`: `Schema.Literals`\<readonly \[`"live-process"`, `"filesystem"`, `"namespace"`, `"restart-only"`\]\>; `cleanupFailure`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `attempts`: `Schema.Int`; `message`: `Schema.String`; \}\>\>; `epoch`: `Schema.Int`; `profileDigest`: `Schema.String`; `provider`: `Schema.String`; `resourceId`: `Schema.String`; `state`: `Schema.Literals`\<readonly \[`"live"`, `"paused"`, `"deleting"`\]\>; \}\>\>; \}\>

Current storage-owned lease plus any provider resource the owner must reconcile.

***

### LeaseMillis

> `const` **LeaseMillis**: `Schema.Int`

Validate a caller-supplied lease duration at an adapter boundary.

***

### OwnerId

> `const` **OwnerId**: `Schema.String`

Identity of one host process competing to own a Session kernel.

***

### Resource

> `const` **Resource**: `Schema.Struct`\<\{ `activeCell`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>\>; `checkpoint`: `Schema.Literals`\<readonly \[`"live-process"`, `"filesystem"`, `"namespace"`, `"restart-only"`\]\>; `cleanupFailure`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `attempts`: `Schema.Int`; `message`: `Schema.String`; \}\>\>; `epoch`: `Schema.Int`; `profileDigest`: `Schema.String`; `provider`: `Schema.String`; `resourceId`: `Schema.String`; `state`: `Schema.Literals`\<readonly \[`"live"`, `"paused"`, `"deleting"`\]\>; \}\>

Host-only binding of one provider resource to its immutable profile and epoch.
Resource IDs and cleanup failures never belong in KernelProfile, CellEvent, or CellResult.

***

### ResourceBinding

> `const` **ResourceBinding**: `Schema.Struct`\<\{ `checkpoint`: `Schema.Literals`\<readonly \[`"live-process"`, `"filesystem"`, `"namespace"`, `"restart-only"`\]\>; `epoch`: `Schema.Int`; `profileDigest`: `Schema.String`; `provider`: `Schema.String`; `resourceId`: `Schema.String`; `state`: `Schema.Literals`\<readonly \[`"live"`, `"paused"`, `"deleting"`\]\>; \}\>

Host-supplied immutable binding and lifecycle facts; authority fields remain store-owned.

***

### ResourceIdentity

> `const` **ResourceIdentity**: `Schema.Struct`\<\{ `epoch`: `Schema.Int`; `profileDigest`: `Schema.String`; `provider`: `Schema.String`; `resourceId`: `Schema.String`; \}\>

Exact provider resource targeted by a cleanup or lifecycle compare-and-set.

***

### ResourceState

> `const` **ResourceState**: `Schema.Literals`\<readonly \[`"live"`, `"paused"`, `"deleting"`\]\>

Mutable provider resource state retained only in the host control authority.
