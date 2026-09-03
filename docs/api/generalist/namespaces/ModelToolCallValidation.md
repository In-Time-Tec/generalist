[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ModelToolCallValidation

# ModelToolCallValidation

## Classes

<a id="invalidtoolcallparameters"></a>

### InvalidToolCallParameters

A model emitted parameters that do not satisfy the named Effect tool schema.

#### Extends

- `InvalidToolCallParameters_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new InvalidToolCallParameters**(...`args`): [`InvalidToolCallParameters`](#invalidtoolcallparameters)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`InvalidToolCallParameters`](#invalidtoolcallparameters)

###### Inherited from

`InvalidToolCallParameters_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`InvalidToolCallParameters_base.hint`

<a id="providerusage"></a>

##### providerUsage?

> `readonly` `optional` **providerUsage?**: `object`

###### inputTokens?

> `readonly` `optional` **inputTokens?**: `number`

###### outputTokens?

> `readonly` `optional` **outputTokens?**: `number`

###### totalTokens?

> `readonly` `optional` **totalTokens?**: `number`

###### Inherited from

`InvalidToolCallParameters_base.providerUsage`

<a id="toolname"></a>

##### toolName

> `readonly` **toolName**: `string`

###### Inherited from

`InvalidToolCallParameters_base.toolName`

***

<a id="tooljsonschemacompilermissing"></a>

### ToolJsonSchemaCompilerMissing

Tool correction was enabled for schema-backed tools, but the active model has no exact compiler.

#### Extends

- `ToolJsonSchemaCompilerMissing_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new ToolJsonSchemaCompilerMissing**(...`args`): [`ToolJsonSchemaCompilerMissing`](#tooljsonschemacompilermissing)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ToolJsonSchemaCompilerMissing`](#tooljsonschemacompilermissing)

###### Inherited from

`ToolJsonSchemaCompilerMissing_base.constructor`

#### Properties

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ToolJsonSchemaCompilerMissing_base.hint`

## Interfaces

<a id="projectedtoolkit"></a>

### ProjectedToolkit

A model-facing toolkit whose parameter decoding is permissive.

#### Properties

<a id="toolkit"></a>

##### toolkit

> `readonly` **toolkit**: `Toolkit`\<`BroadTools`\>

## Variables

<a id="decodetoolcall"></a>

### decodeToolCall

> `const` **decodeToolCall**: \{(`part`): (`toolkit`) => `Effect`\<`ToolCallPart`\<`string`, `unknown`\>, [`InvalidToolCallParameters`](#invalidtoolcallparameters)\>; (`toolkit`, `part`): `Effect`\<`ToolCallPart`\<`string`, `unknown`\>, [`InvalidToolCallParameters`](#invalidtoolcallparameters)\>; \}

Decode one raw model tool call with the original Effect parameter schema.

#### Call Signature

> (`part`): (`toolkit`) => `Effect`\<`ToolCallPart`\<`string`, `unknown`\>, [`InvalidToolCallParameters`](#invalidtoolcallparameters)\>

##### Parameters

###### part

`ToolCallPart`\<`string`, `unknown`\>

##### Returns

(`toolkit`) => `Effect`\<`ToolCallPart`\<`string`, `unknown`\>, [`InvalidToolCallParameters`](#invalidtoolcallparameters)\>

#### Call Signature

> (`toolkit`, `part`): `Effect`\<`ToolCallPart`\<`string`, `unknown`\>, [`InvalidToolCallParameters`](#invalidtoolcallparameters)\>

##### Parameters

###### toolkit

`Any`

###### part

`ToolCallPart`\<`string`, `unknown`\>

##### Returns

`Effect`\<`ToolCallPart`\<`string`, `unknown`\>, [`InvalidToolCallParameters`](#invalidtoolcallparameters)\>

***

<a id="isinvalidtoolcallparameters"></a>

### isInvalidToolCallParameters

> `const` **isInvalidToolCallParameters**: \<`I`\>(`input`) => `input is I & InvalidToolCallParameters`

Test whether a failure is the precise Generalist-owned correction signal.

#### Type Parameters

##### I

`I`

#### Parameters

##### input

`I`

#### Returns

`input is I & InvalidToolCallParameters`

***

<a id="prepare"></a>

### prepare

> `const` **prepare**: \{(`original`, `correctionLimit`): (`model`) => `Effect`\<`Service`, `AiError` \| [`ToolJsonSchemaCompilerMissing`](#tooljsonschemacompilermissing)\>; (`model`, `original`, `correctionLimit`): `Effect`\<`Service`, `AiError` \| [`ToolJsonSchemaCompilerMissing`](#tooljsonschemacompilermissing)\>; \}

Prepare correction validation for the active direct or registered model.

#### Call Signature

> (`original`, `correctionLimit`): (`model`) => `Effect`\<`Service`, `AiError` \| [`ToolJsonSchemaCompilerMissing`](#tooljsonschemacompilermissing)\>

##### Parameters

###### original

`Any`

###### correctionLimit

`number`

##### Returns

(`model`) => `Effect`\<`Service`, `AiError` \| [`ToolJsonSchemaCompilerMissing`](#tooljsonschemacompilermissing)\>

#### Call Signature

> (`model`, `original`, `correctionLimit`): `Effect`\<`Service`, `AiError` \| [`ToolJsonSchemaCompilerMissing`](#tooljsonschemacompilermissing)\>

##### Parameters

###### model

`Service`

###### original

`Any`

###### correctionLimit

`number`

##### Returns

`Effect`\<`Service`, `AiError` \| [`ToolJsonSchemaCompilerMissing`](#tooljsonschemacompilermissing)\>

***

<a id="projecttoolkit"></a>

### projectToolkit

> `const` **projectToolkit**: \{(`compile`): (`original`) => `Effect`\<[`ProjectedToolkit`](#projectedtoolkit), `AiError`\>; (`original`, `compile`): `Effect`\<[`ProjectedToolkit`](#projectedtoolkit), `AiError`\>; \}

Project a toolkit with the active provider's exact JSON Schema compiler.

#### Call Signature

> (`compile`): (`original`) => `Effect`\<[`ProjectedToolkit`](#projectedtoolkit), `AiError`\>

##### Parameters

###### compile

[`ToolJsonSchemaCompiler`](./ModelRegistry#tooljsonschemacompiler-1)

##### Returns

(`original`) => `Effect`\<[`ProjectedToolkit`](#projectedtoolkit), `AiError`\>

#### Call Signature

> (`original`, `compile`): `Effect`\<[`ProjectedToolkit`](#projectedtoolkit), `AiError`\>

##### Parameters

###### original

`Any`

###### compile

[`ToolJsonSchemaCompiler`](./ModelRegistry#tooljsonschemacompiler-1)

##### Returns

`Effect`\<[`ProjectedToolkit`](#projectedtoolkit), `AiError`\>

***

<a id="validatedecodedtoolcall"></a>

### validateDecodedToolCall

> `const` **validateDecodedToolCall**: \{(`part`): (`toolkit`) => `Effect`\<`ToolCallPart`\<`string`, `unknown`\>, [`InvalidToolCallParameters`](#invalidtoolcallparameters)\>; (`toolkit`, `part`): `Effect`\<`ToolCallPart`\<`string`, `unknown`\>, [`InvalidToolCallParameters`](#invalidtoolcallparameters)\>; \}

Validate a middleware-produced call against the decoded side of its original schema.

#### Call Signature

> (`part`): (`toolkit`) => `Effect`\<`ToolCallPart`\<`string`, `unknown`\>, [`InvalidToolCallParameters`](#invalidtoolcallparameters)\>

##### Parameters

###### part

`ToolCallPart`\<`string`, `unknown`\>

##### Returns

(`toolkit`) => `Effect`\<`ToolCallPart`\<`string`, `unknown`\>, [`InvalidToolCallParameters`](#invalidtoolcallparameters)\>

#### Call Signature

> (`toolkit`, `part`): `Effect`\<`ToolCallPart`\<`string`, `unknown`\>, [`InvalidToolCallParameters`](#invalidtoolcallparameters)\>

##### Parameters

###### toolkit

`Any`

###### part

`ToolCallPart`\<`string`, `unknown`\>

##### Returns

`Effect`\<`ToolCallPart`\<`string`, `unknown`\>, [`InvalidToolCallParameters`](#invalidtoolcallparameters)\>

***

<a id="wrap"></a>

### wrap

> `const` **wrap**: \{(`original`, `projected`): (`model`) => `Service`; (`model`, `original`, `projected`): `Service`; \}

Wrap a model so Generalist can validate tool calls before output escapes.

#### Call Signature

> (`original`, `projected`): (`model`) => `Service`

##### Parameters

###### original

`Any`

###### projected

`Toolkit`\<`BroadTools`\>

##### Returns

(`model`) => `Service`

#### Call Signature

> (`model`, `original`, `projected`): `Service`

##### Parameters

###### model

`Service`

###### original

`Any`

###### projected

`Toolkit`\<`BroadTools`\>

##### Returns

`Service`
