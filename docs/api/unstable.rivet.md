[**generalist**](./index.md)

***

[generalist](./index.md) / unstable.rivet

# unstable.rivet

## Classes

<a id="actorruntime"></a>

### ActorRuntime

**`Experimental`**

Operations sharing one object-native Runtime and actor-owned scope.

#### Extends

- `ActorRuntime_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new ActorRuntime**(`_`): [`ActorRuntime`](#actorruntime)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`ActorRuntime`](#actorruntime)

###### Inherited from

`ActorRuntime_base.constructor`

## Interfaces

<a id="actorruntimecontext"></a>

### ActorRuntimeContext

**`Experimental`**

Diagnostic identity for an application-owned wake scope, not storage authority.

#### Properties

<a id="ownerid"></a>

##### ownerId

> `readonly` **ownerId**: `string`

**`Experimental`**

***

<a id="actorruntimeoptions"></a>

### ActorRuntimeOptions

**`Experimental`**

Runtime construction inside an application-owned actor wake scope.

#### Extends

- `Omit`\<[`Options`](./durability.md#options), `"schedulerMode"`\>

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

<a id="drainaction"></a>

##### drainAction

> `readonly` **drainAction**: `string`

**`Experimental`**

<a id="drainfuel"></a>

##### drainFuel?

> `readonly` `optional` **drainFuel?**: `number`

**`Experimental`**

<a id="environment"></a>

##### environment

> `readonly` **environment**: `string`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`environment`](./unstable.cloudflare.durable-objects.md#environment-1)

<a id="initialize"></a>

##### initialize?

> `readonly` `optional` **initialize?**: (`context`) => `Effect`\<`void`, `ActivationFailure`, [`RuntimeServices`](./durability.md#runtimeservices)\>

**`Experimental`**

###### Parameters

###### context

[`ActorRuntimeContext`](#actorruntimecontext)

###### Returns

`Effect`\<`void`, `ActivationFailure`, [`RuntimeServices`](./durability.md#runtimeservices)\>

<a id="maxcommitbytes"></a>

##### maxCommitBytes?

> `readonly` `optional` **maxCommitBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`maxCommitBytes`](./unstable.cloudflare.durable-objects.md#maxcommitbytes-1)

<a id="maxconflictretries"></a>

##### maxConflictRetries?

> `readonly` `optional` **maxConflictRetries?**: `number`

**`Experimental`**

Number of deterministic reevaluations after a competing command wins; zero disables retries.

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`maxConflictRetries`](./unstable.cloudflare.durable-objects.md#maxconflictretries-1)

<a id="maxreplaybytes"></a>

##### maxReplayBytes?

> `readonly` `optional` **maxReplayBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`maxReplayBytes`](./unstable.cloudflare.durable-objects.md#maxreplaybytes-1)

<a id="maxstatebytes"></a>

##### maxStateBytes?

> `readonly` `optional` **maxStateBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`maxStateBytes`](./unstable.cloudflare.durable-objects.md#maxstatebytes-1)

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

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`ownershipLeaseMillis`](./unstable.cloudflare.durable-objects.md#ownershipleasemillis-1)

<a id="partition"></a>

##### partition

> `readonly` **partition**: `string`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`partition`](./unstable.cloudflare.durable-objects.md#partition-1)

<a id="reconcile"></a>

##### reconcile?

> `readonly` `optional` **reconcile?**: (`context`) => `Effect`\<`number` \| `undefined`, `ActivationFailure`, [`RuntimeServices`](./durability.md#runtimeservices)\>

**`Experimental`**

###### Parameters

###### context

[`ActorRuntimeContext`](#actorruntimecontext)

###### Returns

`Effect`\<`number` \| `undefined`, `ActivationFailure`, [`RuntimeServices`](./durability.md#runtimeservices)\>

<a id="reconcileinterval"></a>

##### reconcileInterval?

> `readonly` `optional` **reconcileInterval?**: `Input`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`reconcileInterval`](./unstable.cloudflare.durable-objects.md#reconcileinterval-1)

<a id="recoveryintervalmillis"></a>

##### recoveryIntervalMillis?

> `readonly` `optional` **recoveryIntervalMillis?**: `number`

**`Experimental`**

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

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`snapshotEvery`](./unstable.cloudflare.durable-objects.md#snapshotevery-1)

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

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`tenant`](./unstable.cloudflare.durable-objects.md#tenant-1)

<a id="workerid"></a>

##### workerId?

> `readonly` `optional` **workerId?**: `string`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`workerId`](./unstable.cloudflare.durable-objects.md#workerid-1)

***

<a id="runtimeactoridentity"></a>

### RuntimeActorIdentity

**`Experimental`**

Stable actor identity available before Runtime construction.

#### Properties

<a id="actorid"></a>

##### actorId

> `readonly` **actorId**: `string`

**`Experimental`**

<a id="key"></a>

##### key

> `readonly` **key**: readonly `string`[]

**`Experimental`**

***

<a id="runtimeactoroptions"></a>

### RuntimeActorOptions

**`Experimental`**

#### Extends

- `Omit`\<[`ActorRuntimeOptions`](#actorruntimeoptions), `"drainAction"` \| `"environment"` \| `"tenant"` \| `"partition"`\>

#### Properties

<a id="activationprojection-1"></a>

##### activationProjection?

> `readonly` `optional` **activationProjection?**: `RunActivationProjection`

**`Experimental`**

Final-state callback executed synchronously inside each authoritative store transaction.

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`activationProjection`](./runtime/namespaces/Runtime.md#activationprojection)

<a id="actoroptions"></a>

##### actorOptions?

> `readonly` `optional` **actorOptions?**: `object`

**`Experimental`**

Rivet process-lifecycle tuning; it never carries Runtime authority.

<a id="addresses-1"></a>

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](./runtime/namespaces/Runtime.md#addressbinding)[]

**`Experimental`**

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`addresses`](./runtime/namespaces/Runtime.md#addresses)

<a id="drainfuel-1"></a>

##### drainFuel?

> `readonly` `optional` **drainFuel?**: `number`

**`Experimental`**

###### Inherited from

[`ActorRuntimeOptions`](#actorruntimeoptions).[`drainFuel`](#drainfuel)

<a id="initialize-1"></a>

##### initialize?

> `readonly` `optional` **initialize?**: (`context`) => `Effect`\<`void`, `ActivationFailure`, [`RuntimeServices`](./durability.md#runtimeservices)\>

**`Experimental`**

###### Parameters

###### context

[`ActorRuntimeContext`](#actorruntimecontext)

###### Returns

`Effect`\<`void`, `ActivationFailure`, [`RuntimeServices`](./durability.md#runtimeservices)\>

###### Inherited from

`Omit.initialize`

<a id="maxcommitbytes-1"></a>

##### maxCommitBytes?

> `readonly` `optional` **maxCommitBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`maxCommitBytes`](./unstable.cloudflare.durable-objects.md#maxcommitbytes-1)

<a id="maxconflictretries-1"></a>

##### maxConflictRetries?

> `readonly` `optional` **maxConflictRetries?**: `number`

**`Experimental`**

Number of deterministic reevaluations after a competing command wins; zero disables retries.

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`maxConflictRetries`](./unstable.cloudflare.durable-objects.md#maxconflictretries-1)

<a id="maxreplaybytes-1"></a>

##### maxReplayBytes?

> `readonly` `optional` **maxReplayBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`maxReplayBytes`](./unstable.cloudflare.durable-objects.md#maxreplaybytes-1)

<a id="maxstatebytes-1"></a>

##### maxStateBytes?

> `readonly` `optional` **maxStateBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`maxStateBytes`](./unstable.cloudflare.durable-objects.md#maxstatebytes-1)

<a id="messagingpolicy-1"></a>

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](./runtime/namespaces/Messaging/namespaces/MessagingPolicy.md#service)

**`Experimental`**

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`messagingPolicy`](./runtime/namespaces/Runtime.md#messagingpolicy)

<a id="namespace"></a>

##### namespace

> `readonly` **namespace**: (`identity`) => `object`

**`Experimental`**

Cached for this incarnation; applications must preserve key-to-namespace routing across incarnations.

###### Parameters

###### identity

[`RuntimeActorIdentity`](#runtimeactoridentity)

###### Returns

`object`

###### environment

> `readonly` **environment**: `string`

###### partition

> `readonly` **partition**: `string`

###### tenant

> `readonly` **tenant**: `string`

<a id="ownershipleasemillis-1"></a>

##### ownershipLeaseMillis?

> `readonly` `optional` **ownershipLeaseMillis?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`ownershipLeaseMillis`](./unstable.cloudflare.durable-objects.md#ownershipleasemillis-1)

<a id="reconcile-1"></a>

##### reconcile?

> `readonly` `optional` **reconcile?**: (`context`) => `Effect`\<`number` \| `undefined`, `ActivationFailure`, [`RuntimeServices`](./durability.md#runtimeservices)\>

**`Experimental`**

###### Parameters

###### context

[`ActorRuntimeContext`](#actorruntimecontext)

###### Returns

`Effect`\<`number` \| `undefined`, `ActivationFailure`, [`RuntimeServices`](./durability.md#runtimeservices)\>

###### Inherited from

`Omit.reconcile`

<a id="reconcileinterval-1"></a>

##### reconcileInterval?

> `readonly` `optional` **reconcileInterval?**: `Input`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`reconcileInterval`](./unstable.cloudflare.durable-objects.md#reconcileinterval-1)

<a id="recoveryintervalmillis-1"></a>

##### recoveryIntervalMillis?

> `readonly` `optional` **recoveryIntervalMillis?**: `number`

**`Experimental`**

###### Inherited from

[`ActorRuntimeOptions`](#actorruntimeoptions).[`recoveryIntervalMillis`](#recoveryintervalmillis)

<a id="resolver"></a>

##### resolver

> `readonly` **resolver**: `Layer`\<[`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver)\>

