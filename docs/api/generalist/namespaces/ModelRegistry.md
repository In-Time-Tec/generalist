[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ModelRegistry

# ModelRegistry

## Classes

### LanguageModelNotRegistered

#### Extends

- `LanguageModelNotRegistered_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`LanguageModelNotRegistered_base.hint`

##### model

> `readonly` **model**: `string`

###### Inherited from

`LanguageModelNotRegistered_base.model`

##### provider

> `readonly` **provider**: `string`

###### Inherited from

`LanguageModelNotRegistered_base.provider`

##### registration\_key?

> `readonly` `optional` **registration\_key?**: `string`

###### Inherited from

`LanguageModelNotRegistered_base.registration_key`

***

### ModelRegistry

#### Extends

- `ModelRegistry_base`

#### Constructors

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

### GovernanceOptions

#### Properties

##### maxConcurrentModelCalls?

> `readonly` `optional` **maxConcurrentModelCalls?**: `number`

***

### ModelSelection

#### Properties

##### model

> `readonly` **model**: `string`

##### provider

> `readonly` **provider**: `string`

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

***

### RegisterInput

#### Properties

##### registration

> `readonly` **registration**: [`Registration`](#registration-1)

***

### Registration

#### Properties

##### classifyFailure?

> `readonly` `optional` **classifyFailure?**: [`FailureClassifier`](#failureclassifier)

##### isAvailabilityFailure?

> `readonly` `optional` **isAvailabilityFailure?**: [`AvailabilityFailureClassifier`](#availabilityfailureclassifier)

##### layer

> `readonly` **layer**: `Layer`\<[`ModelEnvironment`](#modelenvironment)\>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

##### model

> `readonly` **model**: `string`

##### provider

> `readonly` **provider**: `string`

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

##### toolJsonSchemaCompiler?

> `readonly` `optional` **toolJsonSchemaCompiler?**: [`ToolJsonSchemaCompiler`](#tooljsonschemacompiler-1)

***

### Service

#### Properties

##### register

> `readonly` **register**: (`input`) => `Effect`\<`void`\>

###### Parameters

###### input

[`RegisterInput`](#registerinput)

###### Returns

`Effect`\<`void`\>

##### registrations

> `readonly` **registrations**: `Effect`\<readonly [`Registration`](#registration-1)[]\>

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

### AvailabilityFailureClassifier

> **AvailabilityFailureClassifier** = (`cause`) => `boolean`

Provider-owned decision that a failed invocation may advance an ordered candidate route.

#### Parameters

##### cause

`unknown`

#### Returns

`boolean`

***

### FailureClassification

> **FailureClassification** = `"context-overflow"` \| `"other"`

***

### FailureClassifier

> **FailureClassifier** = (`cause`) => [`FailureClassification`](#failureclassification)

#### Parameters

##### cause

`unknown`

#### Returns

[`FailureClassification`](#failureclassification)

***

### Metadata

> **Metadata** = *typeof* `Metadata.Type`

***

### ModelEnvironment

> **ModelEnvironment** = `LanguageModel.LanguageModel` \| `Model.ProviderName` \| `Model.ModelName`

***

### ToolJsonSchemaCompiler

> **ToolJsonSchemaCompiler** = (`tool`) => `Effect.Effect`\<`JsonSchema.JsonSchema`, `AiError.AiError`\>

#### Parameters

##### tool

`Tool.Any`

#### Returns

`Effect.Effect`\<`JsonSchema.JsonSchema`, `AiError.AiError`\>

## Variables

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

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`ModelRegistry`](#modelregistry), `never`, `never`\>

In-memory model registry.

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`ModelRegistry`](#modelregistry), `never`, `never`\>

***

### register

> `const` **register**: (`input`) => `Effect.Effect`\<`void`, `never`, [`ModelRegistry`](#modelregistry)\>

#### Parameters

##### input

[`RegisterInput`](#registerinput)

#### Returns

`Effect.Effect`\<`void`, `never`, [`ModelRegistry`](#modelregistry)\>

***

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

### registrations

> `const` **registrations**: () => `Effect.Effect`\<readonly [`Registration`](#registration-1)[], `never`, [`ModelRegistry`](#modelregistry)\>

#### Returns

`Effect.Effect`\<readonly [`Registration`](#registration-1)[], `never`, [`ModelRegistry`](#modelregistry)\>

***

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

### toolJsonSchemaCompiler

> `const` **toolJsonSchemaCompiler**: (`model`) => [`ToolJsonSchemaCompiler`](#tooljsonschemacompiler-1) \| `undefined`

#### Parameters

##### model

`LanguageModel.Service`

#### Returns

[`ToolJsonSchemaCompiler`](#tooljsonschemacompiler-1) \| `undefined`

***

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
