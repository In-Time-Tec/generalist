[**generalist**](./index)

***

[generalist](./index) / unstable.cloudflare.dynamic-workers

# unstable.cloudflare.dynamic-workers

## Interfaces

### CapabilityRpc

**`Experimental`**

Request-scoped capability RPC implementation.

#### Properties

##### call

> `readonly` **call**: (`request`) => `Promise`\<`Json`\>

**`Experimental`**

###### Parameters

###### request

\{ `input?`: `undefined`; `operation`: `"discoverTools"`; `protocolVersion`: `"1"`; `requestId`: `string`; \} \| \{ `input`: `string`; `operation`: `"describeTool"`; `protocolVersion`: `"1"`; `requestId`: `string`; \} \| \{ `input`: \{ `input`: `unknown`; `operation`: `string`; `tool`: `string`; \}; `operation`: `"callTool"`; `protocolVersion`: `"1"`; `requestId`: `string`; \} \| \{ `input`: \{ `input`: `unknown`; `operation`: `string`; `step`: `string`; \}; `operation`: `"callStep"`; `protocolVersion`: `"1"`; `requestId`: `string`; \} \| \{ `input`: \{ `input`: `unknown`; `operation`: `string`; `selection`: `string`; \}; `operation`: `"runAgent"`; `protocolVersion`: `"1"`; `requestId`: `string`; \} \| \{ `input`: \{ `members`: readonly `object`[]; `operation`: `string`; `selection`: `string`; \}; `operation`: `"mapAgents"`; `protocolVersion`: `"1"`; `requestId`: `string`; \} \| \{ `input`: \{ `members`: readonly `object`[]; `operation`: `string`; \}; `operation`: `"fanOutAgents"`; `protocolVersion`: `"1"`; `requestId`: `string`; \} \| \{ `input`: \{ `data?`: \{\[`key`: `string`\]: `Json`; \}; `level`: `"error"` \| `"debug"` \| `"info"` \| `"warn"`; `message`: `string`; `operation`: `string`; \}; `operation`: `"log"`; `protocolVersion`: `"1"`; `requestId`: `string`; \}

###### Returns

`Promise`\<`Json`\>

***

### Fetcher

**`Experimental`**

Minimal loaded Worker fetch entrypoint.

#### Properties

##### fetch

> `readonly` **fetch**: (`request`) => `Promise`\<`Response`\>

**`Experimental`**

###### Parameters

###### request

`Request`

###### Returns

`Promise`\<`Response`\>

***

### MakeOptions

**`Experimental`**

Inputs for adapting one Sandbox provider to the Worker Loader CodeExecutor identity.

#### Properties

##### compatibilityDate

> `readonly` **compatibilityDate**: `string`

**`Experimental`**

##### provider

