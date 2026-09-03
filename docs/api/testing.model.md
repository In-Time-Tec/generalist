[**generalist**](./index)

***

[generalist](./index) / testing.model

# testing.model

## Interfaces

### FailureStep

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Failure"`

##### delay?

> `readonly` `optional` **delay?**: `Input`

##### error

> `readonly` **error**: `AiError`

***

### Fixture

#### Properties

##### awaitRequests

> `readonly` **awaitRequests**: (`count`) => `Effect`\<readonly [`Request`](#request)[]\>

###### Parameters

###### count

`number`

###### Returns

`Effect`\<readonly [`Request`](#request)[]\>

##### layer

> `readonly` **layer**: `Layer`\<`LanguageModel`\>

##### prompts

> `readonly` **prompts**: `Effect`\<readonly `Prompt`[]\>

##### registration

> `readonly` **registration**: [`Registration`](./generalist/namespaces/ModelRegistry#registration-1)

##### registryLayer

> `readonly` **registryLayer**: `Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry)\>

##### remaining

> `readonly` **remaining**: `Effect`\<`number`\>

##### requests

> `readonly` **requests**: `Effect`\<readonly [`Request`](#request)[]\>

##### selection

> `readonly` **selection**: [`ModelSelection`](./generalist/namespaces/ModelRegistry#modelselection)

***

### MakeOptions

#### Properties

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

##### model?

> `readonly` `optional` **model?**: `string`

##### provider?

> `readonly` `optional` **provider?**: `string`

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

***

### ObjectStep

#### Extends

- [`StepOptions`](#stepoptions)

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Object"`

##### delay?

> `readonly` `optional` **delay?**: `Input`

###### Inherited from

[`StepOptions`](#stepoptions).[`delay`](#delay-2)

##### finishReason?

> `readonly` `optional` **finishReason?**: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`

###### Inherited from

[`StepOptions`](#stepoptions).[`finishReason`](#finishreason-1)

##### logprobs?

> `readonly` `optional` **logprobs?**: readonly `number`[]

Provider output token log probabilities exposed to trajectory exporters.

###### Inherited from

[`StepOptions`](#stepoptions).[`logprobs`](#logprobs-1)

##### streamPartDelay?

> `readonly` `optional` **streamPartDelay?**: `Input`

###### Inherited from

[`StepOptions`](#stepoptions).[`streamPartDelay`](#streampartdelay-1)

##### tokens?

> `readonly` `optional` **tokens?**: readonly `number`[]

Provider output token ids exposed to trajectory exporters.

###### Inherited from

[`StepOptions`](#stepoptions).[`tokens`](#tokens-1)

##### usage?

> `readonly` `optional` **usage?**: `Usage`

###### Inherited from

[`StepOptions`](#stepoptions).[`usage`](#usage-1)

##### value

> `readonly` **value**: `unknown`

***

### ReasoningPart

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Reasoning"`

##### text

> `readonly` **text**: `string`

***

### Request

#### Properties

##### incrementalPrompt

> `readonly` **incrementalPrompt**: `Prompt` \| `undefined`

##### index

> `readonly` **index**: `number`

##### operation

> `readonly` **operation**: [`Operation`](#operation-1)

##### previousResponseId

> `readonly` **previousResponseId**: `string` \| `undefined`

##### prompt

> `readonly` **prompt**: `Prompt`

##### responseFormat

> `readonly` **responseFormat**: \{ \} \| \{ \}

##### toolChoice

> `readonly` **toolChoice**: `ToolChoice`\<`any`\>

##### tools

> `readonly` **tools**: readonly `Any`[]

***

### StepOptions

#### Extended by

- [`TurnStep`](#turnstep)
- [`ObjectStep`](#objectstep)

#### Properties

##### delay?

> `readonly` `optional` **delay?**: `Input`

##### finishReason?

> `readonly` `optional` **finishReason?**: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`

##### logprobs?

> `readonly` `optional` **logprobs?**: readonly `number`[]

Provider output token log probabilities exposed to trajectory exporters.

##### streamPartDelay?

> `readonly` `optional` **streamPartDelay?**: `Input`

##### tokens?

> `readonly` `optional` **tokens?**: readonly `number`[]

Provider output token ids exposed to trajectory exporters.

##### usage?

> `readonly` `optional` **usage?**: `Usage`

***

### TextPart

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Text"`

##### text

> `readonly` **text**: `string`

***

### ToolCallOptions

#### Properties

##### id?

> `readonly` `optional` **id?**: `string`

##### providerExecuted?

> `readonly` `optional` **providerExecuted?**: `boolean`

***

### ToolCallPart

#### Properties

##### \_tag

> `readonly` **\_tag**: `"ToolCall"`

##### id?

> `readonly` `optional` **id?**: `string`

##### name

> `readonly` **name**: `string`

##### params

> `readonly` **params**: `unknown`

##### providerExecuted

> `readonly` **providerExecuted**: `boolean`

***

### TruncatedStep

A provider stream that ends mid-content and never emits `finish`.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Truncated"`

##### delay?

> `readonly` `optional` **delay?**: `Input`

##### parts

> `readonly` **parts**: readonly [`Part`](#part)[]

##### stopAfter

> `readonly` **stopAfter**: [`TruncationPoint`](#truncationpoint)

##### streamPartDelay?

> `readonly` `optional` **streamPartDelay?**: `Input`

***

### TurnStep

#### Extends

- [`StepOptions`](#stepoptions)

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Turn"`

##### delay?

> `readonly` `optional` **delay?**: `Input`

###### Inherited from

[`StepOptions`](#stepoptions).[`delay`](#delay-2)

##### finishReason?

> `readonly` `optional` **finishReason?**: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`

###### Inherited from

[`StepOptions`](#stepoptions).[`finishReason`](#finishreason-1)

##### logprobs?

> `readonly` `optional` **logprobs?**: readonly `number`[]

Provider output token log probabilities exposed to trajectory exporters.

###### Inherited from

[`StepOptions`](#stepoptions).[`logprobs`](#logprobs-1)

##### parts

> `readonly` **parts**: readonly [`Part`](#part)[]

##### streamPartDelay?

> `readonly` `optional` **streamPartDelay?**: `Input`

###### Inherited from

[`StepOptions`](#stepoptions).[`streamPartDelay`](#streampartdelay-1)

##### tokens?

> `readonly` `optional` **tokens?**: readonly `number`[]

Provider output token ids exposed to trajectory exporters.

###### Inherited from

[`StepOptions`](#stepoptions).[`tokens`](#tokens-1)

##### usage?

> `readonly` `optional` **usage?**: `Usage`

###### Inherited from

[`StepOptions`](#stepoptions).[`usage`](#usage-1)

## Type Aliases

### Operation

> **Operation** = `"streamText"` \| `"generateText"` \| `"generateObject"`

***

### Part

> **Part** = [`TextPart`](#textpart) \| [`ReasoningPart`](#reasoningpart) \| [`ToolCallPart`](#toolcallpart)

***

### Step

> **Step** = [`Part`](#part) \| [`TurnStep`](#turnstep) \| [`ObjectStep`](#objectstep) \| [`FailureStep`](#failurestep) \| [`TruncatedStep`](#truncatedstep)

***

### TruncationPoint

> **TruncationPoint** = `"reasoning-delta"` \| `"text-delta"` \| `"tool-params-delta"` \| `"response-metadata"`

Where a truncated step stops emitting. The stream always ends
without a `finish` part, reproducing a provider body that reached EOF without
its terminal event.

## Variables

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

### reasoning

> `const` **reasoning**: (`value`) => [`ReasoningPart`](#reasoningpart)

#### Parameters

##### value

`string`

#### Returns

[`ReasoningPart`](#reasoningpart)

***

### text

> `const` **text**: (`value`) => [`TextPart`](#textpart)

#### Parameters

##### value

`string`

#### Returns

[`TextPart`](#textpart)

***

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
