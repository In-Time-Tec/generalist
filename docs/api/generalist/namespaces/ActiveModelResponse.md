[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ActiveModelResponse

# ActiveModelResponse

## Classes

### ActiveModelResponse

Run-owned access to the currently authoritative partial model response.

#### Extends

- `ActiveModelResponse_base`

#### Constructors

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

### AttemptIdentity

Identity of the authoritative provider attempt for one model operation.

#### Extended by

- [`Snapshot`](#snapshot-1)

#### Properties

##### attempt

> `readonly` **attempt**: `number`

##### modelAttemptId

> `readonly` **modelAttemptId**: `string`

##### modelCallId

> `readonly` **modelCallId**: `string`

##### operationKey?

> `readonly` `optional` **operationKey?**: `string`

##### sessionParentId?

> `readonly` `optional` **sessionParentId?**: `string` \| `null`

##### turn

> `readonly` **turn**: `number`

***

### Service

Read-only access to the active model response owned by one Run.

#### Properties

##### \[HandleTypeId\]

> `readonly` **\[HandleTypeId\]**: *typeof* `HandleTypeId`

##### snapshot

> `readonly` **snapshot**: `Effect`\<`Option`\<[`Snapshot`](#snapshot-1)\>\>

***

### Snapshot

A normalized response that was interrupted after producing semantic content.

#### Extends

- [`AttemptIdentity`](#attemptidentity)

#### Properties

##### attempt

> `readonly` **attempt**: `number`

###### Inherited from

[`AttemptIdentity`](#attemptidentity).[`attempt`](#attempt)

##### modelAttemptId

> `readonly` **modelAttemptId**: `string`

###### Inherited from

[`AttemptIdentity`](#attemptidentity).[`modelAttemptId`](#modelattemptid)

##### modelCallId

> `readonly` **modelCallId**: `string`

###### Inherited from

[`AttemptIdentity`](#attemptidentity).[`modelCallId`](#modelcallid)

##### operationKey?

> `readonly` `optional` **operationKey?**: `string`

###### Inherited from

[`AttemptIdentity`](#attemptidentity).[`operationKey`](#operationkey)

##### response

> `readonly` **response**: `CompletedModelResponse`\<`Record`\<`string`, `Any`\>\>

##### sessionParentId?

> `readonly` `optional` **sessionParentId?**: `string` \| `null`

###### Inherited from

[`AttemptIdentity`](#attemptidentity).[`sessionParentId`](#sessionparentid)

##### turn

> `readonly` **turn**: `number`

###### Inherited from

[`AttemptIdentity`](#attemptidentity).[`turn`](#turn)

## Variables

### make

> `const` **make**: () => [`Service`](#service)

Make one opaque accumulator handle for a single Run.

#### Returns

[`Service`](#service)
