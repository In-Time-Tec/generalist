[**generalist**](./index)

***

[generalist](./index) / unstable.sandbox.daytona

# unstable.sandbox.daytona

## Interfaces

<a id="options"></a>

### Options

**`Experimental`**

Daytona hosted sandbox configuration.

#### Properties

<a id="apikey"></a>

##### apiKey

> `readonly` **apiKey**: `Config`\<`Redacted`\<`string`\>\>

**`Experimental`**

<a id="autopauseafter"></a>

##### autoPauseAfter?

> `readonly` `optional` **autoPauseAfter?**: `Input`

**`Experimental`**

<a id="image"></a>

##### image

> `readonly` **image**: `string`

**`Experimental`**

OCI image for containers; existing Daytona VM snapshot for `linux-vm`.

<a id="sandboxclass"></a>

##### sandboxClass

> `readonly` **sandboxClass**: `"container"` \| `"linux-vm"`

**`Experimental`**

***

<a id="provideroptions"></a>

### ProviderOptions

**`Experimental`**

Resolved Daytona configuration used by recorded fixtures.

#### Extends

- `Omit`\<[`Options`](#options), `"apiKey"`\>

#### Properties

<a id="apikey-1"></a>

##### apiKey

> `readonly` **apiKey**: `Redacted`\<`string`\>

**`Experimental`**

<a id="autopauseafter-1"></a>

##### autoPauseAfter?

> `readonly` `optional` **autoPauseAfter?**: `Input`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`autoPauseAfter`](#autopauseafter)

<a id="image-1"></a>

##### image

> `readonly` **image**: `string`

**`Experimental`**

OCI image for containers; existing Daytona VM snapshot for `linux-vm`.

###### Inherited from

[`Options`](#options).[`image`](#image)

<a id="sandboxclass-1"></a>

##### sandboxClass

> `readonly` **sandboxClass**: `"container"` \| `"linux-vm"`

**`Experimental`**

###### Inherited from

[`Options`](#options).[`sandboxClass`](#sandboxclass)

## Type Aliases

<a id="sandboxclass-2"></a>

### SandboxClass

> **SandboxClass** = *typeof* `SandboxClass.Type`

**`Experimental`**

Daytona sandbox class supported by this leaf.

## Variables

<a id="layer"></a>

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

<a id="makeprovider"></a>

### makeProvider

> `const` **makeProvider**: (`options`) => `Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice), `never`, `HttpClient.HttpClient`\>

**`Experimental`**

Construct the Daytona provider over Effect HttpClient.

#### Parameters

##### options

[`ProviderOptions`](#provideroptions)

#### Returns

`Effect.Effect`\<[`SandboxProviderService`](./sandbox#sandboxproviderservice), `never`, `HttpClient.HttpClient`\>
