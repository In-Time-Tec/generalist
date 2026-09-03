[**generalist**](./index)

***

[generalist](./index) / unstable.mcp.client

# unstable.mcp.client

## Classes

<a id="mcpclient"></a>

### MCPClient

**`Experimental`**

#### Extends

- `MCPClient_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new MCPClient**(`_`): [`MCPClient`](#mcpclient)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`MCPClient`](#mcpclient)

###### Inherited from

`MCPClient_base.constructor`

***

<a id="mcpconnectionfailed"></a>

### MCPConnectionFailed

**`Experimental`**

#### Extends

- `MCPConnectionFailed_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new MCPConnectionFailed**(...`args`): [`MCPConnectionFailed`](#mcpconnectionfailed)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`MCPConnectionFailed`](#mcpconnectionfailed)

###### Inherited from

`MCPConnectionFailed_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`MCPConnectionFailed_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`MCPConnectionFailed_base.message`

<a id="server"></a>

##### server

> `readonly` **server**: `string`

**`Experimental`**

###### Inherited from

`MCPConnectionFailed_base.server`

***

<a id="mcptoolcallfailed"></a>

### MCPToolCallFailed

**`Experimental`**

#### Extends

- `MCPToolCallFailed_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new MCPToolCallFailed**(...`args`): [`MCPToolCallFailed`](#mcptoolcallfailed)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`MCPToolCallFailed`](#mcptoolcallfailed)

###### Inherited from

`MCPToolCallFailed_base.constructor`

#### Properties

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`MCPToolCallFailed_base.hint`

<a id="message-1"></a>

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`MCPToolCallFailed_base.message`

<a id="server-1"></a>

##### server

> `readonly` **server**: `string`

**`Experimental`**

###### Inherited from

`MCPToolCallFailed_base.server`

<a id="tool"></a>

##### tool

> `readonly` **tool**: `string`

**`Experimental`**

###### Inherited from

`MCPToolCallFailed_base.tool`

## Interfaces

<a id="calloptions"></a>

### CallOptions

**`Experimental`**

#### Properties

<a id="calltimeout"></a>

##### callTimeout?

> `readonly` `optional` **callTimeout?**: `Input`

**`Experimental`**

***

<a id="discoveredtool"></a>

### DiscoveredTool

**`Experimental`**

#### Properties

<a id="description"></a>

##### description

> `readonly` **description**: `string`

**`Experimental`**

<a id="inputschema"></a>

##### inputSchema

> `readonly` **inputSchema**: `Json`

**`Experimental`**

<a id="name"></a>

##### name

> `readonly` **name**: `string`

**`Experimental`**

<a id="outputschema"></a>

##### outputSchema

> `readonly` **outputSchema**: `Json`

**`Experimental`**

<a id="rawname"></a>

##### rawName

> `readonly` **rawName**: `string`

**`Experimental`**

***

<a id="options"></a>

### Options

**`Experimental`**

#### Properties

<a id="calltimeout-1"></a>

##### callTimeout?

> `readonly` `optional` **callTimeout?**: `Input`

**`Experimental`**

<a id="name-1"></a>

##### name

> `readonly` **name**: `string`

**`Experimental`**

<a id="transport"></a>

##### transport

> `readonly` **transport**: `Transport`

**`Experimental`**

***

<a id="service"></a>

### Service

**`Experimental`**

#### Properties

<a id="aitools"></a>

##### aiTools

> `readonly` **aiTools**: `Effect`\<readonly [`MCPTool`](#mcptool)[]\>

**`Experimental`**

<a id="calltool"></a>

##### callTool

> `readonly` **callTool**: (`rawName`, `input`) => `Effect`\<`Json`, [`MCPToolCallFailed`](#mcptoolcallfailed)\>

**`Experimental`**

###### Parameters

###### rawName

`string`

###### input

`Json`

###### Returns

`Effect`\<`Json`, [`MCPToolCallFailed`](#mcptoolcallfailed)\>

<a id="server-2"></a>

##### server

> `readonly` **server**: `string`

**`Experimental`**

<a id="tools"></a>

##### tools

> `readonly` **tools**: `Effect`\<readonly [`DiscoveredTool`](#discoveredtool)[]\>

**`Experimental`**

## Type Aliases

<a id="jsonvalue"></a>

### JsonValue

> **JsonValue** = `Schema.Json`

**`Experimental`**

***

<a id="mcptool"></a>

### MCPTool

> **MCPTool** = `Tool.Dynamic`\<`string`, \{ `failure`: *typeof* `Schema.String` \| *typeof* [`MCPToolFailure`](#mcptoolfailure-1); `failureMode`: `"return"`; `parameters`: `JsonSchema`; `success`: *typeof* `Schema.Unknown`; \}\>

**`Experimental`**

***

<a id="mcptoolfailure"></a>

### MCPToolFailure

> **MCPToolFailure** = *typeof* `MCPToolFailure.Type`

**`Experimental`**

## Variables

<a id="fromtransport"></a>

### fromTransport

> `const` **fromTransport**: \{(`transport`, `options?`): (`name`) => `Effect`\<[`Service`](#service), [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror), `Scope`\>; (`name`, `transport`, `options?`): `Effect`\<[`Service`](#service), [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror), `Scope`\>; \}

**`Experimental`**

#### Call Signature

> (`transport`, `options?`): (`name`) => `Effect`\<[`Service`](#service), [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror), `Scope`\>

##### Parameters

###### transport

`Transport`

###### options?

[`CallOptions`](#calloptions)

##### Returns

(`name`) => `Effect`\<[`Service`](#service), [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror), `Scope`\>

#### Call Signature

> (`name`, `transport`, `options?`): `Effect`\<[`Service`](#service), [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror), `Scope`\>

##### Parameters

###### name

`string`

###### transport

`Transport`

###### options?

[`CallOptions`](#calloptions)

##### Returns

`Effect`\<[`Service`](#service), [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror), `Scope`\>

***

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`MCPClient`](#mcpclient), [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

**`Experimental`**

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`MCPClient`](#mcpclient), [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

***

<a id="layertagged"></a>

### layerTagged

> `const` **layerTagged**: \{(`options`): \<`Identifier`\>(`tag`) => `Layer`\<`Identifier`, [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>; \<`Identifier`\>(`tag`, `options`): `Layer`\<`Identifier`, [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>; \}

**`Experimental`**

#### Call Signature

> (`options`): \<`Identifier`\>(`tag`) => `Layer`\<`Identifier`, [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

##### Parameters

###### options

[`Options`](#options)

##### Returns

\<`Identifier`\>(`tag`) => `Layer`\<`Identifier`, [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

#### Call Signature

> \<`Identifier`\>(`tag`, `options`): `Layer`\<`Identifier`, [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

##### Type Parameters

###### Identifier

`Identifier`

##### Parameters

###### tag

`Key`\<`Identifier`, [`Service`](#service)\>

###### options

[`Options`](#options)

##### Returns

`Layer`\<`Identifier`, [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

***

<a id="mcptoolfailure-1"></a>

### MCPToolFailure

> `const` **MCPToolFailure**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"generalist/mcp/MCPToolCallFailed"`\>; `hint`: `Schema.withConstructorDefault`\<`Schema.withDecodingDefaultKey`\<`Schema.String`, `never`\>\>; `message`: `Schema.String`; `server`: `Schema.String`; `tool`: `Schema.String`; \}\>

**`Experimental`**
