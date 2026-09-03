[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Steering

# Steering

## Type Aliases

### ExecutionContinuation

> **ExecutionContinuation** = *typeof* `ExecutionContinuation.Type`

Durable reconstruction data for a steering-driven turn.

***

### MessageSource

> **MessageSource** = *typeof* `MessageSource.Type`

Authoritative identity that admitted one inbox message.

***

### SteeringEntry

> **SteeringEntry** = *typeof* `SteeringEntry.Type`

One pending durable inbox entry.

***

### SteeringReceipt

> **SteeringReceipt** = *typeof* `SteeringReceipt.Type`

Stable identity returned for durable steering admission and every identical retry.

## Variables

### decodeContinuation

> `const` **decodeContinuation**: (`encoded`) => [`ExecutionContinuation`](#executioncontinuation)

#### Parameters

##### encoded

`string`

#### Returns

[`ExecutionContinuation`](#executioncontinuation)

***

### digest

> `const` **digest**: (`input`) => `string`

Stable digest used for inbox idempotency.

#### Parameters

##### input

###### addressed?

[`Message`](./Message#message)

###### from

[`MessageSource`](#messagesource)

###### policy

[`AdmissionPolicy`](../../generalist/namespaces/Steering#admissionpolicy)

###### prompt

`Prompt.Prompt`

#### Returns

`string`

***

### encodeContinuation

> `const` **encodeContinuation**: (`continuation`) => `string`

#### Parameters

##### continuation

[`ExecutionContinuation`](#executioncontinuation)

#### Returns

`string`

***

### ExecutionContinuation

> `const` **ExecutionContinuation**: `Schema.Struct`\<\{ `nextTurn`: `Schema.Int`; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `queue`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>\>; `schemaVersion`: `Schema.Literal`\<`1`\>; `steeringEntryIds`: `Schema.$Array`\<`Schema.String`\>; \}\>

Durable reconstruction data for a steering-driven turn.

***

### layer

> `const` **layer**: `Layer`

Handlers for `toolkit()`, backed by the Runtime-owned messaging service.

***

### MessageSource

> `const` **MessageSource**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `runId`: `Schema.String`; \}\>, `Schema.Struct`\<\{ `user`: `Schema.String`; \}\>, `Schema.Struct`\<\{ `system`: `Schema.Literal`\<`true`\>; \}\>\]\>

Authoritative identity that admitted one inbox message.

***

### SteeringEntry

> `const` **SteeringEntry**: `Schema.Struct`\<\{ `addressed`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `causationId`: `Schema.optionalKey`\<`Schema.String`\>; `correlationId`: `Schema.String`; `from`: `Schema.optionalKey`\<`Schema.brand`\<`Schema.String`, `"Address"`\>\>; `id`: `Schema.String`; `idempotencyKey`: `Schema.String`; `inReplyTo`: `Schema.optionalKey`\<`Schema.String`\>; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `sessionId`: `Schema.String`; `to`: `Schema.brand`\<`Schema.String`, `"Address"`\>; \}\>\>; `digest`: `Schema.String`; `entryId`: `Schema.String`; `from`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `runId`: `Schema.String`; \}\>, `Schema.Struct`\<\{ `user`: `Schema.String`; \}\>, `Schema.Struct`\<\{ `system`: `Schema.Literal`\<`true`\>; \}\>\]\>; `idempotencyKey`: `Schema.String`; `policy`: `Schema.Literals`\<readonly \[`"steer"`, `"enqueue"`, `"interrupt"`, `"rollback"`, `"reject"`\]\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}\>

One pending durable inbox entry.

***

### SteeringReceipt

> `const` **SteeringReceipt**: `Schema.Struct`\<\{ `entryId`: `Schema.String`; `sequence`: `Schema.Int`; \}\>

Stable identity returned for durable steering admission and every identical retry.

***

### toolkit

> `const` **toolkit**: () => `Toolkit.Toolkit`\<\{ `list_inbox`: `Tool.Tool`\<`"list_inbox"`, \{ `failure`: `Schema.Struct`\<\{ `message`: `Schema.String`; \}\>; `failureMode`: `"return"`; `parameters`: `Schema.Struct`\<\{ `limit`: `Schema.optionalKey`\<`Schema.Int`\>; \}\>; `success`: `Schema.$Array`\<`Schema.Struct`\<\{ `addressed`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `causationId`: ...; `correlationId`: ...; `from`: ...; `id`: ...; `idempotencyKey`: ...; `inReplyTo`: ...; `metadata`: ...; `prompt`: ...; `sessionId`: ...; `to`: ...; \}\>\>; `digest`: `Schema.String`; `entryId`: `Schema.String`; `from`: `Schema.Union`\<readonly \[..., ..., ...\]\>; `idempotencyKey`: `Schema.String`; `policy`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>; `prompt`: `Schema.Codec`\<`Prompt`, `PromptEncoded`, `never`, `never`\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}\>\>; \}, [`AgentMessaging`](./Messaging/index#agentmessaging) \| [`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext)\>; `send_to_child`: `Tool.Tool`\<`"send_to_child"`, \{ `failure`: `Schema.Struct`\<\{ `message`: `Schema.String`; \}\>; `failureMode`: `"return"`; `parameters`: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; `message`: `Schema.String`; `policy`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>\>; \}\>; `success`: `Schema.Codec`\<[`MessageReceipt`](./Mailbox#messagereceipt), [`MessageReceipt`](./Mailbox#messagereceipt), `never`, `never`\>; \}, [`AgentMessaging`](./Messaging/index#agentmessaging) \| [`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext)\>; `send_to_parent`: `Tool.Tool`\<`"send_to_parent"`, \{ `failure`: `Schema.Struct`\<\{ `message`: `Schema.String`; \}\>; `failureMode`: `"return"`; `parameters`: `Schema.Struct`\<\{ `message`: `Schema.String`; `policy`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>\>; \}\>; `success`: `Schema.Codec`\<[`MessageReceipt`](./Mailbox#messagereceipt), [`MessageReceipt`](./Mailbox#messagereceipt), `never`, `never`\>; \}, [`AgentMessaging`](./Messaging/index#agentmessaging) \| [`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext)\>; \}\>

Effect AI tools for messaging direct children and parents and inspecting this Run's inbox.

#### Returns

`Toolkit.Toolkit`\<\{ `list_inbox`: `Tool.Tool`\<`"list_inbox"`, \{ `failure`: `Schema.Struct`\<\{ `message`: `Schema.String`; \}\>; `failureMode`: `"return"`; `parameters`: `Schema.Struct`\<\{ `limit`: `Schema.optionalKey`\<`Schema.Int`\>; \}\>; `success`: `Schema.$Array`\<`Schema.Struct`\<\{ `addressed`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `causationId`: ...; `correlationId`: ...; `from`: ...; `id`: ...; `idempotencyKey`: ...; `inReplyTo`: ...; `metadata`: ...; `prompt`: ...; `sessionId`: ...; `to`: ...; \}\>\>; `digest`: `Schema.String`; `entryId`: `Schema.String`; `from`: `Schema.Union`\<readonly \[..., ..., ...\]\>; `idempotencyKey`: `Schema.String`; `policy`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>; `prompt`: `Schema.Codec`\<`Prompt`, `PromptEncoded`, `never`, `never`\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}\>\>; \}, [`AgentMessaging`](./Messaging/index#agentmessaging) \| [`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext)\>; `send_to_child`: `Tool.Tool`\<`"send_to_child"`, \{ `failure`: `Schema.Struct`\<\{ `message`: `Schema.String`; \}\>; `failureMode`: `"return"`; `parameters`: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; `message`: `Schema.String`; `policy`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>\>; \}\>; `success`: `Schema.Codec`\<[`MessageReceipt`](./Mailbox#messagereceipt), [`MessageReceipt`](./Mailbox#messagereceipt), `never`, `never`\>; \}, [`AgentMessaging`](./Messaging/index#agentmessaging) \| [`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext)\>; `send_to_parent`: `Tool.Tool`\<`"send_to_parent"`, \{ `failure`: `Schema.Struct`\<\{ `message`: `Schema.String`; \}\>; `failureMode`: `"return"`; `parameters`: `Schema.Struct`\<\{ `message`: `Schema.String`; `policy`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>\>; \}\>; `success`: `Schema.Codec`\<[`MessageReceipt`](./Mailbox#messagereceipt), [`MessageReceipt`](./Mailbox#messagereceipt), `never`, `never`\>; \}, [`AgentMessaging`](./Messaging/index#agentmessaging) \| [`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext)\>; \}\>

## References

### AdmissionPolicy

Re-exports [AdmissionPolicy](../../generalist/namespaces/Steering#admissionpolicy-1)

***

### defaultCapacity

Re-exports [defaultCapacity](../../generalist/namespaces/Steering#defaultcapacity)

***

### defaultMaxPendingBytes

Re-exports [defaultMaxPendingBytes](../../generalist/namespaces/Steering#defaultmaxpendingbytes)

***

### InboxFull

Re-exports [InboxFull](../../generalist/namespaces/Steering#inboxfull)

***

### promptBytes

Re-exports [promptBytes](../../generalist/namespaces/Steering#promptbytes)
