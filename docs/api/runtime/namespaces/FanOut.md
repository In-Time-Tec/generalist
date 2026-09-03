[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / FanOut

# FanOut

## Type Aliases

### FanOutInspection

> **FanOutInspection** = *typeof* `FanOutInspection.Type`

***

### FanOutJoin

> **FanOutJoin** = *typeof* `FanOutJoin.Type`

***

### FanOutMemberResult

> **FanOutMemberResult** = *typeof* `FanOutMemberResult.Type`

***

### FanOutMemberStatus

> **FanOutMemberStatus** = *typeof* `FanOutMemberStatus.Type`

***

### FanOutReceipt

> **FanOutReceipt** = *typeof* `FanOutReceipt.Type`

***

### FanOutRemainder

> **FanOutRemainder** = *typeof* `FanOutRemainder.Type`

***

### FanOutStatus

> **FanOutStatus** = *typeof* `FanOutStatus.Type`

## Variables

### FanOutInspection

> `const` **FanOutInspection**: `Schema.Struct`\<\{ `concurrency`: `Schema.Int`; `fanOutId`: `Schema.String`; `idempotencyKey`: `Schema.String`; `join`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"AllSuccess"`, \{ \}\>, `Schema.TaggedStruct`\<`"AllSettled"`, \{ \}\>, `Schema.TaggedStruct`\<`"FirstSuccess"`, \{ \}\>, `Schema.TaggedStruct`\<`"Quorum"`, \{ `required`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"BestEffort"`, \{ \}\>\]\>; `members`: `Schema.$Array`\<`Schema.Struct`\<\{ `childRunId`: `Schema.String`; `depth`: `Schema.Int`; `error`: `Schema.optionalKey`\<`Schema.Unknown`\>; `key`: `Schema.String`; `label`: `Schema.optionalKey`\<`Schema.String`\>; `ordinal`: `Schema.Int`; `origin`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `operationKey`: `Schema.optionalKey`\<`Schema.String`\>; `parentToolCallId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `readiness`: `Schema.Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>; `reason`: `Schema.optionalKey`\<`Schema.String`\>; `result`: `Schema.optionalKey`\<`Schema.Unknown`\>; `selection`: `Schema.String`; `status`: `Schema.Literals`\<readonly \[`"pending"`, `"running"`, `"succeeded"`, `"failed"`, `"cancelled"`, `"abandoned"`\]\>; `terminalEventId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `parentRunId`: `Schema.String`; `remainder`: `Schema.Literals`\<readonly \[`"await"`, `"request-cancel"`, `"terminate"`, `"abandon"`\]\>; `status`: `Schema.Literals`\<readonly \[`"running"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>

***

### FanOutJoin

> `const` **FanOutJoin**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"AllSuccess"`, \{ \}\>, `Schema.TaggedStruct`\<`"AllSettled"`, \{ \}\>, `Schema.TaggedStruct`\<`"FirstSuccess"`, \{ \}\>, `Schema.TaggedStruct`\<`"Quorum"`, \{ `required`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"BestEffort"`, \{ \}\>\]\>

***

### FanOutMemberResult

> `const` **FanOutMemberResult**: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; `depth`: `Schema.Int`; `error`: `Schema.optionalKey`\<`Schema.Unknown`\>; `key`: `Schema.String`; `label`: `Schema.optionalKey`\<`Schema.String`\>; `ordinal`: `Schema.Int`; `origin`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `operationKey`: `Schema.optionalKey`\<`Schema.String`\>; `parentToolCallId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `readiness`: `Schema.Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>; `reason`: `Schema.optionalKey`\<`Schema.String`\>; `result`: `Schema.optionalKey`\<`Schema.Unknown`\>; `selection`: `Schema.String`; `status`: `Schema.Literals`\<readonly \[`"pending"`, `"running"`, `"succeeded"`, `"failed"`, `"cancelled"`, `"abandoned"`\]\>; `terminalEventId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

***

### FanOutMemberStatus

> `const` **FanOutMemberStatus**: `Schema.Literals`\<readonly \[`"pending"`, `"running"`, `"succeeded"`, `"failed"`, `"cancelled"`, `"abandoned"`\]\>

***

### FanOutReceipt

> `const` **FanOutReceipt**: `Schema.Struct`\<\{ `childRunIds`: `Schema.$Array`\<`Schema.String`\>; `duplicate`: `Schema.Boolean`; `fanOutId`: `Schema.String`; `parentRunId`: `Schema.String`; \}\>

***

### FanOutRemainder

> `const` **FanOutRemainder**: `Schema.Literals`\<readonly \[`"await"`, `"request-cancel"`, `"terminate"`, `"abandon"`\]\>

***

### FanOutStatus

> `const` **FanOutStatus**: `Schema.Literals`\<readonly \[`"running"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>
