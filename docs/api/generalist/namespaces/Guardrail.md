[**generalist**](../../index.md)

***

[generalist](../../index.md) / [generalist](../index.md) / Guardrail

# Guardrail

## Variables

<a id="filteroutput"></a>

### filterOutput

> `const` **filterOutput**: (`keep`) => [`Middleware`](./ModelMiddleware.md#middleware)

Drop streamed non-tool-call parts when `keep` returns false.

#### Parameters

##### keep

(`part`, `context`) => `boolean`

#### Returns

[`Middleware`](./ModelMiddleware.md#middleware)

***

<a id="redactinput"></a>

### redactInput

> `const` **redactInput**: (`options`) => [`Middleware`](./ModelMiddleware.md#middleware)

Redact matches in text-bearing prompt fields before the model sees them.

#### Parameters

##### options

`RedactOptions`

#### Returns

[`Middleware`](./ModelMiddleware.md#middleware)

***

<a id="redactoutput"></a>

### redactOutput

> `const` **redactOutput**: (`options`) => [`Middleware`](./ModelMiddleware.md#middleware)

Redact matches in streamed text deltas before Generalist folds or emits them.

#### Parameters

##### options

`RedactOptions`

#### Returns

[`Middleware`](./ModelMiddleware.md#middleware)

***

<a id="validateinput"></a>

### validateInput

> `const` **validateInput**: (`check`) => [`Middleware`](./ModelMiddleware.md#middleware)

Fail the run when `check` rejects the input prompt.

#### Parameters

##### check

(`prompt`, `context`) => `Effect.Effect`\<`Option.Option`\<`string`\>\>

#### Returns

[`Middleware`](./ModelMiddleware.md#middleware)
