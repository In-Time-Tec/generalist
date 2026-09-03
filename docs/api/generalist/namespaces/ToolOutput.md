[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ToolOutput

# ToolOutput

## Classes

### Error

#### Extends

- `Error_base`

#### Constructors

##### Constructor

> **new Error**(...`args`): [`Error`](#error)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`Error`](#error)

###### Inherited from

`Error_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Error_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`Error_base.message`

***

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

## Interfaces

### BoundedSuccess

A successful tool result after applying the output bound.

#### Extends

- [`Success`](./ToolExecutor#success)

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Success"`

###### Inherited from

[`Success`](./ToolExecutor#success).[`_tag`](./ToolExecutor#_tag-1)

##### encodedResult

> `readonly` **encodedResult**: `unknown`

###### Inherited from

[`Success`](./ToolExecutor#success).[`encodedResult`](./ToolExecutor#encodedresult)

##### memoized?

> `readonly` `optional` **memoized?**: `object`

###### fromOperation

> `readonly` **fromOperation**: `string`

###### fromRun

> `readonly` **fromRun**: `string`

###### Inherited from

[`Success`](./ToolExecutor#success).[`memoized`](./ToolExecutor#memoized)

##### outputPaths

> `readonly` **outputPaths**: readonly `string`[]

##### result

> `readonly` **result**: `unknown`

###### Inherited from

[`Success`](./ToolExecutor#success).[`result`](./ToolExecutor#result)

***

### Output

A bounded tool result: inline content plus optional spilled overflow references.

#### Properties

##### inline

> `readonly` **inline**: `unknown`

##### outputPaths?

> `readonly` `optional` **outputPaths?**: readonly `string`[]

## Variables

### bound

> `const` **bound**: \{(`options`): (`result`) => `Effect`\<[`BoundedSuccess`](#boundedsuccess)\>; (`result`, `options`): `Effect`\<[`BoundedSuccess`](#boundedsuccess)\>; \}

#### Call Signature

> (`options`): (`result`) => `Effect`\<[`BoundedSuccess`](#boundedsuccess)\>

##### Parameters

###### options

###### maxBytes

`number`

###### toolCallId

`string`

##### Returns

(`result`) => `Effect`\<[`BoundedSuccess`](#boundedsuccess)\>

#### Call Signature

> (`result`, `options`): `Effect`\<[`BoundedSuccess`](#boundedsuccess)\>

##### Parameters

###### result

[`Success`](./ToolExecutor#success)

###### options

###### maxBytes

`number`

###### toolCallId

`string`

##### Returns

`Effect`\<[`BoundedSuccess`](#boundedsuccess)\>

***

### layerMemory

> `const` **layerMemory**: `Layer.Layer`\<[`Store`](#store)\>

***

### layerNoop

> `const` **layerNoop**: `Layer.Layer`\<[`Store`](#store)\>

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Store`](#store)\>

#### Parameters

##### implementation

[`Store`](#store)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`Store`](#store)\>
