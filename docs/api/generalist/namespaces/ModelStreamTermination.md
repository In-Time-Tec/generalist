[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ModelStreamTermination

# ModelStreamTermination

## Classes

### Timeout

A provider part stream exceeded its configured idle deadline.

#### Extends

- `Timeout_base`

#### Constructors

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

##### emitted

> `readonly` **emitted**: \{ `_tag`: `"Nothing"`; \} \| \{ `_tag`: `"DisplayOnly"`; `characters`: `number`; \} \| \{ `_tag`: `"OpenToolCall"`; `characters`: `number`; `toolCallId`: `string`; `toolName`: `string`; \}

###### Inherited from

`Timeout_base.emitted`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Timeout_base.hint`

##### idleMillis

> `readonly` **idleMillis**: `number`

###### Inherited from

`Timeout_base.idleMillis`

##### lastPart?

> `readonly` `optional` **lastPart?**: `string`

###### Inherited from

`Timeout_base.lastPart`

##### model?

> `readonly` `optional` **model?**: `string`

###### Inherited from

`Timeout_base.model`

##### provider?

> `readonly` `optional` **provider?**: `string`

###### Inherited from

`Timeout_base.provider`

##### requestId?

> `readonly` `optional` **requestId?**: `string`

###### Inherited from

`Timeout_base.requestId`

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`Timeout_base.turn`

***

### Truncated

A provider part stream reached a clean end without its terminal
`finish` part, so the attempt produced no finish reason and no usage.

#### Extends

- `Truncated_base`

#### Constructors

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

##### emitted

> `readonly` **emitted**: \{ `_tag`: `"Nothing"`; \} \| \{ `_tag`: `"DisplayOnly"`; `characters`: `number`; \} \| \{ `_tag`: `"OpenToolCall"`; `characters`: `number`; `toolCallId`: `string`; `toolName`: `string`; \}

###### Inherited from

`Truncated_base.emitted`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Truncated_base.hint`

##### lastPart?

> `readonly` `optional` **lastPart?**: `string`

###### Inherited from

`Truncated_base.lastPart`

##### model?

> `readonly` `optional` **model?**: `string`

###### Inherited from

`Truncated_base.model`

##### provider?

> `readonly` `optional` **provider?**: `string`

###### Inherited from

`Truncated_base.provider`

##### requestId?

> `readonly` `optional` **requestId?**: `string`

###### Inherited from

`Truncated_base.requestId`

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`Truncated_base.turn`

## Interfaces

### Origin

Provenance stamped onto a termination failure.

#### Properties

##### model

> `readonly` **model**: `string` \| `undefined`

##### provider

> `readonly` **provider**: `string` \| `undefined`

##### turn

> `readonly` **turn**: `number`

## Type Aliases

### EmittedOutput

> **EmittedOutput** = *typeof* `EmittedOutput.Type`

What already escaped downstream when a model part stream ended
without its terminal `finish` part. `Nothing` means no part a consumer would
render or replay reached it, so the attempt can be retried without
duplicating transcript content.

***

### TerminationFailure

> **TerminationFailure** = [`Truncated`](#truncated) \| [`Timeout`](#timeout)

A model part stream did not reach a provider-reported terminal event.

## Variables

### EmittedOutput

> `const` **EmittedOutput**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Nothing"`\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"DisplayOnly"`\>; `characters`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"OpenToolCall"`\>; `characters`: `Schema.Finite`; `toolCallId`: `Schema.String`; `toolName`: `Schema.String`; \}\>\]\>

What already escaped downstream when a model part stream ended
without its terminal `finish` part. `Nothing` means no part a consumer would
render or replay reached it, so the attempt can be retried without
duplicating transcript content.

***

### isTerminationFailure

> `const` **isTerminationFailure**: (`cause`) => `cause is TerminationFailure`

Whether a failure means the stream did not reach its terminal event.

#### Parameters

##### cause

`unknown`

#### Returns

`cause is TerminationFailure`

***

### isTimeout

> `const` **isTimeout**: (`cause`) => `cause is Timeout`

Whether a model stream exceeded its configured idle deadline.

#### Parameters

##### cause

`unknown`

#### Returns

`cause is Timeout`

***

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
