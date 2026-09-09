[**generalist**](./index.md)

***

[generalist](./index.md) / durability

# durability

## Classes

<a id="activation"></a>

### Activation

The returned fiber reports ownership failure and is interrupted with the caller's scope.

#### Extends

- `Activation_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new Activation**(`_`): [`Activation`](#activation)

###### Parameters

###### \_

`never`

###### Returns

[`Activation`](#activation)

###### Inherited from

`Activation_base.constructor`

***

<a id="durabilityfailure"></a>

### DurabilityFailure

A canonical durability boundary could not establish a safe result.

#### Extends

- `DurabilityFailure_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new DurabilityFailure**(...`args`): [`DurabilityFailure`](#durabilityfailure)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`DurabilityFailure`](#durabilityfailure)

###### Inherited from

`DurabilityFailure_base.constructor`

#### Properties

<a id="cause"></a>

##### cause?

> `readonly` `optional` **cause?**: `ObjectStoreFailure`

###### Inherited from

`DurabilityFailure_base.cause`

<a id="commandid"></a>

##### commandId?

> `readonly` `optional` **commandId?**: `string`

###### Inherited from

`DurabilityFailure_base.commandId`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`DurabilityFailure_base.hint`

<a id="key"></a>

##### key?

> `readonly` `optional` **key?**: `string`

###### Inherited from

`DurabilityFailure_base.key`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`DurabilityFailure_base.message`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `"limit"` \| `"transport"` \| `"encoding"` \| `"corruption"` \| `"unsupported-version"` \| `"input-conflict"` \| `"indeterminate"` \| `"configuration"` \| `"crypto"` \| `"contention"`

###### Inherited from

`DurabilityFailure_base.reason`

## Interfaces

<a id="options"></a>

### Options

Canonical namespace and host configuration; construction only reconstructs state.

#### Extends

- [`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).`Options`

#### Extended by

- [`Options`](./unstable.cloudflare.durable-objects.md#options)

#### Properties

<a id="activationprojection"></a>

##### activationProjection?

> `readonly` `optional` **activationProjection?**: `RunActivationProjection`

Final-state callback executed synchronously inside each authoritative store transaction.

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`activationProjection`](./runtime/namespaces/Runtime.md#activationprojection)

<a id="addresses"></a>

##### addresses

> `readonly` **addresses**: readonly [`AddressBinding`](./runtime/namespaces/Runtime.md#addressbinding)[]

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`addresses`](./runtime/namespaces/Runtime.md#addresses)

<a id="admissionreservebytes"></a>

##### admissionReserveBytes?

> `readonly` `optional` **admissionReserveBytes?**: `number`

<a id="environment"></a>

##### environment

> `readonly` **environment**: `string`

###### Inherited from

`JournalOptions.environment`

<a id="maxcommitbytes"></a>

##### maxCommitBytes?

> `readonly` `optional` **maxCommitBytes?**: `number`

###### Inherited from

`JournalOptions.maxCommitBytes`

<a id="maxconflictretries"></a>

##### maxConflictRetries?

> `readonly` `optional` **maxConflictRetries?**: `number`

Number of deterministic reevaluations after a competing command wins; zero disables retries.

###### Inherited from

`JournalOptions.maxConflictRetries`

<a id="maxreplaybytes"></a>

##### maxReplayBytes?

> `readonly` `optional` **maxReplayBytes?**: `number`

###### Inherited from

`JournalOptions.maxReplayBytes`

<a id="maxstatebytes"></a>

##### maxStateBytes?

> `readonly` `optional` **maxStateBytes?**: `number`

###### Inherited from

`JournalOptions.maxStateBytes`

<a id="messagingpolicy"></a>

##### messagingPolicy?

> `readonly` `optional` **messagingPolicy?**: [`Service`](./runtime/namespaces/Messaging/namespaces/MessagingPolicy.md#service)

Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only.

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`messagingPolicy`](./runtime/namespaces/Runtime.md#messagingpolicy)

<a id="ownershipleasemillis"></a>

##### ownershipLeaseMillis?

> `readonly` `optional` **ownershipLeaseMillis?**: `number`

<a id="partition"></a>

##### partition

> `readonly` **partition**: `string`

###### Inherited from

`JournalOptions.partition`

<a id="reconcileinterval"></a>

##### reconcileInterval?

> `readonly` `optional` **reconcileInterval?**: `Input`

<a id="scheduler"></a>

##### scheduler?

> `readonly` `optional` **scheduler?**: `object`

###### concurrency?

> `readonly` `optional` **concurrency?**: `number`

###### pollInterval?

> `readonly` `optional` **pollInterval?**: `Input`

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`scheduler`](./runtime/namespaces/Runtime.md#scheduler)

<a id="schedulermode"></a>

##### schedulerMode?

> `readonly` `optional` **schedulerMode?**: `"poll"` \| `"external"`

<a id="snapshotevery"></a>

##### snapshotEvery?

> `readonly` `optional` **snapshotEvery?**: `number`

###### Inherited from

`JournalOptions.snapshotEvery`

<a id="subscriberqueuecapacity"></a>

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`subscriberQueueCapacity`](./runtime/namespaces/Runtime.md#subscriberqueuecapacity)

<a id="tenant"></a>

##### tenant

> `readonly` **tenant**: `string`

###### Inherited from

`JournalOptions.tenant`

<a id="workerid"></a>

##### workerId?

> `readonly` `optional` **workerId?**: `string`

## Type Aliases

<a id="runtimeservices"></a>

### RuntimeServices

> **RuntimeServices** = [`Runtime`](./runtime/namespaces/Runtime.md#runtime) \| [`RunStore`](./runtime/namespaces/RunStore.md#runstore) \| [`ExternalChildStore`](./unstable.runtime.external-child-store.md#externalchildstore) \| [`RunExecutor`](./runtime/namespaces/RunExecutor.md#runexecutor) \| [`LocalScheduler`](./runtime/namespaces/LocalScheduler.md#localscheduler) \| [`Activation`](#activation)

## Variables

<a id="activate"></a>

### activate

> `const` **activate**: `Effect.Effect`\<`Fiber`, `ActivationFailure`, [`Activation`](#activation) \| `Scope`\>

Acquire fresh host authority and start scoped recovery/execution.
Layer construction is read-only; call this only from an authorized host scope.
The returned fiber fails if ownership is lost; closing the scope interrupts and awaits owned work.

***

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`RuntimeServices`](#runtimeservices), `ActivationFailure`, `ObjectStore` \| `Crypto.Crypto` \| [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver)\>

Reconstruct a partition without acquiring authority or starting execution.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`RuntimeServices`](#runtimeservices), `ActivationFailure`, `ObjectStore` \| `Crypto.Crypto` \| [`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver)\>

***

<a id="layerrunstore"></a>

### layerRunStore

> `const` **layerRunStore**: (`options`) => `Layer.Layer`\<[`Activation`](#activation) \| [`ExternalChildStore`](./unstable.runtime.external-child-store.md#externalchildstore) \| [`RunStore`](./runtime/namespaces/RunStore.md#runstore) \| `StoreActivation`, [`DurabilityFailure`](#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable), `Crypto` \| `ObjectStore`\>

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`Activation`](#activation) \| [`ExternalChildStore`](./unstable.runtime.external-child-store.md#externalchildstore) \| [`RunStore`](./runtime/namespaces/RunStore.md#runstore) \| `StoreActivation`, [`DurabilityFailure`](#durabilityfailure) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable), `Crypto` \| `ObjectStore`\>
