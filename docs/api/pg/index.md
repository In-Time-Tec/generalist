[**generalist**](../index)

***

[generalist](../index) / pg

# pg

## Namespaces

- [RuntimeSchema](./namespaces/RuntimeSchema)

## Interfaces

### Options

PostgreSQL Runtime options independent of client acquisition.

#### Extends

- [`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions)

#### Extended by

- [`UrlOptions`](#urloptions)

#### Properties

##### activationProjection?

> `readonly` `optional` **activationProjection?**: [`RunActivationProjection`](../runtime.sql-driver/index#runactivationprojection)

Final-state callback executed synchronously inside each authoritative store transaction.

###### Inherited from

[`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions).[`activationProjection`](../runtime.sql-driver/index#activationprojection-1)

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](../runtime/namespaces/Runtime#addressbinding)[]

###### Inherited from

[`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions).[`addresses`](../runtime.sql-driver/index#addresses-1)

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](../runtime/namespaces/Messaging/namespaces/MessagingPolicy#service)

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions).[`messagingPolicy`](../runtime.sql-driver/index#messagingpolicy-1)

##### scheduler?

> `readonly` `optional` **scheduler?**: `object`

###### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

###### Inherited from

[`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions).[`scheduler`](../runtime.sql-driver/index#scheduler-1)

##### source?

> `readonly` `optional` **source?**: `string`

###### Overrides

[`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions).[`source`](../runtime.sql-driver/index#source-6)

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

###### Inherited from

[`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions).[`subscriberQueueCapacity`](../runtime.sql-driver/index#subscriberqueuecapacity-1)

***

### UrlOptions

PostgreSQL Runtime options for the URL-backed convenience Layer.

#### Extends

- [`Options`](#options)

#### Properties

##### activationProjection?

> `readonly` `optional` **activationProjection?**: [`RunActivationProjection`](../runtime.sql-driver/index#runactivationprojection)

Final-state callback executed synchronously inside each authoritative store transaction.

###### Inherited from

[`Options`](#options).[`activationProjection`](#activationprojection)

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](../runtime/namespaces/Runtime#addressbinding)[]

###### Inherited from

[`Options`](#options).[`addresses`](#addresses)

##### maxConnections?

> `readonly` `optional` **maxConnections?**: `number`

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](../runtime/namespaces/Messaging/namespaces/MessagingPolicy#service)

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`Options`](#options).[`messagingPolicy`](#messagingpolicy)

##### scheduler?

> `readonly` `optional` **scheduler?**: `object`

###### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

###### Inherited from

[`Options`](#options).[`scheduler`](#scheduler)

##### source?

> `readonly` `optional` **source?**: `string`

###### Inherited from

[`Options`](#options).[`source`](#source)

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

###### Inherited from

[`Options`](#options).[`subscriberQueueCapacity`](#subscriberqueuecapacity)

##### url

> `readonly` **url**: `string`

## Type Aliases

### RuntimeError

> **RuntimeError** = [`SqlDriverStoreError`](../runtime.sql-driver/index#sqldriverstoreerror)

PostgreSQL Runtime construction failures.

## Functions

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
