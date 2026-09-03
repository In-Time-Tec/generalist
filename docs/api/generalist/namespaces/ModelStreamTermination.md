[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ModelStreamTermination

# ModelStreamTermination

## Classes

<a id="timeout"></a>

### Timeout

A provider part stream exceeded its configured idle deadline.

#### Extends

- `Timeout_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new Timeout**(...`args`): [`Timeout`](#timeout)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`Timeout`](#timeout)

###### Inherited from

`Timeout_base.constructor`

#### Properties

<a id="emitted"></a>

##### emitted

> `readonly` **emitted**: \{ `_tag`: `"Nothing"`; \} \| \{ `_tag`: `"DisplayOnly"`; `characters`: `number`; \} \| \{ `_tag`: `"OpenToolCall"`; `characters`: `number`; `toolCallId`: `string`; `toolName`: `string`; \}

###### Inherited from

`Timeout_base.emitted`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Timeout_base.hint`

<a id="idlemillis"></a>

##### idleMillis

> `readonly` **idleMillis**: `number`

###### Inherited from

`Timeout_base.idleMillis`

<a id="lastpart"></a>

##### lastPart?

> `readonly` `optional` **lastPart?**: `string`

###### Inherited from

`Timeout_base.lastPart`

<a id="model"></a>

##### model?

> `readonly` `optional` **model?**: `string`

###### Inherited from

`Timeout_base.model`

<a id="provider"></a>

##### provider?

> `readonly` `optional` **provider?**: `string`

###### Inherited from

`Timeout_base.provider`

<a id="requestid"></a>

##### requestId?

> `readonly` `optional` **requestId?**: `string`

###### Inherited from

`Timeout_base.requestId`

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`Timeout_base.turn`

***

<a id="truncated"></a>

### Truncated

A provider part stream reached a clean end without its terminal
`finish` part, so the attempt produced no finish reason and no usage.

#### Extends

- `Truncated_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new Truncated**(...`args`): [`Truncated`](#truncated)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`Truncated`](#truncated)

###### Inherited from

`Truncated_base.constructor`

#### Properties

<a id="emitted-1"></a>

##### emitted

> `readonly` **emitted**: \{ `_tag`: `"Nothing"`; \} \| \{ `_tag`: `"DisplayOnly"`; `characters`: `number`; \} \| \{ `_tag`: `"OpenToolCall"`; `characters`: `number`; `toolCallId`: `string`; `toolName`: `string`; \}

###### Inherited from

`Truncated_base.emitted`

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Truncated_base.hint`

<a id="lastpart-1"></a>

##### lastPart?

> `readonly` `optional` **lastPart?**: `string`

###### Inherited from

`Truncated_base.lastPart`

<a id="model-1"></a>

##### model?

> `readonly` `optional` **model?**: `string`

###### Inherited from

`Truncated_base.model`

<a id="provider-1"></a>

##### provider?

> `readonly` `optional` **provider?**: `string`

###### Inherited from

`Truncated_base.provider`

<a id="requestid-1"></a>

##### requestId?

> `readonly` `optional` **requestId?**: `string`

###### Inherited from

`Truncated_base.requestId`

<a id="turn-1"></a>

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`Truncated_base.turn`

## Interfaces

<a id="origin"></a>

### Origin

Provenance stamped onto a termination failure.

#### Properties

<a id="model-2"></a>

##### model

> `readonly` **model**: `string` \| `undefined`

<a id="provider-2"></a>

##### provider

> `readonly` **provider**: `string` \| `undefined`

<a id="turn-2"></a>

##### turn

> `readonly` **turn**: `number`

## Type Aliases

<a id="emittedoutput"></a>

### EmittedOutput

> **EmittedOutput** = *typeof* `EmittedOutput.Type`

What already escaped downstream when a model part stream ended
without its terminal `finish` part. `Nothing` means no part a consumer would
render or replay reached it, so the attempt can be retried without
duplicating transcript content.

***

<a id="terminationfailure"></a>

### TerminationFailure

> **TerminationFailure** = [`Truncated`](#truncated) \| [`Timeout`](#timeout)

A model part stream did not reach a provider-reported terminal event.

## Variables

<a id="emittedoutput-1"></a>

### EmittedOutput

> `const` **EmittedOutput**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Nothing"`\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"DisplayOnly"`\>; `characters`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"OpenToolCall"`\>; `characters`: `Schema.Finite`; `toolCallId`: `Schema.String`; `toolName`: `Schema.String`; \}\>\]\>

What already escaped downstream when a model part stream ended
without its terminal `finish` part. `Nothing` means no part a consumer would
render or replay reached it, so the attempt can be retried without
duplicating transcript content.

***

<a id="isterminationfailure"></a>

### isTerminationFailure

> `const` **isTerminationFailure**: (`cause`) => `cause is TerminationFailure`

Whether a failure means the stream did not reach its terminal event.

#### Parameters

##### cause

`unknown`

#### Returns

`cause is TerminationFailure`

***

<a id="istimeout"></a>

### isTimeout

> `const` **isTimeout**: (`cause`) => `cause is Timeout`

Whether a model stream exceeded its configured idle deadline.

#### Parameters

##### cause

`unknown`

#### Returns

`cause is Timeout`

***

<a id="requireterminal"></a>

### requireTerminal

> `const` **requireTerminal**: \{\<`A`\>(`options`): \<`E`, `R`\>(`self`) => `Stream`\<`A`, [`TerminationFailure`](#terminationfailure) \| `E`, `R`\>; \<`A`, `E`, `R`\>(`self`, `options`): `Stream`\<`A`, [`TerminationFailure`](#terminationfailure) \| `E`, `R`\>; \}

Fail a provider part stream that ended without its terminal
`finish` part. A clean end with no `finish` fails with `Truncated`.
When `idleTimeout` is present, a pull that exceeds it fails with
`Timeout`; absence applies no idle deadline.

#### Call Signature

> \<`A`\>(`options`): \<`E`, `R`\>(`self`) => `Stream`\<`A`, [`TerminationFailure`](#terminationfailure) \| `E`, `R`\>

##### Type Parameters

###### A

`A`

##### Parameters

###### options

[`Origin`](#origin) & `object`

##### Returns

\<`E`, `R`\>(`self`) => `Stream`\<`A`, [`TerminationFailure`](#terminationfailure) \| `E`, `R`\>

#### Call Signature

> \<`A`, `E`, `R`\>(`self`, `options`): `Stream`\<`A`, [`TerminationFailure`](#terminationfailure) \| `E`, `R`\>

##### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

##### Parameters

###### self

`Stream`\<`A`, `E`, `R`\>

###### options

[`Origin`](#origin) & `object`

##### Returns

`Stream`\<`A`, [`TerminationFailure`](#terminationfailure) \| `E`, `R`\>
