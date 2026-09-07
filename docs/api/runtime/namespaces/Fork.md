[**generalist**](../../index.md)

***

[generalist](../../index.md) / [runtime](../index.md) / Fork

# Fork

## Interfaces

<a id="forkoptions"></a>

### ForkOptions

Select one committed journal prefix for a new Run.

#### Properties

<a id="atsequence"></a>

##### atSequence

> `readonly` **atSequence**: `number`

<a id="budget"></a>

##### budget?

> `readonly` `optional` **budget?**: `object`

New allocation reserved from the current budget owner; required for a bounded source.

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

<a id="commandid"></a>

##### commandId

> `readonly` **commandId**: `string`

<a id="programbudget"></a>

##### programBudget?

> `readonly` `optional` **programBudget?**: `object`

Separately reserved additive Program resources; a fork never copies its source's allowance.

###### agentRuns

> `readonly` **agentRuns**: `number`

###### concurrency

> `readonly` **concurrency**: `number`

###### logBytes

> `readonly` **logBytes**: `number`

###### outputBytes

> `readonly` **outputBytes**: `number`

###### tokens

> `readonly` **tokens**: `number`

###### toolCalls

> `readonly` **toolCalls**: `number`

###### wallClockMillis

> `readonly` **wallClockMillis**: `number`

<a id="substitute"></a>

##### substitute?

> `readonly` `optional` **substitute?**: [`Substitution`](#substitution)

***

<a id="rewindoptions"></a>

### RewindOptions

Select one committed journal prefix for in-place continuation.

#### Properties

<a id="budget-1"></a>

##### budget?

> `readonly` `optional` **budget?**: `object`

Required when a settled child must reserve new capacity from its current ancestor budget owner.

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

<a id="commandid-1"></a>

##### commandId

> `readonly` **commandId**: `string`

<a id="tosequence"></a>

##### toSequence

> `readonly` **toSequence**: `number`

***

<a id="substitution"></a>

### Substitution

One completed tool result replaced before a counterfactual branch resumes.

#### Properties

<a id="operationid"></a>

##### operationId

> `readonly` **operationId**: `string`

<a id="result"></a>

##### result

> `readonly` **result**: `unknown`
