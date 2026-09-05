[**generalist**](./index)

***

[generalist](./index) / unstable.rivet

# unstable.rivet

## Classes

<a id="actorruntime"></a>

### ActorRuntime

**`Experimental`**

Host operations sharing the actor's Runtime and SQLite transaction domain.

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

<a id="actorruntimeoptions"></a>

### ActorRuntimeOptions

**`Experimental`**

Runtime construction inside an application-owned actor wake scope.

#### Extends

- `Omit`\<[`SqliteStoreOptions`](./runtime.sql-driver/index#sqlitestoreoptions), `"activationProjection"` \| `"source"`\>

#### Properties

<a id="activationprojection"></a>

##### activationProjection?

> `readonly` `optional` **activationProjection?**: (`sql`) => [`RunActivationProjection`](./runtime.sql-driver/index#runactivationprojection)

**`Experimental`**

Product-only projection. The host always composes its own durable activation projection after this.

###### Parameters

###### sql

`SqlClient`

###### Returns

[`RunActivationProjection`](./runtime.sql-driver/index#runactivationprojection)

<a id="addresses"></a>

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](./runtime/namespaces/Runtime#addressbinding)[]

**`Experimental`**

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime#layeroptions).[`addresses`](./runtime/namespaces/Runtime#addresses)

<a id="drainaction"></a>

##### drainAction

> `readonly` **drainAction**: `string`

**`Experimental`**

Scheduled action that invokes ActorRuntime.drain. It must be present on the actor.

<a id="drainfuel"></a>

##### drainFuel?

> `readonly` `optional` **drainFuel?**: `number`

**`Experimental`**

<a id="initialize"></a>

##### initialize?

> `readonly` `optional` **initialize?**: `Effect`\<`void`, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| `SqlError`, `SqlClient`\>

**`Experimental`**

Initialize product tables before Runtime construction and recovery. Must be safe on every wake.

<a id="messagingpolicy"></a>

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](./runtime/namespaces/Messaging/namespaces/MessagingPolicy#service)

**`Experimental`**

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime#layeroptions).[`messagingPolicy`](./runtime/namespaces/Runtime#messagingpolicy)

<a id="multiworker"></a>

##### multiWorker?

> `readonly` `optional` **multiWorker?**: `boolean`

**`Experimental`**

###### Inherited from

[`SqliteStoreOptions`](./runtime.sql-driver/index#sqlitestoreoptions).[`multiWorker`](./runtime.sql-driver/index#multiworker)

<a id="recoveryintervalmillis"></a>

##### recoveryIntervalMillis?

> `readonly` `optional` **recoveryIntervalMillis?**: `number`

**`Experimental`**

Durable fallback doorbell interval. Rivet requires at least 5 seconds.

<a id="recoverypagesize"></a>

##### recoveryPageSize?

> `readonly` `optional` **recoveryPageSize?**: `number`

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

[`LayerOptions`](./runtime/namespaces/Runtime#layeroptions).[`scheduler`](./runtime/namespaces/Runtime#scheduler)

<a id="subscriberqueuecapacity"></a>

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

**`Experimental`**

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime#layeroptions).[`subscriberQueueCapacity`](./runtime/namespaces/Runtime#subscriberqueuecapacity)

<a id="workers"></a>

##### workers?

> `readonly` `optional` **workers?**: `number`

**`Experimental`**

###### Inherited from

[`SqliteStoreOptions`](./runtime.sql-driver/index#sqlitestoreoptions).[`workers`](./runtime.sql-driver/index#workers)

***

<a id="runtimeactoroptions"></a>

### RuntimeActorOptions

**`Experimental`**

#### Extends

- `Omit`\<[`ActorRuntimeOptions`](#actorruntimeoptions), `"drainAction"`\>

#### Properties

<a id="activationprojection-1"></a>

##### activationProjection?

> `readonly` `optional` **activationProjection?**: (`sql`) => [`RunActivationProjection`](./runtime.sql-driver/index#runactivationprojection)

**`Experimental`**

Product-only projection. The host always composes its own durable activation projection after this.

###### Parameters

###### sql

`SqlClient`

###### Returns

[`RunActivationProjection`](./runtime.sql-driver/index#runactivationprojection)

###### Inherited from

`Omit.activationProjection`

<a id="actoroptions"></a>

##### actorOptions?

> `readonly` `optional` **actorOptions?**: `object`

**`Experimental`**

Rivet process-lifecycle tuning; it never carries Runtime authority.

<a id="addresses-1"></a>

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](./runtime/namespaces/Runtime#addressbinding)[]

**`Experimental`**

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime#layeroptions).[`addresses`](./runtime/namespaces/Runtime#addresses)

<a id="drainfuel-1"></a>

##### drainFuel?

> `readonly` `optional` **drainFuel?**: `number`

**`Experimental`**

###### Inherited from

[`ActorRuntimeOptions`](#actorruntimeoptions).[`drainFuel`](#drainfuel)

<a id="initialize-1"></a>

##### initialize?

> `readonly` `optional` **initialize?**: `Effect`\<`void`, [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| `SqlError`, `SqlClient`\>

**`Experimental`**

Initialize product tables before Runtime construction and recovery. Must be safe on every wake.

###### Inherited from

`Omit.initialize`

<a id="messagingpolicy-1"></a>

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](./runtime/namespaces/Messaging/namespaces/MessagingPolicy#service)

**`Experimental`**

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime#layeroptions).[`messagingPolicy`](./runtime/namespaces/Runtime#messagingpolicy)

<a id="multiworker-1"></a>

##### multiWorker?

> `readonly` `optional` **multiWorker?**: `boolean`

**`Experimental`**

###### Inherited from

[`SqliteStoreOptions`](./runtime.sql-driver/index#sqlitestoreoptions).[`multiWorker`](./runtime.sql-driver/index#multiworker)

<a id="recoveryintervalmillis-1"></a>

##### recoveryIntervalMillis?

> `readonly` `optional` **recoveryIntervalMillis?**: `number`

**`Experimental`**

Durable fallback doorbell interval. Rivet requires at least 5 seconds.

###### Inherited from

[`ActorRuntimeOptions`](#actorruntimeoptions).[`recoveryIntervalMillis`](#recoveryintervalmillis)

<a id="recoverypagesize-1"></a>

##### recoveryPageSize?

> `readonly` `optional` **recoveryPageSize?**: `number`

**`Experimental`**

###### Inherited from

[`ActorRuntimeOptions`](#actorruntimeoptions).[`recoveryPageSize`](#recoverypagesize)

<a id="resolver"></a>

##### resolver

> `readonly` **resolver**: `Layer`\<[`ExecutableResolver`](./runtime/namespaces/ExecutableResolver#executableresolver)\>

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

[`LayerOptions`](./runtime/namespaces/Runtime#layeroptions).[`scheduler`](./runtime/namespaces/Runtime#scheduler)

<a id="subscriberqueuecapacity-1"></a>

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

**`Experimental`**

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime#layeroptions).[`subscriberQueueCapacity`](./runtime/namespaces/Runtime#subscriberqueuecapacity)

<a id="workers-1"></a>

##### workers?

> `readonly` `optional` **workers?**: `number`

**`Experimental`**

###### Inherited from

[`SqliteStoreOptions`](./runtime.sql-driver/index#sqlitestoreoptions).[`workers`](./runtime.sql-driver/index#workers)

## Type Aliases

<a id="actorruntimeservices"></a>

### ActorRuntimeServices

> **ActorRuntimeServices** = [`SqliteRuntimeServices`](./runtime.sql-driver/index#sqliteruntimeservices) \| `SqlClient.SqlClient` \| [`ActorRuntime`](#actorruntime)

**`Experimental`**

Services installed by layerActorRuntime in one actor-owned ManagedRuntime.

***

<a id="runtimeactorcontext"></a>

### RuntimeActorContext

> **RuntimeActorContext** = `Pick`\<`ActorContext`\<`undefined`, `undefined`, `undefined`, `undefined`, `undefined`, `ReturnType`\<*typeof* `db`\>\>, `"actorId"` \| `"db"` \| `"schedule"` \| `"cron"`\>

**`Experimental`**

Only the Rivet capabilities needed by the Runtime host; no vars or connection state.

***

<a id="runtimeactordefinition"></a>

### RuntimeActorDefinition

> **RuntimeActorDefinition** = `ActorDefinition`\<`undefined`, `undefined`, `undefined`, `Vars`, `undefined`, `ReturnType`\<*typeof* `db`\>, `Record`\<`never`, `never`\>, `Record`\<`never`, `never`\>, `RuntimeActions`\>

**`Experimental`**

One typed Rivet Actor definition owning one Runtime partition.

## Variables

<a id="layeractorruntime"></a>

### layerActorRuntime

> `const` **layerActorRuntime**: \{(`context`, `options`): `Layer`\<[`ActorRuntimeServices`](#actorruntimeservices), [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`SqliteStoreError`](./runtime.sql-driver/index#sqlitestoreerror) \| `SqlError`, [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver#executableresolver)\>; (`options`): (`context`) => `Layer`\<[`ActorRuntimeServices`](#actorruntimeservices), [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`SqliteStoreError`](./runtime.sql-driver/index#sqlitestoreerror) \| `SqlError`, [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver#executableresolver)\>; \}

**`Experimental`**

Build once in onWake and dispose the owning ManagedRuntime in onSleep/onDestroy.

Product actions use this same runtime. Never wrap Runtime.send in an outer SQL transaction:
activationProjection runs inside Runtime's own transaction and rolls back together with it.
No Rivet State copy, second SQLite client, independent scheduler, or independent Runtime is created.

#### Call Signature

> (`context`, `options`): `Layer`\<[`ActorRuntimeServices`](#actorruntimeservices), [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`SqliteStoreError`](./runtime.sql-driver/index#sqlitestoreerror) \| `SqlError`, [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver#executableresolver)\>

##### Parameters

###### context

[`RuntimeActorContext`](#runtimeactorcontext)

###### options

[`ActorRuntimeOptions`](#actorruntimeoptions)

##### Returns

`Layer`\<[`ActorRuntimeServices`](#actorruntimeservices), [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`SqliteStoreError`](./runtime.sql-driver/index#sqlitestoreerror) \| `SqlError`, [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver#executableresolver)\>

#### Call Signature

> (`options`): (`context`) => `Layer`\<[`ActorRuntimeServices`](#actorruntimeservices), [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`SqliteStoreError`](./runtime.sql-driver/index#sqlitestoreerror) \| `SqlError`, [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver#executableresolver)\>

##### Parameters

###### options

[`ActorRuntimeOptions`](#actorruntimeoptions)

##### Returns

(`context`) => `Layer`\<[`ActorRuntimeServices`](#actorruntimeservices), [`RuntimeUnavailable`](./runtime/namespaces/Errors#runtimeunavailable) \| [`SqliteStoreError`](./runtime.sql-driver/index#sqlitestoreerror) \| `SqlError`, [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver#executableresolver)\>

***

<a id="makeruntimeactor"></a>

### makeRuntimeActor

> `const` **makeRuntimeActor**: (`options`) => [`RuntimeActorDefinition`](#runtimeactordefinition)

**`Experimental`**

Build one Rivet Actor per Runtime partition.

Actor SQLite is the only mutable Runtime authority. Schedules and cron are lossy doorbells.

#### Parameters

##### options

[`RuntimeActorOptions`](#runtimeactoroptions)

#### Returns

[`RuntimeActorDefinition`](#runtimeactordefinition)
