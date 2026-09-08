[**generalist**](./index.md)

***

[generalist](./index.md) / unstable.cloudflare.durable-objects

# unstable.cloudflare.durable-objects

## Interfaces

<a id="alarmstorage"></a>

### AlarmStorage

**`Experimental`**

The one native alarm slot is a wake hint, never canonical Runtime state.

#### Properties

<a id="getalarm"></a>

##### getAlarm

> `readonly` **getAlarm**: () => `Promise`\<`number` \| `null`\>

**`Experimental`**

###### Returns

`Promise`\<`number` \| `null`\>

<a id="setalarm"></a>

##### setAlarm

> `readonly` **setAlarm**: (`time`) => `Promise`\<`void`\>

**`Experimental`**

###### Parameters

###### time

`number`

###### Returns

`Promise`\<`void`\>

***

<a id="host"></a>

### Host

**`Experimental`**

Concurrent commands and alarms share authority until their last call completes.

#### Properties

<a id="alarm"></a>

##### alarm

> `readonly` **alarm**: `Effect`\<[`DrainResult`](./runtime/namespaces/LocalScheduler.md#drainresult), `ActivationFailure`\>

**`Experimental`**

Install as the application's native alarm handler; duplicate delivery is safe.

<a id="run"></a>

##### run

> `readonly` **run**: \<`A`, `E`, `R`\>(`effect`) => `Effect`\<`A`, `ActivationFailure` \| `E`, `Exclude`\<`R`, `Scope` \| [`RuntimeServices`](./durability.md#runtimeservices)\>\>

**`Experimental`**

Supplies Runtime services and a command scope, preserving other requirements and each receipt.

###### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

###### Parameters

###### effect

`Effect`\<`A`, `E`, `R`\>

###### Returns

`Effect`\<`A`, `ActivationFailure` \| `E`, `Exclude`\<`R`, `Scope` \| [`RuntimeServices`](./durability.md#runtimeservices)\>\>

***

<a id="hostoptions"></a>

### HostOptions

**`Experimental`**

Configuration for an application-owned Durable Object host.

#### Extends

- `Omit`\<[`Options`](#options), `"schedulerMode"`\>

#### Properties

<a id="activationprojection"></a>

##### activationProjection?

> `readonly` `optional` **activationProjection?**: `RunActivationProjection`

**`Experimental`**

Final-state callback executed synchronously inside each authoritative store transaction.

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`activationProjection`](./runtime/namespaces/Runtime.md#activationprojection)

<a id="addresses"></a>

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](./runtime/namespaces/Runtime.md#addressbinding)[]

**`Experimental`**

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`addresses`](./runtime/namespaces/Runtime.md#addresses)

<a id="admissionreservebytes"></a>

##### admissionReserveBytes?

> `readonly` `optional` **admissionReserveBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`admissionReserveBytes`](#admissionreservebytes-1)

<a id="bucket"></a>

##### bucket

> `readonly` **bucket**: [`Bucket`](./durability.r2.md#bucket)

**`Experimental`**

###### Inherited from

[`Options`](#options).[`bucket`](#bucket-1)

<a id="environment"></a>

##### environment

> `readonly` **environment**: `string`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`environment`](#environment-1)

<a id="fuel"></a>

##### fuel?

> `readonly` `optional` **fuel?**: `number`

**`Experimental`**

Bounds candidates examined by an alarm, not the duration of admitted execution.

<a id="maxcommitbytes"></a>

##### maxCommitBytes?

> `readonly` `optional` **maxCommitBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`maxCommitBytes`](#maxcommitbytes-1)

<a id="maxconflictretries"></a>

##### maxConflictRetries?

> `readonly` `optional` **maxConflictRetries?**: `number`

**`Experimental`**

Number of deterministic reevaluations after a competing command wins; zero disables retries.

###### Inherited from

[`Options`](#options).[`maxConflictRetries`](#maxconflictretries-1)

<a id="maxreplaybytes"></a>

##### maxReplayBytes?

> `readonly` `optional` **maxReplayBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`maxReplayBytes`](#maxreplaybytes-1)

<a id="maxstatebytes"></a>

##### maxStateBytes?

> `readonly` `optional` **maxStateBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`maxStateBytes`](#maxstatebytes-1)

<a id="messagingpolicy"></a>

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](./runtime/namespaces/Messaging/namespaces/MessagingPolicy.md#service)

**`Experimental`**

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`messagingPolicy`](./runtime/namespaces/Runtime.md#messagingpolicy)

<a id="ownershipleasemillis"></a>

##### ownershipLeaseMillis?

> `readonly` `optional` **ownershipLeaseMillis?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`ownershipLeaseMillis`](#ownershipleasemillis-1)

<a id="partition"></a>

##### partition

> `readonly` **partition**: `string`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`partition`](#partition-1)

<a id="reconcileinterval"></a>

##### reconcileInterval?

> `readonly` `optional` **reconcileInterval?**: `Input`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`reconcileInterval`](#reconcileinterval-1)

<a id="scheduler"></a>

##### scheduler?

> `readonly` `optional` **scheduler?**: `object`

**`Experimental`**

###### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`scheduler`](./runtime/namespaces/Runtime.md#scheduler)

<a id="snapshotevery"></a>

##### snapshotEvery?

> `readonly` `optional` **snapshotEvery?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`snapshotEvery`](#snapshotevery-1)

<a id="storage"></a>

##### storage

> `readonly` **storage**: [`AlarmStorage`](#alarmstorage)

**`Experimental`**

<a id="subscriberqueuecapacity"></a>

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

**`Experimental`**

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`subscriberQueueCapacity`](./runtime/namespaces/Runtime.md#subscriberqueuecapacity)

<a id="tenant"></a>

##### tenant

> `readonly` **tenant**: `string`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`tenant`](#tenant-1)

<a id="workerid"></a>

##### workerId?

> `readonly` `optional` **workerId?**: `string`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`workerId`](#workerid-1)

***

<a id="options"></a>

### Options

**`Experimental`**

A partition's canonical R2 binding and explicit namespace.

#### Extends

- [`Options`](./durability.md#options)

#### Properties

<a id="activationprojection-1"></a>

##### activationProjection?

> `readonly` `optional` **activationProjection?**: `RunActivationProjection`

**`Experimental`**

Final-state callback executed synchronously inside each authoritative store transaction.

###### Inherited from

[`Options`](./durability.md#options).[`activationProjection`](./durability.md#activationprojection)

<a id="addresses-1"></a>

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](./runtime/namespaces/Runtime.md#addressbinding)[]

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`addresses`](./durability.md#addresses)

<a id="admissionreservebytes-1"></a>

##### admissionReserveBytes?

> `readonly` `optional` **admissionReserveBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`admissionReserveBytes`](./durability.md#admissionreservebytes)

<a id="bucket-1"></a>

##### bucket

> `readonly` **bucket**: [`Bucket`](./durability.r2.md#bucket)

**`Experimental`**

<a id="environment-1"></a>

##### environment

> `readonly` **environment**: `string`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`environment`](./durability.md#environment)

<a id="maxcommitbytes-1"></a>

##### maxCommitBytes?

> `readonly` `optional` **maxCommitBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`maxCommitBytes`](./durability.md#maxcommitbytes)

<a id="maxconflictretries-1"></a>

##### maxConflictRetries?

> `readonly` `optional` **maxConflictRetries?**: `number`

**`Experimental`**

Number of deterministic reevaluations after a competing command wins; zero disables retries.

###### Inherited from

[`Options`](./durability.md#options).[`maxConflictRetries`](./durability.md#maxconflictretries)

<a id="maxreplaybytes-1"></a>

##### maxReplayBytes?

> `readonly` `optional` **maxReplayBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`maxReplayBytes`](./durability.md#maxreplaybytes)

<a id="maxstatebytes-1"></a>

##### maxStateBytes?

> `readonly` `optional` **maxStateBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`maxStateBytes`](./durability.md#maxstatebytes)

<a id="messagingpolicy-1"></a>

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](./runtime/namespaces/Messaging/namespaces/MessagingPolicy.md#service)

**`Experimental`**

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`Options`](./durability.md#options).[`messagingPolicy`](./durability.md#messagingpolicy)

<a id="ownershipleasemillis-1"></a>

##### ownershipLeaseMillis?

> `readonly` `optional` **ownershipLeaseMillis?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`ownershipLeaseMillis`](./durability.md#ownershipleasemillis)

<a id="partition-1"></a>

##### partition

> `readonly` **partition**: `string`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`partition`](./durability.md#partition)

<a id="reconcileinterval-1"></a>

##### reconcileInterval?

> `readonly` `optional` **reconcileInterval?**: `Input`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`reconcileInterval`](./durability.md#reconcileinterval)

<a id="scheduler-1"></a>

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

<a id="snapshotevery-1"></a>

##### snapshotEvery?

> `readonly` `optional` **snapshotEvery?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`snapshotEvery`](./durability.md#snapshotevery)

<a id="subscriberqueuecapacity-1"></a>

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`subscriberQueueCapacity`](./durability.md#subscriberqueuecapacity)

<a id="tenant-1"></a>

##### tenant

> `readonly` **tenant**: `string`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`tenant`](./durability.md#tenant)

<a id="workerid-1"></a>

##### workerId?

> `readonly` `optional` **workerId?**: `string`

**`Experimental`**

###### Inherited from

[`Options`](./durability.md#options).[`workerId`](./durability.md#workerid)

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`{ bucket, ...options }`) => `Layer.Layer`\<[`RuntimeServices`](./durability.md#runtimeservices), `ActivationFailure`, `Crypto.Crypto` \| [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver)\>

**`Experimental`**

Scoped execution host. Alarm-driven hosts use schedulerMode: "external".

#### Parameters

##### \{ bucket, ...options \}

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`RuntimeServices`](./durability.md#runtimeservices), `ActivationFailure`, `Crypto.Crypto` \| [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver)\>

***

<a id="layerrunstore"></a>

### layerRunStore

> `const` **layerRunStore**: (`{ bucket, ...options }`) => `Layer.Layer`\<[`Activation`](./durability.md#activation) \| [`ExternalChildStore`](./unstable.runtime.external-child-store.md#externalchildstore) \| [`RunStore`](./runtime/namespaces/RunStore.md#runstore) \| `StoreActivation`, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable), `Crypto.Crypto`\>

**`Experimental`**

Native R2 persistence; Durable Object storage is never runtime authority.

#### Parameters

##### \{ bucket, ...options \}

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`Activation`](./durability.md#activation) \| [`ExternalChildStore`](./unstable.runtime.external-child-store.md#externalchildstore) \| [`RunStore`](./runtime/namespaces/RunStore.md#runstore) \| `StoreActivation`, [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable), `Crypto.Crypto`\>

***

<a id="make"></a>

### make

> `const` **make**: (`{ storage, fuel, bucket, ...options }`) => `Effect.Effect`\<[`Host`](#host), [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable), `Scope.Scope` \| `Crypto.Crypto` \| [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver)\>

**`Experimental`**

Construct once in the application's scope; no Runtime work starts in construction.
Calls initialize single-flight, observe ownership failure, and release idle execution scopes.
The application supplies Crypto and its exact persisted executable resolver.

#### Parameters

##### \{ storage, fuel, bucket, ...options \}

[`HostOptions`](#hostoptions)

#### Returns

`Effect.Effect`\<[`Host`](#host), [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable), `Scope.Scope` \| `Crypto.Crypto` \| [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver)\>

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
