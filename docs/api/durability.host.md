[**generalist**](./index.md)

***

[generalist](./index.md) / durability.host

# durability.host

## Interfaces

<a id="configuration"></a>

### Configuration

**`Experimental`**

Application-authorized runtime configuration, never supplied by a discovery marker.

#### Extends

- `Omit`\<[`Options`](./durability.md#options), `"environment"` \| `"tenant"` \| `"partition"` \| `"schedulerMode"`\>

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

<a id="maxcommitbytes"></a>

##### maxCommitBytes?

> `readonly` `optional` **maxCommitBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`maxCommitBytes`](./unstable.cloudflare.durable-objects.md#maxcommitbytes)

<a id="maxconflictretries"></a>

##### maxConflictRetries?

> `readonly` `optional` **maxConflictRetries?**: `number`

**`Experimental`**

Number of deterministic reevaluations after a competing command wins; zero disables retries.

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`maxConflictRetries`](./unstable.cloudflare.durable-objects.md#maxconflictretries)

<a id="maxreplaybytes"></a>

##### maxReplayBytes?

> `readonly` `optional` **maxReplayBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`maxReplayBytes`](./unstable.cloudflare.durable-objects.md#maxreplaybytes)

<a id="maxstatebytes"></a>

##### maxStateBytes?

> `readonly` `optional` **maxStateBytes?**: `number`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`maxStateBytes`](./unstable.cloudflare.durable-objects.md#maxstatebytes)

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

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`ownershipLeaseMillis`](./unstable.cloudflare.durable-objects.md#ownershipleasemillis)

<a id="reconcileinterval"></a>

##### reconcileInterval?

> `readonly` `optional` **reconcileInterval?**: `Input`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`reconcileInterval`](./unstable.cloudflare.durable-objects.md#reconcileinterval)

<a id="resolver"></a>

##### resolver

> `readonly` **resolver**: `Layer`\<[`ExecutableResolver`](./runtime/namespaces/ExecutableResolver.md#executableresolver), `ActivationFailure`\>

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

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`snapshotEvery`](./unstable.cloudflare.durable-objects.md#snapshotevery)

<a id="subscriberqueuecapacity"></a>

##### subscriberQueueCapacity?

> `readonly` `optional` **subscriberQueueCapacity?**: `number`

**`Experimental`**

###### Inherited from

[`LayerOptions`](./runtime/namespaces/Runtime.md#layeroptions).[`subscriberQueueCapacity`](./runtime/namespaces/Runtime.md#subscriberqueuecapacity)

<a id="workerid"></a>

##### workerId?

> `readonly` `optional` **workerId?**: `string`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.durable-objects.md#options).[`workerId`](./unstable.cloudflare.durable-objects.md#workerid)

***

<a id="options"></a>

### Options

**`Experimental`**

One bounded discovery page; a continuation resumes listing, not ownership.

#### Extends

- [`Scope`](./durability.discovery.md#scope)

#### Type Parameters

##### E

`E` = `never`

##### R

`R` = `never`

#### Properties

<a id="authorize"></a>

##### authorize

> `readonly` **authorize**: (`location`) => `Effect`\<`Option`\<[`Configuration`](#configuration)\>, `E`, `R`\>

**`Experimental`**

###### Parameters

###### location

###### environment

`string`

###### partition

`string`

###### tenant

`string`

###### Returns

`Effect`\<`Option`\<[`Configuration`](#configuration)\>, `E`, `R`\>

<a id="cursor"></a>

##### cursor?

> `readonly` `optional` **cursor?**: `string`

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

`Scope.environment`

<a id="tenant"></a>

##### tenant

> `readonly` **tenant**: `string`

**`Experimental`**

###### Inherited from

`Scope.tenant`

***

<a id="pageresult"></a>

### PageResult

**`Experimental`**

Completed page results; revisit the tenant from the beginning after consuming the continuation.

#### Properties

<a id="cursor-1"></a>

##### cursor?

> `readonly` `optional` **cursor?**: `string`

**`Experimental`**

<a id="partitions"></a>

##### partitions

> `readonly` **partitions**: readonly [`PartitionResult`](#partitionresult)[]

**`Experimental`**

## Type Aliases

<a id="partitionresult"></a>

### PartitionResult

> **PartitionResult** = \{ `location`: [`Location`](./durability.discovery.md#location); `status`: `"denied"` \| `"uncommitted"`; \} \| \{ `drain`: [`DrainResult`](./runtime/namespaces/LocalScheduler.md#drainresult); `location`: [`Location`](./durability.discovery.md#location); `status`: `"drained"`; \}

**`Experimental`**

A location is never activated merely because its marker exists.

## Variables

<a id="reconcilepage"></a>

### reconcilePage

> `const` **reconcilePage**: \<`E`, `R`\>(`options`) => `Effect.Effect`\<[`PageResult`](#pageresult), `E` \| [`ChildDepthExceeded`](./runtime/namespaces/Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./runtime/namespaces/Errors.md#childlimitexceeded) \| [`ChildSelectionMissing`](./runtime/namespaces/Errors.md#childselectionmissing) \| [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`ExecutableIdentityMismatch`](./runtime/namespaces/Errors.md#executableidentitymismatch) \| [`ExecutablePinMissing`](./runtime/namespaces/Errors.md#executablepinmissing) \| [`ExecutableRegistrationConflict`](./runtime/namespaces/Errors.md#executableregistrationconflict) \| [`ExecutableRegistrationInvalid`](./runtime/namespaces/Errors.md#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./runtime/namespaces/Errors.md#executableregistrationmissing) \| [`Exhausted`](./generalist/namespaces/RunBudget.md#exhausted) \| [`FanOutConflict`](./runtime/namespaces/Errors.md#fanoutconflict) \| [`FanOutInvalid`](./runtime/namespaces/Errors.md#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./runtime/namespaces/Errors.md#fanoutremainderunsupported) \| [`IdempotencyConflict`](./runtime/namespaces/Errors.md#idempotencyconflict) \| [`RunIdConflict`](./runtime/namespaces/Errors.md#runidconflict) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`StartInvalid`](./runtime/namespaces/Errors.md#startinvalid) \| [`TreePolicyInvalid`](./runtime/namespaces/Errors.md#treepolicyinvalid), `R` \| `Crypto` \| `ObjectStore`\>

**`Experimental`**

Discover, validate, activate, drain, and close at most one provider page (1000 locations).
Locations run sequentially in independent scopes. Failure or interruption closes the current host;
retry the same page after resolving the failure. Exact committed work is not redispatched.
Call again from the host's periodic recovery lifecycle, even when no notification arrives.

#### Type Parameters

##### E

`E`

##### R

`R`

#### Parameters

##### options

[`Options`](#options)\<`E`, `R`\>

#### Returns

`Effect.Effect`\<[`PageResult`](#pageresult), `E` \| [`ChildDepthExceeded`](./runtime/namespaces/Errors.md#childdepthexceeded) \| [`ChildLimitExceeded`](./runtime/namespaces/Errors.md#childlimitexceeded) \| [`ChildSelectionMissing`](./runtime/namespaces/Errors.md#childselectionmissing) \| [`DurabilityFailure`](./durability.md#durabilityfailure) \| [`ExecutableIdentityMismatch`](./runtime/namespaces/Errors.md#executableidentitymismatch) \| [`ExecutablePinMissing`](./runtime/namespaces/Errors.md#executablepinmissing) \| [`ExecutableRegistrationConflict`](./runtime/namespaces/Errors.md#executableregistrationconflict) \| [`ExecutableRegistrationInvalid`](./runtime/namespaces/Errors.md#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./runtime/namespaces/Errors.md#executableregistrationmissing) \| [`Exhausted`](./generalist/namespaces/RunBudget.md#exhausted) \| [`FanOutConflict`](./runtime/namespaces/Errors.md#fanoutconflict) \| [`FanOutInvalid`](./runtime/namespaces/Errors.md#fanoutinvalid) \| [`FanOutRemainderUnsupported`](./runtime/namespaces/Errors.md#fanoutremainderunsupported) \| [`IdempotencyConflict`](./runtime/namespaces/Errors.md#idempotencyconflict) \| [`RunIdConflict`](./runtime/namespaces/Errors.md#runidconflict) \| [`RuntimeUnavailable`](./runtime/namespaces/Errors.md#runtimeunavailable) \| [`StartInvalid`](./runtime/namespaces/Errors.md#startinvalid) \| [`TreePolicyInvalid`](./runtime/namespaces/Errors.md#treepolicyinvalid), `R` \| `Crypto` \| `ObjectStore`\>
