[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ModelResilience

# ModelResilience

## Classes

### Misconfigured

A model resilience policy contains an unsafe correction bound.

#### Extends

- `Misconfigured_base`

#### Constructors

##### Constructor

> **new Misconfigured**(...`args`): [`Misconfigured`](#misconfigured)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`Misconfigured`](#misconfigured)

###### Inherited from

`Misconfigured_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Misconfigured_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`Misconfigured_base.message`

##### reason

> `readonly` **reason**: `"invalid-tool-call-correction-limit"`

###### Inherited from

`Misconfigured_base.reason`

***

### ModelResilience

#### Extends

- `ModelResilience_base`

#### Constructors

##### Constructor

> **new ModelResilience**(`_`): [`ModelResilience`](#modelresilience)

###### Parameters

###### \_

`never`

###### Returns

[`ModelResilience`](#modelresilience)

###### Inherited from

`ModelResilience_base.constructor`

## Interfaces

### FailureInput

#### Properties

##### error

> `readonly` **error**: `unknown`

##### method

> `readonly` **method**: `Method`

***

### Policy

Retry and correction policy for one logical model call.

#### Properties

##### classify

> `readonly` **classify**: (`cause`) => [`Classification`](#classification)

###### Parameters

###### cause

`unknown`

###### Returns

[`Classification`](#classification)

##### invalidToolCallCorrectionLimit

> `readonly` **invalidToolCallCorrectionLimit**: `number`

##### resolve

> `readonly` **resolve**: [`FailureResolver`](#failureresolver)

##### retrySchedule

> `readonly` **retrySchedule**: `Schedule`\<`unknown`\>

##### streamIdleTimeout?

> `readonly` `optional` **streamIdleTimeout?**: `Input`

## Type Aliases

### Classification

> **Classification** = `"transient"` \| `"terminal"`

Classification of a model-call failure.

***

### FailureResolver

> **FailureResolver** = (`input`) => `AiError.AiError`

#### Parameters

##### input

[`FailureInput`](#failureinput)

#### Returns

`AiError.AiError`

## Variables

### apply

> `const` **apply**: \{(`resilience`): (`model`) => `Service`; (`model`, `resilience`): `Service`; \}

#### Call Signature

> (`resilience`): (`model`) => `Service`

##### Parameters

###### resilience

[`Policy`](#policy)

##### Returns

(`model`) => `Service`

#### Call Signature

> (`model`, `resilience`): `Service`

##### Parameters

###### model

`Service`

###### resilience

[`Policy`](#policy)

##### Returns

`Service`

***

### defaultClassify

> `const` **defaultClassify**: (`cause`) => [`Classification`](#classification)

A stream that ended without its terminal event is retryable
only while nothing a consumer would replay escaped downstream; retrying after
that would duplicate the consumer's transcript.

#### Parameters

##### cause

`unknown`

#### Returns

[`Classification`](#classification)

***

### defaultPolicy

> `const` **defaultPolicy**: [`Policy`](#policy)

***

### defaultResolveFailure

> `const` **defaultResolveFailure**: [`FailureResolver`](#failureresolver)

***

### layer

> `const` **layer**: (`input?`) => `Layer.Layer`\<[`ModelResilience`](#modelresilience), [`Misconfigured`](#misconfigured)\>

#### Parameters

##### input?

`Partial`\<[`Policy`](#policy)\>

#### Returns

`Layer.Layer`\<[`ModelResilience`](#modelresilience), [`Misconfigured`](#misconfigured)\>

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`ModelResilience`](#modelresilience), [`Misconfigured`](#misconfigured)\>

#### Parameters

##### implementation

[`Policy`](#policy)

#### Returns

`Layer.Layer`\<[`ModelResilience`](#modelresilience), [`Misconfigured`](#misconfigured)\>

***

### make

> `const` **make**: (`input?`) => `Effect.Effect`\<[`Policy`](#policy), [`Misconfigured`](#misconfigured)\>

#### Parameters

##### input?

`Partial`\<[`Policy`](#policy)\>

#### Returns

`Effect.Effect`\<[`Policy`](#policy), [`Misconfigured`](#misconfigured)\>

***

### none

> `const` **none**: [`Policy`](#policy)

***

### validate

> `const` **validate**: (`implementation`) => `Effect.Effect`\<[`Policy`](#policy), [`Misconfigured`](#misconfigured)\>

Validate a structurally supplied model resilience policy.

#### Parameters

##### implementation

[`Policy`](#policy)

#### Returns

`Effect.Effect`\<[`Policy`](#policy), [`Misconfigured`](#misconfigured)\>
