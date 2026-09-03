[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / FanOut

# FanOut

## Type Aliases

<a id="fanoutinspection"></a>

### FanOutInspection

> **FanOutInspection** = *typeof* `FanOutInspection.Type`

***

<a id="fanoutjoin"></a>

### FanOutJoin

> **FanOutJoin** = *typeof* `FanOutJoin.Type`

***

<a id="fanoutmemberresult"></a>

### FanOutMemberResult

> **FanOutMemberResult** = *typeof* `FanOutMemberResult.Type`

***

<a id="fanoutmemberstatus"></a>

### FanOutMemberStatus

> **FanOutMemberStatus** = *typeof* `FanOutMemberStatus.Type`

***

<a id="fanoutreceipt"></a>

### FanOutReceipt

> **FanOutReceipt** = *typeof* `FanOutReceipt.Type`

***

<a id="fanoutremainder"></a>

### FanOutRemainder

> **FanOutRemainder** = *typeof* `FanOutRemainder.Type`

***

<a id="fanoutstatus"></a>

### FanOutStatus

> **FanOutStatus** = *typeof* `FanOutStatus.Type`

## Variables

<a id="fanoutinspection-1"></a>

### FanOutInspection

> `const` **FanOutInspection**: `Schema.Struct`\<\{ `concurrency`: `Schema.Int`; `fanOutId`: `Schema.String`; `idempotencyKey`: `Schema.String`; `join`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"AllSuccess"`, \{ \}\>, `Schema.TaggedStruct`\<`"AllSettled"`, \{ \}\>, `Schema.TaggedStruct`\<`"FirstSuccess"`, \{ \}\>, `Schema.TaggedStruct`\<`"Quorum"`, \{ `required`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"BestEffort"`, \{ \}\>\]\>; `members`: `Schema.$Array`\<`Schema.Struct`\<\{ `childRunId`: `Schema.String`; `depth`: `Schema.Int`; `error`: `Schema.optionalKey`\<`Schema.Unknown`\>; `key`: `Schema.String`; `label`: `Schema.optionalKey`\<`Schema.String`\>; `ordinal`: `Schema.Int`; `origin`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `operationKey`: `Schema.optionalKey`\<`Schema.String`\>; `parentToolCallId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `readiness`: `Schema.Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>; `reason`: `Schema.optionalKey`\<`Schema.String`\>; `result`: `Schema.optionalKey`\<`Schema.Unknown`\>; `selection`: `Schema.String`; `status`: `Schema.Literals`\<readonly \[`"pending"`, `"running"`, `"succeeded"`, `"failed"`, `"cancelled"`, `"abandoned"`\]\>; `terminalEventId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `parentRunId`: `Schema.String`; `remainder`: `Schema.Literals`\<readonly \[`"await"`, `"request-cancel"`, `"terminate"`, `"abandon"`\]\>; `status`: `Schema.Literals`\<readonly \[`"running"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>

***

<a id="fanoutjoin-1"></a>

### FanOutJoin

> `const` **FanOutJoin**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"AllSuccess"`, \{ \}\>, `Schema.TaggedStruct`\<`"AllSettled"`, \{ \}\>, `Schema.TaggedStruct`\<`"FirstSuccess"`, \{ \}\>, `Schema.TaggedStruct`\<`"Quorum"`, \{ `required`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"BestEffort"`, \{ \}\>\]\>

***

<a id="fanoutmemberresult-1"></a>

### FanOutMemberResult

> `const` **FanOutMemberResult**: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; `depth`: `Schema.Int`; `error`: `Schema.optionalKey`\<`Schema.Unknown`\>; `key`: `Schema.String`; `label`: `Schema.optionalKey`\<`Schema.String`\>; `ordinal`: `Schema.Int`; `origin`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `operationKey`: `Schema.optionalKey`\<`Schema.String`\>; `parentToolCallId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `readiness`: `Schema.Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>; `reason`: `Schema.optionalKey`\<`Schema.String`\>; `result`: `Schema.optionalKey`\<`Schema.Unknown`\>; `selection`: `Schema.String`; `status`: `Schema.Literals`\<readonly \[`"pending"`, `"running"`, `"succeeded"`, `"failed"`, `"cancelled"`, `"abandoned"`\]\>; `terminalEventId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

***

<a id="fanoutmemberstatus-1"></a>

### FanOutMemberStatus

> `const` **FanOutMemberStatus**: `Schema.Literals`\<readonly \[`"pending"`, `"running"`, `"succeeded"`, `"failed"`, `"cancelled"`, `"abandoned"`\]\>

***

<a id="fanoutreceipt-1"></a>

### FanOutReceipt

> `const` **FanOutReceipt**: `Schema.Struct`\<\{ `childRunIds`: `Schema.$Array`\<`Schema.String`\>; `duplicate`: `Schema.Boolean`; `fanOutId`: `Schema.String`; `parentRunId`: `Schema.String`; \}\>

***

<a id="fanoutremainder-1"></a>

### FanOutRemainder

> `const` **FanOutRemainder**: `Schema.Literals`\<readonly \[`"await"`, `"request-cancel"`, `"terminate"`, `"abandon"`\]\>

***

<a id="fanoutstatus-1"></a>

### FanOutStatus

> `const` **FanOutStatus**: `Schema.Literals`\<readonly \[`"running"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>
