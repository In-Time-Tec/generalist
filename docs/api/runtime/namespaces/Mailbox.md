[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Mailbox

# Mailbox

## Interfaces

<a id="mailboxentry"></a>

### MailboxEntry

Addressed-message projection over one durable Run inbox entry.

#### Properties

<a id="admittedatmillis"></a>

##### admittedAtMillis

> `readonly` **admittedAtMillis**: `number`

<a id="bytes"></a>

##### bytes

> `readonly` **bytes**: `number`

<a id="causationid"></a>

##### causationId?

> `readonly` `optional` **causationId?**: `string`

<a id="correlationid"></a>

##### correlationId

> `readonly` **correlationId**: `string`

<a id="deliveredrunid"></a>

##### deliveredRunId?

> `readonly` `optional` **deliveredRunId?**: `string`

<a id="digest"></a>

##### digest

> `readonly` **digest**: `string`

<a id="entryid"></a>

##### entryId

> `readonly` **entryId**: `string`

<a id="from"></a>

##### from

> `readonly` **from**: `string` & `Brand`\<`"Address"`\>

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

##### messageId

> `readonly` **messageId**: `string`

<a id="metadata"></a>

##### metadata

> `readonly` **metadata**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

<a id="prompt"></a>

##### prompt

> `readonly` **prompt**: `Prompt`

<a id="sequence"></a>

##### sequence

> `readonly` **sequence**: `number`

<a id="steeringentryid"></a>

##### steeringEntryId?

> `readonly` `optional` **steeringEntryId?**: `string`

<a id="targetsessionid"></a>

##### targetSessionId

> `readonly` **targetSessionId**: `string`

<a id="to"></a>

##### to

> `readonly` **to**: `string` & `Brand`\<`"Address"`\>

***

<a id="messagereceipt"></a>

### MessageReceipt

Receipt for one admitted message.

#### Properties

<a id="duplicate"></a>

##### duplicate

> `readonly` **duplicate**: `boolean`

<a id="entryid-1"></a>

##### entryId

> `readonly` **entryId**: `string`

<a id="messageid-1"></a>

##### messageId

> `readonly` **messageId**: `string`

<a id="sequence-1"></a>

##### sequence

> `readonly` **sequence**: `number`

## Variables

<a id="deliveryprompt"></a>

### deliveryPrompt

> `const` **deliveryPrompt**: (`entry`) => `Prompt.Prompt`

#### Parameters

##### entry

`Pick`\<[`MailboxEntry`](#mailboxentry), `"from"` \| `"messageId"` \| `"prompt"`\>

#### Returns

`Prompt.Prompt`

***

<a id="mailboxentry-1"></a>

### MailboxEntry

> **MailboxEntry**: `Codec`\<[`MailboxEntry`](#mailboxentry), `MailboxEntryEncoded`, `never`, `never`\>

***

<a id="messagereceipt-1"></a>

### MessageReceipt

> **MessageReceipt**: `Codec`\<[`MessageReceipt`](#messagereceipt), [`MessageReceipt`](#messagereceipt), `never`, `never`\>

***

<a id="promptbytes"></a>

### promptBytes

> `const` **promptBytes**: (`prompt`) => `number`

Encoded size charged against the inbox byte bound.

#### Parameters

##### prompt

`Prompt.Prompt`

#### Returns

`number`
