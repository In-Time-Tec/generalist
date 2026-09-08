[**generalist**](../../index.md)

***

[generalist](../../index.md) / [runtime](../index.md) / Mailbox

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

<a id="mailboxentryencoded"></a>

### MailboxEntryEncoded

#### Extends

- `Omit`\<[`MailboxEntry`](#mailboxentry), `"from"` \| `"to"` \| `"prompt"`\>

#### Properties

<a id="admittedatmillis-1"></a>

##### admittedAtMillis

> `readonly` **admittedAtMillis**: `number`

###### Inherited from

[`MailboxEntry`](#mailboxentry).[`admittedAtMillis`](#admittedatmillis)

<a id="bytes-1"></a>

##### bytes

> `readonly` **bytes**: `number`

###### Inherited from

[`MailboxEntry`](#mailboxentry).[`bytes`](#bytes)

<a id="causationid-1"></a>

##### causationId?

> `readonly` `optional` **causationId?**: `string`

###### Inherited from

[`MailboxEntry`](#mailboxentry).[`causationId`](#causationid)

<a id="correlationid-1"></a>

##### correlationId

> `readonly` **correlationId**: `string`

###### Inherited from

[`MailboxEntry`](#mailboxentry).[`correlationId`](#correlationid)

<a id="deliveredrunid-1"></a>

##### deliveredRunId?

> `readonly` `optional` **deliveredRunId?**: `string`

###### Inherited from

[`MailboxEntry`](#mailboxentry).[`deliveredRunId`](#deliveredrunid)

<a id="digest-1"></a>

##### digest

> `readonly` **digest**: `string`

###### Inherited from

[`MailboxEntry`](#mailboxentry).[`digest`](#digest)

<a id="entryid-1"></a>

##### entryId

> `readonly` **entryId**: `string`

###### Inherited from

[`MailboxEntry`](#mailboxentry).[`entryId`](#entryid)

<a id="from-1"></a>

##### from

> `readonly` **from**: `string`

<a id="fromrunid-1"></a>

##### fromRunId

> `readonly` **fromRunId**: `string`

###### Inherited from

[`MailboxEntry`](#mailboxentry).[`fromRunId`](#fromrunid)

<a id="idempotencykey-1"></a>

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

###### Inherited from

[`MailboxEntry`](#mailboxentry).[`idempotencyKey`](#idempotencykey)

<a id="inreplyto-1"></a>

##### inReplyTo?

> `readonly` `optional` **inReplyTo?**: `string`

###### Inherited from

[`MailboxEntry`](#mailboxentry).[`inReplyTo`](#inreplyto)

<a id="messageid-1"></a>

##### messageId

> `readonly` **messageId**: `string`

###### Inherited from

[`MailboxEntry`](#mailboxentry).[`messageId`](#messageid)

<a id="metadata-1"></a>

##### metadata

> `readonly` **metadata**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`MailboxEntry`](#mailboxentry).[`metadata`](#metadata)

<a id="prompt-1"></a>

##### prompt

> `readonly` **prompt**: `PromptEncoded`

<a id="sequence-1"></a>

##### sequence

> `readonly` **sequence**: `number`

###### Inherited from

[`MailboxEntry`](#mailboxentry).[`sequence`](#sequence)

<a id="steeringentryid-1"></a>

##### steeringEntryId?

> `readonly` `optional` **steeringEntryId?**: `string`

###### Inherited from

[`MailboxEntry`](#mailboxentry).[`steeringEntryId`](#steeringentryid)

<a id="targetsessionid-1"></a>

##### targetSessionId

> `readonly` **targetSessionId**: `string`

###### Inherited from

[`MailboxEntry`](#mailboxentry).[`targetSessionId`](#targetsessionid)

<a id="to-1"></a>

##### to

> `readonly` **to**: `string`

***

<a id="messagereceipt"></a>

### MessageReceipt

Receipt for one admitted message.

#### Properties

<a id="duplicate"></a>

##### duplicate

> `readonly` **duplicate**: `boolean`

<a id="entryid-2"></a>

##### entryId

> `readonly` **entryId**: `string`

<a id="messageid-2"></a>

##### messageId

> `readonly` **messageId**: `string`

<a id="sequence-2"></a>

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

> **MailboxEntry**: `Codec`\<[`MailboxEntry`](#mailboxentry), [`MailboxEntryEncoded`](#mailboxentryencoded), `never`, `never`\>

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
