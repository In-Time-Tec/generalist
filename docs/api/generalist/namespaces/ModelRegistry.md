[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ModelRegistry

# ModelRegistry

## Classes

<a id="languagemodelnotregistered"></a>

### LanguageModelNotRegistered

#### Extends

- `LanguageModelNotRegistered_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new LanguageModelNotRegistered**(...`args`): [`LanguageModelNotRegistered`](#languagemodelnotregistered)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`LanguageModelNotRegistered`](#languagemodelnotregistered)

###### Inherited from

`LanguageModelNotRegistered_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`LanguageModelNotRegistered_base.hint`

<a id="model"></a>

##### model

> `readonly` **model**: `string`

###### Inherited from

`LanguageModelNotRegistered_base.model`

<a id="provider"></a>

##### provider

> `readonly` **provider**: `string`

###### Inherited from

`LanguageModelNotRegistered_base.provider`

<a id="registration_key"></a>

##### registration\_key?

> `readonly` `optional` **registration\_key?**: `string`

###### Inherited from

`LanguageModelNotRegistered_base.registration_key`

***

<a id="modelregistry"></a>

### ModelRegistry

#### Extends

- `ModelRegistry_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new ModelRegistry**(`_`): [`ModelRegistry`](#modelregistry)

###### Parameters

###### \_

`never`

###### Returns

[`ModelRegistry`](#modelregistry)

###### Inherited from

`ModelRegistry_base.constructor`

## Interfaces

<a id="governanceoptions"></a>

### GovernanceOptions

#### Properties

<a id="maxconcurrentmodelcalls"></a>

##### maxConcurrentModelCalls?

> `readonly` `optional` **maxConcurrentModelCalls?**: `number`

***

<a id="modelselection"></a>

### ModelSelection

#### Properties

<a id="model-1"></a>

##### model

> `readonly` **model**: `string`

<a id="provider-1"></a>

##### provider

> `readonly` **provider**: `string`

<a id="registrationkey"></a>

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

***

<a id="registerinput"></a>

### RegisterInput

#### Properties

<a id="registration"></a>

##### registration

> `readonly` **registration**: [`Registration`](#registration-1)

***

<a id="registration-1"></a>

### Registration

#### Properties

<a id="classifyfailure"></a>

##### classifyFailure?

> `readonly` `optional` **classifyFailure?**: [`FailureClassifier`](#failureclassifier)

<a id="isavailabilityfailure"></a>

##### isAvailabilityFailure?

> `readonly` `optional` **isAvailabilityFailure?**: [`AvailabilityFailureClassifier`](#availabilityfailureclassifier)

<a id="layer"></a>

##### layer

> `readonly` **layer**: `Layer`\<[`ModelEnvironment`](#modelenvironment)\>

<a id="metadata"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

<a id="model-2"></a>

##### model

> `readonly` **model**: `string`

<a id="provider-2"></a>

##### provider

> `readonly` **provider**: `string`

<a id="registrationkey-1"></a>

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

<a id="tooljsonschemacompiler"></a>

##### toolJsonSchemaCompiler?

> `readonly` `optional` **toolJsonSchemaCompiler?**: [`ToolJsonSchemaCompiler`](#tooljsonschemacompiler-1)

***

<a id="service"></a>

### Service

#### Properties

<a id="register"></a>

##### register

> `readonly` **register**: (`input`) => `Effect`\<`void`\>

###### Parameters

###### input

[`RegisterInput`](#registerinput)

###### Returns

`Effect`\<`void`\>

<a id="registrations"></a>

##### registrations

> `readonly` **registrations**: `Effect`\<readonly [`Registration`](#registration-1)[]\>

<a id="stream"></a>

##### stream

> `readonly` **stream**: \<`A`, `E`, `R`\>(`selection`, `stream`) => `Stream`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>

###### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

###### Parameters

###### selection

[`ModelSelection`](#modelselection)

###### stream

`Stream`\<`A`, `E`, `R`\>

###### Returns

`Stream`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>

<a id="withmodel"></a>

##### withModel

> `readonly` **withModel**: \<`A`, `E`, `R`\>(`selection`, `effect`) => `Effect`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>

###### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

###### Parameters

###### selection

[`ModelSelection`](#modelselection)

###### effect

`Effect`\<`A`, `E`, `R`\>

###### Returns

`Effect`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>

## Type Aliases

<a id="availabilityfailureclassifier"></a>

### AvailabilityFailureClassifier

> **AvailabilityFailureClassifier** = (`cause`) => `boolean`

Provider-owned decision that a failed invocation may advance an ordered candidate route.

#### Parameters

##### cause

`unknown`

#### Returns

`boolean`

***

<a id="failureclassification"></a>

### FailureClassification

> **FailureClassification** = `"context-overflow"` \| `"other"`

***

<a id="failureclassifier"></a>

### FailureClassifier

> **FailureClassifier** = (`cause`) => [`FailureClassification`](#failureclassification)

#### Parameters

##### cause

`unknown`

#### Returns

[`FailureClassification`](#failureclassification)

***

<a id="metadata-1"></a>

### Metadata

> **Metadata** = *typeof* `Metadata.Type`

***

<a id="modelenvironment"></a>

### ModelEnvironment

> **ModelEnvironment** = `LanguageModel.LanguageModel` \| `Model.ProviderName` \| `Model.ModelName`

***

<a id="tooljsonschemacompiler-1"></a>

### ToolJsonSchemaCompiler

> **ToolJsonSchemaCompiler** = (`tool`) => `Effect.Effect`\<`JsonSchema.JsonSchema`, `AiError.AiError`\>

#### Parameters

##### tool

`Tool.Any`

#### Returns

`Effect.Effect`\<`JsonSchema.JsonSchema`, `AiError.AiError`\>

## Variables

<a id="classifyfailure-1"></a>

### classifyFailure

> `const` **classifyFailure**: \{(`cause`): (`model`) => [`FailureClassification`](#failureclassification); (`model`, `cause`): [`FailureClassification`](#failureclassification); \}

#### Call Signature

> (`cause`): (`model`) => [`FailureClassification`](#failureclassification)

##### Parameters

###### cause

`unknown`

##### Returns

(`model`) => [`FailureClassification`](#failureclassification)

#### Call Signature

> (`model`, `cause`): [`FailureClassification`](#failureclassification)

##### Parameters

###### model

`Service`

###### cause

`unknown`

##### Returns

[`FailureClassification`](#failureclassification)

***

<a id="layer-1"></a>

### layer

> `const` **layer**: \{(): `Layer`\<[`ModelRegistry`](#modelregistry)\>; \<`E`, `R`\>(`options?`): (`registrations?`) => `Layer`\<[`ModelRegistry`](#modelregistry), `E`, `Exclude`\<`R`, `Scope`\>\>; \<`E`, `R`\>(`registrations?`, `options?`): `Layer`\<[`ModelRegistry`](#modelregistry), `E`, `Exclude`\<`R`, `Scope`\>\>; \}

#### Call Signature

> (): `Layer`\<[`ModelRegistry`](#modelregistry)\>

##### Returns

`Layer`\<[`ModelRegistry`](#modelregistry)\>

#### Call Signature

> \<`E`, `R`\>(`options?`): (`registrations?`) => `Layer`\<[`ModelRegistry`](#modelregistry), `E`, `Exclude`\<`R`, `Scope`\>\>

##### Type Parameters

###### E

`E` = `never`

###### R

`R` = `never`

##### Parameters

###### options?

[`GovernanceOptions`](#governanceoptions)

##### Returns

(`registrations?`) => `Layer`\<[`ModelRegistry`](#modelregistry), `E`, `Exclude`\<`R`, `Scope`\>\>

#### Call Signature

> \<`E`, `R`\>(`registrations?`, `options?`): `Layer`\<[`ModelRegistry`](#modelregistry), `E`, `Exclude`\<`R`, `Scope`\>\>

##### Type Parameters

###### E

`E` = `never`

###### R

`R` = `never`

##### Parameters

###### registrations?

readonly `Effect`\<[`Registration`](#registration-1), `E`, `R`\>[]

###### options?

[`GovernanceOptions`](#governanceoptions)

##### Returns

`Layer`\<[`ModelRegistry`](#modelregistry), `E`, `Exclude`\<`R`, `Scope`\>\>

***

<a id="layermerged"></a>

### layerMerged

> `const` **layerMerged**: \{\<`E`, `R`\>(`options?`): (`registries`) => `Layer`\<[`ModelRegistry`](#modelregistry), `E`, `R`\>; \<`E`, `R`\>(`registries`, `options?`): `Layer`\<[`ModelRegistry`](#modelregistry), `E`, `R`\>; \}

#### Call Signature

> \<`E`, `R`\>(`options?`): (`registries`) => `Layer`\<[`ModelRegistry`](#modelregistry), `E`, `R`\>

##### Type Parameters

###### E

`E` = `never`

###### R

`R` = `never`

##### Parameters

###### options?

[`GovernanceOptions`](#governanceoptions)

##### Returns

(`registries`) => `Layer`\<[`ModelRegistry`](#modelregistry), `E`, `R`\>

#### Call Signature

> \<`E`, `R`\>(`registries`, `options?`): `Layer`\<[`ModelRegistry`](#modelregistry), `E`, `R`\>

##### Type Parameters

###### E

`E` = `never`

###### R

`R` = `never`

##### Parameters

###### registries

readonly `Layer`\<[`ModelRegistry`](#modelregistry), `E`, `R`\>[]

###### options?

[`GovernanceOptions`](#governanceoptions)

##### Returns

`Layer`\<[`ModelRegistry`](#modelregistry), `E`, `R`\>

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`ModelRegistry`](#modelregistry), `never`, `never`\>

In-memory model registry.

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](#modelregistry), `never`, `never`\>

***

<a id="register-1"></a>

### register

> `const` **register**: (`input`) => `Effect.Effect`\<`void`, `never`, [`ModelRegistry`](#modelregistry)\>

#### Parameters

##### input

[`RegisterInput`](#registerinput)

#### Returns

`Effect.Effect`\<`void`, `never`, [`ModelRegistry`](#modelregistry)\>

***

<a id="registration-2"></a>

### registration

> `const` **registration**: \<`R`\>(`input`) => `Effect.Effect`\<[`Registration`](#registration-1), `never`, `R`\>

#### Type Parameters

##### R

`R`

#### Parameters

##### input

###### classifyFailure?

[`FailureClassifier`](#failureclassifier)

###### isAvailabilityFailure?

[`AvailabilityFailureClassifier`](#availabilityfailureclassifier)

###### layer

`Layer.Layer`\<`LanguageModel.LanguageModel`, `never`, `R`\>

###### metadata?

[`Metadata`](#metadata-1)

###### model

`string`

###### provider

`string`

###### registrationKey?

`string`

###### toolJsonSchemaCompiler?

[`ToolJsonSchemaCompiler`](#tooljsonschemacompiler-1)

#### Returns

`Effect.Effect`\<[`Registration`](#registration-1), `never`, `R`\>

***

<a id="registrations-1"></a>

### registrations

> `const` **registrations**: () => `Effect.Effect`\<readonly [`Registration`](#registration-1)[], `never`, [`ModelRegistry`](#modelregistry)\>

#### Returns

`Effect.Effect`\<readonly [`Registration`](#registration-1)[], `never`, [`ModelRegistry`](#modelregistry)\>

***

<a id="stream-1"></a>

### stream

> `const` **stream**: \{\<`A`, `E`, `R`\>(`operation`): (`selection`) => `Stream`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, [`ModelRegistry`](#modelregistry) \| `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>; \<`A`, `E`, `R`\>(`selection`, `operation`): `Stream`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, [`ModelRegistry`](#modelregistry) \| `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>; \}

#### Call Signature

> \<`A`, `E`, `R`\>(`operation`): (`selection`) => `Stream`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, [`ModelRegistry`](#modelregistry) \| `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>

##### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

##### Parameters

###### operation

`Stream`\<`A`, `E`, `R`\>

##### Returns

(`selection`) => `Stream`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, [`ModelRegistry`](#modelregistry) \| `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>

#### Call Signature

> \<`A`, `E`, `R`\>(`selection`, `operation`): `Stream`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, [`ModelRegistry`](#modelregistry) \| `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>

##### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

##### Parameters

###### selection

[`ModelSelection`](#modelselection)

###### operation

`Stream`\<`A`, `E`, `R`\>

##### Returns

`Stream`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, [`ModelRegistry`](#modelregistry) \| `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>

***

<a id="tooljsonschemacompiler-2"></a>

### toolJsonSchemaCompiler

> `const` **toolJsonSchemaCompiler**: (`model`) => [`ToolJsonSchemaCompiler`](#tooljsonschemacompiler-1) \| `undefined`

#### Parameters

##### model

`LanguageModel.Service`

#### Returns

[`ToolJsonSchemaCompiler`](#tooljsonschemacompiler-1) \| `undefined`

***

<a id="withmodel-1"></a>

### withModel

> `const` **withModel**: \{\<`A`, `E`, `R`\>(`effect`): (`selection`) => `Effect`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, [`ModelRegistry`](#modelregistry) \| `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>; \<`A`, `E`, `R`\>(`selection`, `effect`): `Effect`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, [`ModelRegistry`](#modelregistry) \| `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>; \}

#### Call Signature

> \<`A`, `E`, `R`\>(`effect`): (`selection`) => `Effect`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, [`ModelRegistry`](#modelregistry) \| `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>

##### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

##### Parameters

###### effect

`Effect`\<`A`, `E`, `R`\>

##### Returns

(`selection`) => `Effect`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, [`ModelRegistry`](#modelregistry) \| `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>

#### Call Signature

> \<`A`, `E`, `R`\>(`selection`, `effect`): `Effect`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, [`ModelRegistry`](#modelregistry) \| `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>

##### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

##### Parameters

###### selection

[`ModelSelection`](#modelselection)

###### effect

`Effect`\<`A`, `E`, `R`\>

##### Returns

`Effect`\<`A`, [`LanguageModelNotRegistered`](#languagemodelnotregistered) \| `E`, [`ModelRegistry`](#modelregistry) \| `Exclude`\<`R`, [`ModelEnvironment`](#modelenvironment)\>\>

***

<a id="withtooljsonschemacompiler"></a>

### withToolJsonSchemaCompiler

> `const` **withToolJsonSchemaCompiler**: \{(`compiler`): (`model`) => `Service`; (`model`, `compiler`): `Service`; \}

#### Call Signature

> (`compiler`): (`model`) => `Service`

##### Parameters

###### compiler

[`ToolJsonSchemaCompiler`](#tooljsonschemacompiler-1)

##### Returns

(`model`) => `Service`

#### Call Signature

> (`model`, `compiler`): `Service`

##### Parameters

###### model

`Service`

###### compiler

[`ToolJsonSchemaCompiler`](#tooljsonschemacompiler-1)

##### Returns

`Service`
