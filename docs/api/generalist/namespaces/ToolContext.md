[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ToolContext

# ToolContext

## Classes

<a id="toolcontext"></a>

### ToolContext

#### Extends

- `ToolContext_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new ToolContext**(`_`): [`ToolContext`](#toolcontext)

###### Parameters

###### \_

`never`

###### Returns

[`ToolContext`](#toolcontext)

###### Inherited from

`ToolContext_base.constructor`

## Interfaces

<a id="progress"></a>

### Progress

A progress update emitted by a running tool.

#### Properties

<a id="data"></a>

##### data?

> `readonly` `optional` **data?**: `JsonObject`

<a id="message"></a>

##### message?

> `readonly` `optional` **message?**: `string`

<a id="toolcallid"></a>

##### toolCallId

> `readonly` **toolCallId**: `string`

***

<a id="service"></a>

### Service

Ambient context available to a tool handler for the current call.

#### Properties

<a id="admittedat"></a>

##### admittedAt?

> `readonly` `optional` **admittedAt?**: `string`

<a id="agent"></a>

##### agent?

> `readonly` `optional` **agent?**: [`Any`](./Agent#any)

**`Internal`**

Parent definition used to attenuate process-local children.

<a id="agentname"></a>

##### agentName?

> `readonly` `optional` **agentName?**: `string`

<a id="attempt"></a>

##### attempt?

> `readonly` `optional` **attempt?**: `number`

<a id="deadline"></a>

##### deadline?

> `readonly` `optional` **deadline?**: `string`

<a id="emit"></a>

##### emit

> `readonly` **emit**: (`progress`) => `Effect`\<`boolean`\>

###### Parameters

###### progress

[`Progress`](#progress)

###### Returns

`Effect`\<`boolean`\>

<a id="history"></a>

##### history?

> `readonly` `optional` **history?**: `Effect`\<`Prompt`, `never`, `never`\>

**`Internal`**

Exact live transcript available to child inheritance at a tool-spawn boundary.

<a id="idempotencykey"></a>

##### idempotencyKey?

> `readonly` `optional` **idempotencyKey?**: `string`

<a id="inheritedsandboxsnapshot"></a>

##### inheritedSandboxSnapshot?

> `readonly` `optional` **inheritedSandboxSnapshot?**: `Ref`\<`string` \| `undefined`\>

**`Internal`**

One pending durable Sandbox image, cleared after the first successful restoration.

<a id="operationkey"></a>

##### operationKey?

> `readonly` `optional` **operationKey?**: `string`

<a id="rootrunid"></a>

##### rootRunId?

> `readonly` `optional` **rootRunId?**: `string`

<a id="runid"></a>

##### runId?

> `readonly` `optional` **runId?**: `string`

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

<a id="signal"></a>

##### signal

> `readonly` **signal**: `AbortSignal`

<a id="toolcallid-1"></a>

##### toolCallId?

> `readonly` `optional` **toolCallId?**: `string`

<a id="turn"></a>

##### turn?

> `readonly` `optional` **turn?**: `number`

## Variables

<a id="layerdefault"></a>

### layerDefault

> `const` **layerDefault**: `Layer.Layer`\<[`ToolContext`](#toolcontext)\>

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`ToolContext`](#toolcontext)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`ToolContext`](#toolcontext)\>
