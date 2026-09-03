[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ProgramHandlers

# ProgramHandlers

## Interfaces

<a id="agenthandler"></a>

### AgentHandler

One exact Agent implementation callable by a program host.

#### Type Parameters

##### I

`I` *extends* `Prompt.RawInput`

##### IE

`IE`

##### E

`E` = `never`

#### Properties

<a id="agent"></a>

##### agent

> `readonly` **agent**: `string` & `Brand`\<`"generalist/agent-pin"`\>

<a id="authorize"></a>

##### authorize

> `readonly` **authorize**: [`Authorize`](#authorize-5)\<`I`\>

<a id="execute"></a>

##### execute

> `readonly` **execute**: (`input`) => `Effect`\<[`AgentRunResult`](./ProgramCapabilities#agentrunresult), [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| `E`\>

###### Parameters

###### input

`I`

###### Returns

`Effect`\<[`AgentRunResult`](./ProgramCapabilities#agentrunresult), [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| `E`\>

<a id="input"></a>

##### input

> `readonly` **input**: `Codec`\<`I`, `IE`\>

<a id="inputpin"></a>

##### inputPin

> `readonly` **inputPin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

<a id="replay"></a>

##### replay

> `readonly` **replay**: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`

<a id="selection"></a>

##### selection

> `readonly` **selection**: `string`

***

<a id="agentinvocation"></a>

### AgentInvocation

One decoded Agent invocation, exposing only the prompt every Agent input must produce.

#### Properties

<a id="authorize-1"></a>

##### authorize

> `readonly` **authorize**: (`operation`) => `Effect`\<`boolean`, [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended)\>

###### Parameters

###### operation

`string`

###### Returns

`Effect`\<`boolean`, [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended)\>

<a id="execute-1"></a>

##### execute

> `readonly` **execute**: `Effect`\<[`AgentRunResult`](./ProgramCapabilities#agentrunresult), [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled) \| [`ProgramInvocationFailure`](./ProgramCapabilities#programinvocationfailure)\>

<a id="prompt"></a>

##### prompt

> `readonly` **prompt**: `RawInput`

***

<a id="anyagent"></a>

### AnyAgent

Host-facing view of one Agent handler, with its decoded input hidden behind [AgentInvocation](#agentinvocation).

#### Properties

<a id="agent-1"></a>

##### agent

> `readonly` **agent**: `string` & `Brand`\<`"generalist/agent-pin"`\>

<a id="decode"></a>

##### decode

> `readonly` **decode**: (`encoded`) => `Effect`\<[`AgentInvocation`](#agentinvocation), `SchemaError`\>

###### Parameters

###### encoded

`unknown`

###### Returns

`Effect`\<[`AgentInvocation`](#agentinvocation), `SchemaError`\>

<a id="input-1"></a>

##### input

> `readonly` **input**: `Codec`\<`unknown`, `unknown`\>

<a id="inputpin-1"></a>

##### inputPin

> `readonly` **inputPin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

<a id="replay-1"></a>

##### replay

> `readonly` **replay**: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`

<a id="selection-1"></a>

##### selection

> `readonly` **selection**: `string`

***

<a id="anytool"></a>

### AnyTool

Host-facing view of one tool in a heterogeneous handler set. Its identity, replay policy, and
boundary codecs stay observable; its decoded input type is reachable only through [Invocation](#invocation).

#### Properties

<a id="decode-1"></a>

##### decode

> `readonly` **decode**: (`encoded`) => `Effect`\<[`Invocation`](#invocation)\<`unknown`, [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled) \| [`ProgramInvocationFailure`](./ProgramCapabilities#programinvocationfailure)\>, `SchemaError`\>

###### Parameters

###### encoded

`unknown`

###### Returns

`Effect`\<[`Invocation`](#invocation)\<`unknown`, [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled) \| [`ProgramInvocationFailure`](./ProgramCapabilities#programinvocationfailure)\>, `SchemaError`\>

<a id="input-2"></a>

##### input

> `readonly` **input**: `Codec`\<`unknown`, `unknown`\>

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="output"></a>

##### output

> `readonly` **output**: `Codec`\<`unknown`, `unknown`\>

<a id="pin"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

<a id="replay-2"></a>

##### replay

> `readonly` **replay**: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`

***

<a id="handlers"></a>

### Handlers

Complete live authority available to a ProgramRunner.

#### Properties

<a id="agents"></a>

##### agents

> `readonly` **agents**: readonly [`AnyAgent`](#anyagent)[]

<a id="steps"></a>

##### steps

> `readonly` **steps**: readonly [`TypedTool`](#typedtool)[]

<a id="tools"></a>

##### tools

> `readonly` **tools**: readonly [`TypedTool`](#typedtool)[]

***

<a id="invocation"></a>

### Invocation

One decoded invocation of a tool or step. The decoded input stays inside the handler, so
authorization and execution keep the exact type the handler declared.

#### Type Parameters

##### O

`O` = `unknown`

##### E

`E` = [`ProgramInvocationFailure`](./ProgramCapabilities#programinvocationfailure) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled)

#### Properties

<a id="authorize-2"></a>

##### authorize

> `readonly` **authorize**: (`operation`) => `Effect`\<`boolean`, [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended)\>

###### Parameters

###### operation

`string`

###### Returns

`Effect`\<`boolean`, [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended)\>

<a id="execute-2"></a>

##### execute

> `readonly` **execute**: `Effect`\<`O`, `E`\>

***

<a id="stephandler"></a>

### StepHandler

One live typed named step implementation and its exact identity.

#### Extends

- `Omit`\<[`ToolHandler`](#toolhandler)\<`I`, `IE`, `O`, `OE`, `E`\>, `"name"`\>

#### Type Parameters

##### I

`I`

##### IE

`IE`

##### O

`O`

##### OE

`OE`

##### E

`E` = `never`

#### Properties

<a id="authorize-3"></a>

##### authorize

> `readonly` **authorize**: [`Authorize`](#authorize-5)\<`I`\>

###### Inherited from

`Omit.authorize`

<a id="execute-3"></a>

##### execute

> `readonly` **execute**: (`input`) => `Effect`\<`O`, `E`\>

###### Parameters

###### input

`I`

###### Returns

`Effect`\<`O`, `E`\>

###### Inherited from

`Omit.execute`

<a id="input-3"></a>

##### input

> `readonly` **input**: `Codec`\<`I`, `IE`\>

###### Inherited from

`Omit.input`

<a id="name-1"></a>

##### name

> `readonly` **name**: `string`

<a id="output-1"></a>

##### output

> `readonly` **output**: `Codec`\<`O`, `OE`\>

###### Inherited from

`Omit.output`

<a id="pin-1"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### Inherited from

`Omit.pin`

<a id="replay-3"></a>

##### replay

> `readonly` **replay**: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`

###### Inherited from

`Omit.replay`

***

<a id="toolhandler"></a>

### ToolHandler

One live typed tool implementation and its exact identity.

#### Type Parameters

##### I

`I`

##### IE

`IE`

##### O

`O`

##### OE

`OE`

##### E

`E` = `never`

#### Properties

<a id="authorize-4"></a>

##### authorize

> `readonly` **authorize**: [`Authorize`](#authorize-5)\<`I`\>

<a id="execute-4"></a>

##### execute

> `readonly` **execute**: (`input`) => `Effect`\<`O`, `E`\>

###### Parameters

###### input

`I`

###### Returns

`Effect`\<`O`, `E`\>

<a id="input-4"></a>

##### input

> `readonly` **input**: `Codec`\<`I`, `IE`\>

<a id="name-2"></a>

##### name

> `readonly` **name**: `string`

<a id="output-2"></a>

##### output

> `readonly` **output**: `Codec`\<`O`, `OE`\>

<a id="pin-2"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

<a id="replay-4"></a>

##### replay

> `readonly` **replay**: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`

## Type Aliases

<a id="anystep"></a>

### AnyStep

> **AnyStep** = [`AnyTool`](#anytool)

Host-facing view of one named step, with the same hidden input as [AnyTool](#anytool).

***

<a id="authorize-5"></a>

### Authorize

> **Authorize**\<`I`\> = (`request`) => `Effect.Effect`\<`boolean`, [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended)\>

Host-owned authorization callback for one decoded invocation.

#### Type Parameters

##### I

`I`

#### Parameters

##### request

###### input

`I`

###### operation

[`ProgramOperationName`](./ProgramCapabilities#programoperationname)

#### Returns

`Effect.Effect`\<`boolean`, [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended)\>

***

<a id="programreplaypolicy"></a>

### ProgramReplayPolicy

> **ProgramReplayPolicy** = *typeof* `ProgramReplayPolicy.Type`

Replay behavior selected by the host, never by program source.

***

<a id="typedstep"></a>

### TypedStep

> **TypedStep** = [`TypedTool`](#typedtool)

A step handler retaining its exact decoded invocation types.

***

<a id="typedtool"></a>

### TypedTool

> **TypedTool** = [`AnyTool`](#anytool) & `object`

A tool handler retaining its exact decoded invocation types.

#### Type Declaration

##### decode

> `readonly` **decode**: (`encoded`) => `Effect.Effect`\<[`Invocation`](#invocation), `Schema.SchemaError`\>

###### Parameters

###### encoded

*typeof* `Schema.Unknown.Type`

###### Returns

`Effect.Effect`\<[`Invocation`](#invocation), `Schema.SchemaError`\>

## Variables

<a id="agent-2"></a>

### agent

> `const` **agent**: \<`I`, `IE`, `E`\>(`handler`) => [`AnyAgent`](#anyagent)

Construct an exact typed Agent handler.

#### Type Parameters

##### I

`I` *extends* `Prompt.RawInput`

##### IE

`IE`

##### E

`E`

#### Parameters

##### handler

[`AgentHandler`](#agenthandler)\<`I`, `IE`, `E`\>

#### Returns

[`AnyAgent`](#anyagent)

***

<a id="make"></a>

### make

> `const` **make**: (`handlers`) => [`Handlers`](#handlers)

Construct the runner's complete live Program handler set.

#### Parameters

##### handlers

[`Handlers`](#handlers)

#### Returns

[`Handlers`](#handlers)

***

<a id="programreplaypolicy-1"></a>

### ProgramReplayPolicy

> `const` **ProgramReplayPolicy**: `Schema.Literals`\<readonly \[`"recorded"`, `"idempotent"`, `"non-idempotent"`\]\>

Replay behavior selected by the host, never by program source.

***

<a id="step"></a>

### step

> `const` **step**: \<`I`, `IE`, `O`, `OE`, `E`\>(`handler`) => [`TypedStep`](#typedstep) & `object`

Construct a typed named step handler.

#### Type Parameters

##### I

`I`

##### IE

`IE`

##### O

`O`

##### OE

`OE`

##### E

`E`

#### Parameters

##### handler

[`StepHandler`](#stephandler)\<`I`, `IE`, `O`, `OE`, `E`\>

#### Returns

[`TypedStep`](#typedstep) & `object`

***

<a id="tool"></a>

### tool

> `const` **tool**: \<`I`, `IE`, `O`, `OE`, `E`\>(`handler`) => [`TypedTool`](#typedtool) & `object`

Construct a typed tool handler.

#### Type Parameters

##### I

`I`

##### IE

`IE`

##### O

`O`

##### OE

`OE`

##### E

`E`

#### Parameters

##### handler

[`ToolHandler`](#toolhandler)\<`I`, `IE`, `O`, `OE`, `E`\>

#### Returns

[`TypedTool`](#typedtool) & `object`
