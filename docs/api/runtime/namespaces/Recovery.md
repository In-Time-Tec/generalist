[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Recovery

# Recovery

## Interfaces

### Journal

Store-neutral facts read atomically from one Run journal.

#### Properties

##### actions

> `readonly` **actions**: readonly `object` & `object`[]

##### failure?

> `readonly` `optional` **failure?**: `unknown`

##### lastSequence

> `readonly` **lastSequence**: `number`

##### operations

> `readonly` **operations**: readonly [`JournalOperation`](#journaloperation)[]

##### runId

> `readonly` **runId**: `string`

##### status

> `readonly` **status**: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`

##### suspension?

> `readonly` `optional` **suspension?**: [`ExecutionSuspension`](./ExecutionState#executionsuspension)

##### waits

> `readonly` **waits**: readonly `object`[]

***

### JournalOperation

One operation fact needed to derive recovery from the authoritative journal.

#### Properties

##### attempt

> `readonly` **attempt**: `number`

##### operationId

> `readonly` **operationId**: `string`

##### replay

> `readonly` **replay**: `"never"` \| `"safe"`

##### status

> `readonly` **status**: `"unknown"` \| `"running"` \| `"waiting"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"` \| `"requested"` \| `"reserved"`

***

### OperatorActionInput

#### Extended by

- [`RetryInput`](#retryinput)
- [`ResolveUnknownInput`](#resolveunknowninput)

#### Properties

##### operator

> `readonly` **operator**: `string`

##### runId

> `readonly` **runId**: `string`

***

### ResolveUnknownInput

#### Extends

- [`OperatorActionInput`](#operatoractioninput)

#### Properties

##### operationId

> `readonly` **operationId**: `string`

##### operator

> `readonly` **operator**: `string`

###### Inherited from

[`OperatorActionInput`](#operatoractioninput).[`operator`](#operator)

##### resolution

> `readonly` **resolution**: \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \} \| \{ \}

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`OperatorActionInput`](#operatoractioninput).[`runId`](#runid-1)

***

### RetryInput

#### Extends

- [`OperatorActionInput`](#operatoractioninput)

#### Properties

##### operationId

> `readonly` **operationId**: `string`

##### operator

> `readonly` **operator**: `string`

###### Inherited from

[`OperatorActionInput`](#operatoractioninput).[`operator`](#operator)

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`OperatorActionInput`](#operatoractioninput).[`runId`](#runid-1)

## Type Aliases

### Action

> **Action** = *typeof* `Action.Type`

***

### ActionRecord

> **ActionRecord** = *typeof* `ActionRecord.Type`

***

### Explanation

> **Explanation** = *typeof* `Explanation.Type`

***

### Obligation

> **Obligation** = *typeof* `Obligation.Type`

***

### RecoveryDecision

> **RecoveryDecision** = *typeof* `RecoveryDecision.Type`

***

### ResolveApprovalDecision

> **ResolveApprovalDecision** = [`Approved`](../../approvals#approved) \| [`Denied`](../../approvals#denied)

***

### UnknownResolution

> **UnknownResolution** = *typeof* `UnknownResolution.Type`

***

### Verification

> **Verification** = *typeof* `Verification.Type`

***

### WakeInput

> **WakeInput** = [`OperatorActionInput`](#operatoractioninput)

## Variables

### Action

> `const` **Action**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Retry"`, \{ `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Wake"`, \{ \}\>, `Schema.TaggedStruct`\<`"ResolveUnknown"`, \{ `operationId`: `Schema.String`; `resolution`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Succeeded"`, \{ `value`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Retry"`, \{ \}\>\]\>; \}\>, `Schema.TaggedStruct`\<`"ResolveApproval"`, \{ `decision`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<...\>; \}\>\]\>; `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ExtendBudget"`, \{ `delta`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>\]\>

***

### ActionRecord

> `const` **ActionRecord**: `Schema.Struct`\<\{ `action`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Retry"`, \{ `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Wake"`, \{ \}\>, `Schema.TaggedStruct`\<`"ResolveUnknown"`, \{ `operationId`: `Schema.String`; `resolution`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>\]\>; \}\>, `Schema.TaggedStruct`\<`"ResolveApproval"`, \{ `decision`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>\]\>; `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ExtendBudget"`, \{ `delta`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>\]\>; `operator`: `Schema.String`; \}\>

***

### explain

> `const` **explain**: (`journal`) => [`Explanation`](#explanation)

Pure projection from durable facts; no recovery decision is stored separately.

#### Parameters

##### journal

[`Journal`](#journal)

#### Returns

[`Explanation`](#explanation)

***

### Explanation

> `const` **Explanation**: `Schema.Struct`\<\{ `decision`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Resume"`, \{ \}\>, `Schema.TaggedStruct`\<`"RetryOperation"`, \{ `attempt`: `Schema.Int`; `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitApproval"`, \{ `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitBudget"`, \{ `budget`: `Schema.Literals`\<readonly \[`"tokens"`, `"usd"`, `"duration"`, `"toolCalls"`, `"children"`\]\>; \}\>, `Schema.TaggedStruct`\<`"Unknown"`, \{ `operationId`: `Schema.String`; `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>\]\>; `lastSequence`: `Schema.Int`; `obligations`: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Resume"`, \{ \}\>, `Schema.TaggedStruct`\<`"RetryOperation"`, \{ `attempt`: `Schema.Int`; `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitApproval"`, \{ `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitBudget"`, \{ `budget`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>; \}\>, `Schema.TaggedStruct`\<`"Unknown"`, \{ `operationId`: `Schema.String`; `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>\]\>\>; `status`: `Schema.Literals`\<readonly \[`"queued"`, `"running"`, `"waiting"`, `"needs-resolution"`, `"cancelling"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>

***

### Obligation

> `const` **Obligation**: `Schema.Struct`\<\{ `decision`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Resume"`, \{ \}\>, `Schema.TaggedStruct`\<`"RetryOperation"`, \{ `attempt`: `Schema.Int`; `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitApproval"`, \{ `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitBudget"`, \{ `budget`: `Schema.Literals`\<readonly \[`"tokens"`, `"usd"`, `"duration"`, `"toolCalls"`, `"children"`\]\>; \}\>, `Schema.TaggedStruct`\<`"Unknown"`, \{ `operationId`: `Schema.String`; `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>\]\>; `runId`: `Schema.String`; \}\>

***

### RecoveryDecision

> `const` **RecoveryDecision**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Resume"`, \{ \}\>, `Schema.TaggedStruct`\<`"RetryOperation"`, \{ `attempt`: `Schema.Int`; `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitApproval"`, \{ `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitBudget"`, \{ `budget`: `Schema.Literals`\<readonly \[`"tokens"`, `"usd"`, `"duration"`, `"toolCalls"`, `"children"`\]\>; \}\>, `Schema.TaggedStruct`\<`"Unknown"`, \{ `operationId`: `Schema.String`; `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>\]\>

***

### UnknownResolution

> `const` **UnknownResolution**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `outcome`: `Schema.Literal`\<`"succeeded"`\>; `result`: `Schema.Unknown`; \}\>, `Schema.Struct`\<\{ `error`: `Schema.Unknown`; `outcome`: `Schema.Literal`\<`"failed"`\>; \}\>\]\>

***

### Verification

> `const` **Verification**: `Schema.Struct`\<\{ `decision`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Resume"`, \{ \}\>, `Schema.TaggedStruct`\<`"RetryOperation"`, \{ `attempt`: `Schema.Int`; `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitApproval"`, \{ `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitBudget"`, \{ `budget`: `Schema.Literals`\<readonly \[`"tokens"`, `"usd"`, `"duration"`, `"toolCalls"`, `"children"`\]\>; \}\>, `Schema.TaggedStruct`\<`"Unknown"`, \{ `operationId`: `Schema.String`; `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>\]\>; `drift`: `Schema.$Array`\<`Schema.String`\>; `lastSequence`: `Schema.Int`; `obligations`: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Resume"`, \{ \}\>, `Schema.TaggedStruct`\<`"RetryOperation"`, \{ `attempt`: `Schema.Int`; `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitApproval"`, \{ `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitBudget"`, \{ `budget`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>; \}\>, `Schema.TaggedStruct`\<`"Unknown"`, \{ `operationId`: `Schema.String`; `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>\]\>\>; `status`: `Schema.Literals`\<readonly \[`"queued"`, `"running"`, `"waiting"`, `"needs-resolution"`, `"cancelling"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>

***

### verify

> `const` **verify**: (`journal`) => [`Verification`](#verification)

Recompute recovery and report contradictions between materialized Run state and its journal.

#### Parameters

##### journal

[`Journal`](#journal)

#### Returns

[`Verification`](#verification)
