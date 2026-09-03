[**generalist**](../../index)

***

[generalist](../../index) / [unstable.rl-export](../index) / Reward

# Reward

## Classes

### RewardInvalid

**`Experimental`**

A reward policy returned a value that cannot be journaled.

#### Extends

- `RewardInvalid_base`

#### Constructors

##### Constructor

> **new RewardInvalid**(...`args`): [`RewardInvalid`](#rewardinvalid)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`RewardInvalid`](#rewardinvalid)

###### Inherited from

`RewardInvalid_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`RewardInvalid_base.hint`

##### leaf

> `readonly` **leaf**: `string`

**`Experimental`**

###### Inherited from

`RewardInvalid_base.leaf`

##### source

> `readonly` **source**: `string`

**`Experimental`**

###### Inherited from

`RewardInvalid_base.source`

##### value

> `readonly` **value**: `number`

**`Experimental`**

###### Inherited from

`RewardInvalid_base.value`

## Interfaces

### Input

**`Experimental`**

Facts available to one scalar reward policy.

#### Properties

##### leaf

> `readonly` **leaf**: `string`

**`Experimental`**

##### messages

> `readonly` **messages**: `Prompt`

**`Experimental`**

##### runId

> `readonly` **runId**: `string`

**`Experimental`**

##### trajectory

> `readonly` **trajectory**: `object`

**`Experimental`**

###### agent

> `readonly` **agent**: `string`

###### budget?

> `readonly` `optional` **budget?**: `object`

Agent budget allocation when the journal's executable manifest declares one.

###### budget.children?

> `readonly` `optional` **children?**: `number`

###### budget.duration?

> `readonly` `optional` **duration?**: `number`

###### budget.tokens?

> `readonly` `optional` **tokens?**: `number`

###### budget.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### budget.usd?

> `readonly` `optional` **usd?**: `number`

###### gates

> `readonly` **gates**: readonly `object`[]

###### input

> `readonly` **input**: `Prompt`

###### output

> `readonly` **output**: `unknown`

###### runId

> `readonly` **runId**: `string`

###### stopReason

> `readonly` **stopReason**: `string`

###### turns

> `readonly` **turns**: readonly `object`[]

***

### Service

**`Experimental`**

A directly supplied reward service.

#### Type Parameters

##### R

`R` = `never`

##### E

`E` = `never`

#### Properties

##### evaluate

> `readonly` **evaluate**: (`input`) => `Effect`\<`number`, `E`, `R`\>

**`Experimental`**

###### Parameters

###### input

[`Input`](#input)

###### Returns

`Effect`\<`number`, `E`, `R`\>

##### source

> `readonly` **source**: `string`

**`Experimental`**

## Variables

### fromEval

> `const` **fromEval**: \<`R`, `E`\>(`scorers`) => [`Service`](#service)\<`R`, `E`\>

**`Experimental`**

Average existing eval scorer values into one scalar reward.

#### Type Parameters

##### R

`R`

##### E

`E`

#### Parameters

##### scorers

`ReadonlyArray`\<[`Scorer`](../../eval#scorer)\<`R`, `E`\>\>

#### Returns

[`Service`](#service)\<`R`, `E`\>

***

### fromGates

> `const` **fromGates**: [`Service`](#service)

**`Experimental`**

Score one when every completion gate's latest verdict passes, otherwise zero.

***

### make

> `const` **make**: \{\<`R`, `E`\>(`evaluate`): (`source`) => [`Service`](#service)\<`R`, `E`\>; \<`R`, `E`\>(`source`, `evaluate`): [`Service`](#service)\<`R`, `E`\>; \}

**`Experimental`**

Build a reward service from a custom Effect or evaluator.

#### Call Signature

> \<`R`, `E`\>(`evaluate`): (`source`) => [`Service`](#service)\<`R`, `E`\>

##### Type Parameters

###### R

`R` = `never`

###### E

`E` = `never`

##### Parameters

###### evaluate

`Evaluate`\<`R`, `E`\>

##### Returns

(`source`) => [`Service`](#service)\<`R`, `E`\>

#### Call Signature

> \<`R`, `E`\>(`source`, `evaluate`): [`Service`](#service)\<`R`, `E`\>

##### Type Parameters

###### R

`R` = `never`

###### E

`E` = `never`

##### Parameters

###### source

`string`

###### evaluate

`Evaluate`\<`R`, `E`\>

##### Returns

[`Service`](#service)\<`R`, `E`\>
