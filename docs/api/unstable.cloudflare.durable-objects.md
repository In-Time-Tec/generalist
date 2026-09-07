[**generalist**](./index.md)

***

[generalist](./index.md) / unstable.cloudflare.durable-objects

# unstable.cloudflare.durable-objects

## Interfaces

<a id="options"></a>

### Options

**`Experimental`**

A partition's canonical R2 binding and explicit namespace.

#### Extends

- [`Options`](./durability.md#options)

#### Properties

<a id="activationprojection"></a>

##### activationProjection?

> `readonly` `optional` **activationProjection?**: `RunActivationProjection`

**`Experimental`**

Final-state callback executed synchronously inside each authoritative store transaction.

###### Inherited from

[`Options`](./durability.md#options).[`activationProjection`](./durability.md#activationprojection)

<a id="addresses"></a>

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](./runtime/namespaces/Runtime.md#addressbinding)[]

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`addresses`](./durability.md#addresses)

<a id="bucket"></a>

##### bucket

> `readonly` **bucket**: [`Bucket`](./durability.r2.md#bucket)

**`Experimental`**

<a id="environment"></a>

##### environment

> `readonly` **environment**: `string`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`environment`](./durability.md#environment)

<a id="maxcommitbytes"></a>

##### maxCommitBytes?

> `readonly` `optional` **maxCommitBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`maxCommitBytes`](./durability.md#maxcommitbytes)

<a id="maxconflictretries"></a>

##### maxConflictRetries?

> `readonly` `optional` **maxConflictRetries?**: `number`

**`Experimental`**

Number of deterministic reevaluations after a competing command wins; zero disables retries.

###### Inherited from

[`Options`](./durability.md#options).[`maxConflictRetries`](./durability.md#maxconflictretries)

<a id="maxreplaybytes"></a>

##### maxReplayBytes?

> `readonly` `optional` **maxReplayBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`maxReplayBytes`](./durability.md#maxreplaybytes)

<a id="maxstatebytes"></a>

##### maxStateBytes?

> `readonly` `optional` **maxStateBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`maxStateBytes`](./durability.md#maxstatebytes)

<a id="messagingpolicy"></a>

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](./runtime/namespaces/Messaging/namespaces/MessagingPolicy.md#service)

**`Experimental`**

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`Options`](./durability.md#options).[`messagingPolicy`](./durability.md#messagingpolicy)

<a id="ownershipleasemillis"></a>

##### ownershipLeaseMillis?

> `readonly` `optional` **ownershipLeaseMillis?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`ownershipLeaseMillis`](./durability.md#ownershipleasemillis)

<a id="partition"></a>

##### partition

> `readonly` **partition**: `string`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`partition`](./durability.md#partition)

<a id="reconcileinterval"></a>

##### reconcileInterval?

> `readonly` `optional` **reconcileInterval?**: `Input`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`reconcileInterval`](./durability.md#reconcileinterval)

<a id="scheduler"></a>

##### scheduler?

> `readonly` `optional` **scheduler?**: `object`

**`Experimental`**

###### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

###### Inherited from

[`Options`](./durability.md#options).[`scheduler`](./durability.md#scheduler)

<a id="schedulermode"></a>

##### schedulerMode?

> `readonly` `optional` **schedulerMode?**: `"poll"` \| `"external"`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`schedulerMode`](./durability.md#schedulermode)

<a id="snapshotevery"></a>

##### snapshotEvery?

> `readonly` `optional` **snapshotEvery?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`snapshotEvery`](./durability.md#snapshotevery)

<a id="subscriberqueuecapacity"></a>

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`subscriberQueueCapacity`](./durability.md#subscriberqueuecapacity)

<a id="tenant"></a>

##### tenant

> `readonly` **tenant**: `string`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`tenant`](./durability.md#tenant)

<a id="workerid"></a>

##### workerId?

> `readonly` `optional` **workerId?**: `string`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`workerId`](./durability.md#workerid)

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`{ bucket, ...options }`) => `Layer.Layer`\<[`RuntimeServices`](./durability.md#runtimeservices), `ActivationFailure`, `Crypto` \| [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver)\>

**`Experimental`**

Scoped execution host. Alarm-driven hosts use schedulerMode: "external".

#### Parameters

##### \{ bucket, ...options \}

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`RuntimeServices`](./durability.md#runtimeservices), `ActivationFailure`, `Crypto` \| [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver)\>

***

<a id="layerrunstore"></a>

### layerRunStore

> `const` **layerRunStore**: (`{ bucket, ...options }`) => `Layer.Layer`\<[`Activation`](./durability.md#activation) \| [`ExternalChildStore`](./unstable.runtime.external-child-store.md#externalchildstore) \| [`RunStore`](./runtime/namespaces/RunStore.md#runstore) \| `StoreActivation`, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable), `Crypto`\>

**`Experimental`**

Native R2 persistence; Durable Object storage is never runtime authority.

#### Parameters

##### \{ bucket, ...options \}

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`Activation`](./durability.md#activation) \| [`ExternalChildStore`](./unstable.runtime.external-child-store.md#externalchildstore) \| [`RunStore`](./runtime/namespaces/RunStore.md#runstore) \| `StoreActivation`, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable), `Crypto`\>

***

<a id="reconcile"></a>

### reconcile

> `const` **reconcile**: \{(`options`, `fuel?`): `Reconciliation`; (`fuel?`): (`options`) => `Reconciliation`; \}

**`Experimental`**

Run from an independent Cron Trigger or queue consumer for every configured partition.
Alarms only accelerate this reconciliation: losing an alarm cannot erase canonical work.
The application supplies Crypto and its pinned ExecutableResolver, just as for the Durable Object.

#### Call Signature

> (`options`, `fuel?`): `Reconciliation`

##### Parameters

###### options

[`Options`](#options)

###### fuel?

`number`

##### Returns

`Reconciliation`

#### Call Signature

> (`fuel?`): (`options`) => `Reconciliation`

##### Parameters

###### fuel?

`number`

##### Returns

(`options`) => `Reconciliation`
