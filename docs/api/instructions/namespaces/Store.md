[**generalist**](../../index)

***

[generalist](../../index) / [instructions](../index) / Store

# Store

## Classes

<a id="store"></a>

### Store

#### Extends

- `Store_base`

#### Constructors

<a id="constructor"></a>

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

<a id="storeerror"></a>

### StoreError

A guidance store operation failed.

#### Extends

- `StoreError_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="cause"></a>

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`StoreError_base.cause`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`StoreError_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`StoreError_base.message`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `"corrupt"` \| `"encode"` \| `"unreadable"` \| `"unwritable"`

###### Inherited from

`StoreError_base.reason`

<a id="scope"></a>

##### scope

> `readonly` **scope**: `string`

###### Inherited from

`StoreError_base.scope`

## Interfaces

<a id="service"></a>

### Service

Durable instruction state seam, keyed by scope.

#### Properties

<a id="load"></a>

##### load

> `readonly` **load**: (`scope`) => `Effect`\<\{ `entries`: \{ `memory`: readonly `object`[]; `prompt`: readonly `object`[]; `skill`: readonly `object`[]; `subagent`: readonly `object`[]; \}; `refinements`: readonly `object`[]; `schemaVersion`: `"1"`; `scope`: `string`; \}, [`StoreError`](#storeerror)\>

###### Parameters

###### scope

`string`

###### Returns

`Effect`\<\{ `entries`: \{ `memory`: readonly `object`[]; `prompt`: readonly `object`[]; `skill`: readonly `object`[]; `subagent`: readonly `object`[]; \}; `refinements`: readonly `object`[]; `schemaVersion`: `"1"`; `scope`: `string`; \}, [`StoreError`](#storeerror)\>

<a id="save"></a>

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

<a id="storerejection"></a>

### StoreRejection

> **StoreRejection** = *typeof* `StoreRejection.Type`

Why one guidance store operation failed.

## Variables

<a id="layermemory"></a>

### layerMemory

> `const` **layerMemory**: `Layer.Layer`\<[`Store`](#store)\>

An in-process store that starts empty and never persists beyond its own scope.

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Store`](#store)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`Store`](#store)\>

***

<a id="storerejection-1"></a>

### StoreRejection

> `const` **StoreRejection**: `Schema.Literals`\<readonly \[`"corrupt"`, `"encode"`, `"unreadable"`, `"unwritable"`\]\>

Why one guidance store operation failed.
