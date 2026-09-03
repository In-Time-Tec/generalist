[**generalist**](../index)

***

[generalist](../index) / instructions

# instructions

## Namespaces

- [Authorship](./namespaces/Authorship)
- [Entry](./namespaces/Entry)
- [FileSystemStore](./namespaces/FileSystemStore)
- [Overview](./namespaces/Overview)
- [PackageCatalog](./namespaces/PackageCatalog)
- [Refinement](./namespaces/Refinement)
- [Registration](./namespaces/Registration)
- [Snapshot](./namespaces/Snapshot)
- [State](./namespaces/State)
- [Store](./namespaces/Store)

## Classes

### Instructions

#### Extends

- `Instructions_base`

#### Constructors

##### Constructor

> **new Instructions**(`_`): [`Instructions`](#instructions)

###### Parameters

###### \_

`never`

###### Returns

[`Instructions`](#instructions)

###### Inherited from

`Instructions_base.constructor`

## Interfaces

### InstructionFile

Loaded instruction-file content.

#### Properties

##### content

> `readonly` **content**: `string`

##### path

> `readonly` **path**: `string`

***

### Options

Instruction-file discovery options.

#### Properties

##### cwd?

> `readonly` `optional` **cwd?**: `string`

##### filenames?

> `readonly` `optional` **filenames?**: readonly `string`[]

##### globalFiles?

> `readonly` `optional` **globalFiles?**: readonly `string`[]

***

### Provider

Ordered provider of model instructions or contextual updates.

#### Type Parameters

##### R

`R` = `never`

#### Properties

##### id

> `readonly` **id**: `string`

##### render

> `readonly` **render**: (`context`) => `Effect`\<`Option`\<`string`\>, [`AgentError`](../generalist/namespaces/AgentEvent#agenterror), `R`\>

###### Parameters

###### context

[`RenderContext`](#rendercontext)

###### Returns

`Effect`\<`Option`\<`string`\>, [`AgentError`](../generalist/namespaces/AgentEvent#agenterror), `R`\>

***

### RenderContext

Context available while rendering instruction providers.

#### Properties

##### agentName

> `readonly` **agentName**: `string`

##### turn

> `readonly` **turn**: `number`

***

### Service

Instructions registry service boundary.

#### Properties

##### providers

> `readonly` **providers**: readonly [`Provider`](#provider)\<`never`\>[]

## Variables

### fromText

> `const` **fromText**: \{(`text`): (`id`) => [`Provider`](#provider); (`id`, `text`): [`Provider`](#provider); \}

A static baseline provider.

#### Call Signature

> (`text`): (`id`) => [`Provider`](#provider)

##### Parameters

###### text

`string`

##### Returns

(`id`) => [`Provider`](#provider)

#### Call Signature

> (`id`, `text`): [`Provider`](#provider)

##### Parameters

###### id

`string`

###### text

`string`

##### Returns

[`Provider`](#provider)

***

### layer

> `const` **layer**: \<`R`\>(`providers`) => `Layer.Layer`\<[`Instructions`](#instructions), `never`, `R`\>

Provide an explicit ordered instructions registry.

#### Type Parameters

##### R

`R`

#### Parameters

##### providers

`ReadonlyArray`\<[`Provider`](#provider)\<`R`\>\>

#### Returns

`Layer.Layer`\<[`Instructions`](#instructions), `never`, `R`\>

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Instructions`](#instructions)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`Instructions`](#instructions)\>

***

### load

> `const` **load**: (`options?`) => `Effect.Effect`\<`ReadonlyArray`\<[`InstructionFile`](#instructionfile)\>, `PlatformError.PlatformError`, `FileSystem.FileSystem` \| `Path.Path`\>

Load AGENTS.md / CLAUDE.md instruction files from global and ancestor paths.

#### Parameters

##### options?

[`Options`](#options)

#### Returns

`Effect.Effect`\<`ReadonlyArray`\<[`InstructionFile`](#instructionfile)\>, `PlatformError.PlatformError`, `FileSystem.FileSystem` \| `Path.Path`\>

***

### render

> `const` **render**: \{(`context`): (`instructions`) => `Effect`\<`string`, [`AgentError`](../generalist/namespaces/AgentEvent#agenterror)\>; (`instructions`, `context`): `Effect`\<`string`, [`AgentError`](../generalist/namespaces/AgentEvent#agenterror)\>; \}

Render every provider once for a run's instruction baseline.

#### Call Signature

> (`context`): (`instructions`) => `Effect`\<`string`, [`AgentError`](../generalist/namespaces/AgentEvent#agenterror)\>

##### Parameters

###### context

[`RenderContext`](#rendercontext)

##### Returns

(`instructions`) => `Effect`\<`string`, [`AgentError`](../generalist/namespaces/AgentEvent#agenterror)\>

#### Call Signature

> (`instructions`, `context`): `Effect`\<`string`, [`AgentError`](../generalist/namespaces/AgentEvent#agenterror)\>

##### Parameters

###### instructions

[`Service`](#service)

###### context

[`RenderContext`](#rendercontext)

##### Returns

`Effect`\<`string`, [`AgentError`](../generalist/namespaces/AgentEvent#agenterror)\>
