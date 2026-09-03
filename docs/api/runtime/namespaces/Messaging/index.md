[**generalist**](../../../index)

***

[generalist](../../../index) / [runtime](../../index) / Messaging

# Messaging

## Namespaces

- [MessagingPolicy](./namespaces/MessagingPolicy)

## Classes

### AgentMessaging

#### Effect-expect-leaking

ToolContext
ToolContext is the per-call ambient identity of the running execution. Resolving it at Layer
creation would bind one Run into the service and let a caller send under another Run's identity,
which is exactly the forgery this contract exists to prevent.

#### Extends

- `AgentMessaging_base`

#### Constructors

##### Constructor

> **new AgentMessaging**(`_`): [`AgentMessaging`](#agentmessaging)

###### Parameters

###### \_

`never`

###### Returns

[`AgentMessaging`](#agentmessaging)

###### Inherited from

`AgentMessaging_base.constructor`

***

### MessagingPolicy

The host seam for addressing beyond Generalist's derived relationships.

Generalist always allows self, parent, direct child, and sibling-under-one-parent from authoritative
durable identity. Everything else — notably addressing another Session — is a host decision, so
cross-product addressing is opt-in rather than a consequence of knowing an id.

#### Extends

- `MessagingPolicy_base`

#### Constructors

##### Constructor

> **new MessagingPolicy**(`_`): [`MessagingPolicy`](#messagingpolicy)

###### Parameters

###### \_

`never`

###### Returns

[`MessagingPolicy`](#messagingpolicy)

###### Inherited from

`MessagingPolicy_base.constructor`

## Interfaces

### PolicyInput

One authorization question about one exact sender and target.

#### Properties

##### crossSession

> `readonly` **crossSession**: `boolean`

##### relationship

> `readonly` **relationship**: `"parent"` \| `"child"` \| `"self"` \| `"sibling"` \| `undefined`

##### sender

> `readonly` **sender**: [`DirectoryEntry`](../AgentDirectory#directoryentry)

##### target

> `readonly` **target**: [`DirectoryEntry`](../AgentDirectory#directoryentry)

***

### SendMessageInput

Input for one addressed send. Sender identity is a Run id, never caller-supplied text.

#### Properties

##### causationId?

> `readonly` `optional` **causationId?**: `string`

##### correlationId?

> `readonly` `optional` **correlationId?**: `string`

##### fromRunId

> `readonly` **fromRunId**: `string`

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

##### inReplyTo?

> `readonly` `optional` **inReplyTo?**: `string`

##### messageId?

> `readonly` `optional` **messageId?**: `string`

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

##### policy?

> `readonly` `optional` **policy?**: `"enqueue"` \| `"interrupt"` \| `"reject"` \| `"rollback"` \| `"steer"`

##### prompt

> `readonly` **prompt**: `RawInput`

##### to

> `readonly` **to**: `string` & `Brand`\<`"Address"`\>

## Type Aliases

### DirectoryError

> **DirectoryError** = [`RunNotFound`](../Errors#runnotfound) \| [`RuntimeUnavailable`](../Errors#runtimeunavailable)

***

### SendMessageError

> **SendMessageError** = *typeof* `SendMessageError.Type`

Durable send failure.

## Variables

### authorize

> `const` **authorize**: (`input`) => `Effect.Effect`\<`void`, [`NotInFamily`](../Errors#notinfamily)\>

Decide one addressing attempt.

Relationship is derived from durable parent links only. An Address a sender happens to know grants
nothing on its own.

#### Parameters

##### input

###### policy

[`Service`](./namespaces/MessagingPolicy#service)

###### sender

[`DirectoryEntry`](../AgentDirectory#directoryentry)

###### target

[`DirectoryEntry`](../AgentDirectory#directoryentry)

#### Returns

`Effect.Effect`\<`void`, [`NotInFamily`](../Errors#notinfamily)\>

***

### layer

> `const` **layer**: (`policy`) => `Layer.Layer`\<[`MessagingPolicy`](#messagingpolicy)\>

Host policy over exact sender and target identity.

#### Parameters

##### policy

`Partial`\<[`Service`](./namespaces/MessagingPolicy#service)\>

#### Returns

`Layer.Layer`\<[`MessagingPolicy`](#messagingpolicy)\>

***

### make

> `const` **make**: (`input`) => [`AgentMessaging`](#agentmessaging)\[`"Service"`\]

Build in-execution messaging over one RunStore and host policy.

Every send delegates to Runtime's unified Inbox admission, which journals the message before it
can become visible to the target Run.

#### Parameters

##### input

###### policy

[`Service`](./namespaces/MessagingPolicy#service)

###### sendMessage

(`request`) => `Effect.Effect`\<[`MessageReceipt`](../Mailbox#messagereceipt), [`SendMessageError`](#sendmessageerror)\>

###### store

[`Service`](../RunStore#service)

#### Returns

[`AgentMessaging`](#agentmessaging)\[`"Service"`\]

***

### Policy

> `const` **Policy**: `object`

Host messaging policy construction.

#### Type Declaration

##### make

> **make**: *typeof* `makePolicy`

***

### reachable

> `const` **reachable**: (`input`) => `Effect.Effect`\<`ReadonlyArray`\<[`DirectoryEntry`](../AgentDirectory#directoryentry)\>, [`DirectoryError`](#directoryerror)\>

Directory entries one Run may reach under Generalist relationships plus host policy.

#### Parameters

##### input

###### policy

[`Service`](./namespaces/MessagingPolicy#service)

###### runId

`string`

###### store

[`Service`](../RunStore#service)

#### Returns

`Effect.Effect`\<`ReadonlyArray`\<[`DirectoryEntry`](../AgentDirectory#directoryentry)\>, [`DirectoryError`](#directoryerror)\>

***

### SendMessageError

> `const` **SendMessageError**: `Schema.Union`\<readonly \[*typeof* [`AddressNotFound`](../Errors#addressnotfound), *typeof* [`AddressInvalid`](../AgentDirectory#addressinvalid), *typeof* [`NotInFamily`](../Errors#notinfamily), *typeof* [`RunBusy`](../Errors#runbusy), *typeof* [`SteeringConflict`](../Errors#steeringconflict), *typeof* [`ForkSequenceInvalid`](../Errors#forksequenceinvalid), *typeof* [`NoSnapshot`](../Errors#nosnapshot), *typeof* [`CursorExpired`](../Errors#cursorexpired), *typeof* [`InboxFull`](../../../generalist/namespaces/Steering#inboxfull), *typeof* [`RunTerminal`](../Errors#runterminal), *typeof* [`RunNotFound`](../Errors#runnotfound), *typeof* [`RuntimeUnavailable`](../Errors#runtimeunavailable)\]\>

Durable send failure.
