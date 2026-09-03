[**generalist**](../../index)

***

[generalist](../../index) / [repl](../index) / HostBindings

# HostBindings

## Classes

<a id="hostbindings"></a>

### HostBindings

#### Extends

- `HostBindings_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new HostBindings**(`_`): [`HostBindings`](#hostbindings)

###### Parameters

###### \_

`never`

###### Returns

[`HostBindings`](#hostbindings)

###### Inherited from

`HostBindings_base.constructor`

***

<a id="hostmoduleconflict"></a>

### HostModuleConflict

Two modules or two operations claimed the same mounted name.

#### Extends

- `HostModuleConflict_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new HostModuleConflict**(...`args`): [`HostModuleConflict`](#hostmoduleconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`HostModuleConflict`](#hostmoduleconflict)

###### Inherited from

`HostModuleConflict_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`HostModuleConflict_base.hint`

<a id="module"></a>

##### module

> `readonly` **module**: `string`

###### Inherited from

`HostModuleConflict_base.module`

<a id="operation"></a>

##### operation?

> `readonly` `optional` **operation?**: `string`

###### Inherited from

`HostModuleConflict_base.operation`

***

<a id="hostmodulenotfound"></a>

### HostModuleNotFound

The cell addressed a module or operation that is not mounted.

#### Extends

- `HostModuleNotFound_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new HostModuleNotFound**(...`args`): [`HostModuleNotFound`](#hostmodulenotfound)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`HostModuleNotFound`](#hostmodulenotfound)

###### Inherited from

`HostModuleNotFound_base.constructor`

#### Properties

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`HostModuleNotFound_base.hint`

<a id="module-1"></a>

##### module

> `readonly` **module**: `string`

###### Inherited from

`HostModuleNotFound_base.module`

<a id="operation-1"></a>

##### operation?

> `readonly` `optional` **operation?**: `string`

###### Inherited from

`HostModuleNotFound_base.operation`

***

<a id="hostmoduleschemafailure"></a>

### HostModuleSchemaFailure

A host request or reply did not match the operation's declared schema.

#### Extends

- `HostModuleSchemaFailure_base`

#### Constructors

<a id="constructor-3"></a>

##### Constructor

> **new HostModuleSchemaFailure**(...`args`): [`HostModuleSchemaFailure`](#hostmoduleschemafailure)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`HostModuleSchemaFailure`](#hostmoduleschemafailure)

###### Inherited from

`HostModuleSchemaFailure_base.constructor`

#### Properties

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`HostModuleSchemaFailure_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`HostModuleSchemaFailure_base.message`

<a id="module-2"></a>

##### module

> `readonly` **module**: `string`

###### Inherited from

`HostModuleSchemaFailure_base.module`

<a id="operation-2"></a>

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`HostModuleSchemaFailure_base.operation`

<a id="stage"></a>

##### stage

> `readonly` **stage**: `"decode-input"` \| `"encode-output"` \| `"encode-failure"`

###### Inherited from

`HostModuleSchemaFailure_base.stage`

## Interfaces

<a id="descriptor"></a>

### Descriptor

The mounted surface a cell can see, without any handler.

#### Properties

<a id="module-3"></a>

##### module

> `readonly` **module**: `string`

<a id="operations"></a>

##### operations

> `readonly` **operations**: readonly `string`[]

***

<a id="module-4"></a>

### Module

One named module of operations, mounted as a single kernel binding.

#### Type Parameters

##### R

`R` = `never`

#### Properties

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="operations-1"></a>

##### operations

> `readonly` **operations**: readonly [`AnyOperation`](#anyoperation)\<`R`\>[]

***

<a id="operation-3"></a>

### Operation

One Schema-typed operation a host mounts into the kernel namespace.

#### Type Parameters

##### Input

`Input` *extends* `Schema.Constraint` = `Schema.Constraint`

##### Output

`Output` *extends* `Schema.Constraint` = `Schema.Constraint`

##### Failure

`Failure` *extends* `Schema.Constraint` = `Schema.Constraint`

##### R

`R` = `never`

#### Properties

<a id="failure-1"></a>

##### failure

> `readonly` **failure**: `Failure`

<a id="handle"></a>

##### handle

> `readonly` **handle**: (`input`) => `Effect`\<`Output`\[`"Type"`\], `Failure`\[`"Type"`\] & [`Tagged`](#tagged), `R`\>

###### Parameters

###### input

`Input`\[`"Type"`\]

###### Returns

`Effect`\<`Output`\[`"Type"`\], `Failure`\[`"Type"`\] & [`Tagged`](#tagged), `R`\>

<a id="input-1"></a>

##### input

> `readonly` **input**: `Input`

<a id="name-1"></a>

##### name

> `readonly` **name**: `string`

<a id="output-1"></a>

##### output

> `readonly` **output**: `Output`

***

<a id="request"></a>

### Request

A request from an executing cell to a mounted host module.

#### Properties

<a id="cellid"></a>

##### cellId?

> `readonly` `optional` **cellId?**: `string`

The cell that raised this request.

<a id="input-2"></a>

##### input

> `readonly` **input**: `unknown`

<a id="module-5"></a>

##### module

> `readonly` **module**: `string`

<a id="operation-4"></a>

##### operation

> `readonly` **operation**: `string`

<a id="sessionid"></a>

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

The Session whose cell raised this request.

***

<a id="service"></a>

### Service

The seam by which a host mounts named Schema-typed modules into the kernel
namespace and answers requests from an executing cell.

#### Properties

<a id="descriptors"></a>

##### descriptors

> `readonly` **descriptors**: readonly [`Descriptor`](#descriptor)[]

<a id="invoke"></a>

##### invoke

> `readonly` **invoke**: (`request`) => `Effect`\<[`Response`](#response), [`BindingFailure`](#bindingfailure)\>

###### Parameters

###### request

[`Request`](#request)

###### Returns

`Effect`\<[`Response`](#response), [`BindingFailure`](#bindingfailure)\>

<a id="resolve"></a>

##### resolve

> `readonly` **resolve**: (`request`) => `Effect`\<[`AnyOperation`](#anyoperation)\<`never`\>, [`HostModuleNotFound`](#hostmodulenotfound)\>

###### Parameters

###### request

[`Request`](#request)

###### Returns

`Effect`\<[`AnyOperation`](#anyoperation)\<`never`\>, [`HostModuleNotFound`](#hostmodulenotfound)\>

***

<a id="tagged"></a>

### Tagged

Every host operation failure is tagged, so a cell can discriminate it as data.

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `string`

## Type Aliases

<a id="anyoperation"></a>

### AnyOperation

> **AnyOperation**\<`R`\> = [`Operation`](#operation-3)\<`BoundarySchema`, `BoundarySchema`, `BoundarySchema`, `R`\>

#### Type Parameters

##### R

`R` = `never`

***

<a id="bindingfailure"></a>

### BindingFailure

> **BindingFailure** = [`HostModuleNotFound`](#hostmodulenotfound) \| [`HostModuleSchemaFailure`](#hostmoduleschemafailure)

Closed union of host-module boundary failures.

***

<a id="response"></a>

### Response

> **Response** = \{ `_tag`: `"Success"`; `output`: `unknown`; \} \| \{ `_tag`: `"Failure"`; `failure`: `unknown`; \}

Encoded outcome returned to the cell that issued the request.

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: \<`R`\>(`modules`) => `Layer.Layer`\<[`HostBindings`](#hostbindings), [`HostModuleConflict`](#hostmoduleconflict), `R`\>

#### Type Parameters

##### R

`R`

#### Parameters

##### modules

`ReadonlyArray`\<[`Module`](#module-4)\<`R`\>\>

#### Returns

`Layer.Layer`\<[`HostBindings`](#hostbindings), [`HostModuleConflict`](#hostmoduleconflict), `R`\>

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`HostBindings`](#hostbindings)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`HostBindings`](#hostbindings)\>

***

<a id="make"></a>

### make

> `const` **make**: \<`R`\>(`modules`) => `Effect.Effect`\<[`Service`](#service), [`HostModuleConflict`](#hostmoduleconflict), `R`\>

Mount modules and reject duplicate module or operation names.

#### Type Parameters

##### R

`R`

#### Parameters

##### modules

`ReadonlyArray`\<[`Module`](#module-4)\<`R`\>\>

#### Returns

`Effect.Effect`\<[`Service`](#service), [`HostModuleConflict`](#hostmoduleconflict), `R`\>
