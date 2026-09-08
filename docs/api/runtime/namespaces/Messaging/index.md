[**generalist**](../../../index.md)

***

[generalist](../../../index.md) / [runtime](../../index.md) / Messaging

# Messaging

## Namespaces

- [MessagingPolicy](./namespaces/MessagingPolicy.md)

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

> `readonly` **sender**: [`DirectoryEntry`](../AgentDirectory.md#directoryentry)

<a id="target"></a>

##### target

> `readonly` **target**: [`DirectoryEntry`](../AgentDirectory.md#directoryentry)

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

> `readonly` `optional` **policy?**: `"steer"` \| `"interrupt"` \| `"rollback"` \| `"reject"`

<a id="prompt"></a>

##### prompt

> `readonly` **prompt**: `RawInput`

<a id="to"></a>

##### to

> `readonly` **to**: `string` & `Brand`\<`"Address"`\>

## Type Aliases

<a id="directoryerror"></a>

### DirectoryError

> **DirectoryError** = [`RunNotFound`](../Errors.md#runnotfound) \| [`RuntimeUnavailable`](../Errors.md#runtimeunavailable) \| [`DurabilityFailure`](../../../durability.md#durabilityfailure)

***

<a id="sendmessageerror"></a>

### SendMessageError

> **SendMessageError** = *typeof* `SendMessageError.Type`

Durable send failure.

## Variables

<a id="authorize"></a>

### authorize

> `const` **authorize**: (`input`) => `Effect.Effect`\<`void`, [`NotInFamily`](../Errors.md#notinfamily)\>

Decide one addressing attempt.

Relationship is derived from durable parent links only. An Address a sender happens to know grants
nothing on its own.

#### Parameters

##### input

###### policy

[`Service`](./namespaces/MessagingPolicy.md#service)

###### sender

[`DirectoryEntry`](../AgentDirectory.md#directoryentry)

###### target

[`DirectoryEntry`](../AgentDirectory.md#directoryentry)

#### Returns

`Effect.Effect`\<`void`, [`NotInFamily`](../Errors.md#notinfamily)\>

***

<a id="layer"></a>

### layer

> `const` **layer**: (`policy`) => `Layer.Layer`\<[`MessagingPolicy`](#messagingpolicy)\>

Host policy over exact sender and target identity.

#### Parameters

##### policy

`Partial`\<[`Service`](./namespaces/MessagingPolicy.md#service)\>

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

[`Service`](./namespaces/MessagingPolicy.md#service)

###### sendMessage

(`request`) => `Effect.Effect`\<[`MessageReceipt`](../Mailbox.md#messagereceipt), [`SendMessageError`](#sendmessageerror)\>

###### store

[`Service`](../RunStore.md#service)

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

> `const` **reachable**: (`input`) => `Effect.Effect`\<`ReadonlyArray`\<[`DirectoryEntry`](../AgentDirectory.md#directoryentry)\>, [`DirectoryError`](#directoryerror)\>

Directory entries one Run may reach under Generalist relationships plus host policy.

#### Parameters

##### input

###### policy

[`Service`](./namespaces/MessagingPolicy.md#service)

###### runId

`string`

###### store

[`Service`](../RunStore.md#service)

#### Returns

`Effect.Effect`\<`ReadonlyArray`\<[`DirectoryEntry`](../AgentDirectory.md#directoryentry)\>, [`DirectoryError`](#directoryerror)\>

***

<a id="sendmessageerror-1"></a>

### SendMessageError

> `const` **SendMessageError**: `Schema.Union`\<readonly \[*typeof* [`DurabilityFailure`](../../../durability.md#durabilityfailure), *typeof* [`Exhausted`](../../../generalist/namespaces/RunBudget.md#exhausted), *typeof* [`Invalid`](../../../generalist/namespaces/RunBudget.md#invalid), *typeof* [`AddressNotFound`](../Errors.md#addressnotfound), *typeof* [`AddressInvalid`](../AgentDirectory.md#addressinvalid), *typeof* [`NotInFamily`](../Errors.md#notinfamily), *typeof* [`RunBusy`](../Errors.md#runbusy), *typeof* [`RunKindUnsupported`](../Errors.md#runkindunsupported), *typeof* [`SteeringConflict`](../Errors.md#steeringconflict), *typeof* [`ForkSequenceInvalid`](../Errors.md#forksequenceinvalid), *typeof* [`NoSnapshot`](../Errors.md#nosnapshot), *typeof* [`CursorExpired`](../Errors.md#cursorexpired), *typeof* [`InboxFull`](../../../generalist/namespaces/Steering.md#inboxfull), *typeof* [`RunTerminal`](../Errors.md#runterminal), *typeof* [`RunNotFound`](../Errors.md#runnotfound), *typeof* [`RuntimeUnavailable`](../Errors.md#runtimeunavailable)\]\>

Durable send failure.
