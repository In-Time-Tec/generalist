[**generalist**](./index.md)

***

[generalist](./index.md) / unstable.mcp.client.stdio

# unstable.mcp.client.stdio

## Interfaces

<a id="options"></a>

### Options

**`Experimental`**

#### Properties

<a id="calltimeout"></a>

##### callTimeout?

> `readonly` `optional` **callTimeout?**: `Input`

**`Experimental`**

<a id="name"></a>

##### name

> `readonly` **name**: `string`

**`Experimental`**

<a id="transport"></a>

##### transport

> `readonly` **transport**: [`TransportOptions`](#transportoptions)

**`Experimental`**

***

<a id="transportoptions"></a>

### TransportOptions

**`Experimental`**

Node/Bun-only stdio transport options.

#### Properties

<a id="args"></a>

##### args?

> `readonly` `optional` **args?**: readonly `string`[]

**`Experimental`**

<a id="command"></a>

##### command

> `readonly` **command**: `string`

**`Experimental`**

<a id="env"></a>

##### env?

> `readonly` `optional` **env?**: `Record`\<`string`, `string`\>

**`Experimental`**

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`MCPClient`](./unstable.mcp.client.md#mcpclient), [`MCPConnectionFailed`](./unstable.mcp.client.md#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth.md#oauthprovidererror)\>

**`Experimental`**

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`MCPClient`](./unstable.mcp.client.md#mcpclient), [`MCPConnectionFailed`](./unstable.mcp.client.md#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth.md#oauthprovidererror)\>

***

<a id="layertagged"></a>

### layerTagged

> `const` **layerTagged**: \{(`options`): \<`Identifier`\>(`tag`) => `Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client.md#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth.md#oauthprovidererror)\>; \<`Identifier`\>(`tag`, `options`): `Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client.md#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth.md#oauthprovidererror)\>; \}

**`Experimental`**

#### Call Signature

> (`options`): \<`Identifier`\>(`tag`) => `Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client.md#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth.md#oauthprovidererror)\>

##### Parameters

###### options

[`Options`](#options)

##### Returns

\<`Identifier`\>(`tag`) => `Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client.md#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth.md#oauthprovidererror)\>

#### Call Signature

> \<`Identifier`\>(`tag`, `options`): `Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client.md#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth.md#oauthprovidererror)\>

##### Type Parameters

###### Identifier

`Identifier`

##### Parameters

###### tag

`Key`\<`Identifier`, [`Service`](./unstable.mcp.client.md#service)\>

###### options

[`Options`](#options)

##### Returns

`Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client.md#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth.md#oauthprovidererror)\>

***

<a id="make"></a>

### make

> `const` **make**: (`options`) => `Transport`

**`Experimental`**

Construct a Node/Bun-only stdio MCP transport.

#### Parameters

##### options

[`TransportOptions`](#transportoptions)

#### Returns

`Transport`
