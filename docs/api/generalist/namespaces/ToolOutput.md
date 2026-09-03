[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ToolOutput

# ToolOutput

## Classes

<a id="error"></a>

### Error

#### Extends

- `Error_base`

#### Constructors

<a id="constructor"></a>

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

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Error_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`Error_base.message`

***

<a id="store"></a>

### Store

#### Extends

- `Store_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="boundedsuccess"></a>

### BoundedSuccess

A successful tool result after applying the output bound.

#### Extends

- [`Success`](./ToolExecutor#success)

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"Success"`

###### Inherited from

[`Success`](./ToolExecutor#success).[`_tag`](./ToolExecutor#_tag-1)

<a id="encodedresult"></a>

##### encodedResult

> `readonly` **encodedResult**: `unknown`

###### Inherited from

[`Success`](./ToolExecutor#success).[`encodedResult`](./ToolExecutor#encodedresult)

<a id="memoized"></a>

##### memoized?

> `readonly` `optional` **memoized?**: `object`

###### fromOperation

> `readonly` **fromOperation**: `string`

###### fromRun

> `readonly` **fromRun**: `string`

###### Inherited from

[`Success`](./ToolExecutor#success).[`memoized`](./ToolExecutor#memoized)

<a id="outputpaths"></a>

##### outputPaths

> `readonly` **outputPaths**: readonly `string`[]

<a id="result"></a>

##### result

> `readonly` **result**: `unknown`

###### Inherited from

[`Success`](./ToolExecutor#success).[`result`](./ToolExecutor#result)

<a id="taint"></a>

##### taint?

> `readonly` `optional` **taint?**: readonly `object`[]

###### Inherited from

[`Success`](./ToolExecutor#success).[`taint`](./ToolExecutor#taint-1)

***

<a id="output"></a>

### Output

A bounded tool result: inline content plus optional spilled overflow references.

#### Properties

<a id="inline"></a>

##### inline

> `readonly` **inline**: `unknown`

<a id="outputpaths-1"></a>

##### outputPaths?

> `readonly` `optional` **outputPaths?**: readonly `string`[]

## Variables

<a id="bound"></a>

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

<a id="layermemory"></a>

### layerMemory

> `const` **layerMemory**: `Layer.Layer`\<[`Store`](#store)\>

***

<a id="layernoop"></a>

### layerNoop

> `const` **layerNoop**: `Layer.Layer`\<[`Store`](#store)\>

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Store`](#store)\>

#### Parameters

##### implementation

[`Store`](#store)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`Store`](#store)\>
