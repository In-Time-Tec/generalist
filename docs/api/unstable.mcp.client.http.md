[**generalist**](./index)

***

[generalist](./index) / unstable.mcp.client.http

# unstable.mcp.client.http

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

Process-local HTTP transport options. Construct request headers at this boundary.

#### Properties

<a id="oauth"></a>

##### oauth?

> `readonly` `optional` **oauth?**: [`Service`](./unstable.mcp.oauth#service)

**`Experimental`**

<a id="requestinit"></a>

##### requestInit?

> `readonly` `optional` **requestInit?**: `RequestInit`

**`Experimental`**

<a id="url"></a>

##### url

> `readonly` **url**: `string`

**`Experimental`**

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`MCPClient`](./unstable.mcp.client#mcpclient), [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthPending`](./unstable.mcp.oauth#oauthpending) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

**`Experimental`**

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`MCPClient`](./unstable.mcp.client#mcpclient), [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthPending`](./unstable.mcp.oauth#oauthpending) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

***

<a id="layertagged"></a>

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

<a id="make"></a>

### make

> `const` **make**: (`options`) => `Transport`

**`Experimental`**

Construct a Worker-safe Streamable HTTP MCP transport.

#### Parameters

##### options

[`TransportOptions`](#transportoptions)

#### Returns

`Transport`
