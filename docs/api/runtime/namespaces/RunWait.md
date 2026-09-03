[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / RunWait

# RunWait

## Type Aliases

<a id="runwait"></a>

### RunWait

> **RunWait** = *typeof* `RunWait.Type`

***

<a id="waitreason"></a>

### WaitReason

> **WaitReason** = *typeof* `WaitReason.Type`

Typed reason and request payload for one durable wait.

***

<a id="waitresolution"></a>

### WaitResolution

> **WaitResolution** = *typeof* `WaitResolution.Type`

## Variables

<a id="approvalreason"></a>

### approvalReason

> `const` **approvalReason**: (`request`) => [`WaitReason`](#waitreason)

Construct the approval reason shared by Runtime producers and controls.

#### Parameters

##### request

[`Request`](./Approval#request)

#### Returns

[`WaitReason`](#waitreason)

***

<a id="runwait-1"></a>

### RunWait

> `const` **RunWait**: `Schema.Struct`\<\{ `closedAt`: `Schema.optionalKey`\<`Schema.String`\>; `openedAt`: `Schema.String`; `reason`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"ToolWait"`, \{ \}\>, `Schema.TaggedStruct`\<`"Approval"`, \{ `request`: `Schema.Struct`\<\{ `approvalId`: `Schema.String`; `capability`: `Schema.String`; `input`: `Schema.Unknown`; `operation`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Signal"`, \{ `name`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Timer"`, \{ `dueAt`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"External"`, \{ `capability`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"AwaitEvent"`, \{ `deadline`: `Schema.String`; `filter`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>, `Schema.TaggedStruct`\<..., ...\>\]\>; \}\>\]\>; `resolution`: `Schema.optionalKey`\<`Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"ToolResult"`, \{ `encodedResult`: `Schema.Unknown`; `result`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Signal"`, \{ `name`: `Schema.String`; `payload`: `Schema.optionalKey`\<`Schema.Unknown`\>; \}\>\]\>\>; `status`: `Schema.Literals`\<readonly \[`"open"`, `"responded"`, `"signaled"`, `"cancelled"`\]\>; `waitId`: `Schema.String`; \}\>

***

<a id="waitreason-1"></a>

### WaitReason

> `const` **WaitReason**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"ToolWait"`, \{ \}\>, `Schema.TaggedStruct`\<`"Approval"`, \{ `request`: `Schema.Struct`\<\{ `approvalId`: `Schema.String`; `capability`: `Schema.String`; `input`: `Schema.Unknown`; `operation`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Signal"`, \{ `name`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Timer"`, \{ `dueAt`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"External"`, \{ `capability`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"AwaitEvent"`, \{ `deadline`: `Schema.String`; `filter`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Timer"`, \{ `scheduleId`: `Schema.optionalKey`\<...\>; \}\>, `Schema.TaggedStruct`\<`"Webhook"`, \{ `source`: `Schema.optionalKey`\<...\>; \}\>, `Schema.TaggedStruct`\<`"ChildCompleted"`, \{ `childRunId`: `Schema.optionalKey`\<...\>; \}\>, `Schema.TaggedStruct`\<`"FileChanged"`, \{ `kind`: `Schema.optionalKey`\<...\>; `path`: `Schema.optionalKey`\<...\>; \}\>, `Schema.TaggedStruct`\<`"ApprovalResolved"`, \{ `approvalId`: `Schema.optionalKey`\<...\>; \}\>\]\>; \}\>\]\>

Typed reason and request payload for one durable wait.

***

<a id="waitresolution-1"></a>

### WaitResolution

> `const` **WaitResolution**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"ToolResult"`, \{ `encodedResult`: `Schema.Unknown`; `result`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Signal"`, \{ `name`: `Schema.String`; `payload`: `Schema.optionalKey`\<`Schema.Unknown`\>; \}\>\]\>
