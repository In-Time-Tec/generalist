[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Steering

# Steering

## Type Aliases

<a id="executioncontinuation"></a>

### ExecutionContinuation

> **ExecutionContinuation** = *typeof* `ExecutionContinuation.Type`

Durable reconstruction data for a steering-driven turn.

***

<a id="messagesource"></a>

### MessageSource

> **MessageSource** = *typeof* `MessageSource.Type`

Authoritative identity that admitted one inbox message.

***

<a id="steeringentry"></a>

### SteeringEntry

> **SteeringEntry** = *typeof* `SteeringEntry.Type`

One pending durable inbox entry.

***

<a id="steeringreceipt"></a>

### SteeringReceipt

> **SteeringReceipt** = *typeof* `SteeringReceipt.Type`

Stable identity returned for durable steering admission and every identical retry.

## Variables

<a id="decodecontinuation"></a>

### decodeContinuation

> `const` **decodeContinuation**: (`encoded`) => [`ExecutionContinuation`](#executioncontinuation)

#### Parameters

##### encoded

`string`

#### Returns

[`ExecutionContinuation`](#executioncontinuation)

***

<a id="digest"></a>

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

<a id="encodecontinuation"></a>

### encodeContinuation

> `const` **encodeContinuation**: (`continuation`) => `string`

#### Parameters

##### continuation

[`ExecutionContinuation`](#executioncontinuation)

#### Returns

`string`

***

<a id="executioncontinuation-1"></a>

### ExecutionContinuation

> `const` **ExecutionContinuation**: `Schema.Struct`\<\{ `nextTurn`: `Schema.Int`; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `queue`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>\>; `schemaVersion`: `Schema.Literal`\<`1`\>; `steeringEntryIds`: `Schema.$Array`\<`Schema.String`\>; \}\>

Durable reconstruction data for a steering-driven turn.

***

<a id="layer"></a>

### layer

> `const` **layer**: `Layer`

Handlers for `toolkit()`, backed by the Runtime-owned messaging service.

***

<a id="messagesource-1"></a>

### MessageSource

> `const` **MessageSource**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `runId`: `Schema.String`; \}\>, `Schema.Struct`\<\{ `user`: `Schema.String`; \}\>, `Schema.Struct`\<\{ `system`: `Schema.Literal`\<`true`\>; \}\>\]\>

Authoritative identity that admitted one inbox message.

***

<a id="steeringentry-1"></a>

### SteeringEntry

> `const` **SteeringEntry**: `Schema.Struct`\<\{ `addressed`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `causationId`: `Schema.optionalKey`\<`Schema.String`\>; `correlationId`: `Schema.String`; `from`: `Schema.optionalKey`\<`Schema.brand`\<`Schema.String`, `"Address"`\>\>; `id`: `Schema.String`; `idempotencyKey`: `Schema.String`; `inReplyTo`: `Schema.optionalKey`\<`Schema.String`\>; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `sessionId`: `Schema.String`; `to`: `Schema.brand`\<`Schema.String`, `"Address"`\>; \}\>\>; `digest`: `Schema.String`; `entryId`: `Schema.String`; `from`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `runId`: `Schema.String`; \}\>, `Schema.Struct`\<\{ `user`: `Schema.String`; \}\>, `Schema.Struct`\<\{ `system`: `Schema.Literal`\<`true`\>; \}\>\]\>; `idempotencyKey`: `Schema.String`; `policy`: `Schema.Literals`\<readonly \[`"steer"`, `"enqueue"`, `"interrupt"`, `"rollback"`, `"reject"`\]\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}\>

One pending durable inbox entry.

***

<a id="steeringreceipt-1"></a>

### SteeringReceipt

> `const` **SteeringReceipt**: `Schema.Struct`\<\{ `entryId`: `Schema.String`; `sequence`: `Schema.Int`; \}\>

Stable identity returned for durable steering admission and every identical retry.

***

<a id="toolkit"></a>

### toolkit

