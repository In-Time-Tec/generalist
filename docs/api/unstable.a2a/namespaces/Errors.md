[**generalist**](../../index)

***

[generalist](../../index) / [unstable.a2a](../index) / Errors

# Errors

## Classes

### MessageRejected

**`Experimental`**

The remote A2A message cannot be admitted as untrusted user input.

#### Extends

- `MessageRejected_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`MessageRejected_base.hint`

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`MessageRejected_base.message`

##### part?

> `readonly` `optional` **part?**: `number`

**`Experimental`**

###### Inherited from

`MessageRejected_base.part`

***

### TaskProjectionFailed

**`Experimental`**

Runtime state could not be projected to an A2A Task.

#### Extends

- `TaskProjectionFailed_base`

#### Constructors

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

##### cause?

> `readonly` `optional` **cause?**: `unknown`

**`Experimental`**

###### Inherited from

`TaskProjectionFailed_base.cause`

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`TaskProjectionFailed_base.hint`

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`TaskProjectionFailed_base.message`

##### taskId

> `readonly` **taskId**: `string`

**`Experimental`**

###### Inherited from

`TaskProjectionFailed_base.taskId`
