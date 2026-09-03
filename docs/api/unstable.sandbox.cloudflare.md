[**generalist**](./index)

***

[generalist](./index) / unstable.sandbox.cloudflare

# unstable.sandbox.cloudflare

## Interfaces

<a id="execoptions"></a>

### ExecOptions

**`Experimental`**

Options passed to Cloudflare Sandbox command execution.

#### Properties

<a id="cwd"></a>

##### cwd?

> `optional` **cwd?**: `string`

**`Experimental`**

<a id="env"></a>

##### env?

> `optional` **env?**: `Readonly`\<`Record`\<`string`, `string`\>\>

**`Experimental`**

<a id="signal"></a>

##### signal

> **signal**: `AbortSignal`

**`Experimental`**

<a id="timeout"></a>

##### timeout?

> `optional` **timeout?**: `number`

**`Experimental`**

***

<a id="options"></a>

### Options

**`Experimental`**

Cloudflare Sandbox binding configuration.

#### Type Parameters

##### Id

`Id`

#### Properties

<a id="binding"></a>

##### binding

> `readonly` **binding**: [`SandboxBinding`](#sandboxbinding)\<`Id`\>

**`Experimental`**

***

<a id="provideroptions"></a>

### ProviderOptions

**`Experimental`**

Resolved Cloudflare Sandbox factory used by the provider and recorded fixtures.

#### Properties

<a id="getsandbox"></a>

##### getSandbox

> `readonly` **getSandbox**: (`id`) => [`SandboxStub`](#sandboxstub)

**`Experimental`**

###### Parameters

###### id

`string`

###### Returns

[`SandboxStub`](#sandboxstub)

***

<a id="sandboxbinding"></a>

### SandboxBinding

**`Experimental`**

Structural Cloudflare Durable Object namespace accepted by the leaf.

#### Type Parameters

##### Id

`Id`

#### Methods

<a id="get"></a>

##### get()

> **get**(`id`): [`SandboxStub`](#sandboxstub)

**`Experimental`**

###### Parameters

###### id

`Id`

###### Returns

[`SandboxStub`](#sandboxstub)

<a id="idfromname"></a>

##### idFromName()

> **idFromName**(`name`): `Id`

**`Experimental`**

###### Parameters

###### name

`string`

###### Returns

`Id`

***

<a id="sandboxstub"></a>

### SandboxStub

**`Experimental`**

Cloudflare Sandbox Durable Object RPC surface used by Generalist.

#### Methods

<a id="destroy"></a>

##### destroy()

> **destroy**(): `Promise`\<`void`\>

**`Experimental`**

###### Returns

`Promise`\<`void`\>

<a id="exec"></a>

##### exec()

> **exec**(`command`, `options`): `Promise`\<\{ `command`: `string`; `duration`: `number`; `exitCode`: `number`; `sessionId?`: `string`; `stderr`: `string`; `stdout`: `string`; `success`: `boolean`; `timestamp`: `string`; \}\>

**`Experimental`**

###### Parameters

###### command

`string`

###### options

[`ExecOptions`](#execoptions)

###### Returns

`Promise`\<\{ `command`: `string`; `duration`: `number`; `exitCode`: `number`; `sessionId?`: `string`; `stderr`: `string`; `stdout`: `string`; `success`: `boolean`; `timestamp`: `string`; \}\>

<a id="mkdir"></a>

##### mkdir()

> **mkdir**(`path`, `options?`): `Promise`\<\{ `path`: `string`; `success`: `boolean`; \}\>

**`Experimental`**

###### Parameters

###### path

`string`

###### options?

###### recursive

`boolean`

###### Returns

`Promise`\<\{ `path`: `string`; `success`: `boolean`; \}\>

<a id="readfile"></a>

##### readFile()

> **readFile**(`path`, `options`): `Promise`\<\{ `content`: `string`; `path`: `string`; `success`: `boolean`; `timestamp`: `string`; \}\>

**`Experimental`**

###### Parameters

###### path

`string`

###### options

###### encoding

`"utf-8"`

###### Returns

`Promise`\<\{ `content`: `string`; `path`: `string`; `success`: `boolean`; `timestamp`: `string`; \}\>

<a id="writefile"></a>

##### writeFile()

> **writeFile**(`path`, `data`, `options`): `Promise`\<\{ `path`: `string`; `success`: `boolean`; \}\>

**`Experimental`**

###### Parameters

###### path

`string`

###### data

`string`

###### options

###### encoding

`"utf-8"`

###### Returns

`Promise`\<\{ `path`: `string`; `success`: `boolean`; \}\>

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: \<`Id`\>(`options`) => `Layer.Layer`\<[`SandboxProvider`](./sandbox#sandboxprovider)\>

**`Experimental`**

Provide the hosted Cloudflare Container Sandbox leaf.

#### Type Parameters

##### Id

`Id`

#### Parameters

##### options

[`Options`](#options)\<`Id`\>

#### Returns

`Layer.Layer`\<[`SandboxProvider`](./sandbox#sandboxprovider)\>

***

<a id="makeprovider"></a>

### makeProvider

> `const` **makeProvider**: (`options`) => `Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice)\>

**`Experimental`**

Construct the Cloudflare Container Sandbox provider.

#### Parameters

##### options

[`ProviderOptions`](#provideroptions)

#### Returns

`Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice)\>