> `const` **toolkit**: () => `Toolkit.Toolkit`\<\{ `list_inbox`: `Tool.Tool`\<`"list_inbox"`, \{ `failure`: `Schema.Struct`\<\{ `message`: `Schema.String`; \}\>; `failureMode`: `"return"`; `parameters`: `Schema.Struct`\<\{ `limit`: `Schema.optionalKey`\<`Schema.Int`\>; \}\>; `success`: `Schema.$Array`\<`Schema.Struct`\<\{ `addressed`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `causationId`: ...; `correlationId`: ...; `from`: ...; `id`: ...; `idempotencyKey`: ...; `inReplyTo`: ...; `metadata`: ...; `prompt`: ...; `sessionId`: ...; `to`: ...; \}\>\>; `digest`: `Schema.String`; `entryId`: `Schema.String`; `from`: `Schema.Union`\<readonly \[..., ..., ...\]\>; `idempotencyKey`: `Schema.String`; `policy`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>; `prompt`: `Schema.Codec`\<`Prompt`, `PromptEncoded`, `never`, `never`\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}\>\>; \}, [`AgentMessaging`](./Messaging/index#agentmessaging) \| [`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext)\>; `send_to_child`: `Tool.Tool`\<`"send_to_child"`, \{ `failure`: `Schema.Struct`\<\{ `message`: `Schema.String`; \}\>; `failureMode`: `"return"`; `parameters`: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; `message`: `Schema.String`; `policy`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>\>; \}\>; `success`: `Schema.Codec`\<[`MessageReceipt`](./Mailbox#messagereceipt), [`MessageReceipt`](./Mailbox#messagereceipt), `never`, `never`\>; \}, [`AgentMessaging`](./Messaging/index#agentmessaging) \| [`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext)\>; `send_to_parent`: `Tool.Tool`\<`"send_to_parent"`, \{ `failure`: `Schema.Struct`\<\{ `message`: `Schema.String`; \}\>; `failureMode`: `"return"`; `parameters`: `Schema.Struct`\<\{ `message`: `Schema.String`; `policy`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>\>; \}\>; `success`: `Schema.Codec`\<[`MessageReceipt`](./Mailbox#messagereceipt), [`MessageReceipt`](./Mailbox#messagereceipt), `never`, `never`\>; \}, [`AgentMessaging`](./Messaging/index#agentmessaging) \| [`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext)\>; \}\>

Effect AI tools for messaging direct children and parents and inspecting this Run's inbox.

#### Returns

`Toolkit.Toolkit`\<\{ `list_inbox`: `Tool.Tool`\<`"list_inbox"`, \{ `failure`: `Schema.Struct`\<\{ `message`: `Schema.String`; \}\>; `failureMode`: `"return"`; `parameters`: `Schema.Struct`\<\{ `limit`: `Schema.optionalKey`\<`Schema.Int`\>; \}\>; `success`: `Schema.$Array`\<`Schema.Struct`\<\{ `addressed`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `causationId`: ...; `correlationId`: ...; `from`: ...; `id`: ...; `idempotencyKey`: ...; `inReplyTo`: ...; `metadata`: ...; `prompt`: ...; `sessionId`: ...; `to`: ...; \}\>\>; `digest`: `Schema.String`; `entryId`: `Schema.String`; `from`: `Schema.Union`\<readonly \[..., ..., ...\]\>; `idempotencyKey`: `Schema.String`; `policy`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>; `prompt`: `Schema.Codec`\<`Prompt`, `PromptEncoded`, `never`, `never`\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}\>\>; \}, [`AgentMessaging`](./Messaging/index#agentmessaging) \| [`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext)\>; `send_to_child`: `Tool.Tool`\<`"send_to_child"`, \{ `failure`: `Schema.Struct`\<\{ `message`: `Schema.String`; \}\>; `failureMode`: `"return"`; `parameters`: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; `message`: `Schema.String`; `policy`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>\>; \}\>; `success`: `Schema.Codec`\<[`MessageReceipt`](./Mailbox#messagereceipt), [`MessageReceipt`](./Mailbox#messagereceipt), `never`, `never`\>; \}, [`AgentMessaging`](./Messaging/index#agentmessaging) \| [`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext)\>; `send_to_parent`: `Tool.Tool`\<`"send_to_parent"`, \{ `failure`: `Schema.Struct`\<\{ `message`: `Schema.String`; \}\>; `failureMode`: `"return"`; `parameters`: `Schema.Struct`\<\{ `message`: `Schema.String`; `policy`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[..., ..., ..., ..., ...\]\>\>; \}\>; `success`: `Schema.Codec`\<[`MessageReceipt`](./Mailbox#messagereceipt), [`MessageReceipt`](./Mailbox#messagereceipt), `never`, `never`\>; \}, [`AgentMessaging`](./Messaging/index#agentmessaging) \| [`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext)\>; \}\>

## References

<a id="admissionpolicy"></a>

### AdmissionPolicy

Re-exports [AdmissionPolicy](../../generalist/namespaces/Steering#admissionpolicy-1)

***

<a id="defaultcapacity"></a>

### defaultCapacity

Re-exports [defaultCapacity](../../generalist/namespaces/Steering#defaultcapacity)

***

<a id="defaultmaxpendingbytes"></a>

### defaultMaxPendingBytes

Re-exports [defaultMaxPendingBytes](../../generalist/namespaces/Steering#defaultmaxpendingbytes)

***

<a id="inboxfull"></a>

### InboxFull

Re-exports [InboxFull](../../generalist/namespaces/Steering#inboxfull)

***

<a id="promptbytes"></a>

### promptBytes

Re-exports [promptBytes](../../generalist/namespaces/Steering#promptbytes)
