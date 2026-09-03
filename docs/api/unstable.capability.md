[**generalist**](./index)

***

[generalist](./index) / unstable.capability

# unstable.capability

## Classes

<a id="attenuationwidened"></a>

### AttenuationWidened

**`Experimental`**

#### Extends

- `AttenuationWidened_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new AttenuationWidened**(...`args`): [`AttenuationWidened`](#attenuationwidened)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AttenuationWidened`](#attenuationwidened)

###### Inherited from

`AttenuationWidened_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`AttenuationWidened_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`AttenuationWidened_base.message`

<a id="parentid"></a>

##### parentId

> `readonly` **parentId**: `string` & `Brand`\<`"generalist/capability/CapabilityId"`\>

**`Experimental`**

###### Inherited from

`AttenuationWidened_base.parentId`

***

<a id="denied"></a>

### Denied

**`Experimental`**

#### Extends

- `Denied_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new Denied**(...`args`): [`Denied`](#denied)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`Denied`](#denied)

###### Inherited from

`Denied_base.constructor`

#### Properties

<a id="capabilityid"></a>

##### capabilityId?

> `readonly` `optional` **capabilityId?**: `string` & `Brand`\<`"generalist/capability/CapabilityId"`\>

**`Experimental`**

###### Inherited from

`Denied_base.capabilityId`

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`Denied_base.hint`

<a id="message-1"></a>

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`Denied_base.message`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `"missing"` \| `"expired"` \| `"invalid-scope"` \| `"revoked"` \| `"tainted"`

**`Experimental`**

###### Inherited from

`Denied_base.reason`

<a id="sources"></a>

##### sources

> `readonly` **sources**: readonly `object`[]

**`Experimental`**

###### Inherited from

`Denied_base.sources`

<a id="tool"></a>

##### tool?

> `readonly` `optional` **tool?**: `string`

**`Experimental`**

###### Inherited from

`Denied_base.tool`

***

<a id="invalid"></a>

### Invalid

**`Experimental`**

#### Extends

- `Invalid_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new Invalid**(...`args`): [`Invalid`](#invalid)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`Invalid`](#invalid)

###### Inherited from

`Invalid_base.constructor`

#### Properties

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`Invalid_base.hint`

<a id="message-2"></a>

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`Invalid_base.message`

<a id="reason-1"></a>

##### reason

> `readonly` **reason**: `"scope"` \| `"descriptor"` \| `"expiry"` \| `"handle"`

**`Experimental`**

###### Inherited from

`Invalid_base.reason`

## Interfaces

<a id="handle"></a>

### Handle

An unforgeable process-local capability for one exact Tool declaration.

#### Type Parameters

##### T

`T` *extends* `Tool.Any` = `Tool.Any`

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"CapabilityHandle"`

<a id="expiresat"></a>

##### expiresAt

> `readonly` **expiresAt**: `number`

<a id="id"></a>

##### id

> `readonly` **id**: `string` & `Brand`\<`"generalist/capability/CapabilityId"`\>

<a id="scope"></a>

##### scope

> `readonly` **scope**: `object`

###### Index Signature

\[`key`: `string`\]: readonly `string`[]

<a id="tool-1"></a>

##### tool

> `readonly` **tool**: `T`

## Type Aliases

<a id="capabilityid-1"></a>

### CapabilityId

> **CapabilityId** = *typeof* `CapabilityId.Type`

Opaque identity issued by the capability framework.

***

<a id="scope-1"></a>

### Scope

> **Scope** = *typeof* `Scope.Type`

Declarative resource dimensions constrained by one capability.

***

<a id="source"></a>

### Source

> **Source** = *typeof* `Source.Type`

One capability-protected tool result that may have influenced model output.

## Variables

<a id="attenuate"></a>

### attenuate

> `const` **attenuate**: \{(`narrowerScope`): \<`T`\>(`handle`) => [`Handle`](#handle)\<`T`\>; \<`T`\>(`handle`, `narrowerScope`): [`Handle`](#handle)\<`T`\>; \}

Construct a child handle only when its scope is provably contained by the parent.

#### Call Signature

> (`narrowerScope`): \<`T`\>(`handle`) => [`Handle`](#handle)\<`T`\>

##### Parameters

###### narrowerScope

##### Returns

\<`T`\>(`handle`) => [`Handle`](#handle)\<`T`\>

#### Call Signature

> \<`T`\>(`handle`, `narrowerScope`): [`Handle`](#handle)\<`T`\>

##### Type Parameters

###### T

`T` *extends* `Any`

##### Parameters

###### handle

[`Handle`](#handle)\<`T`\>

###### narrowerScope

##### Returns

[`Handle`](#handle)\<`T`\>

***

<a id="capabilityid-2"></a>

### CapabilityId

> `const` **CapabilityId**: `Schema.brand`\<`Schema.String`, `"generalist/capability/CapabilityId"`\>

Opaque identity issued by the capability framework.

***

<a id="check"></a>

### check

> `const` **check**: \<`T`\>(`handle`, `arguments_`) => `Effect.Effect`\<`undefined`, [`Denied`](#denied) \| [`Invalid`](#invalid), `never`\>

Check one live handle outside an Agent loop. Agent-owned checks additionally journal the decision.

#### Type Parameters

##### T

`T` *extends* `Tool.Any`

#### Parameters

##### handle

[`Handle`](#handle)\<`T`\>

##### arguments\_

`Tool.Parameters`\<`T`\>

#### Returns

`Effect.Effect`\<`undefined`, [`Denied`](#denied) \| [`Invalid`](#invalid), `never`\>

***

<a id="grant"></a>

### grant

> `const` **grant**: \<`T`\>(`tool`, `options`) => `Effect.Effect`\<[`Handle`](#handle)\<`T`\>, [`DriverError`](./generalist/namespaces/DurableDriver#drivererror) \| [`DriverStateInvalid`](./generalist/namespaces/DurableDriver#driverstateinvalid) \| [`Invalid`](#invalid), `never`\>

Grant a time-scoped capability for one exact Tool value.

#### Type Parameters

##### T

`T` *extends* `Tool.Any`

#### Parameters

##### tool

`T`

##### options

###### expires

`Duration.Input`

###### scope

[`Scope`](#scope-1)

#### Returns

`Effect.Effect`\<[`Handle`](#handle)\<`T`\>, [`DriverError`](./generalist/namespaces/DurableDriver#drivererror) \| [`DriverStateInvalid`](./generalist/namespaces/DurableDriver#driverstateinvalid) \| [`Invalid`](#invalid), `never`\>

***

<a id="requireuntainted"></a>

### requireUntainted

> `const` **requireUntainted**: (`arguments_`) => \<`Name`, `Config`, `Requirements`\>(`tool`) => `Tool.Tool`\<`Name`, `Config`, `Requirements`\>

Require the named model-authored arguments to have no tainted tool-result provenance.

#### Parameters

##### arguments\_

`ReadonlyArray`\<`string`\>

#### Returns

\<`Name`, `Config`, `Requirements`\>(`tool`) => `Tool.Tool`\<`Name`, `Config`, `Requirements`\>

***

<a id="revoke"></a>

### revoke

> `const` **revoke**: (`handle`) => `Effect.Effect`\<`undefined`, [`DriverError`](./generalist/namespaces/DurableDriver#drivererror) \| [`DriverStateInvalid`](./generalist/namespaces/DurableDriver#driverstateinvalid) \| [`Invalid`](#invalid), `never`\>

Revoke a handle and every handle transitively attenuated from it.

#### Parameters

##### handle

[`Handle`](#handle)\<`Tool.Any`\>

#### Returns

`Effect.Effect`\<`undefined`, [`DriverError`](./generalist/namespaces/DurableDriver#drivererror) \| [`DriverStateInvalid`](./generalist/namespaces/DurableDriver#driverstateinvalid) \| [`Invalid`](#invalid), `never`\>

***

<a id="scope-2"></a>

### Scope

> `const` **Scope**: `Schema.$Record`\<`Schema.String`, `Schema.$Array`\<`Schema.String`\>\>

Declarative resource dimensions constrained by one capability.

***

<a id="source-1"></a>

### Source

> `const` **Source**: `Schema.Struct`\<\{ `capabilityId`: `Schema.brand`\<`Schema.String`, `"generalist/capability/CapabilityId"`\>; `tool`: `Schema.String`; `toolCallId`: `Schema.String`; \}\>

One capability-protected tool result that may have influenced model output.
