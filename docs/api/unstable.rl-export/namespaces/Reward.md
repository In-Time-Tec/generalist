[**generalist**](../../index)

***

[generalist](../../index) / [unstable.rl-export](../index) / Reward

# Reward

## Classes

<a id="rewardinvalid"></a>

### RewardInvalid

**`Experimental`**

A reward policy returned a value that cannot be journaled.

#### Extends

- `RewardInvalid_base`

#### Constructors

<a id="constructor"></a>

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

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`RewardInvalid_base.hint`

<a id="leaf"></a>

##### leaf

> `readonly` **leaf**: `string`

**`Experimental`**

###### Inherited from

`RewardInvalid_base.leaf`

<a id="source"></a>

##### source

> `readonly` **source**: `string`

**`Experimental`**

###### Inherited from

`RewardInvalid_base.source`

<a id="value"></a>

##### value

> `readonly` **value**: `number`

**`Experimental`**

###### Inherited from

`RewardInvalid_base.value`

## Interfaces

<a id="input"></a>

### Input

**`Experimental`**

Facts available to one scalar reward policy.

#### Properties

<a id="leaf-1"></a>

##### leaf

> `readonly` **leaf**: `string`

**`Experimental`**

<a id="messages"></a>

##### messages

> `readonly` **messages**: `Prompt`

**`Experimental`**

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

**`Experimental`**

<a id="trajectory"></a>

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

<a id="service"></a>

### Service

**`Experimental`**

A directly supplied reward service.

#### Type Parameters

##### R

`R` = `never`

##### E

`E` = `never`

#### Properties

<a id="evaluate"></a>

##### evaluate

> `readonly` **evaluate**: (`input`) => `Effect`\<`number`, `E`, `R`\>

**`Experimental`**

###### Parameters

###### input

[`Input`](#input)

###### Returns

`Effect`\<`number`, `E`, `R`\>

<a id="source-1"></a>

##### source

> `readonly` **source**: `string`

**`Experimental`**

## Variables

<a id="fromeval"></a>

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

<a id="fromgates"></a>

### fromGates

> `const` **fromGates**: [`Service`](#service)

**`Experimental`**

Score one when every completion gate's latest verdict passes, otherwise zero.

***

<a id="make"></a>

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
