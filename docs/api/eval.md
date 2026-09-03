[**generalist**](./index)

***

[generalist](./index) / eval

# eval

## Classes

### InvalidSuiteOptions

#### Extends

- `InvalidSuiteOptions_base`

#### Constructors

##### Constructor

> **new InvalidSuiteOptions**(...`args`): [`InvalidSuiteOptions`](#invalidsuiteoptions)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`InvalidSuiteOptions`](#invalidsuiteoptions)

###### Inherited from

`InvalidSuiteOptions_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`InvalidSuiteOptions_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`InvalidSuiteOptions_base.message`

## Interfaces

### JudgeOptions

#### Properties

##### model

> `readonly` **model**: `string`

Stable label for the supplied LanguageModel, included in score output.

##### rubric

> `readonly` **rubric**: `string`

***

### Scorer

#### Type Parameters

##### R

`R` = `never`

##### E

`E` = `never`

#### Properties

##### evaluate

> `readonly` **evaluate**: (`trajectory`) => `Effect`\<\{ `message?`: `string`; `passed`: `boolean`; `scorer`: `string`; `value`: `number`; \}, `E`, `R`\>

###### Parameters

###### trajectory

###### agent

`string`

###### budget?

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

Agent budget allocation when the journal's executable manifest declares one.

###### budget.children?

`number`

###### budget.duration?

`number`

###### budget.tokens?

`number`

###### budget.toolCalls?

`number`

###### budget.usd?

`number`

###### gates

readonly `object`[]

###### input

`Prompt`

###### output

`unknown`

###### runId

`string`

###### stopReason

`string`

###### turns

readonly `object`[]

###### Returns

`Effect`\<\{ `message?`: `string`; `passed`: `boolean`; `scorer`: `string`; `value`: `number`; \}, `E`, `R`\>

##### name

> `readonly` **name**: `string`

***

### SuiteOptions

#### Properties

##### concurrency

> `readonly` **concurrency**: `number`

***

### UsageLimit

#### Properties

##### tokens?

> `readonly` `optional` **tokens?**: `number`

##### usd?

> `readonly` `optional` **usd?**: `number`

## Type Aliases

### Score

> **Score** = *typeof* `Score.Type`

***

### SuiteResult

> **SuiteResult** = *typeof* `SuiteResult.Type`

***

### SuiteRow

> **SuiteRow** = *typeof* `SuiteRow.Type`

## Variables

### gatesPassed

> `const` **gatesPassed**: () => [`Scorer`](#scorer)

Score whether the latest verdict for every completion gate passed.

#### Returns

[`Scorer`](#scorer)

***

### judge

> `const` **judge**: (`options`) => [`Scorer`](#scorer)\<`LanguageModel.LanguageModel`, `AiError.AiError`\>

Score with the LanguageModel supplied in the Effect environment.

#### Parameters

##### options

[`JudgeOptions`](#judgeoptions)

#### Returns

[`Scorer`](#scorer)\<`LanguageModel.LanguageModel`, `AiError.AiError`\>

***

### outputMatches

> `const` **outputMatches**: \<`OutputSchema`\>(`schema`) => [`Scorer`](#scorer)\<`OutputSchema`\[`"DecodingServices"`\]\>

#### Type Parameters

##### OutputSchema

`OutputSchema` *extends* `Schema.Top`

#### Parameters

##### schema

`OutputSchema`

#### Returns

[`Scorer`](#scorer)\<`OutputSchema`\[`"DecodingServices"`\]\>

***

### runSuite

> `const` **runSuite**: `RunSuite`

Run a typed Agent over a dataset through Runtime, score each journal, and print a plain-text table.

***

### score

> `const` **score**: \{\<`R`, `E`\>(`scorers`): (`trajectory`) => `Effect`\<readonly `object`[], `E`, `R`\>; \<`R`, `E`\>(`trajectory`, `scorers`): `Effect`\<readonly `object`[], `E`, `R`\>; \}

Evaluate one trajectory with all scorers in declaration order.

#### Call Signature

> \<`R`, `E`\>(`scorers`): (`trajectory`) => `Effect`\<readonly `object`[], `E`, `R`\>

##### Type Parameters

###### R

`R`

###### E

`E`

##### Parameters

###### scorers

readonly [`Scorer`](#scorer)\<`R`, `E`\>[]

##### Returns

(`trajectory`) => `Effect`\<readonly `object`[], `E`, `R`\>

#### Call Signature

> \<`R`, `E`\>(`trajectory`, `scorers`): `Effect`\<readonly `object`[], `E`, `R`\>

##### Type Parameters

###### R

`R`

###### E

`E`

##### Parameters

###### trajectory

###### agent

`Schema.String`

###### budget?

`Schema.optionalKey`\<`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>

Agent budget allocation when the journal's executable manifest declares one.

###### gates

`Schema.$Array`\<`Schema.Struct`\<\{ `evidence`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `name`: `Schema.String`; `verdict`: `Schema.Literals`\<readonly \[`"pass"`, `"fail"`\]\>; \}\>\>

###### input

`Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>

###### output

`Schema.Unknown`

###### runId

`Schema.String`

###### stopReason

`Schema.String`

###### turns

`Schema.$Array`\<`Schema.Struct`\<\{ `compaction`: `Schema.optionalKey`\<`Schema.Codec`\<[`CompactionInspection`](./runtime/namespaces/Run#compactioninspection), [`CompactionInspection`](./runtime/namespaces/Run#compactioninspection), `never`, `never`\>\>; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `response`: `Schema.Struct`\<\{ `content`: `Schema.$Array`\<`Schema.Union`\<readonly \[..., ..., ..., ..., ..., ..., ..., ..., ..., ...\]\>\>; `finishReason`: `Schema.optionalKey`\<`Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>\>; `usage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: `Schema.Struct`\<...\>; `outputTokens`: `Schema.Struct`\<...\>; \}\>\>; \}\>; `toolCalls`: `Schema.$Array`\<`Schema.Struct`\<\{ `id`: `Schema.String`; `isFailure`: `Schema.optionalKey`\<`Schema.Boolean`\>; `name`: `Schema.String`; `params`: `Schema.Unknown`; `result`: `Schema.optionalKey`\<`Schema.Unknown`\>; \}\>\>; `usageFacts`: `Schema.$Array`\<`Schema.Codec`\<[`RawUsageFact`](./runtime/namespaces/Run#rawusagefact), [`RawUsageFact`](./runtime/namespaces/Run#rawusagefact), `never`, `never`\>\>; \}\>\>

###### scorers

readonly [`Scorer`](#scorer)\<`R`, `E`\>[]

##### Returns

`Effect`\<readonly `object`[], `E`, `R`\>

***

### Score

> `const` **Score**: `Schema.Struct`\<\{ `message`: `Schema.optionalKey`\<`Schema.String`\>; `passed`: `Schema.Boolean`; `scorer`: `Schema.String`; `value`: `Schema.Finite`; \}\>

***

### SuiteResult

> `const` **SuiteResult**: `Schema.Struct`\<\{ `agent`: `Schema.String`; `rows`: `Schema.$Array`\<`Schema.Struct`\<\{ `index`: `Schema.Int`; `output`: `Schema.Unknown`; `runId`: `Schema.String`; `scores`: `Schema.$Array`\<`Schema.Struct`\<\{ `message`: `Schema.optionalKey`\<`Schema.String`\>; `passed`: `Schema.Boolean`; `scorer`: `Schema.String`; `value`: `Schema.Finite`; \}\>\>; \}\>\>; \}\>

***

### SuiteRow

> `const` **SuiteRow**: `Schema.Struct`\<\{ `index`: `Schema.Int`; `output`: `Schema.Unknown`; `runId`: `Schema.String`; `scores`: `Schema.$Array`\<`Schema.Struct`\<\{ `message`: `Schema.optionalKey`\<`Schema.String`\>; `passed`: `Schema.Boolean`; `scorer`: `Schema.String`; `value`: `Schema.Finite`; \}\>\>; \}\>

***

### toolCalledAtMost

> `const` **toolCalledAtMost**: \{(`maximum`): (`tool`) => [`Scorer`](#scorer); (`tool`, `maximum`): [`Scorer`](#scorer); \}

#### Call Signature

> (`maximum`): (`tool`) => [`Scorer`](#scorer)

##### Parameters

###### maximum

`number`

##### Returns

(`tool`) => [`Scorer`](#scorer)

#### Call Signature

> (`tool`, `maximum`): [`Scorer`](#scorer)

##### Parameters

###### tool

`string`

###### maximum

`number`

##### Returns

[`Scorer`](#scorer)

***

### usageUnder

> `const` **usageUnder**: (`limit`) => [`Scorer`](#scorer)

#### Parameters

##### limit

[`UsageLimit`](#usagelimit)

#### Returns

[`Scorer`](#scorer)
