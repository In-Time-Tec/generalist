[**generalist**](./index)

***

[generalist](./index) / unstable.mcp.client.http

# unstable.mcp.client.http

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

Process-local HTTP transport options. Construct request headers at this boundary.

#### Properties

##### oauth?

> `readonly` `optional` **oauth?**: [`Service`](./unstable.mcp.oauth#service)

**`Experimental`**

##### requestInit?

> `readonly` `optional` **requestInit?**: `RequestInit`

**`Experimental`**

##### url

> `readonly` **url**: `string`

**`Experimental`**

## Variables

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`MCPClient`](./unstable.mcp.client#mcpclient), [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthPending`](./unstable.mcp.oauth#oauthpending) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

**`Experimental`**

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`MCPClient`](./unstable.mcp.client#mcpclient), [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthPending`](./unstable.mcp.oauth#oauthpending) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

***

### layerTagged

> `const` **layerTagged**: \{(`options`): \<`Identifier`\>(`tag`) => `Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror) \| [`OAuthPending`](./unstable.mcp.oauth#oauthpending)\>; \<`Identifier`\>(`tag`, `options`): `Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror) \| [`OAuthPending`](./unstable.mcp.oauth#oauthpending)\>; \}

**`Experimental`**

#### Call Signature

> (`options`): \<`Identifier`\>(`tag`) => `Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror) \| [`OAuthPending`](./unstable.mcp.oauth#oauthpending)\>

##### Parameters

###### options

[`Options`](#options)

##### Returns

\<`Identifier`\>(`tag`) => `Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror) \| [`OAuthPending`](./unstable.mcp.oauth#oauthpending)\>

#### Call Signature

> \<`Identifier`\>(`tag`, `options`): `Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror) \| [`OAuthPending`](./unstable.mcp.oauth#oauthpending)\>

##### Type Parameters

###### Identifier

`Identifier`

##### Parameters

###### tag

`Key`\<`Identifier`, [`Service`](./unstable.mcp.client#service)\>

###### options

[`Options`](#options)

##### Returns

`Layer`\<`Identifier`, [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror) \| [`OAuthPending`](./unstable.mcp.oauth#oauthpending)\>

***

### make

> `const` **make**: (`options`) => `Transport`

**`Experimental`**

Construct a Worker-safe Streamable HTTP MCP transport.

#### Parameters

##### options

[`TransportOptions`](#transportoptions)

#### Returns

`Transport`
