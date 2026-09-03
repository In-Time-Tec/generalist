[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ModelMiddleware

# ModelMiddleware

## Classes

### ModelMiddleware

Service holding the middleware chain, applied in array order.

#### Extends

- `ModelMiddleware_base`

#### Constructors

##### Constructor

> **new ModelMiddleware**(`_`): [`ModelMiddleware`](#modelmiddleware)

###### Parameters

###### \_

`never`

###### Returns

[`ModelMiddleware`](#modelmiddleware)

###### Inherited from

`ModelMiddleware_base.constructor`

## Interfaces

### Middleware

A single middleware. Both hooks are optional; omitted hooks are identity.

#### Properties

##### transformPart?

> `readonly` `optional` **transformPart?**: (`part`, `context`) => `Effect`\<`Option`\<`StreamPart`\<`Record`\<`string`, `Any`\>, `false`\>\>, [`HookFailed`](../../hooks#hookfailed) \| [`AgentError`](./AgentEvent#agenterror)\>

Transform or drop a model stream part before the loop processes it.
Return `Option.none()` to drop the part (it is not folded, not emitted, not persisted).
Tool-call parts may be transformed but MUST NOT be dropped — dropping a tool-call
is a middleware bug; the loop fails the run with MiddlewareViolation if it happens.

###### Parameters

###### part

`StreamPart`\<`Record`\<`string`, `Any`\>\>

###### context

[`TurnContext`](#turncontext)

###### Returns

`Effect`\<`Option`\<`StreamPart`\<`Record`\<`string`, `Any`\>, `false`\>\>, [`HookFailed`](../../hooks#hookfailed) \| [`AgentError`](./AgentEvent#agenterror)\>

##### transformPrompt?

> `readonly` `optional` **transformPrompt?**: (`prompt`, `context`) => `Effect`\<`Prompt`, [`HookFailed`](../../hooks#hookfailed) \| [`AgentError`](./AgentEvent#agenterror)\>

Transform the prompt for a turn before it is sent to the model. Recalled-memory messages must preserve lineage.

###### Parameters

###### prompt

`Prompt`

###### context

[`TurnContext`](#turncontext)

###### Returns

`Effect`\<`Prompt`, [`HookFailed`](../../hooks#hookfailed) \| [`AgentError`](./AgentEvent#agenterror)\>

***

### TurnContext

Turn-scoped info handed to middleware.

#### Properties

##### agentName

> `readonly` **agentName**: `string`

##### turn

> `readonly` **turn**: `number`

## Variables

### adapt

> `const` **adapt**: \{\<`GenerateError`, `GenerateObjectError`, `StreamError`\>(`middleware`): (`model`) => `Service`; \<`GenerateError`, `GenerateObjectError`, `StreamError`\>(`model`, `middleware`): `Service`; \}

Typed operation-level adapter for LanguageModel.Service wrappers.

#### Call Signature

> \<`GenerateError`, `GenerateObjectError`, `StreamError`\>(`middleware`): (`model`) => `Service`

##### Type Parameters

###### GenerateError

`GenerateError` = `never`

###### GenerateObjectError

`GenerateObjectError` = `never`

###### StreamError

`StreamError` = `never`

##### Parameters

###### middleware

`Middleware`\<`GenerateError`, `GenerateObjectError`, `StreamError`\>

##### Returns

(`model`) => `Service`

#### Call Signature

> \<`GenerateError`, `GenerateObjectError`, `StreamError`\>(`model`, `middleware`): `Service`

##### Type Parameters

###### GenerateError

`GenerateError` = `never`

###### GenerateObjectError

`GenerateObjectError` = `never`

###### StreamError

`StreamError` = `never`

##### Parameters

###### model

`Service`

###### middleware

`Middleware`\<`GenerateError`, `GenerateObjectError`, `StreamError`\>

##### Returns

`Service`

***

### layer

> `const` **layer**: (`middleware`) => `Layer.Layer`\<[`ModelMiddleware`](#modelmiddleware)\>

Provide an explicit chain.

#### Parameters

##### middleware

`ReadonlyArray`\<[`Middleware`](#middleware)\>

#### Returns

`Layer.Layer`\<[`ModelMiddleware`](#modelmiddleware)\>

***

### layerIdentity

> `const` **layerIdentity**: `Layer.Layer`\<[`ModelMiddleware`](#modelmiddleware)\>

Identity chain — the default.
