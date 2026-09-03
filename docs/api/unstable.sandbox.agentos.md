[**generalist**](./index)

***

[generalist](./index) / unstable.sandbox.agentos

# unstable.sandbox.agentos

## Interfaces

### Actor

**`Experimental`**

Minimal agentOS actor boundary used by recorded fixtures.

#### Properties

##### destroy

> `readonly` **destroy**: () => `Promise`\<`void`\>

**`Experimental`**

###### Returns

`Promise`\<`void`\>

##### execute

> `readonly` **execute**: (`command`, `arguments_`, `options`) => `Promise`\<`ExecResult`\>

**`Experimental`**

###### Parameters

###### command

`string`

###### arguments\_

readonly `string`[]

###### options

`ExecOptions`

###### Returns

`Promise`\<`ExecResult`\>

##### health

> `readonly` **health**: () => `Promise`\<`void`\>

**`Experimental`**

###### Returns

`Promise`\<`void`\>

##### makeDirectory

> `readonly` **makeDirectory**: (`path`) => `Promise`\<`void`\>

**`Experimental`**

###### Parameters

###### path

`string`

###### Returns

`Promise`\<`void`\>

##### readFile

> `readonly` **readFile**: (`path`) => `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

**`Experimental`**

###### Parameters

###### path

`string`

###### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

##### writeFile

> `readonly` **writeFile**: (`path`, `data`) => `Promise`\<`void`\>

**`Experimental`**

###### Parameters

###### path

`string`

###### data

`string`

###### Returns

`Promise`\<`void`\>

***

### Client

**`Experimental`**

Minimal RivetKit client boundary used by recorded fixtures.

#### Properties

##### close

> `readonly` **close**: () => `Promise`\<`void`\>

**`Experimental`**

###### Returns

`Promise`\<`void`\>

##### create

> `readonly` **create**: (`name`, `key`) => `Promise`\<[`Actor`](#actor)\>

**`Experimental`**

###### Parameters

###### name

`string`

###### key

`string`

###### Returns

`Promise`\<[`Actor`](#actor)\>

##### get

> `readonly` **get**: (`name`, `key`) => [`Actor`](#actor)

**`Experimental`**

###### Parameters

###### name

`string`

###### key

`string`

###### Returns

[`Actor`](#actor)

***

### Options

**`Experimental`**

agentOS actor sandbox configuration.

#### Properties

##### actor?

> `readonly` `optional` **actor?**: `string`

**`Experimental`**

Actor name registered by the agentOS host.

##### endpoint

> `readonly` **endpoint**: `string`

**`Experimental`**

##### token

> `readonly` **token**: `Config`\<`Redacted`\<`string`\>\>

**`Experimental`**

***

### ProviderOptions

**`Experimental`**

Resolved agentOS configuration used by recorded fixtures.

#### Extends

- `Omit`\<[`Options`](#options), `"token"`\>

#### Properties

##### actor?

> `readonly` `optional` **actor?**: `string`

**`Experimental`**

Actor name registered by the agentOS host.

###### Inherited from

[`Options`](#options).[`actor`](#actor-1)

##### client

> `readonly` **client**: [`Client`](#client)

**`Experimental`**

##### endpoint

> `readonly` **endpoint**: `string`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`endpoint`](#endpoint)

##### token

> `readonly` **token**: `Redacted`\<`string`\>

**`Experimental`**

## Variables

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`SandboxProvider`](./sandbox#sandboxprovider), `Config.ConfigError`\>

**`Experimental`**

Provide the hosted agentOS V8-isolate Sandbox leaf.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`SandboxProvider`](./sandbox#sandboxprovider), `Config.ConfigError`\>

***

### makeProvider

> `const` **makeProvider**: (`options`) => `Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice)\>

**`Experimental`**

Construct the agentOS provider over an injected public RivetKit client.

#### Parameters

##### options

[`ProviderOptions`](#provideroptions)

#### Returns

`Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice)\>
