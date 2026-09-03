[**generalist**](../../index)

***

[generalist](../../index) / [memory](../index) / VectorStore

# VectorStore

## Classes

<a id="vectorstore"></a>

### VectorStore

#### Extends

- `VectorStore_base`

#### Constructors

<a id="constructor"></a>

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

<a id="vectorstoreerror"></a>

### VectorStoreError

#### Extends

- `VectorStoreError_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`VectorStoreError_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`VectorStoreError_base.message`

## Interfaces

<a id="deleteinput"></a>

### DeleteInput

#### Properties

<a id="id"></a>

##### id?

> `readonly` `optional` **id?**: `string`

<a id="key"></a>

##### key

> `readonly` **key**: [`Key`](../../generalist/namespaces/Memory#key-1)

***

<a id="document"></a>

### Document

#### Extended by

- [`Embedded`](#embedded)

#### Properties

<a id="appliedat"></a>

##### appliedAt

> `readonly` **appliedAt**: `string`

<a id="evidence"></a>

##### evidence

> `readonly` **evidence**: readonly `object`[]

<a id="id-1"></a>

##### id

> `readonly` **id**: `string`

<a id="key-1"></a>

##### key

> `readonly` **key**: [`Key`](../../generalist/namespaces/Memory#key-1)

<a id="metadata"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

<a id="supersedes"></a>

##### supersedes?

> `readonly` `optional` **supersedes?**: `number`

<a id="text"></a>

##### text

> `readonly` **text**: `string`

<a id="version"></a>

##### version

> `readonly` **version**: `number`

***

<a id="embedded"></a>

### Embedded

#### Extends

- [`Document`](#document)

#### Properties

<a id="appliedat-1"></a>

##### appliedAt

> `readonly` **appliedAt**: `string`

###### Inherited from

[`Document`](#document).[`appliedAt`](#appliedat)

<a id="embedding"></a>

##### embedding

> `readonly` **embedding**: readonly `number`[]

<a id="evidence-1"></a>

##### evidence

> `readonly` **evidence**: readonly `object`[]

###### Inherited from

[`Document`](#document).[`evidence`](#evidence)

<a id="id-2"></a>

##### id

> `readonly` **id**: `string`

###### Inherited from

[`Document`](#document).[`id`](#id-1)

<a id="key-2"></a>

##### key

> `readonly` **key**: [`Key`](../../generalist/namespaces/Memory#key-1)

###### Inherited from

[`Document`](#document).[`key`](#key-1)

<a id="metadata-1"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

###### Inherited from

[`Document`](#document).[`metadata`](#metadata)

<a id="supersedes-1"></a>

##### supersedes?

> `readonly` `optional` **supersedes?**: `number`

###### Inherited from

[`Document`](#document).[`supersedes`](#supersedes)

<a id="text-1"></a>

##### text

> `readonly` **text**: `string`

###### Inherited from

[`Document`](#document).[`text`](#text)

<a id="version-1"></a>

##### version

> `readonly` **version**: `number`

###### Inherited from

[`Document`](#document).[`version`](#version)

***

<a id="match"></a>

### Match

#### Properties

<a id="document-1"></a>

##### document

> `readonly` **document**: [`Embedded`](#embedded)

<a id="score"></a>

##### score

> `readonly` **score**: `number`

***

<a id="query"></a>

### Query

#### Properties

<a id="embedding-1"></a>

##### embedding

> `readonly` **embedding**: readonly `number`[]

<a id="key-3"></a>

##### key

> `readonly` **key**: [`Key`](../../generalist/namespaces/Memory#key-1)

<a id="limit"></a>

##### limit

> `readonly` **limit**: `number`

<a id="minscore"></a>

##### minScore?

> `readonly` `optional` **minScore?**: `number`

***

<a id="revertinput"></a>

### RevertInput

#### Properties

<a id="entryid"></a>

##### entryId

> `readonly` **entryId**: `string`

<a id="to"></a>

##### to

> `readonly` **to**: `number`

***

<a id="service"></a>

### Service

#### Properties

<a id="delete"></a>

##### delete

> `readonly` **delete**: (`input`) => `Effect`\<`void`, [`VectorStoreError`](#vectorstoreerror)\>

###### Parameters

###### input

[`DeleteInput`](#deleteinput)

###### Returns

`Effect`\<`void`, [`VectorStoreError`](#vectorstoreerror)\>

<a id="history"></a>

##### history

> `readonly` **history**: (`entryId`) => `Effect`\<readonly [`Embedded`](#embedded)[], [`VectorStoreError`](#vectorstoreerror)\>

###### Parameters

###### entryId

`string`

###### Returns

`Effect`\<readonly [`Embedded`](#embedded)[], [`VectorStoreError`](#vectorstoreerror)\>

<a id="query-1"></a>

##### query

> `readonly` **query**: (`query`) => `Effect`\<readonly [`Match`](#match)[], [`VectorStoreError`](#vectorstoreerror)\>

###### Parameters

###### query

[`Query`](#query)

###### Returns

`Effect`\<readonly [`Match`](#match)[], [`VectorStoreError`](#vectorstoreerror)\>

<a id="revert"></a>

##### revert

> `readonly` **revert**: (`input`) => `Effect`\<`void`, [`VectorStoreError`](#vectorstoreerror)\>

###### Parameters

###### input

[`RevertInput`](#revertinput)

###### Returns

`Effect`\<`void`, [`VectorStoreError`](#vectorstoreerror)\>

<a id="upsert"></a>

##### upsert

> `readonly` **upsert**: (`documents`) => `Effect`\<`void`, [`VectorStoreError`](#vectorstoreerror)\>

###### Parameters

###### documents

readonly [`Embedded`](#embedded)[]

###### Returns

`Effect`\<`void`, [`VectorStoreError`](#vectorstoreerror)\>

## Variables

<a id="layermemory"></a>

### layerMemory

> `const` **layerMemory**: `Layer.Layer`\<[`VectorStore`](#vectorstore)\>

Ref-backed non-durable vector store.

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`VectorStore`](#vectorstore)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`VectorStore`](#vectorstore)\>
