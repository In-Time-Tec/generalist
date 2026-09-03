[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ModelResilience

# ModelResilience

## Classes

<a id="misconfigured"></a>

### Misconfigured

A model resilience policy contains an unsafe correction bound.

#### Extends

- `Misconfigured_base`

#### Constructors

<a id="constructor"></a>

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

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Misconfigured_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`Misconfigured_base.message`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `"invalid-tool-call-correction-limit"`

###### Inherited from

`Misconfigured_base.reason`

***

<a id="modelresilience"></a>

### ModelResilience

#### Extends

- `ModelResilience_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="failureinput"></a>

### FailureInput

#### Properties

<a id="error"></a>

##### error

> `readonly` **error**: `unknown`

<a id="method"></a>

##### method

> `readonly` **method**: `Method`

***

<a id="policy"></a>

### Policy

Retry and correction policy for one logical model call.

#### Properties

<a id="classify"></a>

##### classify

> `readonly` **classify**: (`cause`) => [`Classification`](#classification)

###### Parameters

###### cause

`unknown`

###### Returns

[`Classification`](#classification)

<a id="invalidtoolcallcorrectionlimit"></a>

##### invalidToolCallCorrectionLimit

> `readonly` **invalidToolCallCorrectionLimit**: `number`

<a id="resolve"></a>

##### resolve

> `readonly` **resolve**: [`FailureResolver`](#failureresolver)

<a id="retryschedule"></a>

##### retrySchedule

> `readonly` **retrySchedule**: `Schedule`\<`unknown`\>

<a id="streamidletimeout"></a>

##### streamIdleTimeout?

> `readonly` `optional` **streamIdleTimeout?**: `Input`

## Type Aliases

<a id="classification"></a>

### Classification

> **Classification** = `"transient"` \| `"terminal"`

Classification of a model-call failure.

***

<a id="failureresolver"></a>

### FailureResolver

> **FailureResolver** = (`input`) => `AiError.AiError`

#### Parameters

##### input

[`FailureInput`](#failureinput)

#### Returns

`AiError.AiError`

## Variables

<a id="apply"></a>

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

<a id="defaultclassify"></a>

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

<a id="defaultpolicy"></a>

### defaultPolicy

> `const` **defaultPolicy**: [`Policy`](#policy)

***

<a id="defaultresolvefailure"></a>

### defaultResolveFailure

> `const` **defaultResolveFailure**: [`FailureResolver`](#failureresolver)

***

<a id="layer"></a>

### layer

> `const` **layer**: (`input?`) => `Layer.Layer`\<[`ModelResilience`](#modelresilience), [`Misconfigured`](#misconfigured)\>

#### Parameters

##### input?

`Partial`\<[`Policy`](#policy)\>

#### Returns

`Layer.Layer`\<[`ModelResilience`](#modelresilience), [`Misconfigured`](#misconfigured)\>

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`ModelResilience`](#modelresilience), [`Misconfigured`](#misconfigured)\>

#### Parameters

##### implementation

[`Policy`](#policy)

#### Returns

`Layer.Layer`\<[`ModelResilience`](#modelresilience), [`Misconfigured`](#misconfigured)\>

***

<a id="make"></a>

### make

> `const` **make**: (`input?`) => `Effect.Effect`\<[`Policy`](#policy), [`Misconfigured`](#misconfigured)\>

#### Parameters

##### input?

`Partial`\<[`Policy`](#policy)\>

#### Returns

`Effect.Effect`\<[`Policy`](#policy), [`Misconfigured`](#misconfigured)\>

***

<a id="none"></a>

### none

> `const` **none**: [`Policy`](#policy)

***

<a id="validate"></a>

### validate

> `const` **validate**: (`implementation`) => `Effect.Effect`\<[`Policy`](#policy), [`Misconfigured`](#misconfigured)\>

Validate a structurally supplied model resilience policy.

#### Parameters

##### implementation

[`Policy`](#policy)

#### Returns

`Effect.Effect`\<[`Policy`](#policy), [`Misconfigured`](#misconfigured)\>
