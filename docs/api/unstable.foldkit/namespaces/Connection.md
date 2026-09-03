[**generalist**](../../index)

***

[generalist](../../index) / [unstable.foldkit](../index) / Connection

# Connection

## Classes

<a id="connection"></a>

### Connection

**`Experimental`**

#### Extends

- `Connection_base`

#### Constructors

<a id="constructor"></a>

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

<a id="sendfailed"></a>

### SendFailed

**`Experimental`**

#### Extends

- `SendFailed_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`SendFailed_base.hint`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `string`

**`Experimental`**

###### Inherited from

`SendFailed_base.reason`

## Interfaces

<a id="service"></a>

### Service

**`Experimental`**

#### Properties

<a id="send"></a>

##### send

> `readonly` **send**: (`command`) => `Effect`\<`void`, `TransportError` \| [`SendFailed`](#sendfailed)\>

**`Experimental`**

###### Parameters

###### command

\{ `_tag`: `"SendMessage"`; `prompt`: `string`; `sessionId`: `string`; \} \| \{ `_tag`: `"ResolveApproval"`; `decision`: \{ `_tag`: `"Approved"`; \} \| \{ `_tag`: `"Denied"`; `reason?`: `string`; \}; `sessionId`: `string`; `token`: `string`; \} \| \{ `_tag`: `"Cancel"`; `sessionId`: `string`; \}

###### Returns

`Effect`\<`void`, `TransportError` \| [`SendFailed`](#sendfailed)\>

<a id="session"></a>

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

<a id="sessionconnection"></a>

### SessionConnection

**`Experimental`**

#### Properties

<a id="frames"></a>

##### frames

> `readonly` **frames**: `Stream`\<[`Incoming`](#incoming), `never`\>

**`Experimental`**

<a id="send-1"></a>

##### send

> `readonly` **send**: (`command`) => `Effect`\<`void`, `TransportError` \| [`SendFailed`](#sendfailed)\>

**`Experimental`**

###### Parameters

###### command

\{ `_tag`: `"SendMessage"`; `prompt`: `string`; `sessionId`: `string`; \} \| \{ `_tag`: `"ResolveApproval"`; `decision`: \{ `_tag`: `"Approved"`; \} \| \{ `_tag`: `"Denied"`; `reason?`: `string`; \}; `sessionId`: `string`; `token`: `string`; \} \| \{ `_tag`: `"Cancel"`; `sessionId`: `string`; \}

###### Returns

`Effect`\<`void`, `TransportError` \| [`SendFailed`](#sendfailed)\>

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

**`Experimental`**

## Type Aliases

<a id="agentcommanderror"></a>

### AgentCommandError

> **AgentCommandError** = *typeof* `AgentCommandError.Type`

**`Experimental`**

***

<a id="commandoperation"></a>

### CommandOperation

> **CommandOperation** = *typeof* `CommandOperation.Type`

**`Experimental`**

***

<a id="incoming"></a>

### Incoming

> **Incoming** = [`HostEvent`](../../host#hostevent) \| *typeof* `ConnectionOpened.Type` \| *typeof* `ConnectionLost.Type` \| *typeof* `ConnectionFailed.Type`

**`Experimental`**

## Variables

<a id="agentcommanderror-1"></a>

### AgentCommandError

> `const` **AgentCommandError**: `Schema.Union`\<readonly \[*typeof* `TransportError`, *typeof* [`SendFailed`](#sendfailed)\]\>

**`Experimental`**

***

<a id="commandoperation-1"></a>

### CommandOperation

> `const` **CommandOperation**: `Schema.Literals`\<readonly \[`"send"`, `"cancel"`, `"resolveApproval"`\]\>

**`Experimental`**

***

<a id="connectionfailed"></a>

### ConnectionFailed

> `const` **ConnectionFailed**: `CallableTaggedStruct`\<`"ConnectionFailed"`, \{ `error`: *typeof* `TransportError`; `operation`: `Schema.Literal`\<`"connect"`\>; `reason`: *typeof* `Schema.String`; \}\>

**`Experimental`**

***

<a id="connectionlost"></a>

### ConnectionLost

> `const` **ConnectionLost**: `CallableTaggedStruct`\<`"ConnectionLost"`, `Record`\<`never`, `never`\>\>

**`Experimental`**

***

<a id="connectionopened"></a>

### ConnectionOpened

> `const` **ConnectionOpened**: `CallableTaggedStruct`\<`"ConnectionOpened"`, `Record`\<`never`, `never`\>\>

**`Experimental`**

***

<a id="incoming-1"></a>

### Incoming

> **Incoming**: `Schema`\<[`Incoming`](#incoming)\>

**`Experimental`**

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Connection`](#connection)\>

**`Experimental`**

#### Parameters

##### implementation

[`Connection`](#connection)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`Connection`](#connection)\>

***

<a id="layerwebsocket"></a>

### layerWebSocket

> `const` **layerWebSocket**: (`options`) => `Layer.Layer`\<[`Connection`](#connection), `never`, `HttpClient.HttpClient` \| `Socket.WebSocketConstructor`\>

**`Experimental`**

#### Parameters

##### options

###### baseUrl

`string`

#### Returns

`Layer.Layer`\<[`Connection`](#connection), `never`, `HttpClient.HttpClient` \| `Socket.WebSocketConstructor`\>