> `readonly` **provider**: [`SandboxProviderService`](./sandbox#sandboxproviderservice)

**`Experimental`**

***

### Options

**`Experimental`**

Cloudflare Worker Loader adapter construction options.

#### Extended by

- [`WorkerLoaderOptions`](./unstable.sandbox.worker-loader#workerloaderoptions)

#### Properties

##### capabilityBinding

> `readonly` **capabilityBinding**: (`rpc`) => `CapabilityBinding`

**`Experimental`**

###### Parameters

###### rpc

[`CapabilityRpc`](#capabilityrpc)

###### Returns

`CapabilityBinding`

##### compatibilityDate

> `readonly` **compatibilityDate**: `string`

**`Experimental`**

##### loader

> `readonly` **loader**: [`WorkerLoader`](#workerloader)

**`Experimental`**

***

### WorkerCode

**`Experimental`**

Minimal Worker Loader code contract used by this adapter.

#### Properties

##### compatibilityDate

> `readonly` **compatibilityDate**: `string`

**`Experimental`**

##### env

> `readonly` **env**: `WorkerEnvironment`

**`Experimental`**

##### globalOutbound

> `readonly` **globalOutbound**: `null`

**`Experimental`**

##### limits

> `readonly` **limits**: `object`

**`Experimental`**

###### cpuMs

> `readonly` **cpuMs**: `number`

###### subRequests

> `readonly` **subRequests**: `number`

##### mainModule

> `readonly` **mainModule**: `string`

**`Experimental`**

##### modules

> `readonly` **modules**: `Readonly`\<`Record`\<`string`, `string`\>\>

**`Experimental`**

***

### WorkerLoader

**`Experimental`**

Minimal Worker Loader binding contract.

#### Properties

##### load

> `readonly` **load**: (`code`) => [`WorkerStub`](#workerstub)

**`Experimental`**

###### Parameters

###### code

[`WorkerCode`](#workercode)

###### Returns

[`WorkerStub`](#workerstub)

***

### WorkerStub

**`Experimental`**

Minimal Worker Loader stub contract.

#### Properties

##### getEntrypoint

> `readonly` **getEntrypoint**: () => [`Fetcher`](#fetcher)

**`Experimental`**

###### Returns

[`Fetcher`](#fetcher)

## Type Aliases

### CapabilityRpcRequest

> **CapabilityRpcRequest** = `Union`\<readonly \[`Struct`\<\{ `input`: `optionalKey`\<`Undefined`\>; `operation`: `Literal`\<`"discoverTools"`\>; `protocolVersion`: `Literal`\<`"1"`\>; `requestId`: `String`; \}\>, `Struct`\<\{ `input`: `String`; `operation`: `Literal`\<`"describeTool"`\>; `protocolVersion`: `Literal`\<`"1"`\>; `requestId`: `String`; \}\>, `Struct`\<\{ `input`: `Struct`\<\{ `input`: `Unknown`; `operation`: `String`; `tool`: `String`; \}\>; `operation`: `Literal`\<`"callTool"`\>; `protocolVersion`: `Literal`\<`"1"`\>; `requestId`: `String`; \}\>, `Struct`\<\{ `input`: `Struct`\<\{ `input`: `Unknown`; `operation`: `String`; `step`: `String`; \}\>; `operation`: `Literal`\<`"callStep"`\>; `protocolVersion`: `Literal`\<`"1"`\>; `requestId`: `String`; \}\>, `Struct`\<\{ `input`: `Struct`\<\{ `input`: `Unknown`; `operation`: `String`; `selection`: `String`; \}\>; `operation`: `Literal`\<`"runAgent"`\>; `protocolVersion`: `Literal`\<`"1"`\>; `requestId`: `String`; \}\>, `Struct`\<\{ `input`: `Struct`\<\{ `members`: `$Array`\<`Struct`\<\{ `input`: `Unknown`; `member`: `String`; \}\>\>; `operation`: `String`; `selection`: `String`; \}\>; `operation`: `Literal`\<`"mapAgents"`\>; `protocolVersion`: `Literal`\<`"1"`\>; `requestId`: `String`; \}\>, `Struct`\<\{ `input`: `Struct`\<\{ `members`: `$Array`\<`Struct`\<\{ `input`: `Unknown`; `member`: `String`; `selection`: `String`; \}\>\>; `operation`: `String`; \}\>; `operation`: `Literal`\<`"fanOutAgents"`\>; `protocolVersion`: `Literal`\<`"1"`\>; `requestId`: `String`; \}\>, `Struct`\<\{ `input`: `Struct`\<\{ `data`: `optionalKey`\<`$Record`\<`String`, `Codec`\<`Json`, `Json`, `never`, `never`\>\>\>; `level`: `Literals`\<readonly \[`"debug"`, `"info"`, `"warn"`, `"error"`\]\>; `message`: `String`; `operation`: `String`; \}\>; `operation`: `Literal`\<`"log"`\>; `protocolVersion`: `Literal`\<`"1"`\>; `requestId`: `String`; \}\>\]\>

**`Experimental`**

Strict requests accepted by the sole multiplexed capability binding.

***

### CapabilityRpcRequest

> **CapabilityRpcRequest** = *typeof* `CapabilityRpcRequest.Type`

**`Experimental`**

## Variables

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`CodeExecutor`](./generalist/namespaces/CodeExecutor#codeexecutor)\>

**`Experimental`**

Provide the Worker Loader CodeExecutor.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`CodeExecutor`](./generalist/namespaces/CodeExecutor#codeexecutor)\>

***

### layerUnavailable

> `const` **layerUnavailable**: (`message?`) => `Layer.Layer`\<[`CodeExecutor`](./generalist/namespaces/CodeExecutor#codeexecutor)\>

**`Experimental`**

Provide an explicitly disabled Worker Loader boundary.

#### Parameters

##### message?

`string`

#### Returns

`Layer.Layer`\<[`CodeExecutor`](./generalist/namespaces/CodeExecutor#codeexecutor)\>

***

### make

> `const` **make**: (`options`) => [`Service`](./generalist/namespaces/CodeExecutor#service)

**`Experimental`**

Construct a CodeExecutor as a thin adapter over an explicit Sandbox provider.

#### Parameters

##### options

[`MakeOptions`](#makeoptions)

#### Returns

[`Service`](./generalist/namespaces/CodeExecutor#service)

***

### makeUnavailable

> `const` **makeUnavailable**: (`message?`) => [`Service`](./generalist/namespaces/CodeExecutor#service)

**`Experimental`**

Construct an explicitly disabled Worker Loader boundary.

#### Parameters

##### message?

`string`

#### Returns

[`Service`](./generalist/namespaces/CodeExecutor#service)
