[**generalist**](./index)

***

[generalist](./index) / unstable.sandbox.fly-sprites

# unstable.sandbox.fly-sprites

## Interfaces

### Options

**`Experimental`**

Fly Sprites hosted microVM configuration.

#### Properties

##### app

> `readonly` **app**: `string`

**`Experimental`**

Prefix for fresh Sprite names. Acquire keys address an exact existing Sprite name.

##### token

> `readonly` **token**: `Config`\<`Redacted`\<`string`\>\>

**`Experimental`**

***

### ProviderOptions

**`Experimental`**

Resolved Fly Sprites configuration used by recorded fixtures.

#### Extends

- `Omit`\<[`Options`](#options), `"token"`\>

#### Properties

##### app

> `readonly` **app**: `string`

**`Experimental`**

Prefix for fresh Sprite names. Acquire keys address an exact existing Sprite name.

###### Inherited from

[`Options`](#options).[`app`](#app)

##### token

> `readonly` **token**: `Redacted`\<`string`\>

**`Experimental`**

## Variables

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

### makeProvider

> `const` **makeProvider**: (`options`) => `Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice), `never`, `HttpClient.HttpClient`\>

**`Experimental`**

Construct the Fly Sprites provider over Effect HttpClient.

#### Parameters

##### options

[`ProviderOptions`](#provideroptions)

#### Returns

`Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice), `never`, `HttpClient.HttpClient`\>
