[**generalist**](./index)

***

[generalist](./index) / unstable.mcp.client

# unstable.mcp.client

## Classes

### MCPClient

**`Experimental`**

#### Extends

- `MCPClient_base`

#### Constructors

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

### MCPConnectionFailed

**`Experimental`**

#### Extends

- `MCPConnectionFailed_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`MCPConnectionFailed_base.hint`

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`MCPConnectionFailed_base.message`

##### server

> `readonly` **server**: `string`

**`Experimental`**

###### Inherited from

`MCPConnectionFailed_base.server`

***

### MCPToolCallFailed

**`Experimental`**

#### Extends

- `MCPToolCallFailed_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`MCPToolCallFailed_base.hint`

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`MCPToolCallFailed_base.message`

##### server

> `readonly` **server**: `string`

**`Experimental`**

###### Inherited from

`MCPToolCallFailed_base.server`

##### tool

> `readonly` **tool**: `string`

**`Experimental`**

###### Inherited from

`MCPToolCallFailed_base.tool`

## Interfaces

### CallOptions

**`Experimental`**

#### Properties

##### callTimeout?

> `readonly` `optional` **callTimeout?**: `Input`

**`Experimental`**

***

### DiscoveredTool

**`Experimental`**

#### Properties

##### description

> `readonly` **description**: `string`

**`Experimental`**

##### inputSchema

> `readonly` **inputSchema**: `Json`

**`Experimental`**

##### name

> `readonly` **name**: `string`

**`Experimental`**

##### outputSchema

> `readonly` **outputSchema**: `Json`

**`Experimental`**

##### rawName

> `readonly` **rawName**: `string`

**`Experimental`**

***

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

> `readonly` **transport**: `Transport`

**`Experimental`**

***

### Service

**`Experimental`**

#### Properties

##### aiTools

> `readonly` **aiTools**: `Effect`\<readonly [`MCPTool`](#mcptool)[]\>

**`Experimental`**

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

##### server

> `readonly` **server**: `string`

**`Experimental`**

##### tools

> `readonly` **tools**: `Effect`\<readonly [`DiscoveredTool`](#discoveredtool)[]\>

**`Experimental`**

## Type Aliases

### JsonValue

> **JsonValue** = `Schema.Json`

**`Experimental`**

***

### MCPTool

> **MCPTool** = `Tool.Dynamic`\<`string`, \{ `failure`: *typeof* `Schema.String` \| *typeof* [`MCPToolFailure`](#mcptoolfailure-1); `failureMode`: `"return"`; `parameters`: `JsonSchema`; `success`: *typeof* `Schema.Unknown`; \}\>

**`Experimental`**

***

### MCPToolFailure

> **MCPToolFailure** = *typeof* `MCPToolFailure.Type`

**`Experimental`**

## Variables

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

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`MCPClient`](#mcpclient), [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

**`Experimental`**

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`MCPClient`](#mcpclient), [`MCPConnectionFailed`](#mcpconnectionfailed) \| [`OAuthProviderError`](./unstable.mcp.oauth#oauthprovidererror)\>

***

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

### MCPToolFailure

> `const` **MCPToolFailure**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"generalist/mcp/MCPToolCallFailed"`\>; `hint`: `Schema.withConstructorDefault`\<`Schema.withDecodingDefaultKey`\<`Schema.String`, `never`\>\>; `message`: `Schema.String`; `server`: `Schema.String`; `tool`: `Schema.String`; \}\>

**`Experimental`**
