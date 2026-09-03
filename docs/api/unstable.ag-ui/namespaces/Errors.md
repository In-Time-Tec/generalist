[**generalist**](../../index)

***

[generalist](../../index) / [unstable.ag-ui](../index) / Errors

# Errors

**`Experimental`**

## Classes

<a id="eventinvalid"></a>

### EventInvalid

**`Experimental`**

#### Extends

- `EventInvalid_base`

#### Constructors

<a id="constructor"></a>

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

<a id="detail"></a>

##### detail

> `readonly` **detail**: `string`

**`Experimental`**

###### Inherited from

`EventInvalid_base.detail`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`EventInvalid_base.hint`

<a id="source"></a>

##### source

> `readonly` **source**: `"runtime"` \| `"ag-ui"`

**`Experimental`**

###### Inherited from

`EventInvalid_base.source`

***

<a id="inputmalformed"></a>

### InputMalformed

**`Experimental`**

#### Extends

- `InputMalformed_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="detail-1"></a>

##### detail

> `readonly` **detail**: `string`

**`Experimental`**

###### Inherited from

`InputMalformed_base.detail`

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`InputMalformed_base.hint`

***

<a id="inputrejected"></a>

### InputRejected

**`Experimental`**

#### Extends

- `InputRejected_base`

#### Constructors

<a id="constructor-2"></a>

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

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`InputRejected_base.hint`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `"system-message"` \| `"developer-message"` \| `"client-tools"` \| `"final-message-not-user"` \| `"unsupported-user-content"` \| `"invalid-resume"`

**`Experimental`**

###### Inherited from

`InputRejected_base.reason`

***

<a id="resumemismatch"></a>

### ResumeMismatch

**`Experimental`**

#### Extends

- `ResumeMismatch_base`

#### Constructors

<a id="constructor-3"></a>

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

<a id="expectedwaitid"></a>

##### expectedWaitId?

> `readonly` `optional` **expectedWaitId?**: `string`

**`Experimental`**

###### Inherited from

`ResumeMismatch_base.expectedWaitId`

<a id="hint-3"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`ResumeMismatch_base.hint`

<a id="receivedwaitids"></a>

##### receivedWaitIds

> `readonly` **receivedWaitIds**: readonly `string`[]

**`Experimental`**

###### Inherited from

`ResumeMismatch_base.receivedWaitIds`

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

**`Experimental`**

###### Inherited from

`ResumeMismatch_base.runId`

***

<a id="valuenotserializable"></a>

### ValueNotSerializable

**`Experimental`**

#### Extends

- `ValueNotSerializable_base`

#### Constructors

<a id="constructor-4"></a>

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

<a id="field"></a>

##### field

> `readonly` **field**: `string`

**`Experimental`**

###### Inherited from

`ValueNotSerializable_base.field`

<a id="hint-4"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`ValueNotSerializable_base.hint`
