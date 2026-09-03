[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ExecutableManifest

# ExecutableManifest

## Interfaces

### AgentEntry

One complete pinned Agent entry in an executable closure.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Agent"`

##### manifest

> `readonly` **manifest**: [`AgentManifest`](./AgentManifest#agentmanifest)

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/agent-pin"`\>

***

### ExecutableManifest

Complete closed executable profile registry and entry closure.

#### Properties

##### entries

> `readonly` **entries**: readonly [`ExecutableEntry`](#executableentry)[]

##### profiles

> `readonly` **profiles**: readonly [`ProfileBinding`](#profilebinding)[]

##### root

> `readonly` **root**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

##### version

> `readonly` **version**: `"2"`

***

### ExecutableManifestEncoded

Encoded executable manifest.

#### Extends

- `Omit`\<[`ExecutableManifest`](#executablemanifest), `"root"` \| `"profiles"` \| `"entries"`\>

#### Properties

##### entries

> `readonly` **entries**: readonly `ExecutableEntryEncoded`[]

##### profiles

> `readonly` **profiles**: readonly `ProfileBindingEncoded`[]

##### root

> `readonly` **root**: `string`

##### version

> `readonly` **version**: `"2"`

###### Inherited from

[`ExecutableManifest`](#executablemanifest).[`version`](#version)

***

### PinnedExecutable

Executable closure paired with its constructor-owned reference.

#### Properties

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](#executablemanifest)

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

***

### ProfileBinding

One globally pinned child profile available by selection name.

#### Properties

##### agent

> `readonly` **agent**: `string` & `Brand`\<`"generalist/agent-pin"`\>

##### selection

> `readonly` **selection**: `string`

***

### ProgramEntry

One complete pinned Agent Program entry in an executable closure.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Program"`

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

### ExecutableEntry

> **ExecutableEntry** = [`AgentEntry`](#agententry) \| [`ProgramEntry`](#programentry)

One exact executable definition in a closed closure.

***

### ExecutableRef

> **ExecutableRef** = *typeof* `ExecutableRef.Type`

Durable reference to one exact executable closure and active Agent.

***

### ExecutableTarget

> **ExecutableTarget** = *typeof* `ExecutableTarget.Type`

Exact active executable within one closed closure.

## Variables

### AgentEntry

> **AgentEntry**: `Codec`\<[`AgentEntry`](#agententry), `AgentEntryEncoded`, `never`, `never`\>

One complete pinned Agent entry in an executable closure.

***

### decode

> `const` **decode**: (`input`, `options?`) => `Effect.Effect`\<[`PinnedExecutable`](#pinnedexecutable), `Schema.SchemaError` \| `UnknownError`, `never`\>

#### Parameters

##### input

`unknown`

##### options?

`ParseOptions`

#### Returns

`Effect.Effect`\<[`PinnedExecutable`](#pinnedexecutable), `Schema.SchemaError` \| `UnknownError`, `never`\>

***

### encode

> `const` **encode**: \{(`input`, `options?`): `Effect`\<`PinnedExecutableEncoded`, `SchemaError`, `never`\>; (`options?`): (`input`) => `Effect`\<`PinnedExecutableEncoded`, `SchemaError`, `never`\>; \}

Encode one constructor-validated executable authority.

#### Call Signature

> (`input`, `options?`): `Effect`\<`PinnedExecutableEncoded`, `SchemaError`, `never`\>

##### Parameters

###### input

[`PinnedExecutable`](#pinnedexecutable)

###### options?

`ParseOptions`

##### Returns

`Effect`\<`PinnedExecutableEncoded`, `SchemaError`, `never`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<`PinnedExecutableEncoded`, `SchemaError`, `never`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<`PinnedExecutableEncoded`, `SchemaError`, `never`\>

***

### ExecutableEntry

> **ExecutableEntry**: `Codec`\<[`ExecutableEntry`](#executableentry), `ExecutableEntryEncoded`, `never`, `never`\>

One exact executable definition in a closed closure.

***

### ExecutableManifest

> **ExecutableManifest**: `Codec`\<[`ExecutableManifest`](#executablemanifest), [`ExecutableManifestEncoded`](#executablemanifestencoded), `never`, `never`\>

Complete closed executable profile registry and entry closure.

***

### ExecutableRef

> `const` **ExecutableRef**: `Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>

Durable reference to one exact executable closure and active Agent.

***

### ExecutableTarget

> `const` **ExecutableTarget**: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>

Exact active executable within one closed closure.

***

### make

> `const` **make**: (`input`) => [`PinnedExecutable`](#pinnedexecutable)

Construct, validate, canonicalize, and pin a complete executable closure.

#### Parameters

##### input

###### active?

[`ExecutableTarget`](#executabletarget)

###### entries

`ReadonlyArray`\<`object` & [`PinnedAgent`](./AgentManifest#pinnedagent) \| `object` & [`PinnedProgram`](./ProgramManifest#pinnedprogram)\>

###### profiles?

`ReadonlyArray`\<[`ProfileBinding`](#profilebinding)\>

###### root

[`ExecutableTarget`](#executabletarget)

#### Returns

[`PinnedExecutable`](#pinnedexecutable)

***

### makeTest

> `const` **makeTest**: \{(`revision?`): (`name`) => [`PinnedExecutable`](#pinnedexecutable); (`name`, `revision?`): [`PinnedExecutable`](#pinnedexecutable); \}

Canonical executable fixture for tests and non-running documentation examples.

#### Call Signature

> (`revision?`): (`name`) => [`PinnedExecutable`](#pinnedexecutable)

##### Parameters

###### revision?

`string`

##### Returns

(`name`) => [`PinnedExecutable`](#pinnedexecutable)

#### Call Signature

> (`name`, `revision?`): [`PinnedExecutable`](#pinnedexecutable)

##### Parameters

###### name

`string`

###### revision?

`string`

##### Returns

[`PinnedExecutable`](#pinnedexecutable)

***

### ProfileBinding

> **ProfileBinding**: `Codec`\<[`ProfileBinding`](#profilebinding), `ProfileBindingEncoded`, `never`, `never`\>

One globally pinned child profile available by selection name.

***

### ProgramEntry

> **ProgramEntry**: `Codec`\<[`ProgramEntry`](#programentry), `ProgramEntryEncoded`, `never`, `never`\>

One complete pinned Agent Program entry in an executable closure.

***

### validateRef

> `const` **validateRef**: \{(`manifest`): (`ref`) => `void`; (`ref`, `manifest`): `void`; \}

Verify that a durable reference is exactly owned by a closure.

#### Call Signature

> (`manifest`): (`ref`) => `void`

##### Parameters

###### manifest

[`ExecutableManifest`](#executablemanifest)

##### Returns

(`ref`) => `void`

#### Call Signature

> (`ref`, `manifest`): `void`

##### Parameters

###### ref

###### active

`Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>

###### executable

`Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>

###### manifest

[`ExecutableManifest`](#executablemanifest)

##### Returns

`void`
