[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Triggers

# Triggers

## Classes

<a id="webhookrejected"></a>

### WebhookRejected

A webhook payload or signature failed its configured source boundary.

#### Extends

- `WebhookRejected_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new WebhookRejected**(...`args`): [`WebhookRejected`](#webhookrejected)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`WebhookRejected`](#webhookrejected)

###### Inherited from

`WebhookRejected_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`WebhookRejected_base.hint`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `"invalid-payload"` \| `"invalid-signature"` \| `"missing-dedupe-key"` \| `"stale-request"`

###### Inherited from

`WebhookRejected_base.reason`

<a id="source"></a>

##### source

> `readonly` **source**: `string`

###### Inherited from

`WebhookRejected_base.source`

## Interfaces

<a id="hmacsha256options"></a>

### HmacSha256Options

#### Properties

<a id="header"></a>

##### header

> `readonly` **header**: `string`

<a id="prefix"></a>

##### prefix?

> `readonly` `optional` **prefix?**: `string`

***

<a id="ingestion"></a>

### Ingestion

#### Type Parameters

##### Payload

`Payload`

#### Properties

<a id="event"></a>

##### event

> `readonly` **event**: `object`

###### dedupeKey

> `readonly` **dedupeKey**: `string`

###### headers

> `readonly` **headers**: `object`

###### Index Signature

\[`key`: `string`\]: `string`

###### payload

> `readonly` **payload**: `Json`

###### source

> `readonly` **source**: `string`

<a id="payload-1"></a>

##### payload

> `readonly` **payload**: `Payload`

***

<a id="webhooksource"></a>

### WebhookSource

#### Type Parameters

##### Payload

`Payload` *extends* `Schema.Top`

#### Properties

<a id="payload-3"></a>

##### payload

> `readonly` **payload**: `Payload`

<a id="signature"></a>

##### signature

> `readonly` **signature**: [`Signature`](#signature-1)

<a id="source-1"></a>

##### source

> `readonly` **source**: `string`

## Type Aliases

<a id="signature-1"></a>

### Signature

> **Signature** = \{ `_tag`: `"GitHub"`; `secret`: `Secret`; \} \| \{ `_tag`: `"Slack"`; `secret`: `Secret`; `toleranceSeconds?`: `number`; \} \| \{ `_tag`: `"HmacSha256"`; `header`: `string`; `prefix?`: `string`; `secret`: `Secret`; \} \| \{ `_tag`: `"Unsigned"`; \}

## Variables

<a id="github"></a>

### github

> `const` **github**: (`secret`) => [`Signature`](#signature-1)

#### Parameters

##### secret

`Secret`

#### Returns

[`Signature`](#signature-1)

***

<a id="hmacsha256"></a>

### hmacSha256

> `const` **hmacSha256**: \{(`options`): (`secret`) => [`Signature`](#signature-1); (`secret`, `options`): [`Signature`](#signature-1); \}

#### Call Signature

> (`options`): (`secret`) => [`Signature`](#signature-1)

##### Parameters

###### options

[`HmacSha256Options`](#hmacsha256options)

##### Returns

(`secret`) => [`Signature`](#signature-1)

#### Call Signature

> (`secret`, `options`): [`Signature`](#signature-1)

##### Parameters

###### secret

`Secret`

###### options

[`HmacSha256Options`](#hmacsha256options)

##### Returns

[`Signature`](#signature-1)

***

<a id="ingestwebhook"></a>

### ingestWebhook

> `const` **ingestWebhook**: \<`Payload`\>(`input`) => `Effect.Effect`\<[`Ingestion`](#ingestion)\<`Payload`\[`"Type"`\]\>, [`WebhookRejected`](#webhookrejected) \| `PlatformError.PlatformError`, `Crypto.Crypto` \| `Payload`\[`"DecodingServices"`\]\>

Verify a raw request, validate its source-specific payload, and produce a wake event.

#### Type Parameters

##### Payload

`Payload` *extends* `Schema.Top`

#### Parameters

##### input

###### body

`string`

###### dedupeKey?

`string`

###### headers

`Readonly`\<`Record`\<`string`, `string`\>\>

###### source

[`WebhookSource`](#webhooksource)\<`Payload`\>

#### Returns

`Effect.Effect`\<[`Ingestion`](#ingestion)\<`Payload`\[`"Type"`\]\>, [`WebhookRejected`](#webhookrejected) \| `PlatformError.PlatformError`, `Crypto.Crypto` \| `Payload`\[`"DecodingServices"`\]\>

***

<a id="slack"></a>

### slack

> `const` **slack**: \{(`toleranceSeconds`): (`secret`) => [`Signature`](#signature-1); (`secret`, `toleranceSeconds`): [`Signature`](#signature-1); \}

#### Call Signature

> (`toleranceSeconds`): (`secret`) => [`Signature`](#signature-1)

##### Parameters

###### toleranceSeconds

`number`

##### Returns

(`secret`) => [`Signature`](#signature-1)

#### Call Signature

> (`secret`, `toleranceSeconds`): [`Signature`](#signature-1)

##### Parameters

###### secret

`Secret`

###### toleranceSeconds

`number`

##### Returns

[`Signature`](#signature-1)

***

<a id="source-2"></a>

### source

> `const` **source**: \<`Payload`\>(`definition`) => [`WebhookSource`](#webhooksource)\<`Payload`\>

#### Type Parameters

##### Payload

`Payload` *extends* `Schema.Top`

#### Parameters

##### definition

[`WebhookSource`](#webhooksource)\<`Payload`\>

#### Returns

[`WebhookSource`](#webhooksource)\<`Payload`\>

***

<a id="unsigned"></a>

### unsigned

> `const` **unsigned**: [`Signature`](#signature-1)
