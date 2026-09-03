[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ActiveModelResponse

# ActiveModelResponse

## Classes

<a id="activemodelresponse"></a>

### ActiveModelResponse

Run-owned access to the currently authoritative partial model response.

#### Extends

- `ActiveModelResponse_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new ActiveModelResponse**(`_`): [`ActiveModelResponse`](#activemodelresponse)

###### Parameters

###### \_

`never`

###### Returns

[`ActiveModelResponse`](#activemodelresponse)

###### Inherited from

`ActiveModelResponse_base.constructor`

## Interfaces

<a id="attemptidentity"></a>

### AttemptIdentity

Identity of the authoritative provider attempt for one model operation.

#### Extended by

- [`Snapshot`](#snapshot-1)

#### Properties

<a id="attempt"></a>

##### attempt

> `readonly` **attempt**: `number`

<a id="modelattemptid"></a>

##### modelAttemptId

> `readonly` **modelAttemptId**: `string`

<a id="modelcallid"></a>

##### modelCallId

> `readonly` **modelCallId**: `string`

<a id="operationkey"></a>

##### operationKey?

> `readonly` `optional` **operationKey?**: `string`

<a id="sessionparentid"></a>

##### sessionParentId?

> `readonly` `optional` **sessionParentId?**: `string` \| `null`

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="service"></a>

### Service

Read-only access to the active model response owned by one Run.

#### Properties

<a id="handletypeid"></a>

##### \[HandleTypeId\]

> `readonly` **\[HandleTypeId\]**: *typeof* `HandleTypeId`

<a id="snapshot"></a>

##### snapshot

> `readonly` **snapshot**: `Effect`\<`Option`\<[`Snapshot`](#snapshot-1)\>\>

***

<a id="snapshot-1"></a>

### Snapshot

A normalized response that was interrupted after producing semantic content.

#### Extends

- [`AttemptIdentity`](#attemptidentity)

#### Properties

<a id="attempt-1"></a>

##### attempt

> `readonly` **attempt**: `number`

###### Inherited from

[`AttemptIdentity`](#attemptidentity).[`attempt`](#attempt)

<a id="modelattemptid-1"></a>

##### modelAttemptId

> `readonly` **modelAttemptId**: `string`

###### Inherited from

[`AttemptIdentity`](#attemptidentity).[`modelAttemptId`](#modelattemptid)

<a id="modelcallid-1"></a>

##### modelCallId

> `readonly` **modelCallId**: `string`

###### Inherited from

[`AttemptIdentity`](#attemptidentity).[`modelCallId`](#modelcallid)

<a id="operationkey-1"></a>

##### operationKey?

> `readonly` `optional` **operationKey?**: `string`

###### Inherited from

[`AttemptIdentity`](#attemptidentity).[`operationKey`](#operationkey)

<a id="response"></a>

##### response

> `readonly` **response**: `CompletedModelResponse`\<`Record`\<`string`, `Any`\>\>

<a id="sessionparentid-1"></a>

##### sessionParentId?

> `readonly` `optional` **sessionParentId?**: `string` \| `null`

###### Inherited from

[`AttemptIdentity`](#attemptidentity).[`sessionParentId`](#sessionparentid)

<a id="turn-1"></a>

##### turn

> `readonly` **turn**: `number`

###### Inherited from

[`AttemptIdentity`](#attemptidentity).[`turn`](#turn)

## Variables

<a id="make"></a>

### make

> `const` **make**: () => [`Service`](#service)

Make one opaque accumulator handle for a single Run.

#### Returns

[`Service`](#service)
