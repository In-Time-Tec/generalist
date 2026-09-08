[**generalist**](../../index.md)

***

[generalist](../../index.md) / [unstable.foldkit](../index.md) / Connection

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

\{ `_tag`: `"SendMessage"`; `prompt`: `string`; `sessionId`: `string`; \} \| \{ `_tag`: `"ResolveApproval"`; `decision`: \{ `_tag`: `"Approved"`; \} \| \{ `_tag`: `"Denied"`; `reason?`: `string`; \}; `sessionId`: `string`; `token`: `string`; \} \| \{ `_tag`: `"Cancel"`; `commandId`: `string`; `sessionId`: `string`; \}

###### Returns

`Effect`\<`void`, `TransportError` \| [`SendFailed`](#sendfailed)\>

<a id="session"></a>

##### session

> `readonly` **session**: (`options`) => `Effect`\<[`SessionConnection`](#sessionconnection), `never`, `Scope`\>

**`Experimental`**

###### Parameters

###### options

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

\{ `_tag`: `"SendMessage"`; `prompt`: `string`; `sessionId`: `string`; \} \| \{ `_tag`: `"ResolveApproval"`; `decision`: \{ `_tag`: `"Approved"`; \} \| \{ `_tag`: `"Denied"`; `reason?`: `string`; \}; `sessionId`: `string`; `token`: `string`; \} \| \{ `_tag`: `"Cancel"`; `commandId`: `string`; `sessionId`: `string`; \}

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

> **Incoming** = *typeof* `SessionSnapshot.Type` \| *typeof* `HostDelivery.Type` \| *typeof* `PreviewDelivery.Type` \| *typeof* `ConnectionOpened.Type` \| *typeof* `ConnectionLost.Type` \| *typeof* `ConnectionFailed.Type`

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

> `const` **ConnectionFailed**: `CallableTaggedStruct`\<`"ConnectionFailed"`, *typeof* `DeliveryIdentity` & `object`\>

**`Experimental`**

***

<a id="connectionlost"></a>

### ConnectionLost

> `const` **ConnectionLost**: `CallableTaggedStruct`\<`"ConnectionLost"`, \{ `epoch`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>

**`Experimental`**

***

<a id="connectionopened"></a>

### ConnectionOpened

> `const` **ConnectionOpened**: `CallableTaggedStruct`\<`"ConnectionOpened"`, \{ `epoch`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>

***

<a id="hostdelivery"></a>

### HostDelivery

> `const` **HostDelivery**: `CallableTaggedStruct`\<`"HostDelivery"`, \{ `activeRunId`: `Schema.NullOr`\<`Schema.String`\>; `epoch`: `Schema.Int`; `event`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"RunStarted"`, \{ `cursor`: [`Cursor`](../../runtime/namespaces/Cursor.md#cursor); `event`: `Schema.refine`\<`object` & `object` & `object`, `Schema.Codec`\<[`RunEvent`](../../runtime/namespaces/RunEvent.md#runevent), `object` & ..., `never`, `never`\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Turn"`, \{ `cursor`: [`Cursor`](../../runtime/namespaces/Cursor.md#cursor); `event`: `Schema.refine`\<... & ... & ... \| ... & ... & ..., `Schema.Codec`\<[`RunEvent`](../../runtime/namespaces/RunEvent.md#runevent), `object` & ..., `never`, `never`\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ToolCall"`, \{ `cursor`: [`Cursor`](../../runtime/namespaces/Cursor.md#cursor); `event`: `Schema.refine`\<... & ... & ... \| ... & ... & ... \| ... & ... & ... \| ... & ... & ..., `Schema.Codec`\<[`RunEvent`](../../runtime/namespaces/RunEvent.md#runevent), `object` & ..., `never`, `never`\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"TasksUpdated"`, \{ `cursor`: `Schema.Int`; `items`: `Schema.$Array`\<`Schema.Struct`\<\{ `id`: `Schema.String`; `note`: `Schema.optionalKey`\<...\>; `status`: `Schema.Literals`\<...\>; `title`: `Schema.String`; \}\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ArtifactUpdated"`, \{ `cursor`: `Schema.Int`; `runId`: `Schema.String`; `sessionId`: `Schema.String`; `update`: `Schema.Struct`\<\{ `artifact`: `Schema.String`; `attribution`: `Schema.Union`\<readonly ...\>; `base`: `Schema.Int`; `branch`: `Schema.optionalKey`\<`Schema.String`\>; `result`: `Schema.Int`; \}\>; \}\>, `Schema.TaggedStruct`\<`"ApprovalRequested"`, \{ `cursor`: [`Cursor`](../../runtime/namespaces/Cursor.md#cursor); `event`: `Schema.refine`\<`object` & [`ApprovalRequested`](../../generalist/namespaces/AgentEvent.md#approvalrequested) & `object`, `Schema.Codec`\<[`RunEvent`](../../runtime/namespaces/RunEvent.md#runevent), `object` & ..., `never`, `never`\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Compacted"`, \{ `cursor`: [`Cursor`](../../runtime/namespaces/Cursor.md#cursor); `event`: `Schema.refine`\<`object` & `object` & `object`, `Schema.Codec`\<[`RunEvent`](../../runtime/namespaces/RunEvent.md#runevent), `object` & ..., `never`, `never`\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Completed"`, \{ `cursor`: [`Cursor`](../../runtime/namespaces/Cursor.md#cursor); `event`: `Schema.refine`\<... & ... & ... \| ... & ... & ... \| ... & ... & ..., `Schema.Codec`\<[`RunEvent`](../../runtime/namespaces/RunEvent.md#runevent), `object` & ..., `never`, `never`\>\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Conversation"`, \{ `cursor`: `Schema.Int`; `sessionId`: `Schema.String`; `update`: `Schema.Struct`\<\{ `afterEntryId`: `Schema.NullOr`\<`Schema.String`\>; `entries`: `Schema.$Array`\<`Schema.Codec`\<..., ..., ..., ...\>\>; `leafId`: `Schema.NullOr`\<`Schema.String`\>; `nextLeafId`: `Schema.optionalKey`\<`Schema.String`\>; `previousLeafId`: `Schema.NullOr`\<`Schema.String`\>; `reset`: `Schema.optionalKey`\<`Schema.Literal`\<...\>\>; \}\>; \}\>\]\>; \}\>

**`Experimental`**

One committed Host event delivered within an established snapshot epoch.

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

***

<a id="previewdelivery"></a>

### PreviewDelivery

> `const` **PreviewDelivery**: `CallableTaggedStruct`\<`"PreviewDelivery"`, \{ `delivery`: `Schema.TaggedStruct`\<`"PreviewDelivery"`, \{ `authorityAttemptFence`: `Schema.Int`; `event`: `Schema.Union`\<readonly \[`Schema.refine`\<\{ `_tag`: `"ModelPreview"`; `attempt`: `number`; `attemptFence`: `number`; `changes`: readonly \[..., ...\]; `generation`: `number`; `modelAttemptId`: `string`; `modelCallId`: `string`; `runId`: `string`; `sequence`: `number`; `turn`: `number`; \}, `Schema.TaggedStruct`\<`"ModelPreview"`, \{ `attempt`: `Schema.Int`; `attemptFence`: `Schema.Int`; `changes`: `Schema.NonEmptyArray`\<...\>; `generation`: `Schema.Int`; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `runId`: `Schema.String`; `sequence`: `Schema.Int`; `turn`: `Schema.Int`; \}\>\>, `Schema.TaggedStruct`\<`"ModelPreviewCleared"`, \{ `attemptFence`: `Schema.Int`; `generation`: `Schema.Int`; `runId`: `Schema.String`; \}\>\]\>; `runId`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `epoch`: `Schema.Int`; \}\>

**`Experimental`**

One Host-authorized memory-only preview delivered within an established snapshot epoch.

***

<a id="sessionsnapshot"></a>

### SessionSnapshot

> `const` **SessionSnapshot**: `CallableTaggedStruct`\<`"SessionSnapshot"`, \{ `epoch`: `Schema.Int`; `snapshot`: `Schema.Codec`\<[`HostSessionSnapshot`](../../runtime/namespaces/HostSession.md#hostsessionsnapshot), `unknown`, `never`, `never`\>; \}\>

**`Experimental`**

A committed snapshot establishes a new connection-local delivery epoch.
