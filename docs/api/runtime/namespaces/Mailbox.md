[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Mailbox

# Mailbox

## Interfaces

### MailboxEntry

Addressed-message projection over one durable Run inbox entry.

#### Properties

##### admittedAtMillis

> `readonly` **admittedAtMillis**: `number`

##### bytes

> `readonly` **bytes**: `number`

##### causationId?

> `readonly` `optional` **causationId?**: `string`

##### correlationId

> `readonly` **correlationId**: `string`

##### deliveredRunId?

> `readonly` `optional` **deliveredRunId?**: `string`

##### digest

> `readonly` **digest**: `string`

##### entryId

> `readonly` **entryId**: `string`

##### from

> `readonly` **from**: `string` & `Brand`\<`"Address"`\>

##### fromRunId

> `readonly` **fromRunId**: `string`

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

##### inReplyTo?

> `readonly` `optional` **inReplyTo?**: `string`

##### messageId

> `readonly` **messageId**: `string`

##### metadata

> `readonly` **metadata**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

##### prompt

> `readonly` **prompt**: `Prompt`

##### sequence

> `readonly` **sequence**: `number`

##### steeringEntryId?

> `readonly` `optional` **steeringEntryId?**: `string`

##### targetSessionId

> `readonly` **targetSessionId**: `string`

##### to

> `readonly` **to**: `string` & `Brand`\<`"Address"`\>

***

### MessageReceipt

Receipt for one admitted message.

#### Properties

##### duplicate

> `readonly` **duplicate**: `boolean`

##### entryId

> `readonly` **entryId**: `string`

##### messageId

> `readonly` **messageId**: `string`

##### sequence

> `readonly` **sequence**: `number`

## Variables

### deliveryPrompt

> `const` **deliveryPrompt**: (`entry`) => `Prompt.Prompt`

#### Parameters

##### entry

`Pick`\<[`MailboxEntry`](#mailboxentry), `"from"` \| `"messageId"` \| `"prompt"`\>

#### Returns

`Prompt.Prompt`

***

### MailboxEntry

> **MailboxEntry**: `Codec`\<[`MailboxEntry`](#mailboxentry), `MailboxEntryEncoded`, `never`, `never`\>

***

### MessageReceipt

> **MessageReceipt**: `Codec`\<[`MessageReceipt`](#messagereceipt), [`MessageReceipt`](#messagereceipt), `never`, `never`\>

***

### promptBytes

> `const` **promptBytes**: (`prompt`) => `number`

Encoded size charged against the inbox byte bound.

#### Parameters

##### prompt

`Prompt.Prompt`

#### Returns

`number`
