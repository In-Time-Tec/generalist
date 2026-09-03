[**generalist**](../../index)

***

[generalist](../../index) / [unstable.a2a](../index) / Errors

# Errors

## Classes

<a id="messagerejected"></a>

### MessageRejected

**`Experimental`**

The remote A2A message cannot be admitted as untrusted user input.

#### Extends

- `MessageRejected_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new MessageRejected**(...`args`): [`MessageRejected`](#messagerejected)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`MessageRejected`](#messagerejected)

###### Inherited from

`MessageRejected_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`MessageRejected_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`MessageRejected_base.message`

<a id="part"></a>

##### part?

> `readonly` `optional` **part?**: `number`

**`Experimental`**

###### Inherited from

`MessageRejected_base.part`

***

<a id="taskprojectionfailed"></a>

### TaskProjectionFailed

**`Experimental`**

Runtime state could not be projected to an A2A Task.

#### Extends

- `TaskProjectionFailed_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new TaskProjectionFailed**(...`args`): [`TaskProjectionFailed`](#taskprojectionfailed)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`TaskProjectionFailed`](#taskprojectionfailed)

###### Inherited from

`TaskProjectionFailed_base.constructor`

#### Properties

<a id="cause"></a>

##### cause?

> `readonly` `optional` **cause?**: `unknown`

**`Experimental`**

###### Inherited from

`TaskProjectionFailed_base.cause`

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`TaskProjectionFailed_base.hint`

<a id="message-1"></a>

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`TaskProjectionFailed_base.message`

<a id="taskid"></a>

##### taskId

> `readonly` **taskId**: `string`

**`Experimental`**

###### Inherited from

`TaskProjectionFailed_base.taskId`
