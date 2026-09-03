[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Fork

# Fork

## Interfaces

<a id="forkoptions"></a>

### ForkOptions

Select one committed journal prefix for a new Run.

#### Properties

<a id="atsequence"></a>

##### atSequence

> `readonly` **atSequence**: `number`

<a id="substitute"></a>

##### substitute?

> `readonly` `optional` **substitute?**: [`Substitution`](#substitution)

***

<a id="rewindoptions"></a>

### RewindOptions

Select one committed journal prefix for in-place continuation.

#### Properties

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
