[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Policy

# Policy

## Classes

<a id="policyerror"></a>

### PolicyError

A turn policy could not evaluate its decision.

#### Extends

- `PolicyError_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new PolicyError**(...`args`): [`PolicyError`](#policyerror)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`PolicyError`](#policyerror)

###### Inherited from

`PolicyError_base.constructor`

#### Properties

<a id="cause"></a>

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`PolicyError_base.cause`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PolicyError_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`PolicyError_base.message`

## Interfaces

<a id="bothsnapshot"></a>

### BothSnapshot

Portable constructor data for two composed portable policies.

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"Both"`

<a id="first"></a>

##### first

> `readonly` **first**: [`Snapshot`](#snapshot-1)

<a id="second"></a>

##### second

> `readonly` **second**: [`Snapshot`](#snapshot-1)

***

<a id="budgetexhausted"></a>

### BudgetExhausted

A named policy budget was exhausted.

#### Properties

<a id="_tag-1"></a>

##### \_tag

> `readonly` **\_tag**: `"BudgetExhausted"`

<a id="budget"></a>

##### budget

> `readonly` **budget**: `string`

***

<a id="continue"></a>

### Continue

#### Properties

<a id="_tag-2"></a>

##### \_tag

> `readonly` **\_tag**: `"Continue"`

<a id="overrides"></a>

##### overrides?

> `readonly` `optional` **overrides?**: [`TurnOverrides`](#turnoverrides)

***

<a id="customreason"></a>

### CustomReason

A custom policy stopped for a host-defined detail.

#### Properties

<a id="_tag-3"></a>

##### \_tag

> `readonly` **\_tag**: `"Policy"`

<a id="detail"></a>

##### detail

> `readonly` **detail**: `string`

***

<a id="foreversnapshot"></a>

### ForeverSnapshot

Portable constructor data for unbounded continuation.

#### Properties

<a id="_tag-4"></a>

##### \_tag

> `readonly` **\_tag**: `"Forever"`

***

<a id="goalsatisfied"></a>

### GoalSatisfied

The policy determined that the run's goal is satisfied.

#### Properties

<a id="_tag-5"></a>

##### \_tag

> `readonly` **\_tag**: `"GoalSatisfied"`

***

<a id="policy"></a>

### Policy

A turn policy in the spirit of `Schedule`.

#### Type Parameters

##### R

`R` = `never`

#### Properties

<a id="decide"></a>

##### decide

> `readonly` **decide**: (`info`) => `Effect`\<[`Decision`](#decision), [`PolicyError`](#policyerror), `R`\>

###### Parameters

###### info

[`TurnInfo`](#turninfo)

###### Returns

`Effect`\<[`Decision`](#decision), [`PolicyError`](#policyerror), `R`\>

<a id="snapshot"></a>

##### snapshot?

> `readonly` `optional` **snapshot?**: [`Snapshot`](#snapshot-1)

***

<a id="recurssnapshot"></a>

### RecursSnapshot

Portable constructor data for a recursive follow-up cap.

#### Properties

<a id="_tag-6"></a>

##### \_tag

> `readonly` **\_tag**: `"Recurs"`

<a id="count"></a>

##### count

> `readonly` **count**: `number`

***

<a id="stop"></a>

### Stop

#### Properties

<a id="_tag-7"></a>

##### \_tag

> `readonly` **\_tag**: `"Stop"`

<a id="reason"></a>

##### reason

> `readonly` **reason**: \{ `_tag`: `"TurnLimit"`; `limit`: `number`; \} \| \{ `_tag`: `"GoalSatisfied"`; \} \| \{ `_tag`: `"BudgetExhausted"`; `budget`: `string`; \} \| \{ `_tag`: `"Policy"`; `detail`: `string`; \}

***

<a id="turninfo"></a>

### TurnInfo

Snapshot given to a policy before each follow-up turn.

#### Properties

<a id="budget-1"></a>

##### budget

> `readonly` **budget**: `object`

###### children?

> `readonly` `optional` **children?**: `number`

###### duration?

> `readonly` `optional` **duration?**: `number`

###### tokens?

> `readonly` `optional` **tokens?**: `number`

###### toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### usd?

> `readonly` `optional` **usd?**: `number`

<a id="history"></a>

##### history

> `readonly` **history**: `Prompt`

<a id="pendingtoolresults"></a>

##### pendingToolResults

> `readonly` **pendingToolResults**: readonly `ToolResultPart`\<`string`, `unknown`, `unknown`\>[]

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="turnlimit"></a>

### TurnLimit

A configured follow-up turn cap was exhausted.

#### Properties

<a id="_tag-8"></a>

##### \_tag

> `readonly` **\_tag**: `"TurnLimit"`

<a id="limit"></a>

##### limit

> `readonly` **limit**: `number`

***

<a id="turnoverrides"></a>

### TurnOverrides

Per-turn overrides applied when a policy continues.

#### Properties

<a id="activetools"></a>

##### activeTools?

> `readonly` `optional` **activeTools?**: readonly `string`[]

<a id="instructions"></a>

##### instructions?

> `readonly` `optional` **instructions?**: `string`

<a id="model"></a>

##### model?

> `readonly` `optional` **model?**: `Layer`\<`LanguageModel`, `never`, `never`\>

***

<a id="untiltoolcallsnapshot"></a>

### UntilToolCallSnapshot

Portable constructor data for a named-tool stop policy.

#### Properties

<a id="_tag-9"></a>

##### \_tag

> `readonly` **\_tag**: `"UntilToolCall"`

<a id="name"></a>

##### name

> `readonly` **name**: `string`

## Type Aliases

<a id="decision"></a>

### Decision

> **Decision** = [`Continue`](#continue) \| [`Stop`](#stop)

***

<a id="snapshot-1"></a>

### Snapshot

> **Snapshot** = [`ForeverSnapshot`](#foreversnapshot) \| [`RecursSnapshot`](#recurssnapshot) \| [`UntilToolCallSnapshot`](#untiltoolcallsnapshot) \| [`BothSnapshot`](#bothsnapshot)

Portable constructor data exposed by built-in turn policies.

***

<a id="stopreason-1"></a>

### StopReason

> **StopReason** = *typeof* `StopReason.Type`

Schema-backed reason for a successful policy stop.

## Variables

<a id="both"></a>

### both

> `const` **both**: \{\<`R2`\>(`second`): \<`R1`\>(`first`) => [`Policy`](#policy)\<`R2` \| `R1`\>; \<`R1`, `R2`\>(`first`, `second`): [`Policy`](#policy)\<`R1` \| `R2`\>; \}

Both must continue; overrides merge with `second` winning.

#### Call Signature

> \<`R2`\>(`second`): \<`R1`\>(`first`) => [`Policy`](#policy)\<`R2` \| `R1`\>

##### Type Parameters

###### R2

`R2`

##### Parameters

###### second

[`Policy`](#policy)\<`R2`\>

##### Returns

\<`R1`\>(`first`) => [`Policy`](#policy)\<`R2` \| `R1`\>

#### Call Signature

> \<`R1`, `R2`\>(`first`, `second`): [`Policy`](#policy)\<`R1` \| `R2`\>

##### Type Parameters

###### R1

`R1`

###### R2

`R2`

##### Parameters

###### first

[`Policy`](#policy)\<`R1`\>

###### second

[`Policy`](#policy)\<`R2`\>

##### Returns

[`Policy`](#policy)\<`R1` \| `R2`\>

***

<a id="decision-1"></a>

### decision

> `const` **decision**: `object`

#### Type Declaration

<a id="continue-1"></a>

##### continue

> **continue**: (`overrides?`) => [`Continue`](#continue)

###### Parameters

###### overrides?

[`TurnOverrides`](#turnoverrides)

###### Returns

[`Continue`](#continue)

<a id="stop-1"></a>

##### stop

> **stop**: (`reason`) => [`Stop`](#stop)

###### Parameters

###### reason

\{ `_tag`: `"TurnLimit"`; `limit`: `number`; \} \| \{ `_tag`: `"GoalSatisfied"`; \} \| \{ `_tag`: `"BudgetExhausted"`; `budget`: `string`; \} \| \{ `_tag`: `"Policy"`; `detail`: `string`; \}

###### Returns

[`Stop`](#stop)

***

<a id="defaultpolicy"></a>

### defaultPolicy

> `const` **defaultPolicy**: [`Policy`](#policy)

Default policy: `forever` — no framework-imposed follow-up cap.

***

<a id="forever"></a>

### forever

> `const` **forever**: [`Policy`](#policy)

Continue after every turn; a run still completes naturally without pending tool results.

***

<a id="make"></a>

### make

> `const` **make**: \<`R`\>(`decide`) => [`Policy`](#policy)\<`R`\>

Construct a policy from a decide function.

#### Type Parameters

##### R

`R` = `never`

#### Parameters

##### decide

(`info`) => `Effect.Effect`\<[`Decision`](#decision), [`PolicyError`](#policyerror), `R`\>

#### Returns

[`Policy`](#policy)\<`R`\>

***

<a id="recurs"></a>

### recurs

> `const` **recurs**: (`n`) => [`Policy`](#policy)

Continue for at most `n` follow-up turns after the first.

#### Parameters

##### n

`number`

#### Returns

[`Policy`](#policy)

***

<a id="stopreason-2"></a>

### StopReason

> `const` **StopReason**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"TurnLimit"`\>; `limit`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"GoalSatisfied"`\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"BudgetExhausted"`\>; `budget`: `Schema.String`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Policy"`\>; `detail`: `Schema.String`; \}\>\]\>

Schema-backed reason for a successful policy stop.

***

<a id="untiltoolcall"></a>

### untilToolCall

> `const` **untilToolCall**: (`name`) => [`Policy`](#policy)

Continue while a named tool has not yet been called this run.

#### Parameters

##### name

`string`

#### Returns

[`Policy`](#policy)
