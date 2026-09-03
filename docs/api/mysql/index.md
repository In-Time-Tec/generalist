[**generalist**](../index)

***

[generalist](../index) / mysql

# mysql

## Namespaces

- [RuntimeSchema](./namespaces/RuntimeSchema)

## Interfaces

### Options

#### Extends

- [`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions)

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

##### maxConnections?

> `readonly` `optional` **maxConnections?**: `number`

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](../runtime/namespaces/Messaging/namespaces/MessagingPolicy#service)

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`SqlStoreOptions`](../runtime.sql-driver/index#sqlstoreoptions).[`messagingPolicy`](../runtime.sql-driver/index#messagingpolicy-1)

##### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

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

##### url

> `readonly` **url**: `string`

## Type Aliases

### RuntimeError

> **RuntimeError** = [`SqlDriverStoreError`](../runtime.sql-driver/index#sqldriverstoreerror)

## Variables

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`SqlRuntimeServices`](../runtime.sql-driver/index#sqlruntimeservices), [`RuntimeError`](#runtimeerror) \| `SqlError` \| `Config.ConfigError`, [`ExecutableResolver`](../runtime/namespaces/ExecutableResolver#executableresolver)\>

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`SqlRuntimeServices`](../runtime.sql-driver/index#sqlruntimeservices), [`RuntimeError`](#runtimeerror) \| `SqlError` \| `Config.ConfigError`, [`ExecutableResolver`](../runtime/namespaces/ExecutableResolver#executableresolver)\>
