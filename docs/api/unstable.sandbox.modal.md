[**generalist**](./index)

***

[generalist](./index) / unstable.sandbox.modal

# unstable.sandbox.modal

## Interfaces

<a id="client"></a>

### Client

**`Experimental`**

Minimal Modal SDK client boundary used by recorded fixtures.

#### Properties

<a id="close"></a>

##### close

> `readonly` **close**: () => `void`

**`Experimental`**

###### Returns

`void`

<a id="connect"></a>

##### connect

> `readonly` **connect**: (`id`) => `Promise`\<[`Connection`](#connection)\>

**`Experimental`**

###### Parameters

###### id

`string`

###### Returns

`Promise`\<[`Connection`](#connection)\>

<a id="create"></a>

##### create

> `readonly` **create**: (`image`, `snapshot`) => `Promise`\<[`Connection`](#connection)\>

**`Experimental`**

###### Parameters

###### image

`string`

###### snapshot

`boolean`

###### Returns

`Promise`\<[`Connection`](#connection)\>

***

<a id="connection"></a>

### Connection

**`Experimental`**

Minimal Modal SDK sandbox boundary used by recorded fixtures.

#### Properties

<a id="detach"></a>

##### detach

> `readonly` **detach**: () => `void`

**`Experimental`**

###### Returns

`void`

<a id="execute"></a>

##### execute

> `readonly` **execute**: (`command`, `options`) => `Promise`\<`ProcessResult`\>

**`Experimental`**

###### Parameters

###### command

readonly `string`[]

###### options

`ExecuteOptions`

###### Returns

`Promise`\<`ProcessResult`\>

<a id="id"></a>

##### id

> `readonly` **id**: `string`

**`Experimental`**

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

> `readonly` **readFile**: (`path`) => `Promise`\<`string`\>

**`Experimental`**

###### Parameters

###### path

`string`

###### Returns

`Promise`\<`string`\>

<a id="snapshot"></a>

##### snapshot

> `readonly` **snapshot**: () => `Promise`\<`string`\>

**`Experimental`**

###### Returns

`Promise`\<`string`\>

<a id="terminate"></a>

##### terminate

> `readonly` **terminate**: () => `Promise`\<`void`\>

**`Experimental`**

###### Returns

`Promise`\<`void`\>

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

<a id="options"></a>

### Options

**`Experimental`**

Modal hosted container configuration.

#### Properties

<a id="app"></a>

##### app

> `readonly` **app**: `string`

**`Experimental`**

<a id="image"></a>

##### image

> `readonly` **image**: `string`

**`Experimental`**

<a id="tokenid"></a>

##### tokenId

> `readonly` **tokenId**: `Config`\<`Redacted`\<`string`\>\>

**`Experimental`**

<a id="tokensecret"></a>

##### tokenSecret

> `readonly` **tokenSecret**: `Config`\<`Redacted`\<`string`\>\>

**`Experimental`**

***

<a id="provideroptions"></a>

### ProviderOptions

**`Experimental`**

Resolved Modal configuration used by recorded fixtures.

#### Extends

- `Omit`\<[`Options`](#options), `"tokenId"` \| `"tokenSecret"`\>

#### Properties

<a id="app-1"></a>

##### app

> `readonly` **app**: `string`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`app`](#app)

<a id="client-1"></a>

##### client

> `readonly` **client**: [`Client`](#client)

**`Experimental`**

<a id="image-1"></a>

##### image

> `readonly` **image**: `string`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`image`](#image)

<a id="tokenid-1"></a>

##### tokenId

> `readonly` **tokenId**: `Redacted`\<`string`\>

**`Experimental`**

<a id="tokensecret-1"></a>

##### tokenSecret

> `readonly` **tokenSecret**: `Redacted`\<`string`\>

**`Experimental`**

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`SandboxProvider`](./sandbox#sandboxprovider), `Config.ConfigError`\>

**`Experimental`**

Provide the hosted Modal container Sandbox leaf.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`SandboxProvider`](./sandbox#sandboxprovider), `Config.ConfigError`\>

***

<a id="makeprovider"></a>

### makeProvider

> `const` **makeProvider**: (`options`) => [`SandboxProviderService`](./sandbox#sandboxproviderservice)

**`Experimental`**

Construct the Modal provider over an injected SDK client.

#### Parameters

##### options

[`ProviderOptions`](#provideroptions)

#### Returns

[`SandboxProviderService`](./sandbox#sandboxproviderservice)
