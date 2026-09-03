[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ExecutableManifest

# ExecutableManifest

## Interfaces

<a id="agententry"></a>

### AgentEntry

One complete pinned Agent entry in an executable closure.

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"Agent"`

<a id="manifest"></a>

##### manifest

> `readonly` **manifest**: [`AgentManifest`](./AgentManifest#agentmanifest)

<a id="pin"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/agent-pin"`\>

***

<a id="executablemanifest"></a>

### ExecutableManifest

Complete closed executable profile registry and entry closure.

#### Properties

<a id="entries"></a>

##### entries

> `readonly` **entries**: readonly [`ExecutableEntry`](#executableentry)[]

<a id="profiles"></a>

##### profiles

> `readonly` **profiles**: readonly [`ProfileBinding`](#profilebinding)[]

<a id="root"></a>

##### root

> `readonly` **root**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

<a id="version"></a>

##### version

> `readonly` **version**: `"2"`

***

<a id="executablemanifestencoded"></a>

### ExecutableManifestEncoded

Encoded executable manifest.

#### Extends

- `Omit`\<[`ExecutableManifest`](#executablemanifest), `"root"` \| `"profiles"` \| `"entries"`\>

#### Properties

<a id="entries-1"></a>

##### entries

> `readonly` **entries**: readonly `ExecutableEntryEncoded`[]

<a id="profiles-1"></a>

##### profiles

> `readonly` **profiles**: readonly `ProfileBindingEncoded`[]

<a id="root-1"></a>

##### root

> `readonly` **root**: `string`

<a id="version-1"></a>

##### version

> `readonly` **version**: `"2"`

###### Inherited from

[`ExecutableManifest`](#executablemanifest).[`version`](#version)

***

<a id="pinnedexecutable"></a>

### PinnedExecutable

Executable closure paired with its constructor-owned reference.

#### Properties

<a id="manifest-1"></a>

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](#executablemanifest)

<a id="ref"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

***

<a id="profilebinding"></a>

### ProfileBinding

One globally pinned child profile available by selection name.

#### Properties

<a id="agent"></a>

##### agent

> `readonly` **agent**: `string` & `Brand`\<`"generalist/agent-pin"`\>

<a id="selection"></a>

##### selection

> `readonly` **selection**: `string`

***

<a id="programentry"></a>

### ProgramEntry

One complete pinned Agent Program entry in an executable closure.

#### Properties

<a id="_tag-1"></a>

##### \_tag

> `readonly` **\_tag**: `"Program"`

<a id="manifest-2"></a>

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

<a id="pin-1"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/program-pin"`\>

## Type Aliases

<a id="executableentry"></a>

### ExecutableEntry

> **ExecutableEntry** = [`AgentEntry`](#agententry) \| [`ProgramEntry`](#programentry)

One exact executable definition in a closed closure.

***

<a id="executableref"></a>

### ExecutableRef

> **ExecutableRef** = *typeof* `ExecutableRef.Type`

Durable reference to one exact executable closure and active Agent.

***

<a id="executabletarget"></a>

### ExecutableTarget

> **ExecutableTarget** = *typeof* `ExecutableTarget.Type`

Exact active executable within one closed closure.

## Variables

<a id="agententry-1"></a>

### AgentEntry

> **AgentEntry**: `Codec`\<[`AgentEntry`](#agententry), `AgentEntryEncoded`, `never`, `never`\>

One complete pinned Agent entry in an executable closure.

***

<a id="decode"></a>

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

<a id="encode"></a>

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

<a id="executableentry-1"></a>

### ExecutableEntry

> **ExecutableEntry**: `Codec`\<[`ExecutableEntry`](#executableentry), `ExecutableEntryEncoded`, `never`, `never`\>

One exact executable definition in a closed closure.

***

<a id="executablemanifest-1"></a>

### ExecutableManifest

> **ExecutableManifest**: `Codec`\<[`ExecutableManifest`](#executablemanifest), [`ExecutableManifestEncoded`](#executablemanifestencoded), `never`, `never`\>

Complete closed executable profile registry and entry closure.

***

<a id="executableref-1"></a>

### ExecutableRef

> `const` **ExecutableRef**: `Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>

Durable reference to one exact executable closure and active Agent.

***

<a id="executabletarget-1"></a>

### ExecutableTarget

> `const` **ExecutableTarget**: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>

Exact active executable within one closed closure.

***

<a id="make"></a>

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

<a id="maketest"></a>

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

<a id="profilebinding-1"></a>

### ProfileBinding

> **ProfileBinding**: `Codec`\<[`ProfileBinding`](#profilebinding), `ProfileBindingEncoded`, `never`, `never`\>

One globally pinned child profile available by selection name.

***

<a id="programentry-1"></a>

### ProgramEntry

> **ProgramEntry**: `Codec`\<[`ProgramEntry`](#programentry), `ProgramEntryEncoded`, `never`, `never`\>

One complete pinned Agent Program entry in an executable closure.

***

<a id="validateref"></a>

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
