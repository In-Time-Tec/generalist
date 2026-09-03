[**generalist**](../../index)

***

[generalist](../../index) / [unstable.ag-ui](../index) / Errors

# Errors

**`Experimental`**

## Classes

### EventInvalid

**`Experimental`**

#### Extends

- `EventInvalid_base`

#### Constructors

##### Constructor

> **new EventInvalid**(...`args`): [`EventInvalid`](#eventinvalid)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`EventInvalid`](#eventinvalid)

###### Inherited from

`EventInvalid_base.constructor`

#### Properties

##### detail

> `readonly` **detail**: `string`

**`Experimental`**

###### Inherited from

`EventInvalid_base.detail`

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`EventInvalid_base.hint`

##### source

> `readonly` **source**: `"runtime"` \| `"ag-ui"`

**`Experimental`**

###### Inherited from

`EventInvalid_base.source`

***

### InputMalformed

**`Experimental`**

#### Extends

- `InputMalformed_base`

#### Constructors

##### Constructor

> **new InputMalformed**(...`args`): [`InputMalformed`](#inputmalformed)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`InputMalformed`](#inputmalformed)

###### Inherited from

`InputMalformed_base.constructor`

#### Properties

##### detail

> `readonly` **detail**: `string`

**`Experimental`**

###### Inherited from

`InputMalformed_base.detail`

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`InputMalformed_base.hint`

***

### InputRejected

**`Experimental`**

#### Extends

- `InputRejected_base`

#### Constructors

##### Constructor

> **new InputRejected**(...`args`): [`InputRejected`](#inputrejected)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`InputRejected`](#inputrejected)

###### Inherited from

`InputRejected_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`InputRejected_base.hint`

##### reason

> `readonly` **reason**: `"system-message"` \| `"developer-message"` \| `"client-tools"` \| `"final-message-not-user"` \| `"unsupported-user-content"` \| `"invalid-resume"`

**`Experimental`**

###### Inherited from

`InputRejected_base.reason`

***

### ResumeMismatch

**`Experimental`**

#### Extends

- `ResumeMismatch_base`

#### Constructors

##### Constructor

> **new ResumeMismatch**(...`args`): [`ResumeMismatch`](#resumemismatch)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ResumeMismatch`](#resumemismatch)

###### Inherited from

`ResumeMismatch_base.constructor`

#### Properties

##### expectedWaitId?

> `readonly` `optional` **expectedWaitId?**: `string`

**`Experimental`**

###### Inherited from

`ResumeMismatch_base.expectedWaitId`

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`ResumeMismatch_base.hint`

##### receivedWaitIds

> `readonly` **receivedWaitIds**: readonly `string`[]

**`Experimental`**

###### Inherited from

`ResumeMismatch_base.receivedWaitIds`

##### runId

> `readonly` **runId**: `string`

**`Experimental`**

###### Inherited from

`ResumeMismatch_base.runId`

***

### ValueNotSerializable

**`Experimental`**

#### Extends

- `ValueNotSerializable_base`

#### Constructors

##### Constructor

> **new ValueNotSerializable**(...`args`): [`ValueNotSerializable`](#valuenotserializable)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ValueNotSerializable`](#valuenotserializable)

###### Inherited from

`ValueNotSerializable_base.constructor`

#### Properties

##### field

> `readonly` **field**: `string`

**`Experimental`**

###### Inherited from

`ValueNotSerializable_base.field`

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`ValueNotSerializable_base.hint`
