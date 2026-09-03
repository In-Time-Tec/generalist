[**generalist**](./index)

***

[generalist](./index) / unstable.sandbox.agentos

# unstable.sandbox.agentos

## Interfaces

<a id="actor"></a>

### Actor

**`Experimental`**

Minimal agentOS actor boundary used by recorded fixtures.

#### Properties

<a id="destroy"></a>

##### destroy

> `readonly` **destroy**: () => `Promise`\<`void`\>

**`Experimental`**

###### Returns

`Promise`\<`void`\>

<a id="execute"></a>

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

<a id="health"></a>

##### health

> `readonly` **health**: () => `Promise`\<`void`\>

**`Experimental`**

###### Returns

`Promise`\<`void`\>

<a id="makedirectory"></a>

##### makeDirectory

> `readonly` **makeDirectory**: (`path`) => `Promise`\<`void`\>

**`Experimental`**

###### Parameters

###### path

`string`

###### Returns

`Promise`\<`void`\>

<a id="readfile"></a>

##### readFile

> `readonly` **readFile**: (`path`) => `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

**`Experimental`**

###### Parameters

###### path

`string`

###### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

<a id="writefile"></a>

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

<a id="client"></a>

### Client

**`Experimental`**

Minimal RivetKit client boundary used by recorded fixtures.

#### Properties

<a id="close"></a>

##### close

> `readonly` **close**: () => `Promise`\<`void`\>

**`Experimental`**

###### Returns

`Promise`\<`void`\>

<a id="create"></a>

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

<a id="get"></a>

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

<a id="options"></a>

### Options

**`Experimental`**

agentOS actor sandbox configuration.

#### Properties

<a id="actor-1"></a>

##### actor?

> `readonly` `optional` **actor?**: `string`

**`Experimental`**

Actor name registered by the agentOS host.

<a id="endpoint"></a>

##### endpoint

> `readonly` **endpoint**: `string`

**`Experimental`**

<a id="token"></a>

##### token

> `readonly` **token**: `Config`\<`Redacted`\<`string`\>\>

**`Experimental`**

***

<a id="provideroptions"></a>

### ProviderOptions

**`Experimental`**

Resolved agentOS configuration used by recorded fixtures.

#### Extends

- `Omit`\<[`Options`](#options), `"token"`\>

#### Properties

<a id="actor-2"></a>

##### actor?

> `readonly` `optional` **actor?**: `string`

**`Experimental`**

Actor name registered by the agentOS host.

###### Inherited from

[`Options`](#options).[`actor`](#actor-1)

<a id="client-1"></a>

##### client

> `readonly` **client**: [`Client`](#client)

**`Experimental`**

<a id="endpoint-1"></a>

##### endpoint

> `readonly` **endpoint**: `string`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`endpoint`](#endpoint)

<a id="token-1"></a>

##### token

> `readonly` **token**: `Redacted`\<`string`\>

**`Experimental`**

## Variables

<a id="layer"></a>

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

<a id="makeprovider"></a>

### makeProvider

> `const` **makeProvider**: (`options`) => `Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice)\>

**`Experimental`**

Construct the agentOS provider over an injected public RivetKit client.

#### Parameters

##### options

[`ProviderOptions`](#provideroptions)

#### Returns

`Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice)\>
