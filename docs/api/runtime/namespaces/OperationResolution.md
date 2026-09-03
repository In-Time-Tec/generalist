[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / OperationResolution

# OperationResolution

## Type Aliases

### OperationResolution

> **OperationResolution** = *typeof* `OperationResolution.Type`

***

### ResolveOperationInput

> **ResolveOperationInput** = *typeof* `ResolveOperationInput.Type`

## Variables

### digest

> `const` **digest**: (`resolution`) => `string`

Stable digest used for operation-resolution idempotency.

#### Parameters

##### resolution

[`OperationResolution`](#operationresolution)

#### Returns

`string`

***

### OperationResolution

> `const` **OperationResolution**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Succeeded"`, \{ `value`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Retry"`, \{ \}\>\]\>

***

### ResolveOperationInput

> `const` **ResolveOperationInput**: `Schema.Struct`\<\{ `idempotencyKey`: `Schema.String`; `operationId`: `Schema.String`; `resolution`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Succeeded"`, \{ `value`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Retry"`, \{ \}\>\]\>; `runId`: `Schema.String`; \}\>
