[**generalist**](./index)

***

[generalist](./index) / unstable.mcp.tools

# unstable.mcp.tools

## Interfaces

<a id="mcptools"></a>

### MCPTools

**`Experimental`**

#### Properties

<a id="executorlayer"></a>

##### executorLayer

> `readonly` **executorLayer**: `Layer`\<`Handler`\<`string`\> \| [`ToolExecutor`](./generalist/namespaces/ToolExecutor#toolexecutor)\>

**`Experimental`**

<a id="toolkit"></a>

##### toolkit

> `readonly` **toolkit**: `Toolkit`\<`Record`\<`string`, [`MCPTool`](./unstable.mcp.client#mcptool)\>\>

**`Experimental`**

***

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

> `readonly` **transport**: `Transport`

**`Experimental`**

## Variables

<a id="connect"></a>

### connect

> `const` **connect**: (`options`) => `Effect.Effect`\<[`MCPTools`](#mcptools), [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror), `Scope.Scope`\>

**`Experimental`**

Acquires one MCP connection and assembles its complete Generalist tool integration.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Effect.Effect`\<[`MCPTools`](#mcptools), [`MCPConnectionFailed`](./unstable.mcp.client#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror), `Scope.Scope`\>

***

<a id="layertoolkit"></a>

### layerToolkit

> `const` **layerToolkit**: (`client`) => `Layer.Layer`\<`Tool.Handler`\<`string`\>\>

**`Experimental`**

Effect AI handler layer that proxies MCP tool calls to the MCP server.

#### Parameters

##### client

[`Service`](./unstable.mcp.client#service)

#### Returns

`Layer.Layer`\<`Tool.Handler`\<`string`\>\>

***

<a id="toolkit-1"></a>

### toolkit

> `const` **toolkit**: (`client`) => `Effect.Effect`\<`Toolkit.Toolkit`\<`Record`\<`string`, [`MCPTool`](./unstable.mcp.client#mcptool)\>\>\>

**`Experimental`**

Discovered MCP tools as a Generalist toolkit. Pair with [layerToolkit](#layertoolkit)
so tool calls are proxied to the MCP server through Effect AI handlers.

#### Parameters

##### client

[`Service`](./unstable.mcp.client#service)

#### Returns

`Effect.Effect`\<`Toolkit.Toolkit`\<`Record`\<`string`, [`MCPTool`](./unstable.mcp.client#mcptool)\>\>\>
