[**generalist**](./index)

***

[generalist](./index) / unstable.sandbox.daytona

# unstable.sandbox.daytona

## Interfaces

### Options

**`Experimental`**

Daytona hosted sandbox configuration.

#### Properties

##### apiKey

> `readonly` **apiKey**: `Config`\<`Redacted`\<`string`\>\>

**`Experimental`**

##### autoPauseAfter?

> `readonly` `optional` **autoPauseAfter?**: `Input`

**`Experimental`**

##### image

> `readonly` **image**: `string`

**`Experimental`**

OCI image for containers; existing Daytona VM snapshot for `linux-vm`.

##### sandboxClass

> `readonly` **sandboxClass**: `"container"` \| `"linux-vm"`

**`Experimental`**

***

### ProviderOptions

**`Experimental`**

Resolved Daytona configuration used by recorded fixtures.

#### Extends

- `Omit`\<[`Options`](#options), `"apiKey"`\>

#### Properties

##### apiKey

> `readonly` **apiKey**: `Redacted`\<`string`\>

**`Experimental`**

##### autoPauseAfter?

> `readonly` `optional` **autoPauseAfter?**: `Input`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`autoPauseAfter`](#autopauseafter)

##### image

> `readonly` **image**: `string`

**`Experimental`**

OCI image for containers; existing Daytona VM snapshot for `linux-vm`.

###### Inherited from

[`Options`](#options).[`image`](#image)

##### sandboxClass

> `readonly` **sandboxClass**: `"container"` \| `"linux-vm"`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`sandboxClass`](#sandboxclass)

## Type Aliases

### SandboxClass

> **SandboxClass** = *typeof* `SandboxClass.Type`

**`Experimental`**

Daytona sandbox class supported by this leaf.

## Variables

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`SandboxProvider`](./sandbox#sandboxprovider), `Config.ConfigError`, `HttpClient.HttpClient`\>

**`Experimental`**

Provide the hosted Daytona Sandbox leaf.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`SandboxProvider`](./sandbox#sandboxprovider), `Config.ConfigError`, `HttpClient.HttpClient`\>

***

### makeProvider

> `const` **makeProvider**: (`options`) => `Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice), `never`, `HttpClient.HttpClient`\>

**`Experimental`**

Construct the Daytona provider over Effect HttpClient.

#### Parameters

##### options

[`ProviderOptions`](#provideroptions)

#### Returns

`Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice), `never`, `HttpClient.HttpClient`\>
