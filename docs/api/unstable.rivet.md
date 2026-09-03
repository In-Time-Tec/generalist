[**generalist**](./index)

***

[generalist](./index) / unstable.rivet

# unstable.rivet

## Interfaces

<a id="runtimeactoroptions"></a>

### RuntimeActorOptions

**`Experimental`**

#### Extends

- `Omit`\<[`SqliteStoreOptions`](./runtime.sql-driver/index#sqlitestoreoptions), `"activationProjection"` \| `"source"`\>

#### Properties

<a id="actoroptions"></a>

##### actorOptions?

> `readonly` `optional` **actorOptions?**: `object`

**`Experimental`**

Rivet process-lifecycle tuning; it never carries Runtime authority.

<a id="addresses"></a>

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](./runtime/namespaces/Runtime#addressbinding)[]

**`Experimental`**

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime#layeroptions).[`addresses`](./runtime/namespaces/Runtime#addresses)

<a id="drainfuel"></a>

##### drainFuel?

> `readonly` `optional` **drainFuel?**: `number`

**`Experimental`**

Bounded authoritative candidates processed per wake.

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

Bounded stale claims recovered per startup transaction.

<a id="resolver"></a>

##### resolver

> `readonly` **resolver**: `Layer`\<[`ExecutableResolver`](./runtime/namespaces/ExecutableResolver#executableresolver)\>

**`Experimental`**

Application-owned executable reconstruction composed into each actor incarnation.

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

## Type Aliases

<a id="runtimeactordefinition"></a>

### RuntimeActorDefinition

> **RuntimeActorDefinition** = `ActorDefinition`\<`undefined`, `undefined`, `undefined`, `Vars`, `undefined`, `ReturnType`\<*typeof* `db`\>, `Record`\<`never`, `never`\>, `Record`\<`never`, `never`\>, `RuntimeActions`\>

**`Experimental`**

One typed Rivet Actor definition owning one Runtime partition.

## Variables

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
