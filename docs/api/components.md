[**generalist**](./index.md)

***

[generalist](./index.md) / components

# components

## Classes

<a id="commandtool"></a>

### CommandTool

**`Experimental`**

Annotate an Effect AI command tool so recovery may safely retry its accepted component command.

#### Extends

- `CommandTool_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new CommandTool**(`_`): [`CommandTool`](#commandtool)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`CommandTool`](#commandtool)

###### Inherited from

`CommandTool_base.constructor`

## Interfaces

<a id="commandcapability"></a>

### CommandCapability

**`Experimental`**

Identity held by one registered component declaration.

#### Properties

<a id="namespace"></a>

##### namespace

> `readonly` **namespace**: `string`

**`Experimental`**

<a id="pin"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

**`Experimental`**

***

<a id="declaration"></a>

### Declaration

**`Experimental`**

One typed, schema-pinned component declaration.

#### Type Parameters

##### State

`State`

##### Command

`Command`

#### Properties

<a id="command-1"></a>

##### command

> `readonly` **command**: `Codec`\<`Command`, `unknown`\>

**`Experimental`**

<a id="registration"></a>

##### registration

> `readonly` **registration**: [`Registration`](#registration-1)

**`Experimental`**

<a id="state-1"></a>

##### state

> `readonly` **state**: `Codec`\<`State`, `unknown`\>

**`Experimental`**

***

<a id="registration-1"></a>

### Registration

**`Experimental`**

Register the same declaration that its tools use; rebuild it with matching pins on recovery.

#### Properties

<a id="capability"></a>

##### capability

> `readonly` **capability**: [`CommandCapability`](#commandcapability)

**`Experimental`**

<a id="descriptor"></a>

##### descriptor

> `readonly` **descriptor**: `object`

**`Experimental`**

###### access?

> `readonly` `optional` **access?**: `"session-owner"`

###### branch

> `readonly` **branch**: `"restore"`

###### handler

> `readonly` **handler**: `string`

###### handlerVersion

> `readonly` **handlerVersion**: `string`

###### inheritance?

> `readonly` `optional` **inheritance?**: `"none"`

###### instance

> `readonly` **instance**: `string`

###### key

> `readonly` **key**: `string`

###### maxCommandBytes

> `readonly` **maxCommandBytes**: `number`

###### maxReceiptBytes

> `readonly` **maxReceiptBytes**: `number`

###### maxStateBytes

> `readonly` **maxStateBytes**: `number`

###### redaction

> `readonly` **redaction**: `"visible"`

###### schemaVersion

> `readonly` **schemaVersion**: `string`

###### scope

> `readonly` **scope**: `"run"` \| `"session"`

###### version

> `readonly` **version**: `"1"`

<a id="initial"></a>

##### initial

> `readonly` **initial**: `Effect`\<`Json`, [`DriverStateInvalid`](./generalist/namespaces/DurableDriver.md#driverstateinvalid)\>

**`Experimental`**

<a id="pin-1"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

**`Experimental`**

<a id="transition"></a>

##### transition

> `readonly` **transition**: (`state`, `command`) => `Effect`\<`Json`, [`DriverStateInvalid`](./generalist/namespaces/DurableDriver.md#driverstateinvalid)\>

**`Experimental`**

###### Parameters

###### state

`Json`

###### command

`Json`

###### Returns

`Effect`\<`Json`, [`DriverStateInvalid`](./generalist/namespaces/DurableDriver.md#driverstateinvalid)\>

<a id="validate"></a>

##### validate

> `readonly` **validate**: (`state`) => `Effect`\<`void`, [`DriverStateInvalid`](./generalist/namespaces/DurableDriver.md#driverstateinvalid)\>

**`Experimental`**

###### Parameters

###### state

`Json`

###### Returns

`Effect`\<`void`, [`DriverStateInvalid`](./generalist/namespaces/DurableDriver.md#driverstateinvalid)\>

## Type Aliases

<a id="descriptor-1"></a>

### Descriptor

> **Descriptor** = *typeof* `Descriptor.Type`

**`Experimental`**

Component ownership and codec contract.

## Variables

<a id="command-2"></a>

### command

> `const` **command**: \{\<`Command`\>(`input`): \<`State`\>(`declaration`) => `Effect`\<`State`, [`DriverStateInvalid`](./generalist/namespaces/DurableDriver.md#driverstateinvalid) \| [`DriverError`](./generalist/namespaces/DurableDriver.md#drivererror)\>; \<`State`, `Command`\>(`declaration`, `input`): `Effect`\<`State`, [`DriverStateInvalid`](./generalist/namespaces/DurableDriver.md#driverstateinvalid) \| [`DriverError`](./generalist/namespaces/DurableDriver.md#drivererror)\>; \}

**`Experimental`**

Accept one deterministic command. In a tool, omit id to reuse its durable operation identity.

#### Call Signature

> \<`Command`\>(`input`): \<`State`\>(`declaration`) => `Effect`\<`State`, [`DriverStateInvalid`](./generalist/namespaces/DurableDriver.md#driverstateinvalid) \| [`DriverError`](./generalist/namespaces/DurableDriver.md#drivererror)\>

##### Type Parameters

###### Command

`Command`

##### Parameters

###### input

###### command

`Command`

###### id?

`string`

##### Returns

\<`State`\>(`declaration`) => `Effect`\<`State`, [`DriverStateInvalid`](./generalist/namespaces/DurableDriver.md#driverstateinvalid) \| [`DriverError`](./generalist/namespaces/DurableDriver.md#drivererror)\>

#### Call Signature

> \<`State`, `Command`\>(`declaration`, `input`): `Effect`\<`State`, [`DriverStateInvalid`](./generalist/namespaces/DurableDriver.md#driverstateinvalid) \| [`DriverError`](./generalist/namespaces/DurableDriver.md#drivererror)\>

##### Type Parameters

###### State

`State`

###### Command

`Command`

##### Parameters

###### declaration

[`Declaration`](#declaration)\<`State`, `Command`\>

###### input

###### command

`Command`

###### id?

`string`

##### Returns

`Effect`\<`State`, [`DriverStateInvalid`](./generalist/namespaces/DurableDriver.md#driverstateinvalid) \| [`DriverError`](./generalist/namespaces/DurableDriver.md#drivererror)\>

***

<a id="descriptor-2"></a>

### Descriptor

> `const` **Descriptor**: `Schema.Struct`\<\{ `access`: `Schema.optionalKey`\<`Schema.Literal`\<`"session-owner"`\>\>; `branch`: `Schema.Literal`\<`"restore"`\>; `handler`: `Schema.String`; `handlerVersion`: `Schema.String`; `inheritance`: `Schema.optionalKey`\<`Schema.Literal`\<`"none"`\>\>; `instance`: `Schema.String`; `key`: `Schema.String`; `maxCommandBytes`: `Schema.Int`; `maxReceiptBytes`: `Schema.Int`; `maxStateBytes`: `Schema.Int`; `redaction`: `Schema.Literal`\<`"visible"`\>; `schemaVersion`: `Schema.String`; `scope`: `Schema.Literals`\<readonly \[`"run"`, `"session"`\]\>; `version`: `Schema.Literal`\<`"1"`\>; \}\>

**`Experimental`**

Pin one component's ownership, schema, transition handler, and byte bounds.

***

<a id="layer"></a>

### layer

> `const` **layer**: (`registrations`) => `Layer.Layer`\<`Registry`, [`DriverStateInvalid`](./generalist/namespaces/DurableDriver.md#driverstateinvalid)\>

**`Experimental`**

Provide the single component registry for Agent registration and execution.

#### Parameters

##### registrations

`ReadonlyArray`\<[`Registration`](#registration-1)\>

#### Returns

`Layer.Layer`\<`Registry`, [`DriverStateInvalid`](./generalist/namespaces/DurableDriver.md#driverstateinvalid)\>

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: *typeof* [`layer`](#layer)

**`Experimental`**

Provide component registrations in a test environment.

***

<a id="make"></a>

### make

> `const` **make**: \<`State`, `Command`\>(`input`) => [`Declaration`](#declaration)\<`State`, `Command`\>

**`Experimental`**

Declare a bounded deterministic component without allocating state or running a transition.

#### Type Parameters

##### State

`State`

##### Command

`Command`

#### Parameters

##### input

###### command

`Schema.Codec`\<`Command`, `unknown`\>

###### descriptor

[`Descriptor`](#descriptor-1)

###### initial

`State`

###### state

`Schema.Codec`\<`State`, `unknown`\>

###### transition

(`state`, `command`) => `State`

#### Returns

[`Declaration`](#declaration)\<`State`, `Command`\>

***

<a id="read"></a>

### read

> `const` **read**: \<`State`, `Command`\>(`declaration`) => `Effect.Effect`\<`State`, [`DriverStateInvalid`](./generalist/namespaces/DurableDriver.md#driverstateinvalid)\>

**`Experimental`**

Read the current component value without accepting a command or changing its receipts.

#### Type Parameters

##### State

`State`

##### Command

`Command`

#### Parameters

##### declaration

[`Declaration`](#declaration)\<`State`, `Command`\>

#### Returns

`Effect.Effect`\<`State`, [`DriverStateInvalid`](./generalist/namespaces/DurableDriver.md#driverstateinvalid)\>
