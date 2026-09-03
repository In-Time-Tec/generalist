[**generalist**](./index)

***

[generalist](./index) / providers.deterministic

# providers.deterministic

## Interfaces

### Options

#### Extends

- [`RegistrationOptions`](./providers.openai#registrationoptions)

#### Properties

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`metadata`](./providers.openai#metadata-3)

##### model?

> `readonly` `optional` **model?**: `string`

##### provider?

> `readonly` `optional` **provider?**: `string`

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`registrationKey`](./providers.openai#registrationkey-3)

##### response?

> `readonly` `optional` **response?**: `string`

Scripted text returned by both streaming and non-streaming calls.

## Variables

### layer

> `const` **layer**: (`input?`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry)\>

#### Parameters

##### input?

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry)\>

***

### layerModel

> `const` **layerModel**: (`input?`) => `Model.Model`\<`string`, `LanguageModel.LanguageModel`, `never`\>

Scripted model layer for tests and CI; provide it to a run with `Effect.provide`.

#### Parameters

##### input?

[`Options`](#options)

#### Returns

`Model.Model`\<`string`, `LanguageModel.LanguageModel`, `never`\>

***

### registration

> `const` **registration**: (`input?`) => `Effect.Effect`\<[`Registration`](./generalist/namespaces/ModelRegistry#registration-1), `never`, `never`\>

#### Parameters

##### input?

[`Options`](#options)

#### Returns

`Effect.Effect`\<[`Registration`](./generalist/namespaces/ModelRegistry#registration-1), `never`, `never`\>
