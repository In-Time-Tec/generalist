[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Policy

# Policy

## Classes

### PolicyError

A turn policy could not evaluate its decision.

#### Extends

- `PolicyError_base`

#### Constructors

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

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`PolicyError_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PolicyError_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`PolicyError_base.message`

## Interfaces

### BothSnapshot

Portable constructor data for two composed portable policies.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Both"`

##### first

> `readonly` **first**: [`Snapshot`](#snapshot-1)

##### second

> `readonly` **second**: [`Snapshot`](#snapshot-1)

***

### BudgetExhausted

A named policy budget was exhausted.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"BudgetExhausted"`

##### budget

> `readonly` **budget**: `string`

***

### Continue

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Continue"`

##### overrides?

> `readonly` `optional` **overrides?**: [`TurnOverrides`](#turnoverrides)

***

### CustomReason

A custom policy stopped for a host-defined detail.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Policy"`

##### detail

> `readonly` **detail**: `string`

***

### ForeverSnapshot

Portable constructor data for unbounded continuation.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Forever"`

***

### GoalSatisfied

The policy determined that the run's goal is satisfied.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"GoalSatisfied"`

***

### Policy

A turn policy in the spirit of `Schedule`.

#### Type Parameters

##### R

`R` = `never`

#### Properties

##### decide

> `readonly` **decide**: (`info`) => `Effect`\<[`Decision`](#decision), [`PolicyError`](#policyerror), `R`\>

###### Parameters

###### info

[`TurnInfo`](#turninfo)

###### Returns

`Effect`\<[`Decision`](#decision), [`PolicyError`](#policyerror), `R`\>

##### snapshot?

> `readonly` `optional` **snapshot?**: [`Snapshot`](#snapshot-1)

***

### RecursSnapshot

Portable constructor data for a recursive follow-up cap.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Recurs"`

##### count

> `readonly` **count**: `number`

***

### Stop

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Stop"`

##### reason

> `readonly` **reason**: \{ `_tag`: `"TurnLimit"`; `limit`: `number`; \} \| \{ `_tag`: `"GoalSatisfied"`; \} \| \{ `_tag`: `"BudgetExhausted"`; `budget`: `string`; \} \| \{ `_tag`: `"Policy"`; `detail`: `string`; \}

***

### TurnInfo

Snapshot given to a policy before each follow-up turn.

#### Properties

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

##### history

> `readonly` **history**: `Prompt`

##### pendingToolResults

> `readonly` **pendingToolResults**: readonly `ToolResultPart`\<`string`, `unknown`, `unknown`\>[]

##### turn

> `readonly` **turn**: `number`

***

### TurnLimit

A configured follow-up turn cap was exhausted.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"TurnLimit"`

##### limit

> `readonly` **limit**: `number`

***

### TurnOverrides

Per-turn overrides applied when a policy continues.

#### Properties

##### activeTools?

> `readonly` `optional` **activeTools?**: readonly `string`[]

##### instructions?

> `readonly` `optional` **instructions?**: `string`

##### model?

> `readonly` `optional` **model?**: `Layer`\<`LanguageModel`, `never`, `never`\>

***

### UntilToolCallSnapshot

Portable constructor data for a named-tool stop policy.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"UntilToolCall"`

##### name

> `readonly` **name**: `string`

## Type Aliases

### Decision

> **Decision** = [`Continue`](#continue) \| [`Stop`](#stop)

***

### Snapshot

> **Snapshot** = [`ForeverSnapshot`](#foreversnapshot) \| [`RecursSnapshot`](#recurssnapshot) \| [`UntilToolCallSnapshot`](#untiltoolcallsnapshot) \| [`BothSnapshot`](#bothsnapshot)

Portable constructor data exposed by built-in turn policies.

***

### StopReason

> **StopReason** = *typeof* `StopReason.Type`

Schema-backed reason for a successful policy stop.

## Variables

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

### decision

> `const` **decision**: `object`

#### Type Declaration

##### continue

> **continue**: (`overrides?`) => [`Continue`](#continue)

###### Parameters

###### overrides?

[`TurnOverrides`](#turnoverrides)

###### Returns

[`Continue`](#continue)

##### stop

> **stop**: (`reason`) => [`Stop`](#stop)

###### Parameters

###### reason

\{ `_tag`: `"TurnLimit"`; `limit`: `number`; \} \| \{ `_tag`: `"GoalSatisfied"`; \} \| \{ `_tag`: `"BudgetExhausted"`; `budget`: `string`; \} \| \{ `_tag`: `"Policy"`; `detail`: `string`; \}

###### Returns

[`Stop`](#stop)

***

### defaultPolicy

> `const` **defaultPolicy**: [`Policy`](#policy)

Default policy: `forever` — no framework-imposed follow-up cap.

***

### forever

> `const` **forever**: [`Policy`](#policy)

Continue after every turn; a run still completes naturally without pending tool results.

***

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

### recurs

> `const` **recurs**: (`n`) => [`Policy`](#policy)

Continue for at most `n` follow-up turns after the first.

#### Parameters

##### n

`number`

#### Returns

[`Policy`](#policy)

***

### StopReason

> `const` **StopReason**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"TurnLimit"`\>; `limit`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"GoalSatisfied"`\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"BudgetExhausted"`\>; `budget`: `Schema.String`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Policy"`\>; `detail`: `Schema.String`; \}\>\]\>

Schema-backed reason for a successful policy stop.

***

### untilToolCall

> `const` **untilToolCall**: (`name`) => [`Policy`](#policy)

Continue while a named tool has not yet been called this run.

#### Parameters

##### name

`string`

#### Returns

[`Policy`](#policy)
