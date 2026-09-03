[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / OperationResolution

# OperationResolution

## Type Aliases

<a id="operationresolution"></a>

### OperationResolution

> **OperationResolution** = *typeof* `OperationResolution.Type`

***

<a id="resolveoperationinput"></a>

### ResolveOperationInput

> **ResolveOperationInput** = *typeof* `ResolveOperationInput.Type`

## Variables

<a id="digest"></a>

### digest

> `const` **digest**: (`resolution`) => `string`

Stable digest used for operation-resolution idempotency.

#### Parameters

##### resolution

[`OperationResolution`](#operationresolution)

#### Returns

`string`

***

<a id="operationresolution-1"></a>

### OperationResolution

> `const` **OperationResolution**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Succeeded"`, \{ `value`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Retry"`, \{ \}\>\]\>

***

<a id="resolveoperationinput-1"></a>

### ResolveOperationInput

> `const` **ResolveOperationInput**: `Schema.Struct`\<\{ `idempotencyKey`: `Schema.String`; `operationId`: `Schema.String`; `resolution`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Succeeded"`, \{ `value`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `error`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Retry"`, \{ \}\>\]\>; `runId`: `Schema.String`; \}\>
