[**generalist**](./index.md)

***

[generalist](./index.md) / unstable.sandbox.worker-loader

# unstable.sandbox.worker-loader

## Interfaces

<a id="workerloaderoptions"></a>

### WorkerLoaderOptions

**`Experimental`**

Worker Loader sandbox configuration and optional provider-wide maximums.

#### Extends

- [`Options`](./unstable.cloudflare.dynamic-workers.md#options)

#### Properties

<a id="capabilitybinding"></a>

##### capabilityBinding

> `readonly` **capabilityBinding**: (`rpc`) => `CapabilityBinding`

**`Experimental`**

###### Parameters

###### rpc

[`CapabilityRpc`](./unstable.cloudflare.dynamic-workers.md#capabilityrpc)

###### Returns

`CapabilityBinding`

###### Inherited from

[`Options`](./unstable.cloudflare.dynamic-workers.md#options).[`capabilityBinding`](./unstable.cloudflare.dynamic-workers.md#capabilitybinding)

<a id="compatibilitydate"></a>

##### compatibilityDate

> `readonly` **compatibilityDate**: `string`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.dynamic-workers.md#options).[`compatibilityDate`](./unstable.cloudflare.dynamic-workers.md#compatibilitydate-1)

<a id="image"></a>

##### image?

> `readonly` `optional` **image?**: `string`

**`Experimental`**

<a id="limits"></a>

##### limits?

> `readonly` `optional` **limits?**: `object`

**`Experimental`**

###### cpuMs?

> `readonly` `optional` **cpuMs?**: `number`

###### memoryMb?

> `readonly` `optional` **memoryMb?**: `number`

###### wallClock?

> `readonly` `optional` **wallClock?**: `Duration`

<a id="loader"></a>

##### loader

> `readonly` **loader**: [`WorkerLoader`](./unstable.cloudflare.dynamic-workers.md#workerloader)

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.dynamic-workers.md#options).[`loader`](./unstable.cloudflare.dynamic-workers.md#loader)

## Variables

<a id="layerworkerloader"></a>

### layerWorkerLoader

> `const` **layerWorkerLoader**: (`options`) => `Layer.Layer`\<[`SandboxProvider`](./sandbox.md#sandboxprovider)\>

**`Experimental`**

Provide the v8-isolate Worker Loader Sandbox leaf.

#### Parameters

##### options

[`WorkerLoaderOptions`](#workerloaderoptions)

#### Returns

`Layer.Layer`\<[`SandboxProvider`](./sandbox.md#sandboxprovider)\>

***

<a id="makeworkerloaderprovider"></a>

### makeWorkerLoaderProvider

> `const` **makeWorkerLoaderProvider**: (`options`) => [`SandboxProviderService`](./sandbox.md#sandboxproviderservice)

**`Experimental`**

Construct the v8-isolate Worker Loader Sandbox provider.

#### Parameters

##### options

[`WorkerLoaderOptions`](#workerloaderoptions)

#### Returns

[`SandboxProviderService`](./sandbox.md#sandboxproviderservice)
