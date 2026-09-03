[**generalist**](./index)

***

[generalist](./index) / unstable.providers.model-route

# unstable.providers.model-route

## Classes

### AvailabilitySemanticsMissing

**`Experimental`**

An ordered candidate route contains a candidate without provider-approved availability semantics.

#### Extends

- `AvailabilitySemanticsMissing_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`AvailabilitySemanticsMissing_base.hint`

##### model

> `readonly` **model**: `string`

**`Experimental`**

###### Inherited from

`AvailabilitySemanticsMissing_base.model`

##### provider

> `readonly` **provider**: `string`

**`Experimental`**

###### Inherited from

`AvailabilitySemanticsMissing_base.provider`

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

**`Experimental`**

###### Inherited from

`AvailabilitySemanticsMissing_base.registrationKey`

## Interfaces

### Input

**`Experimental`**

#### Properties

##### candidates

> `readonly` **candidates**: readonly \[[`Registration`](./generalist/namespaces/ModelRegistry#registration-1), [`Registration`](./generalist/namespaces/ModelRegistry#registration-1)\]

**`Experimental`**

***

### Route

**`Experimental`**

#### Properties

##### registration

> `readonly` **registration**: [`Registration`](./generalist/namespaces/ModelRegistry#registration-1)

**`Experimental`**

##### selection

> `readonly` **selection**: [`ModelSelection`](./generalist/namespaces/ModelRegistry#modelselection)

**`Experimental`**

## Variables

### make

> `const` **make**: (`input`) => `Effect.Effect`\<[`Route`](#route), [`AvailabilitySemanticsMissing`](#availabilitysemanticsmissing)\>

**`Experimental`**

Construct one exact registry selection and its immutable ordered candidate registration.

#### Parameters

##### input

[`Input`](#input)

#### Returns

`Effect.Effect`\<[`Route`](#route), [`AvailabilitySemanticsMissing`](#availabilitysemanticsmissing)\>
