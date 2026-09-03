[**generalist**](./index)

***

[generalist](./index) / testing.model

# testing.model

## Interfaces

<a id="failurestep"></a>

### FailureStep

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"Failure"`

<a id="delay"></a>

##### delay?

> `readonly` `optional` **delay?**: `Input`

<a id="error"></a>

##### error

> `readonly` **error**: `AiError`

***

<a id="fixture"></a>

### Fixture

#### Properties

<a id="awaitrequests"></a>

##### awaitRequests

> `readonly` **awaitRequests**: (`count`) => `Effect`\<readonly [`Request`](#request)[]\>

###### Parameters

###### count

`number`

###### Returns

`Effect`\<readonly [`Request`](#request)[]\>

<a id="layer"></a>

##### layer

> `readonly` **layer**: `Layer`\<`LanguageModel`\>

<a id="prompts"></a>

##### prompts

> `readonly` **prompts**: `Effect`\<readonly `Prompt`[]\>

<a id="registration"></a>

##### registration

> `readonly` **registration**: [`Registration`](./generalist/namespaces/ModelRegistry#registration-1)

<a id="registrylayer"></a>

##### registryLayer

> `readonly` **registryLayer**: `Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry)\>

<a id="remaining"></a>

##### remaining

> `readonly` **remaining**: `Effect`\<`number`\>

<a id="requests"></a>

##### requests

