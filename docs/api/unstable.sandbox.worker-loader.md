[**generalist**](./index)

***

[generalist](./index) / unstable.sandbox.worker-loader

# unstable.sandbox.worker-loader

## Interfaces

### WorkerLoaderOptions

**`Experimental`**

Worker Loader sandbox configuration and optional provider-wide maximums.

#### Extends

- [`Options`](./unstable.cloudflare.dynamic-workers#options)

#### Properties

##### capabilityBinding

> `readonly` **capabilityBinding**: (`rpc`) => `CapabilityBinding`

**`Experimental`**

###### Parameters

###### rpc

[`CapabilityRpc`](./unstable.cloudflare.dynamic-workers#capabilityrpc)

###### Returns

`CapabilityBinding`

###### Inherited from

[`Options`](./unstable.cloudflare.dynamic-workers#options).[`capabilityBinding`](./unstable.cloudflare.dynamic-workers#capabilitybinding)

##### compatibilityDate

> `readonly` **compatibilityDate**: `string`

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.dynamic-workers#options).[`compatibilityDate`](./unstable.cloudflare.dynamic-workers#compatibilitydate-1)

##### image?

> `readonly` `optional` **image?**: `string`

**`Experimental`**

##### limits?

> `readonly` `optional` **limits?**: `object`

**`Experimental`**

###### cpuMs?

> `readonly` `optional` **cpuMs?**: `number`

###### memoryMb?

> `readonly` `optional` **memoryMb?**: `number`

###### wallClock?

> `readonly` `optional` **wallClock?**: `Duration`

##### loader

> `readonly` **loader**: [`WorkerLoader`](./unstable.cloudflare.dynamic-workers#workerloader)

**`Experimental`**

###### Inherited from

[`Options`](./unstable.cloudflare.dynamic-workers#options).[`loader`](./unstable.cloudflare.dynamic-workers#loader)

## Variables

### layerWorkerLoader

> `const` **layerWorkerLoader**: (`options`) => `Layer.Layer`\<[`SandboxProvider`](./sandbox#sandboxprovider)\>

**`Experimental`**

Provide the v8-isolate Worker Loader Sandbox leaf.

#### Parameters

##### options

[`WorkerLoaderOptions`](#workerloaderoptions)

#### Returns

`Layer.Layer`\<[`SandboxProvider`](./sandbox#sandboxprovider)\>

***

### makeWorkerLoaderProvider

> `const` **makeWorkerLoaderProvider**: (`options`) => [`SandboxProviderService`](./sandbox#sandboxproviderservice)

**`Experimental`**

Construct the v8-isolate Worker Loader Sandbox provider.

#### Parameters

##### options

[`WorkerLoaderOptions`](#workerloaderoptions)

#### Returns

[`SandboxProviderService`](./sandbox#sandboxproviderservice)
