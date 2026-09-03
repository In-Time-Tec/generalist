[**generalist**](./index)

***

[generalist](./index) / unstable.sandbox.e2b

# unstable.sandbox.e2b

## Interfaces

### Options

**`Experimental`**

E2B hosted microVM configuration.

#### Properties

##### apiKey

> `readonly` **apiKey**: `Config`\<`Redacted`\<`string`\>\>

**`Experimental`**

##### autoPauseAfter?

> `readonly` `optional` **autoPauseAfter?**: `Input`

**`Experimental`**

##### template

> `readonly` **template**: `string`

**`Experimental`**

## Variables

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`SandboxProvider`](./sandbox#sandboxprovider), `Config.ConfigError`, `HttpClient.HttpClient`\>

**`Experimental`**

Provide the hosted E2B microVM Sandbox leaf.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`SandboxProvider`](./sandbox#sandboxprovider), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

### makeProvider

> `const` **makeProvider**: (`options`) => `Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice), `never`, `HttpClient.HttpClient`\>

**`Experimental`**

Construct the E2B provider over Effect HttpClient.

#### Parameters

##### options

`Omit`\<[`Options`](#options), `"apiKey"`\> & `object`

#### Returns

`Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice), `never`, `HttpClient.HttpClient`\>
