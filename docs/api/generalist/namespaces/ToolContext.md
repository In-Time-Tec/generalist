[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ToolContext

# ToolContext

## Classes

### ToolContext

#### Extends

- `ToolContext_base`

#### Constructors

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

### Progress

A progress update emitted by a running tool.

#### Properties

##### data?

> `readonly` `optional` **data?**: `JsonObject`

##### message?

> `readonly` `optional` **message?**: `string`

##### toolCallId

> `readonly` **toolCallId**: `string`

***

### Service

Ambient context available to a tool handler for the current call.

#### Properties

##### admittedAt?

> `readonly` `optional` **admittedAt?**: `string`

##### agent?

> `readonly` `optional` **agent?**: [`Any`](./Agent#any)

**`Internal`**

Parent definition used to attenuate process-local children.

##### agentName?

> `readonly` `optional` **agentName?**: `string`

##### attempt?

> `readonly` `optional` **attempt?**: `number`

##### deadline?

> `readonly` `optional` **deadline?**: `string`

##### emit

> `readonly` **emit**: (`progress`) => `Effect`\<`boolean`\>

###### Parameters

###### progress

[`Progress`](#progress)

###### Returns

`Effect`\<`boolean`\>

##### history?

> `readonly` `optional` **history?**: `Effect`\<`Prompt`, `never`, `never`\>

**`Internal`**

Exact live transcript available to child inheritance at a tool-spawn boundary.

##### idempotencyKey?

> `readonly` `optional` **idempotencyKey?**: `string`

##### inheritedSandboxSnapshot?

> `readonly` `optional` **inheritedSandboxSnapshot?**: `Ref`\<`string` \| `undefined`\>

**`Internal`**

One pending durable Sandbox image, cleared after the first successful restoration.

##### operationKey?

> `readonly` `optional` **operationKey?**: `string`

##### rootRunId?

> `readonly` `optional` **rootRunId?**: `string`

##### runId?

> `readonly` `optional` **runId?**: `string`

##### sessionId

> `readonly` **sessionId**: `string`

##### signal

> `readonly` **signal**: `AbortSignal`

##### toolCallId?

> `readonly` `optional` **toolCallId?**: `string`

##### turn?

> `readonly` `optional` **turn?**: `number`

## Variables

### layerDefault

> `const` **layerDefault**: `Layer.Layer`\<[`ToolContext`](#toolcontext)\>

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`ToolContext`](#toolcontext)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`ToolContext`](#toolcontext)\>