> `readonly` **requests**: `Effect`\<readonly [`Request`](#request)[]\>

<a id="selection"></a>

##### selection

> `readonly` **selection**: [`ModelSelection`](./generalist/namespaces/ModelRegistry#modelselection)

***

<a id="makeoptions"></a>

### MakeOptions

#### Properties

<a id="metadata"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

<a id="model"></a>

##### model?

> `readonly` `optional` **model?**: `string`

<a id="provider"></a>

##### provider?

> `readonly` `optional` **provider?**: `string`

<a id="registrationkey"></a>

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

***

<a id="objectstep"></a>

### ObjectStep

#### Extends

- [`StepOptions`](#stepoptions)

#### Properties

<a id="_tag-1"></a>

##### \_tag

> `readonly` **\_tag**: `"Object"`

<a id="delay-1"></a>

##### delay?

> `readonly` `optional` **delay?**: `Input`

###### Inherited from

[`StepOptions`](#stepoptions).[`delay`](#delay-2)

<a id="finishreason"></a>

##### finishReason?

> `readonly` `optional` **finishReason?**: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`

###### Inherited from

[`StepOptions`](#stepoptions).[`finishReason`](#finishreason-1)

<a id="logprobs"></a>

##### logprobs?

> `readonly` `optional` **logprobs?**: readonly `number`[]

Provider output token log probabilities exposed to trajectory exporters.

###### Inherited from

[`StepOptions`](#stepoptions).[`logprobs`](#logprobs-1)

<a id="streampartdelay"></a>

##### streamPartDelay?

> `readonly` `optional` **streamPartDelay?**: `Input`

###### Inherited from

[`StepOptions`](#stepoptions).[`streamPartDelay`](#streampartdelay-1)

<a id="tokens"></a>

##### tokens?

> `readonly` `optional` **tokens?**: readonly `number`[]

Provider output token ids exposed to trajectory exporters.

###### Inherited from

[`StepOptions`](#stepoptions).[`tokens`](#tokens-1)

<a id="usage"></a>

##### usage?

> `readonly` `optional` **usage?**: `Usage`

###### Inherited from

[`StepOptions`](#stepoptions).[`usage`](#usage-1)

<a id="value"></a>

##### value

> `readonly` **value**: `unknown`

***

<a id="reasoningpart"></a>

### ReasoningPart

#### Properties

<a id="_tag-2"></a>

##### \_tag

> `readonly` **\_tag**: `"Reasoning"`

<a id="text"></a>

##### text

> `readonly` **text**: `string`

***

<a id="request"></a>

### Request

#### Properties

<a id="incrementalprompt"></a>

##### incrementalPrompt

> `readonly` **incrementalPrompt**: `Prompt` \| `undefined`

<a id="index"></a>

##### index

> `readonly` **index**: `number`

<a id="operation"></a>

##### operation

> `readonly` **operation**: [`Operation`](#operation-1)

<a id="previousresponseid"></a>

##### previousResponseId

> `readonly` **previousResponseId**: `string` \| `undefined`

<a id="prompt"></a>

##### prompt

> `readonly` **prompt**: `Prompt`

<a id="responseformat"></a>

##### responseFormat

> `readonly` **responseFormat**: \{ \} \| \{ \}

<a id="toolchoice"></a>

##### toolChoice

> `readonly` **toolChoice**: `ToolChoice`\<`any`\>

<a id="tools"></a>

##### tools

> `readonly` **tools**: readonly `Any`[]

***

<a id="stepoptions"></a>

### StepOptions

#### Extended by

- [`TurnStep`](#turnstep)
- [`ObjectStep`](#objectstep)

#### Properties

<a id="delay-2"></a>

##### delay?

> `readonly` `optional` **delay?**: `Input`

<a id="finishreason-1"></a>

##### finishReason?

> `readonly` `optional` **finishReason?**: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`

<a id="logprobs-1"></a>

##### logprobs?

> `readonly` `optional` **logprobs?**: readonly `number`[]

Provider output token log probabilities exposed to trajectory exporters.

<a id="streampartdelay-1"></a>

##### streamPartDelay?

> `readonly` `optional` **streamPartDelay?**: `Input`

<a id="tokens-1"></a>

##### tokens?

> `readonly` `optional` **tokens?**: readonly `number`[]

Provider output token ids exposed to trajectory exporters.

<a id="usage-1"></a>

##### usage?

> `readonly` `optional` **usage?**: `Usage`

***

<a id="textpart"></a>

### TextPart

#### Properties

<a id="_tag-3"></a>

##### \_tag

> `readonly` **\_tag**: `"Text"`

<a id="text-1"></a>

##### text

> `readonly` **text**: `string`

***

<a id="toolcalloptions"></a>

### ToolCallOptions

#### Properties

<a id="id"></a>

##### id?

> `readonly` `optional` **id?**: `string`

<a id="providerexecuted"></a>

##### providerExecuted?

> `readonly` `optional` **providerExecuted?**: `boolean`

***

<a id="toolcallpart"></a>

### ToolCallPart

#### Properties

<a id="_tag-4"></a>

##### \_tag

> `readonly` **\_tag**: `"ToolCall"`

<a id="id-1"></a>

##### id?

> `readonly` `optional` **id?**: `string`

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="params"></a>

##### params

> `readonly` **params**: `unknown`

<a id="providerexecuted-1"></a>

##### providerExecuted

> `readonly` **providerExecuted**: `boolean`

***

<a id="truncatedstep"></a>

### TruncatedStep

A provider stream that ends mid-content and never emits `finish`.

#### Properties

<a id="_tag-5"></a>

##### \_tag

> `readonly` **\_tag**: `"Truncated"`

<a id="delay-3"></a>

##### delay?

> `readonly` `optional` **delay?**: `Input`

<a id="parts"></a>

##### parts

> `readonly` **parts**: readonly [`Part`](#part)[]

<a id="stopafter"></a>

##### stopAfter

> `readonly` **stopAfter**: [`TruncationPoint`](#truncationpoint)

<a id="streampartdelay-2"></a>

##### streamPartDelay?

> `readonly` `optional` **streamPartDelay?**: `Input`

***

<a id="turnstep"></a>

### TurnStep

#### Extends

- [`StepOptions`](#stepoptions)

#### Properties

<a id="_tag-6"></a>

##### \_tag

> `readonly` **\_tag**: `"Turn"`

<a id="delay-4"></a>

##### delay?

> `readonly` `optional` **delay?**: `Input`

###### Inherited from

[`StepOptions`](#stepoptions).[`delay`](#delay-2)

<a id="finishreason-2"></a>

##### finishReason?

> `readonly` `optional` **finishReason?**: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`

###### Inherited from

[`StepOptions`](#stepoptions).[`finishReason`](#finishreason-1)

<a id="logprobs-2"></a>

##### logprobs?

> `readonly` `optional` **logprobs?**: readonly `number`[]

Provider output token log probabilities exposed to trajectory exporters.

###### Inherited from

[`StepOptions`](#stepoptions).[`logprobs`](#logprobs-1)

<a id="parts-1"></a>

##### parts

> `readonly` **parts**: readonly [`Part`](#part)[]

<a id="streampartdelay-3"></a>

##### streamPartDelay?

> `readonly` `optional` **streamPartDelay?**: `Input`

###### Inherited from

[`StepOptions`](#stepoptions).[`streamPartDelay`](#streampartdelay-1)

<a id="tokens-2"></a>

##### tokens?

> `readonly` `optional` **tokens?**: readonly `number`[]

Provider output token ids exposed to trajectory exporters.

###### Inherited from

[`StepOptions`](#stepoptions).[`tokens`](#tokens-1)

<a id="usage-2"></a>

##### usage?

> `readonly` `optional` **usage?**: `Usage`

###### Inherited from

[`StepOptions`](#stepoptions).[`usage`](#usage-1)

## Type Aliases

<a id="operation-1"></a>

### Operation

> **Operation** = `"streamText"` \| `"generateText"` \| `"generateObject"`

***

<a id="part"></a>

### Part

> **Part** = [`TextPart`](#textpart) \| [`ReasoningPart`](#reasoningpart) \| [`ToolCallPart`](#toolcallpart)

***

<a id="step"></a>

### Step

> **Step** = [`Part`](#part) \| [`TurnStep`](#turnstep) \| [`ObjectStep`](#objectstep) \| [`FailureStep`](#failurestep) \| [`TruncatedStep`](#truncatedstep)

***

<a id="truncationpoint"></a>

### TruncationPoint

> **TruncationPoint** = `"reasoning-delta"` \| `"text-delta"` \| `"tool-params-delta"` \| `"response-metadata"`

Where a truncated step stops emitting. The stream always ends
without a `finish` part, reproducing a provider body that reached EOF without
its terminal event.

## Variables

<a id="failure"></a>

### failure

> `const` **failure**: \{(`options?`): (`error`) => [`FailureStep`](#failurestep); (`error`, `options?`): [`FailureStep`](#failurestep); \}

#### Call Signature

> (`options?`): (`error`) => [`FailureStep`](#failurestep)

##### Parameters

###### options?

###### delay?

`Duration.Input`

##### Returns

(`error`) => [`FailureStep`](#failurestep)

#### Call Signature

> (`error`, `options?`): [`FailureStep`](#failurestep)

##### Parameters

###### error

`AiError`

###### options?

###### delay?

`Duration.Input`

##### Returns

[`FailureStep`](#failurestep)

***

<a id="layer-1"></a>

### layer

> `const` **layer**: \{(`options?`): (`script`) => `Layer`\<`LanguageModel`\>; (`script`, `options?`): `Layer`\<`LanguageModel`\>; \}

#### Call Signature

> (`options?`): (`script`) => `Layer`\<`LanguageModel`\>

##### Parameters

###### options?

[`MakeOptions`](#makeoptions)

##### Returns

(`script`) => `Layer`\<`LanguageModel`\>

#### Call Signature

> (`script`, `options?`): `Layer`\<`LanguageModel`\>

##### Parameters

###### script

readonly [`Step`](#step)[]

###### options?

[`MakeOptions`](#makeoptions)

##### Returns

`Layer`\<`LanguageModel`\>

***

<a id="layerregistry"></a>

### layerRegistry

> `const` **layerRegistry**: \{(`governance?`): (`fixtures`) => `Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry)\>; (`fixtures`, `governance?`): `Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry)\>; \}

#### Call Signature

> (`governance?`): (`fixtures`) => `Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry)\>

##### Parameters

###### governance?

[`GovernanceOptions`](./generalist/namespaces/ModelRegistry#governanceoptions)

##### Returns

(`fixtures`) => `Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry)\>

#### Call Signature

> (`fixtures`, `governance?`): `Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry)\>

##### Parameters

###### fixtures

readonly [`Fixture`](#fixture)[]

###### governance?

[`GovernanceOptions`](./generalist/namespaces/ModelRegistry#governanceoptions)

##### Returns

`Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry)\>

***

<a id="make"></a>

### make

> `const` **make**: \{(`options?`): (`script`) => `Effect`\<[`Fixture`](#fixture)\>; (`script`, `options?`): `Effect`\<[`Fixture`](#fixture)\>; \}

#### Call Signature

> (`options?`): (`script`) => `Effect`\<[`Fixture`](#fixture)\>

##### Parameters

###### options?

[`MakeOptions`](#makeoptions)

##### Returns

(`script`) => `Effect`\<[`Fixture`](#fixture)\>

#### Call Signature

> (`script`, `options?`): `Effect`\<[`Fixture`](#fixture)\>

##### Parameters

###### script

readonly [`Step`](#step)[]

###### options?

[`MakeOptions`](#makeoptions)

##### Returns

`Effect`\<[`Fixture`](#fixture)\>

***

<a id="object"></a>

### object

> `const` **object**: \{(`options?`): (`value`) => [`ObjectStep`](#objectstep); (`value`, `options?`): [`ObjectStep`](#objectstep); \}

#### Call Signature

> (`options?`): (`value`) => [`ObjectStep`](#objectstep)

##### Parameters

###### options?

[`StepOptions`](#stepoptions)

##### Returns

(`value`) => [`ObjectStep`](#objectstep)

#### Call Signature

> (`value`, `options?`): [`ObjectStep`](#objectstep)

##### Parameters

###### value

`unknown`

###### options?

[`StepOptions`](#stepoptions)

##### Returns

[`ObjectStep`](#objectstep)

***

<a id="reasoning"></a>

### reasoning

> `const` **reasoning**: (`value`) => [`ReasoningPart`](#reasoningpart)

#### Parameters

##### value

`string`

#### Returns

[`ReasoningPart`](#reasoningpart)

***

<a id="text-2"></a>

### text

> `const` **text**: (`value`) => [`TextPart`](#textpart)

#### Parameters

##### value

`string`

#### Returns

[`TextPart`](#textpart)

***

<a id="toolcall"></a>

### toolCall

> `const` **toolCall**: \{(`params`, `options?`): (`name`) => [`ToolCallPart`](#toolcallpart); (`name`, `params`, `options?`): [`ToolCallPart`](#toolcallpart); \}

#### Call Signature

> (`params`, `options?`): (`name`) => [`ToolCallPart`](#toolcallpart)

##### Parameters

###### params

`unknown`

###### options?

[`ToolCallOptions`](#toolcalloptions)

##### Returns

(`name`) => [`ToolCallPart`](#toolcallpart)

#### Call Signature

> (`name`, `params`, `options?`): [`ToolCallPart`](#toolcallpart)

##### Parameters

###### name

`string`

###### params

`unknown`

###### options?

[`ToolCallOptions`](#toolcalloptions)

##### Returns

[`ToolCallPart`](#toolcallpart)

***

<a id="truncated"></a>

### truncated

> `const` **truncated**: \{(`options`): (`parts`) => [`TruncatedStep`](#truncatedstep); (`parts`, `options`): [`TruncatedStep`](#truncatedstep); \}

A turn whose provider stream ends without a `finish` part.
`stopAfter: "tool-params-delta"` emits `tool-params-start` and unclosed
parameter JSON but never the closing `tool-call`.

#### Call Signature

> (`options`): (`parts`) => [`TruncatedStep`](#truncatedstep)

##### Parameters

###### options

###### delay?

`Duration.Input`

###### stopAfter

[`TruncationPoint`](#truncationpoint)

###### streamPartDelay?

`Duration.Input`

##### Returns

(`parts`) => [`TruncatedStep`](#truncatedstep)

#### Call Signature

> (`parts`, `options`): [`TruncatedStep`](#truncatedstep)

##### Parameters

###### parts

readonly [`Part`](#part)[]

###### options

###### delay?

`Duration.Input`

###### stopAfter

[`TruncationPoint`](#truncationpoint)

###### streamPartDelay?

`Duration.Input`

##### Returns

[`TruncatedStep`](#truncatedstep)

***

<a id="turn"></a>

### turn

> `const` **turn**: \{(`options?`): (`parts`) => [`TurnStep`](#turnstep); (`parts`, `options?`): [`TurnStep`](#turnstep); \}

#### Call Signature

> (`options?`): (`parts`) => [`TurnStep`](#turnstep)

##### Parameters

###### options?

[`StepOptions`](#stepoptions)

##### Returns

(`parts`) => [`TurnStep`](#turnstep)

#### Call Signature

> (`parts`, `options?`): [`TurnStep`](#turnstep)

##### Parameters

###### parts

readonly [`Part`](#part)[]

###### options?

[`StepOptions`](#stepoptions)

##### Returns

[`TurnStep`](#turnstep)
