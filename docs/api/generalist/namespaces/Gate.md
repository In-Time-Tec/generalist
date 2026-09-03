[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Gate

# Gate

## Classes

### GateFailed

The configured failure mode rejected a proposed completion.

#### Extends

- `GateFailed_base`

#### Constructors

##### Constructor

> **new GateFailed**(...`args`): [`GateFailed`](#gatefailed)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`GateFailed`](#gatefailed)

###### Inherited from

`GateFailed_base.constructor`

#### Properties

##### gate

> `readonly` **gate**: `object`

###### evidence

> `readonly` **evidence**: `Json`

###### name

> `readonly` **name**: `string`

###### verdict

> `readonly` **verdict**: `"pass"` \| `"fail"`

###### Inherited from

`GateFailed_base.gate`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`GateFailed_base.hint`

## Interfaces

### Command

Run one shell command in the Sandbox owned by the proposing Agent.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Command"`

##### name

> `readonly` **name**: `string`

##### run

> `readonly` **run**: `string`

***

### Predicate

Evaluate application code against the decoded proposed output.

#### Type Parameters

##### Output

`Output` = `unknown`

##### R

`R` = `never`

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Predicate"`

##### check

> `readonly` **check**: (`output`) => `boolean` \| `Effect`\<`boolean`, `unknown`, `R`\>

###### Parameters

###### output

`Output`

###### Returns

`boolean` \| `Effect`\<`boolean`, `unknown`, `R`\>

##### name

> `readonly` **name**: `string`

##### requirements?

> `readonly` `optional` **requirements?**: () => `R`

###### Returns

`R`

***

### Verifier

Run one independent Agent and compare its structured score to a threshold.

#### Type Parameters

##### R

`R` = `never`

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Verifier"`

##### agent

> `readonly` **agent**: [`Any`](./Agent#any)

##### name

> `readonly` **name**: `string`

##### requirements?

> `readonly` `optional` **requirements?**: () => `R`

###### Returns

`R`

##### threshold

> `readonly` **threshold**: `number`

## Type Aliases

### Any

> **Any** = [`Gate`](#gate-1)\<`never`, `unknown`\>

One Gate with its output and requirement types hidden.

***

### Checkpoint

> **Checkpoint** = *typeof* `Checkpoint.Type`

**`Internal`**

One keyed result retained in the durable loop checkpoint.

***

### FailureMode

> **FailureMode** = `"retry"` \| `"fail"`

Behavior after the first gate that rejects a proposed output.

***

### Gate

> **Gate**\<`Output`, `R`\> = [`Command`](#command) \| [`Verifier`](#verifier)\<`R`\> \| [`Predicate`](#predicate)\<`Output`, `R`\>

One ordered completion gate.

#### Type Parameters

##### Output

`Output` = `unknown`

##### R

`R` = `never`

***

### Requirements

> **Requirements**\<`G`\> = `G` *extends* [`Verifier`](#verifier)\<infer R\> \| [`Predicate`](#predicate)\<`never`, infer R\> ? `R` : `never`

Extract a Gate's Effect requirements.

#### Type Parameters

##### G

`G`

***

### Result

> **Result** = *typeof* `Result.Type`

Journaled evidence from one completion-gate decision.

***

### Verdict

> **Verdict** = *typeof* `Verdict.Type`

Whether one completion gate accepted or rejected a proposed terminal output.

***

### VerifierAgent

> **VerifierAgent**\<`R`\> = [`Agent`](./Agent#agent)\<`Record`\<`string`, `Tool.Any`\>, `R`, `R`, `R`, `Schema.Top`, `Schema.Top`\>

Verifier Agent shape retained after type erasure.

#### Type Parameters

##### R

`R`

***

### VerifierOutput

> **VerifierOutput** = *typeof* `VerifierOutput.Type`

Structured output required from a verifier Agent.

## Variables

### Checkpoint

> `const` **Checkpoint**: `Schema.Struct`\<\{ `key`: `Schema.String`; `result`: `Schema.Struct`\<\{ `evidence`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `name`: `Schema.String`; `verdict`: `Schema.Literals`\<readonly \[`"pass"`, `"fail"`\]\>; \}\>; `turn`: `Schema.Finite`; \}\>

**`Internal`**

One keyed result retained in the durable loop checkpoint.

***

### command

> `const` **command**: (`options`) => [`Command`](#command)

Construct a Sandbox command completion gate.

#### Parameters

##### options

###### name

`string`

###### run

`string`

#### Returns

[`Command`](#command)

***

### predicate

> `const` **predicate**: \<`Output`, `R`\>(`options`) => [`Predicate`](#predicate)\<`Output`, `R`\>

Construct an application predicate completion gate.

#### Type Parameters

##### Output

`Output`

##### R

`R` = `never`

#### Parameters

##### options

###### check

(`output`) => `boolean` \| `Effect.Effect`\<`boolean`, `unknown`, `R`\>

###### name

`string`

#### Returns

[`Predicate`](#predicate)\<`Output`, `R`\>

***

### Result

> `const` **Result**: `Schema.Struct`\<\{ `evidence`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `name`: `Schema.String`; `verdict`: `Schema.Literals`\<readonly \[`"pass"`, `"fail"`\]\>; \}\>

Journaled evidence from one completion-gate decision.

***

### validateAgentGates

> `const` **validateAgentGates**: (`input`) => `void`

**`Internal`**

Validate Agent-owned gate configuration while the Agent is constructed.

#### Parameters

##### input

###### failureMode

[`FailureMode`](#failuremode)

###### gates

`ReadonlyArray`\<\{ `_tag`: `string`; `name`: `string`; \}\>

###### sandbox

[`SandboxService`](../../sandbox#sandboxservice) \| `undefined`

#### Returns

`void`

***

### Verdict

> `const` **Verdict**: `Schema.Literals`\<readonly \[`"pass"`, `"fail"`\]\>

Whether one completion gate accepted or rejected a proposed terminal output.

***

### verifier

> `const` **verifier**: \<`A`\>(`options`) => [`Verifier`](#verifier)\<[`Requirements`](./Agent#requirements-1)\<`A`\>\>

Construct an isolated Agent verifier completion gate.

#### Type Parameters

##### A

`A` *extends* [`Any`](./Agent#any)

#### Parameters

##### options

###### agent

`A`

###### name

`string`

###### threshold

`number`

#### Returns

[`Verifier`](#verifier)\<[`Requirements`](./Agent#requirements-1)\<`A`\>\>

***

### VerifierOutput

> `const` **VerifierOutput**: `Schema.Struct`\<\{ `evidence`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `score`: `Schema.Finite`; \}\>

Structured output required from a verifier Agent.
