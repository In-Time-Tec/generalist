[**generalist**](./index)

***

[generalist](./index) / unstable.providers.model-route

# unstable.providers.model-route

## Classes

<a id="availabilitysemanticsmissing"></a>

### AvailabilitySemanticsMissing

**`Experimental`**

An ordered candidate route contains a candidate without provider-approved availability semantics.

#### Extends

- `AvailabilitySemanticsMissing_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new AvailabilitySemanticsMissing**(...`args`): [`AvailabilitySemanticsMissing`](#availabilitysemanticsmissing)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AvailabilitySemanticsMissing`](#availabilitysemanticsmissing)

###### Inherited from

`AvailabilitySemanticsMissing_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`AvailabilitySemanticsMissing_base.hint`

<a id="model"></a>

##### model

> `readonly` **model**: `string`

**`Experimental`**

###### Inherited from

`AvailabilitySemanticsMissing_base.model`

<a id="provider"></a>

##### provider

> `readonly` **provider**: `string`

**`Experimental`**

###### Inherited from

`AvailabilitySemanticsMissing_base.provider`

<a id="registrationkey"></a>

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

**`Experimental`**

###### Inherited from

`AvailabilitySemanticsMissing_base.registrationKey`

## Interfaces

<a id="input"></a>

### Input

**`Experimental`**

#### Properties

<a id="candidates"></a>

##### candidates

> `readonly` **candidates**: readonly \[[`Registration`](./generalist/namespaces/ModelRegistry#registration-1), [`Registration`](./generalist/namespaces/ModelRegistry#registration-1)\]

**`Experimental`**

***

<a id="route"></a>

### Route

**`Experimental`**

#### Properties

<a id="registration"></a>

##### registration

> `readonly` **registration**: [`Registration`](./generalist/namespaces/ModelRegistry#registration-1)

**`Experimental`**

<a id="selection"></a>

##### selection

> `readonly` **selection**: [`ModelSelection`](./generalist/namespaces/ModelRegistry#modelselection)

**`Experimental`**

## Variables

<a id="make"></a>

### make

> `const` **make**: (`input`) => `Effect.Effect`\<[`Route`](#route), [`AvailabilitySemanticsMissing`](#availabilitysemanticsmissing)\>

**`Experimental`**

Construct one exact registry selection and its immutable ordered candidate registration.

#### Parameters

##### input

[`Input`](#input)

#### Returns

`Effect.Effect`\<[`Route`](#route), [`AvailabilitySemanticsMissing`](#availabilitysemanticsmissing)\>
