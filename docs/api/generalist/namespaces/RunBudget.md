[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / RunBudget

# RunBudget

## Classes

<a id="exhausted"></a>

### Exhausted

#### Extends

- `Exhausted_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new Exhausted**(...`args`): [`Exhausted`](#exhausted)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`Exhausted`](#exhausted)

###### Inherited from

`Exhausted_base.constructor`

#### Properties

<a id="budget"></a>

##### budget

> `readonly` **budget**: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`

###### Inherited from

`Exhausted_base.budget`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Exhausted_base.hint`

<a id="remaining"></a>

##### remaining?

> `readonly` `optional` **remaining?**: `number`

###### Inherited from

`Exhausted_base.remaining`

<a id="requested"></a>

##### requested

> `readonly` **requested**: `number`

###### Inherited from

`Exhausted_base.requested`

***

<a id="invalid"></a>

### Invalid

Invalid serialized child grant or extension.

#### Extends

- `Invalid_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new Invalid**(...`args`): [`Invalid`](#invalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`Invalid`](#invalid)

###### Inherited from

`Invalid_base.constructor`

#### Properties

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Invalid_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`Invalid_base.message`

## Interfaces

<a id="input"></a>

### Input

#### Properties

<a id="children"></a>

##### children?

> `readonly` `optional` **children?**: `number`

<a id="duration"></a>

##### duration?

> `readonly` `optional` **duration?**: `Input`

<a id="tokens"></a>

##### tokens?

> `readonly` `optional` **tokens?**: `number`

<a id="toolcalls"></a>

##### toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

<a id="usd"></a>

##### usd?

> `readonly` `optional` **usd?**: `number`

## Type Aliases

<a id="budgetexhausted"></a>

### BudgetExhausted

> **BudgetExhausted** = *typeof* `BudgetExhausted.Type`

Durable non-terminal suspension reason.

***

<a id="budgetlimits"></a>

### BudgetLimits

> **BudgetLimits** = *typeof* `BudgetLimits.Type`

Normalized portable limits. Duration is milliseconds.

***

<a id="dimension"></a>

### Dimension

> **Dimension** = *typeof* `Dimension.Type`

***

<a id="remaining-1"></a>

### Remaining

> **Remaining** = *typeof* `Remaining.Type`

***

<a id="runbudget"></a>

### RunBudget

> **RunBudget** = *typeof* `RunBudget.Type`

One allocation and its transient loop remainder. Durable Runtime spend is projected from journal facts.

***

<a id="spend"></a>

### Spend

> **Spend** = *typeof* `Spend.Type`

## Variables

<a id="budgetexhausted-1"></a>

### BudgetExhausted

> `const` **BudgetExhausted**: `Schema.TaggedStruct`\<`"BudgetExhausted"`, \{ `budget`: `Schema.Literals`\<readonly \[`"tokens"`, `"usd"`, `"duration"`, `"toolCalls"`, `"children"`\]\>; \}\>

Durable non-terminal suspension reason.

***

<a id="budgetlimits-1"></a>

### BudgetLimits

> `const` **BudgetLimits**: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

Normalized portable limits. Duration is milliseconds.

***

<a id="charge"></a>

### charge

> `const` **charge**: \{(`usage`): (`budget`) => `Effect`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}, [`Exhausted`](#exhausted)\>; (`budget`, `usage`): `Effect`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}, [`Exhausted`](#exhausted)\>; \}

Charge transient loop state. Runtime reconstructs this state from its journal before replay.

#### Call Signature

> (`usage`): (`budget`) => `Effect`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}, [`Exhausted`](#exhausted)\>

##### Parameters

###### usage

###### children?

`Schema.optionalKey`\<`Schema.Finite`\>

###### duration?

`Schema.optionalKey`\<`Schema.Finite`\>

###### tokens?

`Schema.optionalKey`\<`Schema.Finite`\>

###### toolCalls?

`Schema.optionalKey`\<`Schema.Finite`\>

###### usd?

`Schema.optionalKey`\<`Schema.Finite`\>

##### Returns

(`budget`) => `Effect`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}, [`Exhausted`](#exhausted)\>

#### Call Signature

> (`budget`, `usage`): `Effect`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}, [`Exhausted`](#exhausted)\>

##### Parameters

###### budget

###### allocation

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### usage

###### children?

`Schema.optionalKey`\<`Schema.Finite`\>

###### duration?

`Schema.optionalKey`\<`Schema.Finite`\>

###### tokens?

`Schema.optionalKey`\<`Schema.Finite`\>

###### toolCalls?

`Schema.optionalKey`\<`Schema.Finite`\>

###### usd?

`Schema.optionalKey`\<`Schema.Finite`\>

##### Returns

`Effect`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}, [`Exhausted`](#exhausted)\>

***

<a id="childgrant"></a>

### childGrant

> `const` **childGrant**: \{(`admittedChildren`): (`remaining`) => `object`; (`remaining`, `admittedChildren`): `object`; \}

Aggregate limits available after reserving the child admissions themselves.

#### Call Signature

> (`admittedChildren`): (`remaining`) => `object`

##### Parameters

###### admittedChildren

`number`

##### Returns

(`remaining`) => `object`

#### Call Signature

> (`remaining`, `admittedChildren`): `object`

##### Parameters

###### remaining

###### children?

`Schema.optionalKey`\<`Schema.Finite`\>

###### duration?

`Schema.optionalKey`\<`Schema.Finite`\>

###### tokens?

`Schema.optionalKey`\<`Schema.Finite`\>

###### toolCalls?

`Schema.optionalKey`\<`Schema.Finite`\>

###### usd?

`Schema.optionalKey`\<`Schema.Union`\<readonly \[`Schema.Finite`, `Schema.Literal`\<`"unknown"`\>\]\>\>

###### admittedChildren

`number`

##### Returns

`object`

###### children?

> `readonly` `optional` **children?**: `Schema.optionalKey`\<`Schema.Finite`\>

###### duration?

> `readonly` `optional` **duration?**: `Schema.optionalKey`\<`Schema.Finite`\>

###### tokens?

> `readonly` `optional` **tokens?**: `Schema.optionalKey`\<`Schema.Finite`\>

###### toolCalls?

> `readonly` `optional` **toolCalls?**: `Schema.optionalKey`\<`Schema.Finite`\>

###### usd?

> `readonly` `optional` **usd?**: `Schema.optionalKey`\<`Schema.Finite`\>

***

<a id="dimension-1"></a>

### Dimension

> `const` **Dimension**: `Schema.Literals`\<readonly \[`"tokens"`, `"usd"`, `"duration"`, `"toolCalls"`, `"children"`\]\>

***

<a id="extend"></a>

### extend

> `const` **extend**: \{(`delta`): (`budget`) => `object`; (`budget`, `delta`): `object`; \}

#### Call Signature

> (`delta`): (`budget`) => `object`

##### Parameters

###### delta

[`Input`](#input)

##### Returns

(`budget`) => `object`

#### Call Signature

> (`budget`, `delta`): `object`

##### Parameters

###### budget

###### allocation

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### delta

[`Input`](#input)

##### Returns

`object`

###### allocation

> `readonly` **allocation**: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

> `readonly` **remaining**: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

***

<a id="inspect"></a>

### inspect

> `const` **inspect**: \{(`spend`): (`budget`) => `object`; (`budget`, `spend`): `object`; \}

#### Call Signature

> (`spend`): (`budget`) => `object`

##### Parameters

###### spend

###### children

`Schema.Finite`

###### duration

`Schema.Finite`

###### tokens

`Schema.Finite`

###### toolCalls

`Schema.Finite`

###### usd

`Schema.Union`\<readonly \[`Schema.Finite`, `Schema.Literal`\<`"unknown"`\>\]\>

##### Returns

(`budget`) => `object`

#### Call Signature

> (`budget`, `spend`): `object`

##### Parameters

###### budget

###### allocation

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### spend

###### children

`Schema.Finite`

###### duration

`Schema.Finite`

###### tokens

`Schema.Finite`

###### toolCalls

`Schema.Finite`

###### usd

`Schema.Union`\<readonly \[`Schema.Finite`, `Schema.Literal`\<`"unknown"`\>\]\>

##### Returns

`object`

###### children?

> `readonly` `optional` **children?**: `Schema.optionalKey`\<`Schema.Finite`\>

###### duration?

> `readonly` `optional` **duration?**: `Schema.optionalKey`\<`Schema.Finite`\>

###### tokens?

> `readonly` `optional` **tokens?**: `Schema.optionalKey`\<`Schema.Finite`\>

###### toolCalls?

> `readonly` `optional` **toolCalls?**: `Schema.optionalKey`\<`Schema.Finite`\>

###### usd?

> `readonly` `optional` **usd?**: `Schema.optionalKey`\<`Schema.Union`\<readonly \[`Schema.Finite`, `Schema.Literal`\<`"unknown"`\>\]\>\>

***

<a id="make"></a>

### make

> `const` **make**: (`input`) => [`RunBudget`](#runbudget)

Construct one validated in-memory budget.

#### Parameters

##### input

[`Input`](#input)

#### Returns

[`RunBudget`](#runbudget)

***

<a id="narrowchild"></a>

### narrowChild

> `const` **narrowChild**: \{(`child`, `narrower`): (`parent`) => `Effect`\<\{ `child`: [`RunBudget`](#runbudget); `parent`: [`RunBudget`](#runbudget); \}, [`Invalid`](#invalid)\>; (`parent`, `child`, `narrower`): `Effect`\<\{ `child`: [`RunBudget`](#runbudget); `parent`: [`RunBudget`](#runbudget); \}, [`Invalid`](#invalid)\>; \}

#### Call Signature

> (`child`, `narrower`): (`parent`) => `Effect`\<\{ `child`: [`RunBudget`](#runbudget); `parent`: [`RunBudget`](#runbudget); \}, [`Invalid`](#invalid)\>

##### Parameters

###### child

###### allocation

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### narrower

###### children?

`Schema.optionalKey`\<`Schema.Finite`\>

###### duration?

`Schema.optionalKey`\<`Schema.Finite`\>

###### tokens?

`Schema.optionalKey`\<`Schema.Finite`\>

###### toolCalls?

`Schema.optionalKey`\<`Schema.Finite`\>

###### usd?

`Schema.optionalKey`\<`Schema.Finite`\>

##### Returns

(`parent`) => `Effect`\<\{ `child`: [`RunBudget`](#runbudget); `parent`: [`RunBudget`](#runbudget); \}, [`Invalid`](#invalid)\>

#### Call Signature

> (`parent`, `child`, `narrower`): `Effect`\<\{ `child`: [`RunBudget`](#runbudget); `parent`: [`RunBudget`](#runbudget); \}, [`Invalid`](#invalid)\>

##### Parameters

###### parent

###### allocation

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### child

###### allocation

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### narrower

###### children?

`Schema.optionalKey`\<`Schema.Finite`\>

###### duration?

`Schema.optionalKey`\<`Schema.Finite`\>

###### tokens?

`Schema.optionalKey`\<`Schema.Finite`\>

###### toolCalls?

`Schema.optionalKey`\<`Schema.Finite`\>

###### usd?

`Schema.optionalKey`\<`Schema.Finite`\>

##### Returns

`Effect`\<\{ `child`: [`RunBudget`](#runbudget); `parent`: [`RunBudget`](#runbudget); \}, [`Invalid`](#invalid)\>

***

<a id="refundunused"></a>

### refundUnused

> `const` **refundUnused**: \{(`child`): (`parent`) => `object`; (`parent`, `child`): `object`; \}

#### Call Signature

> (`child`): (`parent`) => `object`

##### Parameters

###### child

###### allocation

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

##### Returns

(`parent`) => `object`

#### Call Signature

> (`parent`, `child`): `object`

##### Parameters

###### parent

###### allocation

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### child

###### allocation

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

##### Returns

`object`

###### allocation

> `readonly` **allocation**: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

> `readonly` **remaining**: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

***

<a id="remaining-2"></a>

### Remaining

> `const` **Remaining**: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Union`\<readonly \[`Schema.Finite`, `Schema.Literal`\<`"unknown"`\>\]\>\>; \}\>

***

<a id="reservechild"></a>

### reserveChild

> `const` **reserveChild**: \{(`grant`): (`parent`) => `Effect`\<\{ `child`: [`RunBudget`](#runbudget); `parent`: [`RunBudget`](#runbudget); \}, [`Exhausted`](#exhausted) \| [`Invalid`](#invalid)\>; (`parent`, `grant`): `Effect`\<\{ `child`: [`RunBudget`](#runbudget); `parent`: [`RunBudget`](#runbudget); \}, [`Exhausted`](#exhausted) \| [`Invalid`](#invalid)\>; \}

#### Call Signature

> (`grant`): (`parent`) => `Effect`\<\{ `child`: [`RunBudget`](#runbudget); `parent`: [`RunBudget`](#runbudget); \}, [`Exhausted`](#exhausted) \| [`Invalid`](#invalid)\>

##### Parameters

###### grant

###### children?

`Schema.optionalKey`\<`Schema.Finite`\>

###### duration?

`Schema.optionalKey`\<`Schema.Finite`\>

###### tokens?

`Schema.optionalKey`\<`Schema.Finite`\>

###### toolCalls?

`Schema.optionalKey`\<`Schema.Finite`\>

###### usd?

`Schema.optionalKey`\<`Schema.Finite`\>

##### Returns

(`parent`) => `Effect`\<\{ `child`: [`RunBudget`](#runbudget); `parent`: [`RunBudget`](#runbudget); \}, [`Exhausted`](#exhausted) \| [`Invalid`](#invalid)\>

#### Call Signature

> (`parent`, `grant`): `Effect`\<\{ `child`: [`RunBudget`](#runbudget); `parent`: [`RunBudget`](#runbudget); \}, [`Exhausted`](#exhausted) \| [`Invalid`](#invalid)\>

##### Parameters

###### parent

###### allocation

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### grant

###### children?

`Schema.optionalKey`\<`Schema.Finite`\>

###### duration?

`Schema.optionalKey`\<`Schema.Finite`\>

###### tokens?

`Schema.optionalKey`\<`Schema.Finite`\>

###### toolCalls?

`Schema.optionalKey`\<`Schema.Finite`\>

###### usd?

`Schema.optionalKey`\<`Schema.Finite`\>

##### Returns

`Effect`\<\{ `child`: [`RunBudget`](#runbudget); `parent`: [`RunBudget`](#runbudget); \}, [`Exhausted`](#exhausted) \| [`Invalid`](#invalid)\>

***

<a id="resolve"></a>

### resolve

> `const` **resolve**: \{(`runOverride?`): (`agentDefault?`) => `object`; (`agentDefault?`, `runOverride?`): `object`; \}

#### Call Signature

> (`runOverride?`): (`agentDefault?`) => `object`

##### Parameters

###### runOverride?

###### children?

`Schema.optionalKey`\<`Schema.Finite`\>

###### duration?

`Schema.optionalKey`\<`Schema.Finite`\>

###### tokens?

`Schema.optionalKey`\<`Schema.Finite`\>

###### toolCalls?

`Schema.optionalKey`\<`Schema.Finite`\>

###### usd?

`Schema.optionalKey`\<`Schema.Finite`\>

##### Returns

(`agentDefault?`) => `object`

#### Call Signature

> (`agentDefault?`, `runOverride?`): `object`

##### Parameters

###### agentDefault?

###### children?

`Schema.optionalKey`\<`Schema.Finite`\>

###### duration?

`Schema.optionalKey`\<`Schema.Finite`\>

###### tokens?

`Schema.optionalKey`\<`Schema.Finite`\>

###### toolCalls?

`Schema.optionalKey`\<`Schema.Finite`\>

###### usd?

`Schema.optionalKey`\<`Schema.Finite`\>

###### runOverride?

###### children?

`Schema.optionalKey`\<`Schema.Finite`\>

###### duration?

`Schema.optionalKey`\<`Schema.Finite`\>

###### tokens?

`Schema.optionalKey`\<`Schema.Finite`\>

###### toolCalls?

`Schema.optionalKey`\<`Schema.Finite`\>

###### usd?

`Schema.optionalKey`\<`Schema.Finite`\>

##### Returns

`object`

###### allocation

> `readonly` **allocation**: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

> `readonly` **remaining**: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

***

<a id="runbudget-1"></a>

### RunBudget

> `const` **RunBudget**: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>

One allocation and its transient loop remainder. Durable Runtime spend is projected from journal facts.

***

<a id="settlemodeltokens"></a>

### settleModelTokens

> `const` **settleModelTokens**: \{(`requested`): (`budget`) => `Settlement`; (`budget`, `requested`): `Settlement`; \}

#### Call Signature

> (`requested`): (`budget`) => `Settlement`

##### Parameters

###### requested

`number`

##### Returns

(`budget`) => `Settlement`

#### Call Signature

> (`budget`, `requested`): `Settlement`

##### Parameters

###### budget

###### allocation

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### requested

`number`

##### Returns

`Settlement`

***

<a id="spend-1"></a>

### Spend

> `const` **Spend**: `Schema.Struct`\<\{ `children`: `Schema.Finite`; `duration`: `Schema.Finite`; `tokens`: `Schema.Finite`; `toolCalls`: `Schema.Finite`; `usd`: `Schema.Union`\<readonly \[`Schema.Finite`, `Schema.Literal`\<`"unknown"`\>\]\>; \}\>

***

<a id="unbounded"></a>

### unbounded

> `const` **unbounded**: [`BudgetLimits`](#budgetlimits)

Explicitly unlimited allocation.

***

<a id="zerospend"></a>

### zeroSpend

> `const` **zeroSpend**: [`Spend`](#spend)
