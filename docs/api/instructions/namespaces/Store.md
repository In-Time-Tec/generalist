[**generalist**](../../index)

***

[generalist](../../index) / [instructions](../index) / Store

# Store

## Classes

### Store

#### Extends

- `Store_base`

#### Constructors

##### Constructor

> **new Store**(`_`): [`Store`](#store)

###### Parameters

###### \_

`never`

###### Returns

[`Store`](#store)

###### Inherited from

`Store_base.constructor`

***

### StoreError

A guidance store operation failed.

#### Extends

- `StoreError_base`

#### Constructors

##### Constructor

> **new StoreError**(...`args`): [`StoreError`](#storeerror)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`StoreError`](#storeerror)

###### Inherited from

`StoreError_base.constructor`

#### Properties

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`StoreError_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`StoreError_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`StoreError_base.message`

##### reason

> `readonly` **reason**: `"corrupt"` \| `"encode"` \| `"unreadable"` \| `"unwritable"`

###### Inherited from

`StoreError_base.reason`

##### scope

> `readonly` **scope**: `string`

###### Inherited from

`StoreError_base.scope`

## Interfaces

### Service

Durable instruction state seam, keyed by scope.

#### Properties

##### load

> `readonly` **load**: (`scope`) => `Effect`\<\{ `entries`: \{ `memory`: readonly `object`[]; `prompt`: readonly `object`[]; `skill`: readonly `object`[]; `subagent`: readonly `object`[]; \}; `refinements`: readonly `object`[]; `schemaVersion`: `"1"`; `scope`: `string`; \}, [`StoreError`](#storeerror)\>

###### Parameters

###### scope

`string`

###### Returns

`Effect`\<\{ `entries`: \{ `memory`: readonly `object`[]; `prompt`: readonly `object`[]; `skill`: readonly `object`[]; `subagent`: readonly `object`[]; \}; `refinements`: readonly `object`[]; `schemaVersion`: `"1"`; `scope`: `string`; \}, [`StoreError`](#storeerror)\>

##### save

> `readonly` **save**: (`state`) => `Effect`\<`void`, [`StoreError`](#storeerror)\>

###### Parameters

###### state

###### entries

\{ `memory`: readonly `object`[]; `prompt`: readonly `object`[]; `skill`: readonly `object`[]; `subagent`: readonly `object`[]; \}

###### entries.memory

readonly `object`[]

###### entries.prompt

readonly `object`[]

###### entries.skill

readonly `object`[]

###### entries.subagent

readonly `object`[]

###### refinements

readonly `object`[]

###### schemaVersion

`"1"`

###### scope

`string`

###### Returns

`Effect`\<`void`, [`StoreError`](#storeerror)\>

## Type Aliases

### StoreRejection

> **StoreRejection** = *typeof* `StoreRejection.Type`

Why one guidance store operation failed.

## Variables

### layerMemory

> `const` **layerMemory**: `Layer.Layer`\<[`Store`](#store)\>

An in-process store that starts empty and never persists beyond its own scope.

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Store`](#store)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`Store`](#store)\>

***

### StoreRejection

> `const` **StoreRejection**: `Schema.Literals`\<readonly \[`"corrupt"`, `"encode"`, `"unreadable"`, `"unwritable"`\]\>

Why one guidance store operation failed.
