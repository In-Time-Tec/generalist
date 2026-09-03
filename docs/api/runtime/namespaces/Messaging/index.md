[**generalist**](../../../index)

***

[generalist](../../../index) / [runtime](../../index) / Messaging

# Messaging

## Namespaces

- [MessagingPolicy](./namespaces/MessagingPolicy)

## Classes

<a id="agentmessaging"></a>

### AgentMessaging

#### Effect-expect-leaking

ToolContext
ToolContext is the per-call ambient identity of the running execution. Resolving it at Layer
creation would bind one Run into the service and let a caller send under another Run's identity,
which is exactly the forgery this contract exists to prevent.

#### Extends

- `AgentMessaging_base`

#### Constructors

<a id="constructor"></a>

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

<a id="messagingpolicy"></a>

### MessagingPolicy

The host seam for addressing beyond Generalist's derived relationships.

Generalist always allows self, parent, direct child, and sibling-under-one-parent from authoritative
durable identity. Everything else — notably addressing another Session — is a host decision, so
cross-product addressing is opt-in rather than a consequence of knowing an id.

#### Extends

- `MessagingPolicy_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="policyinput"></a>

### PolicyInput

One authorization question about one exact sender and target.

#### Properties

<a id="crosssession"></a>

##### crossSession

> `readonly` **crossSession**: `boolean`

<a id="relationship"></a>

##### relationship

> `readonly` **relationship**: `"parent"` \| `"child"` \| `"self"` \| `"sibling"` \| `undefined`

<a id="sender"></a>

##### sender

> `readonly` **sender**: [`DirectoryEntry`](../AgentDirectory#directoryentry)

<a id="target"></a>

##### target

> `readonly` **target**: [`DirectoryEntry`](../AgentDirectory#directoryentry)

***

<a id="sendmessageinput"></a>

### SendMessageInput

Input for one addressed send. Sender identity is a Run id, never caller-supplied text.

#### Properties

<a id="causationid"></a>

##### causationId?

> `readonly` `optional` **causationId?**: `string`

<a id="correlationid"></a>

##### correlationId?

> `readonly` `optional` **correlationId?**: `string`

<a id="fromrunid"></a>

##### fromRunId

> `readonly` **fromRunId**: `string`

<a id="idempotencykey"></a>

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

<a id="inreplyto"></a>

##### inReplyTo?

> `readonly` `optional` **inReplyTo?**: `string`

<a id="messageid"></a>

##### messageId?

> `readonly` `optional` **messageId?**: `string`

<a id="metadata"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

<a id="policy"></a>

##### policy?

> `readonly` `optional` **policy?**: `"steer"` \| `"enqueue"` \| `"interrupt"` \| `"rollback"` \| `"reject"`

<a id="prompt"></a>

##### prompt

> `readonly` **prompt**: `RawInput`

<a id="to"></a>

##### to

> `readonly` **to**: `string` & `Brand`\<`"Address"`\>

## Type Aliases

<a id="directoryerror"></a>

### DirectoryError

> **DirectoryError** = [`RunNotFound`](../Errors#runnotfound) \| [`RuntimeUnavailable`](../Errors#runtimeunavailable)

***

<a id="sendmessageerror"></a>

### SendMessageError

> **SendMessageError** = *typeof* `SendMessageError.Type`

Durable send failure.

## Variables

<a id="authorize"></a>

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

<a id="layer"></a>

### layer

> `const` **layer**: (`policy`) => `Layer.Layer`\<[`MessagingPolicy`](#messagingpolicy)\>

Host policy over exact sender and target identity.

#### Parameters

##### policy

`Partial`\<[`Service`](./namespaces/MessagingPolicy#service)\>

#### Returns

`Layer.Layer`\<[`MessagingPolicy`](#messagingpolicy)\>

***

<a id="make"></a>

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

<a id="policy-1"></a>

### Policy

> `const` **Policy**: `object`

Host messaging policy construction.

#### Type Declaration

<a id="make-1"></a>

##### make

> **make**: *typeof* `makePolicy`

***

<a id="reachable"></a>

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

<a id="sendmessageerror-1"></a>

### SendMessageError

> `const` **SendMessageError**: `Schema.Union`\<readonly \[*typeof* [`AddressNotFound`](../Errors#addressnotfound), *typeof* [`AddressInvalid`](../AgentDirectory#addressinvalid), *typeof* [`NotInFamily`](../Errors#notinfamily), *typeof* [`RunBusy`](../Errors#runbusy), *typeof* [`SteeringConflict`](../Errors#steeringconflict), *typeof* [`ForkSequenceInvalid`](../Errors#forksequenceinvalid), *typeof* [`NoSnapshot`](../Errors#nosnapshot), *typeof* [`CursorExpired`](../Errors#cursorexpired), *typeof* [`InboxFull`](../../../generalist/namespaces/Steering#inboxfull), *typeof* [`RunTerminal`](../Errors#runterminal), *typeof* [`RunNotFound`](../Errors#runnotfound), *typeof* [`RuntimeUnavailable`](../Errors#runtimeunavailable)\]\>

Durable send failure.
