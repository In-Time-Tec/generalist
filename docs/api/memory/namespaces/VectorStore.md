[**generalist**](../../index)

***

[generalist](../../index) / [memory](../index) / VectorStore

# VectorStore

## Classes

### VectorStore

#### Extends

- `VectorStore_base`

#### Constructors

##### Constructor

> **new VectorStore**(`_`): [`VectorStore`](#vectorstore)

###### Parameters

###### \_

`never`

###### Returns

[`VectorStore`](#vectorstore)

###### Inherited from

`VectorStore_base.constructor`

***

### VectorStoreError

#### Extends

- `VectorStoreError_base`

#### Constructors

##### Constructor

> **new VectorStoreError**(...`args`): [`VectorStoreError`](#vectorstoreerror)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`VectorStoreError`](#vectorstoreerror)

###### Inherited from

`VectorStoreError_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`VectorStoreError_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`VectorStoreError_base.message`

## Interfaces

### DeleteInput

#### Properties

##### id?

> `readonly` `optional` **id?**: `string`

##### key

> `readonly` **key**: [`Key`](../../generalist/namespaces/Memory#key-1)

***

### Document

#### Extended by

- [`Embedded`](#embedded)

#### Properties

##### appliedAt

> `readonly` **appliedAt**: `string`

##### evidence

> `readonly` **evidence**: readonly `object`[]

##### id

> `readonly` **id**: `string`

##### key

> `readonly` **key**: [`Key`](../../generalist/namespaces/Memory#key-1)

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

##### supersedes?

> `readonly` `optional` **supersedes?**: `number`

##### text

> `readonly` **text**: `string`

##### version

> `readonly` **version**: `number`

***

### Embedded

#### Extends

- [`Document`](#document)

#### Properties

##### appliedAt

> `readonly` **appliedAt**: `string`

###### Inherited from

[`Document`](#document).[`appliedAt`](#appliedat)

##### embedding

> `readonly` **embedding**: readonly `number`[]

##### evidence

> `readonly` **evidence**: readonly `object`[]

###### Inherited from

[`Document`](#document).[`evidence`](#evidence)

##### id

> `readonly` **id**: `string`

###### Inherited from

[`Document`](#document).[`id`](#id-1)

##### key

> `readonly` **key**: [`Key`](../../generalist/namespaces/Memory#key-1)

###### Inherited from

[`Document`](#document).[`key`](#key-1)

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

###### Inherited from

[`Document`](#document).[`metadata`](#metadata)

##### supersedes?

> `readonly` `optional` **supersedes?**: `number`

###### Inherited from

[`Document`](#document).[`supersedes`](#supersedes)

##### text

> `readonly` **text**: `string`

###### Inherited from

[`Document`](#document).[`text`](#text)

##### version

> `readonly` **version**: `number`

###### Inherited from

[`Document`](#document).[`version`](#version)

***

### Match

#### Properties

##### document

> `readonly` **document**: [`Embedded`](#embedded)

##### score

> `readonly` **score**: `number`

***

### Query

#### Properties

##### embedding

> `readonly` **embedding**: readonly `number`[]

##### key

> `readonly` **key**: [`Key`](../../generalist/namespaces/Memory#key-1)

##### limit

> `readonly` **limit**: `number`

##### minScore?

> `readonly` `optional` **minScore?**: `number`

***

### RevertInput

#### Properties

##### entryId

> `readonly` **entryId**: `string`

##### to

> `readonly` **to**: `number`

***

### Service

#### Properties

##### delete

> `readonly` **delete**: (`input`) => `Effect`\<`void`, [`VectorStoreError`](#vectorstoreerror)\>

###### Parameters

###### input

[`DeleteInput`](#deleteinput)

###### Returns

`Effect`\<`void`, [`VectorStoreError`](#vectorstoreerror)\>

##### history

> `readonly` **history**: (`entryId`) => `Effect`\<readonly [`Embedded`](#embedded)[], [`VectorStoreError`](#vectorstoreerror)\>

###### Parameters

###### entryId

`string`

###### Returns

`Effect`\<readonly [`Embedded`](#embedded)[], [`VectorStoreError`](#vectorstoreerror)\>

##### query

> `readonly` **query**: (`query`) => `Effect`\<readonly [`Match`](#match)[], [`VectorStoreError`](#vectorstoreerror)\>

###### Parameters

###### query

[`Query`](#query)

###### Returns

`Effect`\<readonly [`Match`](#match)[], [`VectorStoreError`](#vectorstoreerror)\>

##### revert

> `readonly` **revert**: (`input`) => `Effect`\<`void`, [`VectorStoreError`](#vectorstoreerror)\>

###### Parameters

###### input

[`RevertInput`](#revertinput)

###### Returns

`Effect`\<`void`, [`VectorStoreError`](#vectorstoreerror)\>

##### upsert

> `readonly` **upsert**: (`documents`) => `Effect`\<`void`, [`VectorStoreError`](#vectorstoreerror)\>

###### Parameters

###### documents

readonly [`Embedded`](#embedded)[]

###### Returns

`Effect`\<`void`, [`VectorStoreError`](#vectorstoreerror)\>

## Variables

### layerMemory

> `const` **layerMemory**: `Layer.Layer`\<[`VectorStore`](#vectorstore)\>

Ref-backed non-durable vector store.

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`VectorStore`](#vectorstore)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`VectorStore`](#vectorstore)\>
