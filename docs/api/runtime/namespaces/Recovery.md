[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Recovery

# Recovery

## Interfaces

<a id="journal"></a>

### Journal

Store-neutral facts read atomically from one Run journal.

#### Properties

<a id="actions"></a>

##### actions

> `readonly` **actions**: readonly `object` & `object`[]

<a id="failure"></a>

##### failure?

> `readonly` `optional` **failure?**: `unknown`

<a id="lastsequence"></a>

##### lastSequence

> `readonly` **lastSequence**: `number`

<a id="operations"></a>

##### operations

> `readonly` **operations**: readonly [`JournalOperation`](#journaloperation)[]

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

<a id="status"></a>

##### status

> `readonly` **status**: `"failed"` \| `"cancelled"` \| `"queued"` \| `"succeeded"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"`

<a id="suspension"></a>

##### suspension?

> `readonly` `optional` **suspension?**: [`ExecutionSuspension`](./ExecutionState#executionsuspension)

<a id="waits"></a>

##### waits

> `readonly` **waits**: readonly `object`[]

***

<a id="journaloperation"></a>

### JournalOperation

One operation fact needed to derive recovery from the authoritative journal.

#### Properties

<a id="attempt"></a>

##### attempt

> `readonly` **attempt**: `number`

<a id="operationid"></a>

##### operationId

> `readonly` **operationId**: `string`

<a id="replay"></a>

##### replay

> `readonly` **replay**: `"never"` \| `"safe"`

<a id="status-1"></a>

##### status

> `readonly` **status**: `"unknown"` \| `"failed"` \| `"cancelled"` \| `"succeeded"` \| `"running"` \| `"waiting"` \| `"cancelling"` \| `"requested"` \| `"reserved"`

***

<a id="operatoractioninput"></a>

### OperatorActionInput

#### Extended by

- [`RetryInput`](#retryinput)
- [`ResolveUnknownInput`](#resolveunknowninput)

#### Properties

<a id="operator"></a>

##### operator

> `readonly` **operator**: `string`

<a id="runid-1"></a>

##### runId

> `readonly` **runId**: `string`

***

<a id="resolveunknowninput"></a>

### ResolveUnknownInput

#### Extends

- [`OperatorActionInput`](#operatoractioninput)

#### Properties

<a id="operationid-1"></a>

##### operationId

> `readonly` **operationId**: `string`

<a id="operator-1"></a>

##### operator

> `readonly` **operator**: `string`

###### Inherited from

[`OperatorActionInput`](#operatoractioninput).[`operator`](#operator)

<a id="resolution"></a>

##### resolution

> `readonly` **resolution**: \{ `value`: `unknown`; \} \| \{ `error`: `unknown`; \} \| \{ \}

<a id="runid-2"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`OperatorActionInput`](#operatoractioninput).[`runId`](#runid-1)

***

<a id="retryinput"></a>

### RetryInput

#### Extends

- [`OperatorActionInput`](#operatoractioninput)

#### Properties

<a id="operationid-2"></a>

##### operationId

> `readonly` **operationId**: `string`

<a id="operator-2"></a>

##### operator

> `readonly` **operator**: `string`

###### Inherited from

[`OperatorActionInput`](#operatoractioninput).[`operator`](#operator)

<a id="runid-3"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`OperatorActionInput`](#operatoractioninput).[`runId`](#runid-1)

## Type Aliases

<a id="action"></a>

### Action

> **Action** = *typeof* `Action.Type`

***

<a id="actionrecord"></a>

### ActionRecord

> **ActionRecord** = *typeof* `ActionRecord.Type`

***

<a id="explanation"></a>

### Explanation

> **Explanation** = *typeof* `Explanation.Type`

***

<a id="obligation"></a>

### Obligation

> **Obligation** = *typeof* `Obligation.Type`

***

<a id="recoverydecision"></a>

### RecoveryDecision

> **RecoveryDecision** = *typeof* `RecoveryDecision.Type`

***

<a id="resolveapprovaldecision"></a>

### ResolveApprovalDecision

> **ResolveApprovalDecision** = [`Approved`](../../approvals#approved) \| [`Denied`](../../approvals#denied)

***

<a id="unknownresolution"></a>

### UnknownResolution

> **UnknownResolution** = *typeof* `UnknownResolution.Type`

***

<a id="verification"></a>

### Verification

> **Verification** = *typeof* `Verification.Type`

***

<a id="wakeinput"></a>

### WakeInput

> **WakeInput** = [`OperatorActionInput`](#operatoractioninput)

## Variables

<a id="action-1"></a>

### Action

> `const` **Action**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Retry"`, \{ `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Wake"`, \{ \}\>, `Schema.TaggedStruct`\<`"ResolveUnknown"`, \{ `operationId`: `Schema.String`; `resolution`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Succeeded"`, \{ `value`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Retry"`, \{ \}\>\]\>; \}\>, `Schema.TaggedStruct`\<`"ResolveApproval"`, \{ `decision`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<...\>; \}\>\]\>; `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ExtendBudget"`, \{ `delta`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>\]\>

***

<a id="actionrecord-1"></a>

### ActionRecord

> `const` **ActionRecord**: `Schema.Struct`\<\{ `action`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Retry"`, \{ `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Wake"`, \{ \}\>, `Schema.TaggedStruct`\<`"ResolveUnknown"`, \{ `operationId`: `Schema.String`; `resolution`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>\]\>; \}\>, `Schema.TaggedStruct`\<`"ResolveApproval"`, \{ `decision`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>\]\>; `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ExtendBudget"`, \{ `delta`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>\]\>; `operator`: `Schema.String`; \}\>

***

<a id="explain"></a>

### explain

> `const` **explain**: (`journal`) => [`Explanation`](#explanation)

Pure projection from durable facts; no recovery decision is stored separately.

#### Parameters

##### journal

[`Journal`](#journal)

#### Returns

[`Explanation`](#explanation)

***

<a id="explanation-1"></a>

### Explanation

> `const` **Explanation**: `Schema.Struct`\<\{ `decision`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Resume"`, \{ \}\>, `Schema.TaggedStruct`\<`"RetryOperation"`, \{ `attempt`: `Schema.Int`; `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitApproval"`, \{ `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitBudget"`, \{ `budget`: `Schema.Literals`\<readonly \[`"tokens"`, `"usd"`, `"duration"`, `"toolCalls"`, `"children"`\]\>; \}\>, `Schema.TaggedStruct`\<`"Unknown"`, \{ `operationId`: `Schema.String`; `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>\]\>; `lastSequence`: `Schema.Int`; `obligations`: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Resume"`, \{ \}\>, `Schema.TaggedStruct`\<`"RetryOperation"`, \{ `attempt`: `Schema.Int`; `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitApproval"`, \{ `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitBudget"`, \{ `budget`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>; \}\>, `Schema.TaggedStruct`\<`"Unknown"`, \{ `operationId`: `Schema.String`; `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>\]\>\>; `status`: `Schema.Literals`\<readonly \[`"queued"`, `"running"`, `"waiting"`, `"needs-resolution"`, `"cancelling"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>

***

<a id="obligation-1"></a>

### Obligation

> `const` **Obligation**: `Schema.Struct`\<\{ `decision`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Resume"`, \{ \}\>, `Schema.TaggedStruct`\<`"RetryOperation"`, \{ `attempt`: `Schema.Int`; `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitApproval"`, \{ `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitBudget"`, \{ `budget`: `Schema.Literals`\<readonly \[`"tokens"`, `"usd"`, `"duration"`, `"toolCalls"`, `"children"`\]\>; \}\>, `Schema.TaggedStruct`\<`"Unknown"`, \{ `operationId`: `Schema.String`; `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>\]\>; `runId`: `Schema.String`; \}\>

***

<a id="recoverydecision-1"></a>

### RecoveryDecision

> `const` **RecoveryDecision**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Resume"`, \{ \}\>, `Schema.TaggedStruct`\<`"RetryOperation"`, \{ `attempt`: `Schema.Int`; `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitApproval"`, \{ `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitBudget"`, \{ `budget`: `Schema.Literals`\<readonly \[`"tokens"`, `"usd"`, `"duration"`, `"toolCalls"`, `"children"`\]\>; \}\>, `Schema.TaggedStruct`\<`"Unknown"`, \{ `operationId`: `Schema.String`; `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>\]\>

***

<a id="unknownresolution-1"></a>

### UnknownResolution

> `const` **UnknownResolution**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `outcome`: `Schema.Literal`\<`"succeeded"`\>; `result`: `Schema.Unknown`; \}\>, `Schema.Struct`\<\{ `error`: `Schema.Unknown`; `outcome`: `Schema.Literal`\<`"failed"`\>; \}\>\]\>

***

<a id="verification-1"></a>

### Verification

> `const` **Verification**: `Schema.Struct`\<\{ `decision`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Resume"`, \{ \}\>, `Schema.TaggedStruct`\<`"RetryOperation"`, \{ `attempt`: `Schema.Int`; `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitApproval"`, \{ `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitBudget"`, \{ `budget`: `Schema.Literals`\<readonly \[`"tokens"`, `"usd"`, `"duration"`, `"toolCalls"`, `"children"`\]\>; \}\>, `Schema.TaggedStruct`\<`"Unknown"`, \{ `operationId`: `Schema.String`; `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>\]\>; `drift`: `Schema.$Array`\<`Schema.String`\>; `lastSequence`: `Schema.Int`; `obligations`: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Resume"`, \{ \}\>, `Schema.TaggedStruct`\<`"RetryOperation"`, \{ `attempt`: `Schema.Int`; `operationId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitApproval"`, \{ `token`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"AwaitBudget"`, \{ `budget`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>; \}\>, `Schema.TaggedStruct`\<`"Unknown"`, \{ `operationId`: `Schema.String`; `reason`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>\]\>\>; `status`: `Schema.Literals`\<readonly \[`"queued"`, `"running"`, `"waiting"`, `"needs-resolution"`, `"cancelling"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>

***

<a id="verify"></a>

### verify

> `const` **verify**: (`journal`) => [`Verification`](#verification)

Recompute recovery and report contradictions between materialized Run state and its journal.

#### Parameters

##### journal

[`Journal`](#journal)

#### Returns

[`Verification`](#verification)
