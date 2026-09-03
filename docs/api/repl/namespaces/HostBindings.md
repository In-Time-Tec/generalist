[**generalist**](../../index)

***

[generalist](../../index) / [repl](../index) / HostBindings

# HostBindings

## Classes

### HostBindings

#### Extends

- `HostBindings_base`

#### Constructors

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

### HostModuleConflict

Two modules or two operations claimed the same mounted name.

#### Extends

- `HostModuleConflict_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`HostModuleConflict_base.hint`

##### module

> `readonly` **module**: `string`

###### Inherited from

`HostModuleConflict_base.module`

##### operation?

> `readonly` `optional` **operation?**: `string`

###### Inherited from

`HostModuleConflict_base.operation`

***

### HostModuleNotFound

The cell addressed a module or operation that is not mounted.

#### Extends

- `HostModuleNotFound_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`HostModuleNotFound_base.hint`

##### module

> `readonly` **module**: `string`

###### Inherited from

`HostModuleNotFound_base.module`

##### operation?

> `readonly` `optional` **operation?**: `string`

###### Inherited from

`HostModuleNotFound_base.operation`

***

### HostModuleSchemaFailure

A host request or reply did not match the operation's declared schema.

#### Extends

- `HostModuleSchemaFailure_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`HostModuleSchemaFailure_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`HostModuleSchemaFailure_base.message`

##### module

> `readonly` **module**: `string`

###### Inherited from

`HostModuleSchemaFailure_base.module`

##### operation

> `readonly` **operation**: `string`

###### Inherited from

`HostModuleSchemaFailure_base.operation`

##### stage

> `readonly` **stage**: `"decode-input"` \| `"encode-output"` \| `"encode-failure"`

###### Inherited from

`HostModuleSchemaFailure_base.stage`

## Interfaces

### Descriptor

The mounted surface a cell can see, without any handler.

#### Properties

##### module

> `readonly` **module**: `string`

##### operations

> `readonly` **operations**: readonly `string`[]

***

### Module

One named module of operations, mounted as a single kernel binding.

#### Type Parameters

##### R

`R` = `never`

#### Properties

##### name

> `readonly` **name**: `string`

##### operations

> `readonly` **operations**: readonly [`AnyOperation`](#anyoperation)\<`R`\>[]

***

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

##### failure

> `readonly` **failure**: `Failure`

##### handle

> `readonly` **handle**: (`input`) => `Effect`\<`Output`\[`"Type"`\], `Failure`\[`"Type"`\] & [`Tagged`](#tagged), `R`\>

###### Parameters

###### input

`Input`\[`"Type"`\]

###### Returns

`Effect`\<`Output`\[`"Type"`\], `Failure`\[`"Type"`\] & [`Tagged`](#tagged), `R`\>

##### input

> `readonly` **input**: `Input`

##### name

> `readonly` **name**: `string`

##### output

> `readonly` **output**: `Output`

***

### Request

A request from an executing cell to a mounted host module.

#### Properties

##### cellId?

> `readonly` `optional` **cellId?**: `string`

The cell that raised this request.

##### input

> `readonly` **input**: `unknown`

##### module

> `readonly` **module**: `string`

##### operation

> `readonly` **operation**: `string`

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

The Session whose cell raised this request.

***

### Service

The seam by which a host mounts named Schema-typed modules into the kernel
namespace and answers requests from an executing cell.

#### Properties

##### descriptors

> `readonly` **descriptors**: readonly [`Descriptor`](#descriptor)[]

##### invoke

> `readonly` **invoke**: (`request`) => `Effect`\<[`Response`](#response), [`BindingFailure`](#bindingfailure)\>

###### Parameters

###### request

[`Request`](#request)

###### Returns

`Effect`\<[`Response`](#response), [`BindingFailure`](#bindingfailure)\>

##### resolve

> `readonly` **resolve**: (`request`) => `Effect`\<[`AnyOperation`](#anyoperation)\<`never`\>, [`HostModuleNotFound`](#hostmodulenotfound)\>

###### Parameters

###### request

[`Request`](#request)

###### Returns

`Effect`\<[`AnyOperation`](#anyoperation)\<`never`\>, [`HostModuleNotFound`](#hostmodulenotfound)\>

***

### Tagged

Every host operation failure is tagged, so a cell can discriminate it as data.

#### Properties

##### \_tag

> `readonly` **\_tag**: `string`

## Type Aliases

### AnyOperation

> **AnyOperation**\<`R`\> = [`Operation`](#operation-3)\<`BoundarySchema`, `BoundarySchema`, `BoundarySchema`, `R`\>

#### Type Parameters

##### R

`R` = `never`

***

### BindingFailure

> **BindingFailure** = [`HostModuleNotFound`](#hostmodulenotfound) \| [`HostModuleSchemaFailure`](#hostmoduleschemafailure)

Closed union of host-module boundary failures.

***

### Response

> **Response** = \{ `_tag`: `"Success"`; `output`: `unknown`; \} \| \{ `_tag`: `"Failure"`; `failure`: `unknown`; \}

Encoded outcome returned to the cell that issued the request.

## Variables

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

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`HostBindings`](#hostbindings)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`HostBindings`](#hostbindings)\>

***

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
