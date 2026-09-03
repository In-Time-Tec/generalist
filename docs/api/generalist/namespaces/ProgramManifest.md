[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ProgramManifest

# ProgramManifest

## Interfaces

### PinnedProgram

An Agent Program manifest paired with its constructor-owned digest.

#### Properties

##### manifest

> `readonly` **manifest**: `object`

###### budget

> `readonly` **budget**: `object`

###### budget.agentRuns

> `readonly` **agentRuns**: `number`

###### budget.concurrency

> `readonly` **concurrency**: `number`

###### budget.logBytes

> `readonly` **logBytes**: `number`

###### budget.outputBytes

> `readonly` **outputBytes**: `number`

###### budget.tokens

> `readonly` **tokens**: `number`

###### budget.toolCalls

> `readonly` **toolCalls**: `number`

###### budget.wallClockMillis

> `readonly` **wallClockMillis**: `number`

###### capabilities

> `readonly` **capabilities**: `object`

###### capabilities.agents

> `readonly` **agents**: readonly `object`[]

###### capabilities.steps

> `readonly` **steps**: readonly [`NamedCapability`](./AgentManifest#namedcapability)[]

###### capabilities.tools

> `readonly` **tools**: readonly [`NamedCapability`](./AgentManifest#namedcapability)[]

###### input

> `readonly` **input**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### name

> `readonly` **name**: `string`

###### output

> `readonly` **output**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### sandbox

> `readonly` **sandbox**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### source

> `readonly` **source**: `object`

###### source.language

> `readonly` **language**: `"javascript"`

###### source.text

> `readonly` **text**: `string`

###### version

> `readonly` **version**: `"1"`

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/program-pin"`\>

## Type Aliases

### ProgramAgentCapability

> **ProgramAgentCapability** = *typeof* `ProgramAgentCapability.Type`

Exact Agent and input schema callable by one Program selection.

***

### ProgramBudget

> **ProgramBudget** = *typeof* `ProgramBudget.Type`

Bounded resources available to one Agent Program.

***

### ProgramCapabilityManifest

> **ProgramCapabilityManifest** = *typeof* `ProgramCapabilityManifest.Type`

Exact host capabilities visible inside one Agent Program sandbox.

***

### ProgramManifest

> **ProgramManifest** = *typeof* `ProgramManifest.Type`

Closed reconstructable identity contract for one Agent Program.

***

### ProgramSource

> **ProgramSource** = *typeof* `ProgramSource.Type`

Sandboxed source pinned as part of one Agent Program.

## Variables

### make

> `const` **make**: (`input`) => [`PinnedProgram`](#pinnedprogram)

Construct and pin one canonical Agent Program manifest.

#### Parameters

##### input

`Omit`\<[`ProgramManifest`](#programmanifest), `"version"`\> & `object`

#### Returns

[`PinnedProgram`](#pinnedprogram)

***

### ProgramAgentCapability

> `const` **ProgramAgentCapability**: `Schema.Struct`\<\{ `agent`: `Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>; `input`: `Schema.brand`\<`Schema.String`, `"generalist/capability-pin"`\>; `selection`: `Schema.String`; \}\>

Exact Agent and input schema callable by one Program selection.

***

### ProgramBudget

> `const` **ProgramBudget**: `Schema.Struct`\<\{ `agentRuns`: `Schema.Int`; `concurrency`: `Schema.Int`; `logBytes`: `Schema.Int`; `outputBytes`: `Schema.Int`; `tokens`: `Schema.Int`; `toolCalls`: `Schema.Int`; `wallClockMillis`: `Schema.Int`; \}\>

Bounded resources available to one Agent Program.

***

### ProgramCapabilityManifest

> `const` **ProgramCapabilityManifest**: `Schema.Struct`\<\{ `agents`: `Schema.$Array`\<`Schema.Struct`\<\{ `agent`: `Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>; `input`: `Schema.brand`\<`Schema.String`, `"generalist/capability-pin"`\>; `selection`: `Schema.String`; \}\>\>; `steps`: `Schema.$Array`\<`Schema.Codec`\<[`NamedCapability`](./AgentManifest#namedcapability), `NamedCapabilityEncoded`, `never`, `never`\>\>; `tools`: `Schema.$Array`\<`Schema.Codec`\<[`NamedCapability`](./AgentManifest#namedcapability), `NamedCapabilityEncoded`, `never`, `never`\>\>; \}\>

Exact host capabilities visible inside one Agent Program sandbox.

***

### ProgramManifest

> `const` **ProgramManifest**: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `agentRuns`: `Schema.Int`; `concurrency`: `Schema.Int`; `logBytes`: `Schema.Int`; `outputBytes`: `Schema.Int`; `tokens`: `Schema.Int`; `toolCalls`: `Schema.Int`; `wallClockMillis`: `Schema.Int`; \}\>; `capabilities`: `Schema.Struct`\<\{ `agents`: `Schema.$Array`\<`Schema.Struct`\<\{ `agent`: `Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>; `input`: `Schema.brand`\<`Schema.String`, `"generalist/capability-pin"`\>; `selection`: `Schema.String`; \}\>\>; `steps`: `Schema.$Array`\<`Schema.Codec`\<[`NamedCapability`](./AgentManifest#namedcapability), `NamedCapabilityEncoded`, `never`, `never`\>\>; `tools`: `Schema.$Array`\<`Schema.Codec`\<[`NamedCapability`](./AgentManifest#namedcapability), `NamedCapabilityEncoded`, `never`, `never`\>\>; \}\>; `input`: `Schema.brand`\<`Schema.String`, `"generalist/capability-pin"`\>; `name`: `Schema.String`; `output`: `Schema.brand`\<`Schema.String`, `"generalist/capability-pin"`\>; `sandbox`: `Schema.brand`\<`Schema.String`, `"generalist/capability-pin"`\>; `source`: `Schema.Struct`\<\{ `language`: `Schema.Literal`\<`"javascript"`\>; `text`: `Schema.String`; \}\>; `version`: `Schema.Literal`\<`"1"`\>; \}\>

Closed reconstructable identity contract for one Agent Program.

***

### ProgramSource

> `const` **ProgramSource**: `Schema.Struct`\<\{ `language`: `Schema.Literal`\<`"javascript"`\>; `text`: `Schema.String`; \}\>

Sandboxed source pinned as part of one Agent Program.
