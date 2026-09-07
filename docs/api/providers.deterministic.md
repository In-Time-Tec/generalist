[**generalist**](./index.md)

***

[generalist](./index.md) / providers.deterministic

# providers.deterministic

## Interfaces

<a id="options"></a>

### Options

#### Extends

- [`RegistrationOptions`](./providers.openai.md#registrationoptions)

#### Properties

<a id="metadata"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`RegistrationOptions`](./providers.openai.md#registrationoptions).[`metadata`](./providers.openai.md#metadata-3)

<a id="model"></a>

##### model?

> `readonly` `optional` **model?**: `string`

<a id="provider"></a>

##### provider?

> `readonly` `optional` **provider?**: `string`

<a id="registrationkey"></a>

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`RegistrationOptions`](./providers.openai.md#registrationoptions).[`registrationKey`](./providers.openai.md#registrationkey-3)

<a id="response"></a>

##### response?

> `readonly` `optional` **response?**: `string`

Scripted text returned by both streaming and non-streaming calls.

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`input?`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry.md#modelregistry)\>

#### Parameters

##### input?

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry.md#modelregistry)\>

***

<a id="layermodel"></a>

### layerModel

> `const` **layerModel**: (`input?`) => `Model.Model`\<`string`, `LanguageModel.LanguageModel`, `never`\>

Scripted model layer for tests and CI; provide it to a run with `Effect.provide`.

#### Parameters

##### input?

[`Options`](#options)

#### Returns

`Model.Model`\<`string`, `LanguageModel.LanguageModel`, `never`\>

***

<a id="registration"></a>

### registration

> `const` **registration**: (`input?`) => `Effect.Effect`\<[`Registration`](./generalist/namespaces/ModelRegistry.md#registration-1), `never`, `never`\>

#### Parameters

##### input?

[`Options`](#options)

#### Returns

`Effect.Effect`\<[`Registration`](./generalist/namespaces/ModelRegistry.md#registration-1), `never`, `never`\>
