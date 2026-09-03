[**generalist**](./index)

***

[generalist](./index) / unstable.sandbox.modal

# unstable.sandbox.modal

## Interfaces

### Client

**`Experimental`**

Minimal Modal SDK client boundary used by recorded fixtures.

#### Properties

##### close

> `readonly` **close**: () => `void`

**`Experimental`**

###### Returns

`void`

##### connect

> `readonly` **connect**: (`id`) => `Promise`\<[`Connection`](#connection)\>

**`Experimental`**

###### Parameters

###### id

`string`

###### Returns

`Promise`\<[`Connection`](#connection)\>

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

### Connection

**`Experimental`**

Minimal Modal SDK sandbox boundary used by recorded fixtures.

#### Properties

##### detach

> `readonly` **detach**: () => `void`

**`Experimental`**

###### Returns

`void`

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

##### id

> `readonly` **id**: `string`

**`Experimental`**

##### makeDirectory

> `readonly` **makeDirectory**: (`path`) => `Promise`\<`void`\>

**`Experimental`**

###### Parameters

###### path

`string`

###### Returns

`Promise`\<`void`\>

##### readFile

> `readonly` **readFile**: (`path`) => `Promise`\<`string`\>

**`Experimental`**

###### Parameters

###### path

`string`

###### Returns

`Promise`\<`string`\>

##### snapshot

> `readonly` **snapshot**: () => `Promise`\<`string`\>

**`Experimental`**

###### Returns

`Promise`\<`string`\>

##### terminate

> `readonly` **terminate**: () => `Promise`\<`void`\>

**`Experimental`**

###### Returns

`Promise`\<`void`\>

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

### Options

**`Experimental`**

Modal hosted container configuration.

#### Properties

##### app

> `readonly` **app**: `string`

**`Experimental`**

##### image

> `readonly` **image**: `string`

**`Experimental`**

##### tokenId

> `readonly` **tokenId**: `Config`\<`Redacted`\<`string`\>\>

**`Experimental`**

##### tokenSecret

> `readonly` **tokenSecret**: `Config`\<`Redacted`\<`string`\>\>

**`Experimental`**

***

### ProviderOptions

**`Experimental`**

Resolved Modal configuration used by recorded fixtures.

#### Extends

- `Omit`\<[`Options`](#options), `"tokenId"` \| `"tokenSecret"`\>

#### Properties

##### app

> `readonly` **app**: `string`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`app`](#app)

##### client

> `readonly` **client**: [`Client`](#client)

**`Experimental`**

##### image

> `readonly` **image**: `string`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`image`](#image)

##### tokenId

> `readonly` **tokenId**: `Redacted`\<`string`\>

**`Experimental`**

##### tokenSecret

> `readonly` **tokenSecret**: `Redacted`\<`string`\>

**`Experimental`**

## Variables

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

### makeProvider

> `const` **makeProvider**: (`options`) => [`SandboxProviderService`](./sandbox#sandboxproviderservice)

**`Experimental`**

Construct the Modal provider over an injected SDK client.

#### Parameters

##### options

[`ProviderOptions`](#provideroptions)

#### Returns

[`SandboxProviderService`](./sandbox#sandboxproviderservice)
