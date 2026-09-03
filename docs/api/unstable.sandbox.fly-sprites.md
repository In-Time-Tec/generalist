[**generalist**](./index)

***

[generalist](./index) / unstable.sandbox.fly-sprites

# unstable.sandbox.fly-sprites

## Interfaces

<a id="options"></a>

### Options

**`Experimental`**

Fly Sprites hosted microVM configuration.

#### Properties

<a id="app"></a>

##### app

> `readonly` **app**: `string`

**`Experimental`**

Prefix for fresh Sprite names. Acquire keys address an exact existing Sprite name.

<a id="token"></a>

##### token

> `readonly` **token**: `Config`\<`Redacted`\<`string`\>\>

**`Experimental`**

***

<a id="provideroptions"></a>

### ProviderOptions

**`Experimental`**

Resolved Fly Sprites configuration used by recorded fixtures.

#### Extends

- `Omit`\<[`Options`](#options), `"token"`\>

#### Properties

<a id="app-1"></a>

##### app

> `readonly` **app**: `string`

**`Experimental`**

Prefix for fresh Sprite names. Acquire keys address an exact existing Sprite name.

###### Inherited from

[`Options`](#options).[`app`](#app)

<a id="token-1"></a>

##### token

> `readonly` **token**: `Redacted`\<`string`\>

**`Experimental`**

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`SandboxProvider`](./sandbox#sandboxprovider), `Config.ConfigError`, `HttpClient.HttpClient`\>

**`Experimental`**

Provide the hosted Fly Sprites microVM Sandbox leaf.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`SandboxProvider`](./sandbox#sandboxprovider), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

<a id="makeprovider"></a>

### makeProvider

> `const` **makeProvider**: (`options`) => `Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice), `never`, `HttpClient.HttpClient`\>

**`Experimental`**

Construct the Fly Sprites provider over Effect HttpClient.

#### Parameters

##### options

[`ProviderOptions`](#provideroptions)

#### Returns

`Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice), `never`, `HttpClient.HttpClient`\>
