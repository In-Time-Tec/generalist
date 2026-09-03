[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ProgramHandlers

# ProgramHandlers

## Interfaces

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

##### agent

> `readonly` **agent**: `string` & `Brand`\<`"generalist/agent-pin"`\>

##### authorize

> `readonly` **authorize**: [`Authorize`](#authorize-5)\<`I`\>

##### execute

> `readonly` **execute**: (`input`) => `Effect`\<[`AgentRunResult`](./ProgramCapabilities#agentrunresult), [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| `E`\>

###### Parameters

###### input

`I`

###### Returns

`Effect`\<[`AgentRunResult`](./ProgramCapabilities#agentrunresult), [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| `E`\>

##### input

> `readonly` **input**: `Codec`\<`I`, `IE`\>

##### inputPin

> `readonly` **inputPin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

##### replay

> `readonly` **replay**: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`

##### selection

> `readonly` **selection**: `string`

***

### AgentInvocation

One decoded Agent invocation, exposing only the prompt every Agent input must produce.

#### Properties

##### authorize

> `readonly` **authorize**: (`operation`) => `Effect`\<`boolean`, [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended)\>

###### Parameters

###### operation

`string`

###### Returns

`Effect`\<`boolean`, [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended)\>

##### execute

> `readonly` **execute**: `Effect`\<[`AgentRunResult`](./ProgramCapabilities#agentrunresult), [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled) \| [`ProgramInvocationFailure`](./ProgramCapabilities#programinvocationfailure)\>

##### prompt

> `readonly` **prompt**: `RawInput`

***

### AnyAgent

Host-facing view of one Agent handler, with its decoded input hidden behind [AgentInvocation](#agentinvocation).

#### Properties

##### agent

> `readonly` **agent**: `string` & `Brand`\<`"generalist/agent-pin"`\>

##### decode

> `readonly` **decode**: (`encoded`) => `Effect`\<[`AgentInvocation`](#agentinvocation), `SchemaError`\>

###### Parameters

###### encoded

`unknown`

###### Returns

`Effect`\<[`AgentInvocation`](#agentinvocation), `SchemaError`\>

##### input

> `readonly` **input**: `Codec`\<`unknown`, `unknown`\>

##### inputPin

> `readonly` **inputPin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

##### replay

> `readonly` **replay**: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`

##### selection

> `readonly` **selection**: `string`

***

### AnyTool

Host-facing view of one tool in a heterogeneous handler set. Its identity, replay policy, and
boundary codecs stay observable; its decoded input type is reachable only through [Invocation](#invocation).

#### Properties

##### decode

> `readonly` **decode**: (`encoded`) => `Effect`\<[`Invocation`](#invocation)\<`unknown`, [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled) \| [`ProgramInvocationFailure`](./ProgramCapabilities#programinvocationfailure)\>, `SchemaError`\>

###### Parameters

###### encoded

`unknown`

###### Returns

`Effect`\<[`Invocation`](#invocation)\<`unknown`, [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled) \| [`ProgramInvocationFailure`](./ProgramCapabilities#programinvocationfailure)\>, `SchemaError`\>

##### input

> `readonly` **input**: `Codec`\<`unknown`, `unknown`\>

##### name

> `readonly` **name**: `string`

##### output

> `readonly` **output**: `Codec`\<`unknown`, `unknown`\>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

##### replay

> `readonly` **replay**: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`

***

### Handlers

Complete live authority available to a ProgramRunner.

#### Properties

##### agents

> `readonly` **agents**: readonly [`AnyAgent`](#anyagent)[]

##### steps

> `readonly` **steps**: readonly [`TypedTool`](#typedtool)[]

##### tools

> `readonly` **tools**: readonly [`TypedTool`](#typedtool)[]

***

### Invocation

One decoded invocation of a tool or step. The decoded input stays inside the handler, so
authorization and execution keep the exact type the handler declared.

#### Type Parameters

##### O

`O` = `unknown`

##### E

`E` = [`ProgramInvocationFailure`](./ProgramCapabilities#programinvocationfailure) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled)

#### Properties

##### authorize

> `readonly` **authorize**: (`operation`) => `Effect`\<`boolean`, [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended)\>

###### Parameters

###### operation

`string`

###### Returns

`Effect`\<`boolean`, [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended)\>

##### execute

> `readonly` **execute**: `Effect`\<`O`, `E`\>

***

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

##### authorize

> `readonly` **authorize**: [`Authorize`](#authorize-5)\<`I`\>

###### Inherited from

`Omit.authorize`

##### execute

> `readonly` **execute**: (`input`) => `Effect`\<`O`, `E`\>

###### Parameters

###### input

`I`

###### Returns

`Effect`\<`O`, `E`\>

###### Inherited from

`Omit.execute`

##### input

> `readonly` **input**: `Codec`\<`I`, `IE`\>

###### Inherited from

`Omit.input`

##### name

> `readonly` **name**: `string`

##### output

> `readonly` **output**: `Codec`\<`O`, `OE`\>

###### Inherited from

`Omit.output`

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### Inherited from

`Omit.pin`

##### replay

> `readonly` **replay**: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`

###### Inherited from

`Omit.replay`

***

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

##### authorize

> `readonly` **authorize**: [`Authorize`](#authorize-5)\<`I`\>

##### execute

> `readonly` **execute**: (`input`) => `Effect`\<`O`, `E`\>

###### Parameters

###### input

`I`

###### Returns

`Effect`\<`O`, `E`\>

##### input

> `readonly` **input**: `Codec`\<`I`, `IE`\>

##### name

> `readonly` **name**: `string`

##### output

> `readonly` **output**: `Codec`\<`O`, `OE`\>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

##### replay

> `readonly` **replay**: `"recorded"` \| `"idempotent"` \| `"non-idempotent"`

## Type Aliases

### AnyStep

> **AnyStep** = [`AnyTool`](#anytool)

Host-facing view of one named step, with the same hidden input as [AnyTool](#anytool).

***

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

### ProgramReplayPolicy

> **ProgramReplayPolicy** = *typeof* `ProgramReplayPolicy.Type`

Replay behavior selected by the host, never by program source.

***

### TypedStep

> **TypedStep** = [`TypedTool`](#typedtool)

A step handler retaining its exact decoded invocation types.

***

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

### make

> `const` **make**: (`handlers`) => [`Handlers`](#handlers)

Construct the runner's complete live Program handler set.

#### Parameters

##### handlers

[`Handlers`](#handlers)

#### Returns

[`Handlers`](#handlers)

***

### ProgramReplayPolicy

> `const` **ProgramReplayPolicy**: `Schema.Literals`\<readonly \[`"recorded"`, `"idempotent"`, `"non-idempotent"`\]\>

Replay behavior selected by the host, never by program source.

***

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
