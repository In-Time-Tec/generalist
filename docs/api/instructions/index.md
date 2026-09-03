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

<a id="instructions"></a>

### Instructions

#### Extends

- `Instructions_base`

#### Constructors

<a id="constructor"></a>

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

<a id="instructionfile"></a>

### InstructionFile

Loaded instruction-file content.

#### Properties

<a id="content"></a>

##### content

> `readonly` **content**: `string`

<a id="path"></a>

##### path

> `readonly` **path**: `string`

***

<a id="options"></a>

### Options

Instruction-file discovery options.

#### Properties

<a id="cwd"></a>

##### cwd?

> `readonly` `optional` **cwd?**: `string`

<a id="filenames"></a>

##### filenames?

> `readonly` `optional` **filenames?**: readonly `string`[]

<a id="globalfiles"></a>

##### globalFiles?

> `readonly` `optional` **globalFiles?**: readonly `string`[]

***

<a id="provider"></a>

### Provider

Ordered provider of model instructions or contextual updates.

#### Type Parameters

##### R

`R` = `never`

#### Properties

<a id="id"></a>

##### id

> `readonly` **id**: `string`

<a id="render"></a>

##### render

> `readonly` **render**: (`context`) => `Effect`\<`Option`\<`string`\>, [`AgentError`](../generalist/namespaces/AgentEvent#agenterror), `R`\>

###### Parameters

###### context

[`RenderContext`](#rendercontext)

###### Returns

`Effect`\<`Option`\<`string`\>, [`AgentError`](../generalist/namespaces/AgentEvent#agenterror), `R`\>

***

<a id="rendercontext"></a>

### RenderContext

Context available while rendering instruction providers.

#### Properties

<a id="agentname"></a>

##### agentName

> `readonly` **agentName**: `string`

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="service"></a>

### Service

Instructions registry service boundary.

#### Properties

<a id="providers"></a>

##### providers

> `readonly` **providers**: readonly [`Provider`](#provider)\<`never`\>[]

## Variables

<a id="fromtext"></a>

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

<a id="layer"></a>

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

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Instructions`](#instructions)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`Instructions`](#instructions)\>

***

<a id="load"></a>

### load

> `const` **load**: (`options?`) => `Effect.Effect`\<`ReadonlyArray`\<[`InstructionFile`](#instructionfile)\>, `PlatformError.PlatformError`, `FileSystem.FileSystem` \| `Path.Path`\>

Load AGENTS.md / CLAUDE.md instruction files from global and ancestor paths.

#### Parameters

##### options?

[`Options`](#options)

#### Returns

`Effect.Effect`\<`ReadonlyArray`\<[`InstructionFile`](#instructionfile)\>, `PlatformError.PlatformError`, `FileSystem.FileSystem` \| `Path.Path`\>

***

<a id="render-1"></a>

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