**`Experimental`**

Application-owned executable reconstruction composed into each actor incarnation.

<a id="scheduler-1"></a>

##### scheduler?

> `readonly` `optional` **scheduler?**: `object`

**`Experimental`**

###### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`scheduler`](./runtime/namespaces/Runtime.md#scheduler)

<a id="snapshotevery-1"></a>

##### snapshotEvery?

> `readonly` `optional` **snapshotEvery?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`snapshotEvery`](./unstable.cloudflare.durable-objects.md#snapshotevery-1)

<a id="storage"></a>

##### storage

> `readonly` **storage**: `Layer`\<`Crypto` \| `ObjectStore`\>

**`Experimental`**

Application-owned transport and cryptography; never actor-local durability.

<a id="subscriberqueuecapacity-1"></a>

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

**`Experimental`**

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`subscriberQueueCapacity`](./runtime/namespaces/Runtime.md#subscriberqueuecapacity)

<a id="workerid-1"></a>

##### workerId?

> `readonly` `optional` **workerId?**: `string`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`workerId`](./unstable.cloudflare.durable-objects.md#workerid-1)

## Type Aliases

<a id="actorruntimeservices"></a>

### ActorRuntimeServices

> **ActorRuntimeServices** = [`RuntimeServices`](./durability.md#runtimeservices) \| [`ActorRuntime`](#actorruntime)

**`Experimental`**

Services installed in one actor-owned ManagedRuntime.

***

<a id="runtimeactorcontext"></a>

### RuntimeActorContext

> **RuntimeActorContext** = `Pick`\<`ActorContext`\<`undefined`, `undefined`, `undefined`, `undefined`, `undefined`, `undefined`\>, `"actorId"` \| `"schedule"` \| `"cron"`\>

**`Experimental`**

Rivet capabilities used only as wake hints.

***

<a id="runtimeactordefinition"></a>

### RuntimeActorDefinition

> **RuntimeActorDefinition** = `ActorDefinition`\<`undefined`, `undefined`, `undefined`, `Vars`, `undefined`, `undefined`, `Record`\<`never`, `never`\>, `Record`\<`never`, `never`\>, `RuntimeActions`\>

**`Experimental`**

One typed Rivet Actor definition owning one Runtime partition.

***

<a id="runtimeactornamespace"></a>

### RuntimeActorNamespace

> **RuntimeActorNamespace** = *typeof* `RuntimeActorNamespace.Type`

**`Experimental`**

## Variables

<a id="layeractorruntime"></a>

### layerActorRuntime

> `const` **layerActorRuntime**: \{(`context`, `options`): `Layer`\<[`ActorRuntimeServices`](#actorruntimeservices), `ActivationFailure`, `Crypto` \| `ObjectStore` \| [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver)\>; (`options`): (`context`) => `Layer`\<[`ActorRuntimeServices`](#actorruntimeservices), `ActivationFailure`, `Crypto` \| `ObjectStore` \| [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver)\>; \}

**`Experimental`**

Build in onWake, drain after readiness, observe failure, and dispose the owning ManagedRuntime on shutdown.

#### Call Signature

> (`context`, `options`): `Layer`\<[`ActorRuntimeServices`](#actorruntimeservices), `ActivationFailure`, `Crypto` \| `ObjectStore` \| [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver)\>

##### Parameters

###### context

[`RuntimeActorContext`](#runtimeactorcontext)

###### options

[`ActorRuntimeOptions`](#actorruntimeoptions)

##### Returns

`Layer`\<[`ActorRuntimeServices`](#actorruntimeservices), `ActivationFailure`, `Crypto` \| `ObjectStore` \| [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver)\>

#### Call Signature

> (`options`): (`context`) => `Layer`\<[`ActorRuntimeServices`](#actorruntimeservices), `ActivationFailure`, `Crypto` \| `ObjectStore` \| [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver)\>

##### Parameters

###### options

[`ActorRuntimeOptions`](#actorruntimeoptions)

##### Returns

(`context`) => `Layer`\<[`ActorRuntimeServices`](#actorruntimeservices), `ActivationFailure`, `Crypto` \| `ObjectStore` \| [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver)\>

***

<a id="makeruntimeactor"></a>

### makeRuntimeActor

> `const` **makeRuntimeActor**: (`options`) => [`RuntimeActorDefinition`](#runtimeactordefinition)

**`Experimental`**

Build one Rivet Actor per Runtime partition.

The object journal is the only Runtime authority. Schedules and cron are wake hints.

#### Parameters

##### options

[`RuntimeActorOptions`](#runtimeactoroptions)

#### Returns

[`RuntimeActorDefinition`](#runtimeactordefinition)

***

<a id="runtimeactornamespace-1"></a>

### RuntimeActorNamespace

> `const` **RuntimeActorNamespace**: `Schema.Struct`\<\{ `environment`: `Schema.String`; `partition`: `Schema.String`; `tenant`: `Schema.String`; \}\>

**`Experimental`**

Canonical object namespace resolved for one actor instance.
