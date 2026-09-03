[**generalist**](../index)

***

[generalist](../index) / pg

# pg

## Namespaces

- [RuntimeSchema](./namespaces/RuntimeSchema)

## Interfaces

<a id="options"></a>

### Options

PostgreSQL Runtime options independent of client acquisition.

#### Extends

- [`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions)

#### Extended by

- [`UrlOptions`](#urloptions)

#### Properties

<a id="activationprojection"></a>

##### activationProjection?

> `readonly` `optional` **activationProjection?**: [`RunActivationProjection`](../runtime.sql-driver/index#runactivationprojection)

Final-state callback executed synchronously inside each authoritative store transaction.

###### Inherited from

[`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions).[`activationProjection`](../runtime.sql-driver/index#activationprojection-1)

<a id="addresses"></a>

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](../runtime/namespaces/Runtime#addressbinding)[]

###### Inherited from

[`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions).[`addresses`](../runtime.sql-driver/index#addresses-1)

<a id="messagingpolicy"></a>

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](../runtime/namespaces/Messaging/namespaces/MessagingPolicy#service)

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions).[`messagingPolicy`](../runtime.sql-driver/index#messagingpolicy-1)

<a id="scheduler"></a>

##### scheduler?

> `readonly` `optional` **scheduler?**: `object`

###### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

###### Inherited from

[`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions).[`scheduler`](../runtime.sql-driver/index#scheduler-1)

<a id="source"></a>

##### source?

> `readonly` `optional` **source?**: `string`

###### Overrides

[`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions).[`source`](../runtime.sql-driver/index#source-6)

<a id="subscriberqueuecapacity"></a>

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

###### Inherited from

[`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions).[`subscriberQueueCapacity`](../runtime.sql-driver/index#subscriberqueuecapacity-1)

***

<a id="urloptions"></a>

### UrlOptions

PostgreSQL Runtime options for the URL-backed convenience Layer.

#### Extends

- [`Options`](#options)

#### Properties

<a id="activationprojection-1"></a>

##### activationProjection?

> `readonly` `optional` **activationProjection?**: [`RunActivationProjection`](../runtime.sql-driver/index#runactivationprojection)

Final-state callback executed synchronously inside each authoritative store transaction.

###### Inherited from

[`Options`](#options).[`activationProjection`](#activationprojection)

<a id="addresses-1"></a>

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](../runtime/namespaces/Runtime#addressbinding)[]

###### Inherited from

[`Options`](#options).[`addresses`](#addresses)

<a id="maxconnections"></a>

##### maxConnections?

> `readonly` `optional` **maxConnections?**: `number`

<a id="messagingpolicy-1"></a>

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](../runtime/namespaces/Messaging/namespaces/MessagingPolicy#service)

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`Options`](#options).[`messagingPolicy`](#messagingpolicy)

<a id="scheduler-1"></a>

##### scheduler?

> `readonly` `optional` **scheduler?**: `object`

###### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

###### Inherited from

[`Options`](#options).[`scheduler`](#scheduler)

<a id="source-1"></a>

##### source?

> `readonly` `optional` **source?**: `string`

###### Inherited from

[`Options`](#options).[`source`](#source)

<a id="subscriberqueuecapacity-1"></a>

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

###### Inherited from

[`Options`](#options).[`subscriberQueueCapacity`](#subscriberqueuecapacity)

<a id="url"></a>

##### url

> `readonly` **url**: `string`

## Type Aliases

<a id="runtimeerror"></a>

### RuntimeError

> **RuntimeError** = [`SqlDriverStoreError`](../runtime.sql-driver/index#sqldriverstoreerror)

PostgreSQL Runtime construction failures.

## Functions

<a id="layer"></a>

### layer()

#### Call Signature

> **layer**(`options`): `Layer`\<[`SqlRuntimeServices`](../runtime.sql-driver/index#sqlruntimeservices), [`SqlDriverStoreError`](../runtime.sql-driver/index#sqldriverstoreerror) \| `SqlError`, [`ExecutableResolver`](../runtime/namespaces/ExecutableResolver#executableresolver)\>

Build the PostgreSQL Runtime, optionally acquiring its client from a URL.

##### Parameters

###### options

[`UrlOptions`](#urloptions)

##### Returns

`Layer`\<[`SqlRuntimeServices`](../runtime.sql-driver/index#sqlruntimeservices), [`SqlDriverStoreError`](../runtime.sql-driver/index#sqldriverstoreerror) \| `SqlError`, [`ExecutableResolver`](../runtime/namespaces/ExecutableResolver#executableresolver)\>

#### Call Signature

> **layer**(`options`): `Layer`\<[`SqlRuntimeServices`](../runtime.sql-driver/index#sqlruntimeservices), [`SqlDriverStoreError`](../runtime.sql-driver/index#sqldriverstoreerror) \| `SqlError`, [`ExecutableResolver`](../runtime/namespaces/ExecutableResolver#executableresolver) \| `PgClient`\>

Build the PostgreSQL Runtime, optionally acquiring its client from a URL.

##### Parameters

###### options

[`Options`](#options)

##### Returns

`Layer`\<[`SqlRuntimeServices`](../runtime.sql-driver/index#sqlruntimeservices), [`SqlDriverStoreError`](../runtime.sql-driver/index#sqldriverstoreerror) \| `SqlError`, [`ExecutableResolver`](../runtime/namespaces/ExecutableResolver#executableresolver) \| `PgClient`\>
