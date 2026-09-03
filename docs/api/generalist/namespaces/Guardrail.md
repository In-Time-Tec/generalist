[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Guardrail

# Guardrail

## Variables

### filterOutput

> `const` **filterOutput**: (`keep`) => [`Middleware`](./ModelMiddleware#middleware)

Drop streamed non-tool-call parts when `keep` returns false.

#### Parameters

##### keep

(`part`, `context`) => `boolean`

#### Returns

[`Middleware`](./ModelMiddleware#middleware)

***

### redactInput

> `const` **redactInput**: (`options`) => [`Middleware`](./ModelMiddleware#middleware)

Redact matches in text-bearing prompt fields before the model sees them.

#### Parameters

##### options

`RedactOptions`

#### Returns

[`Middleware`](./ModelMiddleware#middleware)

***

### redactOutput

> `const` **redactOutput**: (`options`) => [`Middleware`](./ModelMiddleware#middleware)

Redact matches in streamed text deltas before Generalist folds or emits them.

#### Parameters

##### options

`RedactOptions`

#### Returns

[`Middleware`](./ModelMiddleware#middleware)

***

### validateInput

> `const` **validateInput**: (`check`) => [`Middleware`](./ModelMiddleware#middleware)

Fail the run when `check` rejects the input prompt.

#### Parameters

##### check

(`prompt`, `context`) => `Effect.Effect`\<`Option.Option`\<`string`\>\>

#### Returns

[`Middleware`](./ModelMiddleware#middleware)
