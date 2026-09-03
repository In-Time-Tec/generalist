[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Triggers

# Triggers

## Classes

### WebhookRejected

A webhook payload or signature failed its configured source boundary.

#### Extends

- `WebhookRejected_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`WebhookRejected_base.hint`

##### reason

> `readonly` **reason**: `"invalid-payload"` \| `"invalid-signature"` \| `"missing-dedupe-key"` \| `"stale-request"`

###### Inherited from

`WebhookRejected_base.reason`

##### source

> `readonly` **source**: `string`

###### Inherited from

`WebhookRejected_base.source`

## Interfaces

### HmacSha256Options

#### Properties

##### header

> `readonly` **header**: `string`

##### prefix?

> `readonly` `optional` **prefix?**: `string`

***

### Ingestion

#### Type Parameters

##### Payload

`Payload`

#### Properties

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

##### payload

> `readonly` **payload**: `Payload`

***

### WebhookSource

#### Type Parameters

##### Payload

`Payload` *extends* `Schema.Top`

#### Properties

##### payload

> `readonly` **payload**: `Payload`

##### signature

> `readonly` **signature**: [`Signature`](#signature-1)

##### source

> `readonly` **source**: `string`

## Type Aliases

### Signature

> **Signature** = \{ `_tag`: `"GitHub"`; `secret`: `Secret`; \} \| \{ `_tag`: `"Slack"`; `secret`: `Secret`; `toleranceSeconds?`: `number`; \} \| \{ `_tag`: `"HmacSha256"`; `header`: `string`; `prefix?`: `string`; `secret`: `Secret`; \} \| \{ `_tag`: `"Unsigned"`; \}

## Variables

### github

> `const` **github**: (`secret`) => [`Signature`](#signature-1)

#### Parameters

##### secret

`Secret`

#### Returns

[`Signature`](#signature-1)

***

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

### unsigned

> `const` **unsigned**: [`Signature`](#signature-1)
