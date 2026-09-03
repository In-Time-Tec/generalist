[**generalist**](./index)

***

[generalist](./index) / unstable.sandbox.cloudflare

# unstable.sandbox.cloudflare

## Interfaces

### ExecOptions

**`Experimental`**

Options passed to Cloudflare Sandbox command execution.

#### Properties

##### cwd?

> `optional` **cwd?**: `string`

**`Experimental`**

##### env?

> `optional` **env?**: `Readonly`\<`Record`\<`string`, `string`\>\>

**`Experimental`**

##### signal

> **signal**: `AbortSignal`

**`Experimental`**

##### timeout?

> `optional` **timeout?**: `number`

**`Experimental`**

***

### Options

**`Experimental`**

Cloudflare Sandbox binding configuration.

#### Type Parameters

##### Id

`Id`

#### Properties

##### binding

> `readonly` **binding**: [`SandboxBinding`](#sandboxbinding)\<`Id`\>

**`Experimental`**

***

### ProviderOptions

**`Experimental`**

Resolved Cloudflare Sandbox factory used by the provider and recorded fixtures.

#### Properties

##### getSandbox

> `readonly` **getSandbox**: (`id`) => [`SandboxStub`](#sandboxstub)

**`Experimental`**

###### Parameters

###### id

`string`

###### Returns

[`SandboxStub`](#sandboxstub)

***

### SandboxBinding

**`Experimental`**

Structural Cloudflare Durable Object namespace accepted by the leaf.

#### Type Parameters

##### Id

`Id`

#### Methods

##### get()

> **get**(`id`): [`SandboxStub`](#sandboxstub)

**`Experimental`**

###### Parameters

###### id

`Id`

###### Returns

[`SandboxStub`](#sandboxstub)

##### idFromName()

> **idFromName**(`name`): `Id`

**`Experimental`**

###### Parameters

###### name

`string`

###### Returns

`Id`

***

### SandboxStub

**`Experimental`**

Cloudflare Sandbox Durable Object RPC surface used by Generalist.

#### Methods

##### destroy()

> **destroy**(): `Promise`\<`void`\>

**`Experimental`**

###### Returns

`Promise`\<`void`\>

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

### makeProvider

> `const` **makeProvider**: (`options`) => `Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice)\>

**`Experimental`**

Construct the Cloudflare Container Sandbox provider.

#### Parameters

##### options

[`ProviderOptions`](#provideroptions)

#### Returns

`Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice)\>
