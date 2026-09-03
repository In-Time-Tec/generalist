[**generalist**](./index)

***

[generalist](./index) / unstable.mcp.client.stdio

# unstable.mcp.client.stdio

## Interfaces

### Options

**`Experimental`**

#### Properties

##### callTimeout?

> `readonly` `optional` **callTimeout?**: `Input`

**`Experimental`**

##### name

> `readonly` **name**: `string`

**`Experimental`**

##### transport

> `readonly` **transport**: [`TransportOptions`](#transportoptions)

**`Experimental`**

***

### TransportOptions

**`Experimental`**

Node/Bun-only stdio transport options.

#### Properties

##### args?

> `readonly` `optional` **args?**: readonly `string`[]

**`Experimental`**

##### command

> `readonly` **command**: `string`

**`Experimental`**

##### env?

> `readonly` `optional` **env?**: `Record`\<`string`, `string`\>

**`Experimental`**

## Variables

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`MCPClient`](./unstable.mcp.client#mcpclient), [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

**`Experimental`**

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`MCPClient`](./unstable.mcp.client#mcpclient), [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

***

### layerTagged

> `const` **layerTagged**: \{(`options`): \<`Identifier`\>(`tag`) => `Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>; \<`Identifier`\>(`tag`, `options`): `Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>; \}

**`Experimental`**

#### Call Signature

> (`options`): \<`Identifier`\>(`tag`) => `Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

##### Parameters

###### options

[`Options`](#options)

##### Returns

\<`Identifier`\>(`tag`) => `Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

#### Call Signature

> \<`Identifier`\>(`tag`, `options`): `Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

##### Type Parameters

###### Identifier

`Identifier`

##### Parameters

###### tag

`Key`\<`Identifier`, [`Service`](./unstable.mcp.client#service)\>

###### options

[`Options`](#options)

##### Returns

`Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

***

### make

> `const` **make**: (`options`) => `Transport`

**`Experimental`**

Construct a Node/Bun-only stdio MCP transport.

#### Parameters

##### options

[`TransportOptions`](#transportoptions)

#### Returns

`Transport`
