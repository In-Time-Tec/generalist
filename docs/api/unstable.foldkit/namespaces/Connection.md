[**generalist**](../../index)

***

[generalist](../../index) / [unstable.foldkit](../index) / Connection

# Connection

## Classes

### Connection

**`Experimental`**

#### Extends

- `Connection_base`

#### Constructors

##### Constructor

> **new Connection**(`_`): [`Connection`](#connection)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`Connection`](#connection)

###### Inherited from

`Connection_base.constructor`

***

### SendFailed

**`Experimental`**

#### Extends

- `SendFailed_base`

#### Constructors

##### Constructor

> **new SendFailed**(...`args`): [`SendFailed`](#sendfailed)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SendFailed`](#sendfailed)

###### Inherited from

`SendFailed_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`SendFailed_base.hint`

##### reason

> `readonly` **reason**: `string`

**`Experimental`**

###### Inherited from

`SendFailed_base.reason`

## Interfaces

### Service

**`Experimental`**

#### Properties

##### send

> `readonly` **send**: (`command`) => `Effect`\<`void`, `TransportError` \| [`SendFailed`](#sendfailed)\>

**`Experimental`**

###### Parameters

###### command

\{ `_tag`: `"SendMessage"`; `prompt`: `string`; `sessionId`: `string`; \} \| \{ `_tag`: `"ResolveApproval"`; `decision`: \{ `_tag`: `"Approved"`; \} \| \{ `_tag`: `"Denied"`; `reason?`: `string`; \}; `sessionId`: `string`; `token`: `string`; \} \| \{ `_tag`: `"Cancel"`; `sessionId`: `string`; \}

###### Returns

`Effect`\<`void`, `TransportError` \| [`SendFailed`](#sendfailed)\>

##### session

> `readonly` **session**: (`options`) => `Effect`\<[`SessionConnection`](#sessionconnection), `never`, `Scope`\>

**`Experimental`**

###### Parameters

###### options

###### afterSeq?

`number`

###### sessionId

`string`

###### Returns

`Effect`\<[`SessionConnection`](#sessionconnection), `never`, `Scope`\>

***

### SessionConnection

**`Experimental`**

#### Properties

##### frames

> `readonly` **frames**: `Stream`\<[`Incoming`](#incoming), `never`\>

**`Experimental`**

##### send

> `readonly` **send**: (`command`) => `Effect`\<`void`, `TransportError` \| [`SendFailed`](#sendfailed)\>

**`Experimental`**

###### Parameters

###### command

\{ `_tag`: `"SendMessage"`; `prompt`: `string`; `sessionId`: `string`; \} \| \{ `_tag`: `"ResolveApproval"`; `decision`: \{ `_tag`: `"Approved"`; \} \| \{ `_tag`: `"Denied"`; `reason?`: `string`; \}; `sessionId`: `string`; `token`: `string`; \} \| \{ `_tag`: `"Cancel"`; `sessionId`: `string`; \}

###### Returns

`Effect`\<`void`, `TransportError` \| [`SendFailed`](#sendfailed)\>

##### sessionId

> `readonly` **sessionId**: `string`

**`Experimental`**

## Type Aliases

### AgentCommandError

> **AgentCommandError** = *typeof* `AgentCommandError.Type`

**`Experimental`**

***

### CommandOperation

> **CommandOperation** = *typeof* `CommandOperation.Type`

**`Experimental`**

***

### Incoming

> **Incoming** = [`HostEvent`](../../host#hostevent) \| *typeof* `ConnectionOpened.Type` \| *typeof* `ConnectionLost.Type` \| *typeof* `ConnectionFailed.Type`

**`Experimental`**

## Variables

### AgentCommandError

> `const` **AgentCommandError**: `Schema.Union`\<readonly \[*typeof* `TransportError`, *typeof* [`SendFailed`](#sendfailed)\]\>

**`Experimental`**

***

### CommandOperation

> `const` **CommandOperation**: `Schema.Literals`\<readonly \[`"send"`, `"cancel"`, `"resolveApproval"`\]\>

**`Experimental`**

***

### ConnectionFailed

> `const` **ConnectionFailed**: `CallableTaggedStruct`\<`"ConnectionFailed"`, \{ `error`: *typeof* `TransportError`; `operation`: `Schema.Literal`\<`"connect"`\>; `reason`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

### ConnectionLost

> `const` **ConnectionLost**: `CallableTaggedStruct`\<`"ConnectionLost"`, `Record`\<`never`, `never`\>\>

**`Experimental`**

***

### ConnectionOpened

> `const` **ConnectionOpened**: `CallableTaggedStruct`\<`"ConnectionOpened"`, `Record`\<`never`, `never`\>\>

**`Experimental`**

***

### Incoming

> **Incoming**: `Schema`\<[`Incoming`](#incoming)\>

**`Experimental`**

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Connection`](#connection)\>

**`Experimental`**

#### Parameters

##### implementation

[`Connection`](#connection)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`Connection`](#connection)\>

***

### layerWebSocket

> `const` **layerWebSocket**: (`options`) => `Layer.Layer`\<[`Connection`](#connection), `never`, `HttpClient.HttpClient` \| `Socket.WebSocketConstructor`\>

**`Experimental`**

#### Parameters

##### options

###### baseUrl

`string`

#### Returns

`Layer.Layer`\<[`Connection`](#connection), `never`, `HttpClient.HttpClient` \| `Socket.WebSocketConstructor`\>
