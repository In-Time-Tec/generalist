[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Message

# Message

## Type Aliases

<a id="message"></a>

### Message

> **Message** = *typeof* `Message.Type`

***

<a id="metadata"></a>

### Metadata

> **Metadata** = *typeof* `Metadata.Type`

## Variables

<a id="make"></a>

### make

> `const` **make**: (`input`) => [`Message`](#message)

#### Parameters

##### input

###### causationId?

`string`

###### correlationId

`string`

###### from?

[`Address`](./Address#address)

###### id

`string`

###### idempotencyKey

`string`

###### inReplyTo?

`string`

###### metadata?

[`Metadata`](#metadata)

###### prompt

`Prompt.Prompt`

###### sessionId

`string`

###### to

[`Address`](./Address#address)

#### Returns

[`Message`](#message)

***

<a id="message-1"></a>

### Message

> `const` **Message**: `Schema.Struct`\<\{ `causationId`: `Schema.optionalKey`\<`Schema.String`\>; `correlationId`: `Schema.String`; `from`: `Schema.optionalKey`\<`Schema.brand`\<`Schema.String`, `"Address"`\>\>; `id`: `Schema.String`; `idempotencyKey`: `Schema.String`; `inReplyTo`: `Schema.optionalKey`\<`Schema.String`\>; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `sessionId`: `Schema.String`; `to`: `Schema.brand`\<`Schema.String`, `"Address"`\>; \}\>

***

<a id="metadata-1"></a>

### Metadata

> `const` **Metadata**: `Schema.$Record`\<`Schema.String`, `Schema.Unknown`\>

## Functions

<a id="decode"></a>

### decode()

#### Call Signature

> **decode**(`input`, `options?`): `Effect`\<\{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}, `SchemaError`, `never`\>

##### Parameters

###### input

###### causationId?

`string`

###### correlationId

`string`

###### from?

`string`

###### id

`string`

###### idempotencyKey

`string`

###### inReplyTo?

`string`

###### metadata

\{\[`key`: `string`\]: `unknown`; \}

###### prompt

`PromptEncoded`

###### sessionId

`string`

###### to

`string`

###### options?

`ParseOptions`

##### Returns

`Effect`\<\{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}, `SchemaError`, `never`\>

#### Call Signature

> **decode**(`options?`): (`input`) => `Effect`\<\{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}, `SchemaError`, `never`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<\{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string` & `Brand`\<`"Address"`\>; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `Prompt`; `sessionId`: `string`; `to`: `string` & `Brand`\<`"Address"`\>; \}, `SchemaError`, `never`\>

***

<a id="encode"></a>

### encode()

#### Call Signature

> **encode**(`input`, `options?`): `Effect`\<\{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string`; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `PromptEncoded`; `sessionId`: `string`; `to`: `string`; \}, `SchemaError`, `never`\>

##### Parameters

###### input

###### causationId?

`string`

###### correlationId

`string`

###### from?

`string` & `Brand`\<`"Address"`\>

###### id

`string`

###### idempotencyKey

`string`

###### inReplyTo?

`string`

###### metadata

\{\[`key`: `string`\]: `unknown`; \}

###### prompt

`Prompt`

###### sessionId

`string`

###### to

`string` & `Brand`\<`"Address"`\>

###### options?

`ParseOptions`

##### Returns

`Effect`\<\{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string`; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `PromptEncoded`; `sessionId`: `string`; `to`: `string`; \}, `SchemaError`, `never`\>

#### Call Signature

> **encode**(`options?`): (`input`) => `Effect`\<\{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string`; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `PromptEncoded`; `sessionId`: `string`; `to`: `string`; \}, `SchemaError`, `never`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<\{ `causationId?`: `string`; `correlationId`: `string`; `from?`: `string`; `id`: `string`; `idempotencyKey`: `string`; `inReplyTo?`: `string`; `metadata`: \{\[`key`: `string`\]: `unknown`; \}; `prompt`: `PromptEncoded`; `sessionId`: `string`; `to`: `string`; \}, `SchemaError`, `never`\>
