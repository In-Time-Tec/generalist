[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Fork

# Fork

## Interfaces

### ForkOptions

Select one committed journal prefix for a new Run.

#### Properties

##### atSequence

> `readonly` **atSequence**: `number`

##### substitute?

> `readonly` `optional` **substitute?**: [`Substitution`](#substitution)

***

### RewindOptions

Select one committed journal prefix for in-place continuation.

#### Properties

##### toSequence

> `readonly` **toSequence**: `number`

***

### Substitution

One completed tool result replaced before a counterfactual branch resumes.

#### Properties

##### operationId

> `readonly` **operationId**: `string`

##### result

> `readonly` **result**: `unknown`
