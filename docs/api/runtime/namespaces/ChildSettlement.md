[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / ChildSettlement

# ChildSettlement

## Type Aliases

<a id="notification"></a>

### Notification

> **Notification** = *typeof* `Notification.Type`

One ordered durable child settlement notification.

***

<a id="payload"></a>

### Payload

> **Payload** = *typeof* `Payload.Type`

Durable payload written when a child Run reaches a terminal state.

## Variables

<a id="frommailboxentry"></a>

### fromMailboxEntry

> `const` **fromMailboxEntry**: (`entry`) => [`Notification`](#notification) \| `undefined`

Decode a typed settlement notification from a mailbox row.

#### Parameters

##### entry

[`MailboxEntry`](./Mailbox#mailboxentry)

#### Returns

[`Notification`](#notification) \| `undefined`

***

<a id="frommetadata"></a>

### fromMetadata

> `const` **fromMetadata**: (`input`) => [`Notification`](#notification) \| `undefined`

Decode a typed settlement notification from mailbox metadata.

#### Parameters

##### input

###### admittedAtMillis

`number`

###### metadata

[`Metadata`](./Message#metadata)

###### sequence

`number`

#### Returns

[`Notification`](#notification) \| `undefined`

***

<a id="maxresultbytes"></a>

### maxResultBytes

> `const` **maxResultBytes**: `16384` = `16384`

Maximum UTF-8 result size carried inline by one settlement notification.

***

<a id="notification-1"></a>

### Notification

> `const` **Notification**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ChildSettlement"`\>; `admittedAtMillis`: `Schema.Finite`; `childRunId`: `Schema.String`; `joined`: `Schema.optionalKey`\<`Schema.Boolean`\>; `notificationId`: `Schema.String`; `parentRunId`: `Schema.String`; `resultBytes`: `Schema.Int`; `resultText`: `Schema.String`; `resultTruncated`: `Schema.Boolean`; `sequence`: `Schema.Int`; `status`: `Schema.Literals`\<readonly \[`"succeeded"`, `"failed"`, `"cancelled"`\]\>; `terminalEventId`: `Schema.String`; \}\>

One ordered durable child settlement notification.

***

<a id="notificationidfor"></a>

### notificationIdFor

> `const` **notificationIdFor**: (`childRunId`) => `string`

Stable identity shared by retries of one child's settlement.

#### Parameters

##### childRunId

`string`

#### Returns

`string`

***

<a id="observationentry"></a>

### observationEntry

> `const` **observationEntry**: (`input`) => [`MailboxEntry`](./Mailbox#mailboxentry)

Encode one settlement payload as a durable observation.

A settlement carries no model-facing content. The parent receives a child's outcome as the tool
result of the call that started it; hosts read settlements through the child-settlement
operations.

#### Parameters

##### input

###### admittedAtMillis

`number`

###### parentSessionId

`string`

###### payload

[`Payload`](#payload)

###### sequence

`number`

#### Returns

[`MailboxEntry`](./Mailbox#mailboxentry)

***

<a id="payload-1"></a>

### Payload

> `const` **Payload**: `Schema.TaggedStruct`\<`"ChildSettlement"`, \{ `childRunId`: `Schema.String`; `joined`: `Schema.optionalKey`\<`Schema.Boolean`\>; `notificationId`: `Schema.String`; `parentRunId`: `Schema.String`; `resultBytes`: `Schema.Int`; `resultText`: `Schema.String`; `resultTruncated`: `Schema.Boolean`; `status`: `Schema.Literals`\<readonly \[`"succeeded"`, `"failed"`, `"cancelled"`\]\>; `terminalEventId`: `Schema.String`; \}\>

Durable payload written when a child Run reaches a terminal state.

***

<a id="payloadfromevent"></a>

### payloadFromEvent

> `const` **payloadFromEvent**: (`input`) => [`Payload`](#payload) \| `undefined`

Build the typed notification payload from the authoritative terminal event.

#### Parameters

##### input

###### childRunId

`string`

###### event

[`RunEvent`](./RunEvent#runevent)

###### joined?

`boolean`

###### parentRunId

`string`

#### Returns

[`Payload`](#payload) \| `undefined`
