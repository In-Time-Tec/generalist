[**generalist**](./index)

***

[generalist](./index) / unstable.sandbox.e2b

# unstable.sandbox.e2b

## Interfaces

<a id="options"></a>

### Options

**`Experimental`**

E2B hosted microVM configuration.

#### Properties

<a id="apikey"></a>

##### apiKey

> `readonly` **apiKey**: `Config`\<`Redacted`\<`string`\>\>

**`Experimental`**

<a id="autopauseafter"></a>

##### autoPauseAfter?

> `readonly` `optional` **autoPauseAfter?**: `Input`

**`Experimental`**

<a id="template"></a>

##### template

> `readonly` **template**: `string`

**`Experimental`**

## Variables

<a id="layer"></a>

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

<a id="makeprovider"></a>

### makeProvider

> `const` **makeProvider**: (`options`) => `Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice), `never`, `HttpClient.HttpClient`\>

**`Experimental`**

Construct the E2B provider over Effect HttpClient.

#### Parameters

##### options

`Omit`\<[`Options`](#options), `"apiKey"`\> & `object`

#### Returns

`Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice), `never`, `HttpClient.HttpClient`\>
