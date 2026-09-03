[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Gate

# Gate

## Classes

<a id="gatefailed"></a>

### GateFailed

The configured failure mode rejected a proposed completion.

#### Extends

- `GateFailed_base`

#### Constructors

<a id="constructor"></a>

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

<a id="gate"></a>

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

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`GateFailed_base.hint`

## Interfaces

<a id="command"></a>

### Command

Run one shell command in the Sandbox owned by the proposing Agent.

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"Command"`

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="run"></a>

##### run

> `readonly` **run**: `string`

***

<a id="predicate"></a>

### Predicate

Evaluate application code against the decoded proposed output.

#### Type Parameters

##### Output

`Output` = `unknown`

##### R

`R` = `never`

#### Properties

<a id="_tag-1"></a>

##### \_tag

> `readonly` **\_tag**: `"Predicate"`

<a id="check"></a>

##### check

> `readonly` **check**: (`output`) => `boolean` \| `Effect`\<`boolean`, `unknown`, `R`\>

###### Parameters

###### output

`Output`

###### Returns

`boolean` \| `Effect`\<`boolean`, `unknown`, `R`\>

<a id="name-1"></a>

##### name

> `readonly` **name**: `string`

<a id="requirements"></a>

##### requirements?

> `readonly` `optional` **requirements?**: () => `R`

###### Returns

`R`

***

<a id="verifier"></a>

### Verifier

Run one independent Agent and compare its structured score to a threshold.

#### Type Parameters

##### R

`R` = `never`

#### Properties

<a id="_tag-2"></a>

##### \_tag

> `readonly` **\_tag**: `"Verifier"`

<a id="agent"></a>

##### agent

> `readonly` **agent**: [`Any`](./Agent#any)

<a id="name-2"></a>

##### name

> `readonly` **name**: `string`

<a id="requirements-1"></a>

##### requirements?

> `readonly` `optional` **requirements?**: () => `R`

###### Returns

`R`

<a id="threshold"></a>

##### threshold

> `readonly` **threshold**: `number`

## Type Aliases

<a id="any"></a>

### Any

> **Any** = [`Gate`](#gate-1)\<`never`, `unknown`\>

One Gate with its output and requirement types hidden.

***

<a id="checkpoint"></a>

### Checkpoint

> **Checkpoint** = *typeof* `Checkpoint.Type`

**`Internal`**

One keyed result retained in the durable loop checkpoint.

***

<a id="failuremode"></a>

### FailureMode

> **FailureMode** = `"retry"` \| `"fail"`

Behavior after the first gate that rejects a proposed output.

***

<a id="gate-1"></a>

### Gate

> **Gate**\<`Output`, `R`\> = [`Command`](#command) \| [`Verifier`](#verifier)\<`R`\> \| [`Predicate`](#predicate)\<`Output`, `R`\>

One ordered completion gate.

#### Type Parameters

##### Output

`Output` = `unknown`

##### R

`R` = `never`

***

<a id="requirements-2"></a>

### Requirements

> **Requirements**\<`G`\> = `G` *extends* [`Verifier`](#verifier)\<infer R\> \| [`Predicate`](#predicate)\<`never`, infer R\> ? `R` : `never`

Extract a Gate's Effect requirements.

#### Type Parameters

##### G

`G`

***

<a id="result"></a>

### Result

> **Result** = *typeof* `Result.Type`

Journaled evidence from one completion-gate decision.

***

<a id="verdict"></a>

### Verdict

> **Verdict** = *typeof* `Verdict.Type`

Whether one completion gate accepted or rejected a proposed terminal output.

***

<a id="verifieragent-1"></a>

### VerifierAgent

> **VerifierAgent**\<`R`\> = [`Agent`](./Agent#agent)\<`Record`\<`string`, `Tool.Any`\>, `R`, `R`, `R`, `Schema.Top`, `Schema.Top`\>

Verifier Agent shape retained after type erasure.

#### Type Parameters

##### R

`R`

***

<a id="verifieroutput"></a>

### VerifierOutput

> **VerifierOutput** = *typeof* `VerifierOutput.Type`

Structured output required from a verifier Agent.

## Variables

<a id="checkpoint-1"></a>

### Checkpoint

> `const` **Checkpoint**: `Schema.Struct`\<\{ `key`: `Schema.String`; `result`: `Schema.Struct`\<\{ `evidence`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `name`: `Schema.String`; `verdict`: `Schema.Literals`\<readonly \[`"pass"`, `"fail"`\]\>; \}\>; `turn`: `Schema.Finite`; \}\>

**`Internal`**

One keyed result retained in the durable loop checkpoint.

***

<a id="command-1"></a>

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

<a id="predicate-1"></a>

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

<a id="result-1"></a>

### Result

> `const` **Result**: `Schema.Struct`\<\{ `evidence`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `name`: `Schema.String`; `verdict`: `Schema.Literals`\<readonly \[`"pass"`, `"fail"`\]\>; \}\>

Journaled evidence from one completion-gate decision.

***

<a id="validateagentgates"></a>

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

<a id="verdict-1"></a>

### Verdict

> `const` **Verdict**: `Schema.Literals`\<readonly \[`"pass"`, `"fail"`\]\>

Whether one completion gate accepted or rejected a proposed terminal output.

***

<a id="verifier-1"></a>

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

<a id="verifieroutput-1"></a>

### VerifierOutput

> `const` **VerifierOutput**: `Schema.Struct`\<\{ `evidence`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `score`: `Schema.Finite`; \}\>

Structured output required from a verifier Agent.
