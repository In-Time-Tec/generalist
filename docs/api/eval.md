[**generalist**](./index)

***

[generalist](./index) / eval

# eval

## Classes

<a id="invalidsuiteoptions"></a>

### InvalidSuiteOptions

#### Extends

- `InvalidSuiteOptions_base`

#### Constructors

<a id="constructor"></a>

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

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`InvalidSuiteOptions_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`InvalidSuiteOptions_base.message`

## Interfaces

<a id="judgeoptions"></a>

### JudgeOptions

#### Properties

<a id="model"></a>

##### model

> `readonly` **model**: `string`

Stable label for the supplied LanguageModel, included in score output.

<a id="rubric"></a>

##### rubric

> `readonly` **rubric**: `string`

***

<a id="scorer"></a>

### Scorer

#### Type Parameters

##### R

`R` = `never`

##### E

`E` = `never`

#### Properties

<a id="evaluate"></a>

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

<a id="name"></a>

##### name

> `readonly` **name**: `string`

***

<a id="suiteoptions"></a>

### SuiteOptions

#### Properties

<a id="concurrency"></a>

##### concurrency

> `readonly` **concurrency**: `number`

***

<a id="usagelimit"></a>

### UsageLimit

#### Properties

<a id="tokens"></a>

##### tokens?

> `readonly` `optional` **tokens?**: `number`

<a id="usd"></a>

##### usd?

> `readonly` `optional` **usd?**: `number`

## Type Aliases

<a id="score"></a>

### Score

> **Score** = *typeof* `Score.Type`

***

<a id="suiteresult"></a>

### SuiteResult

> **SuiteResult** = *typeof* `SuiteResult.Type`

***

<a id="suiterow"></a>

### SuiteRow

> **SuiteRow** = *typeof* `SuiteRow.Type`

## Variables

<a id="gatespassed"></a>

### gatesPassed

> `const` **gatesPassed**: () => [`Scorer`](#scorer)

Score whether the latest verdict for every completion gate passed.

#### Returns

[`Scorer`](#scorer)

***

<a id="judge"></a>

### judge

> `const` **judge**: (`options`) => [`Scorer`](#scorer)\<`LanguageModel.LanguageModel`, `AiError.AiError`\>

Score with the LanguageModel supplied in the Effect environment.

#### Parameters

##### options

[`JudgeOptions`](#judgeoptions)

#### Returns

[`Scorer`](#scorer)\<`LanguageModel.LanguageModel`, `AiError.AiError`\>

***

<a id="outputmatches"></a>

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

<a id="runsuite"></a>

### runSuite

> `const` **runSuite**: `RunSuite`

Run a typed Agent over a dataset through Runtime, score each journal, and print a plain-text table.

***

<a id="score-1"></a>

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

<a id="score-2"></a>

### Score

> `const` **Score**: `Schema.Struct`\<\{ `message`: `Schema.optionalKey`\<`Schema.String`\>; `passed`: `Schema.Boolean`; `scorer`: `Schema.String`; `value`: `Schema.Finite`; \}\>

***

<a id="suiteresult-1"></a>

### SuiteResult

> `const` **SuiteResult**: `Schema.Struct`\<\{ `agent`: `Schema.String`; `rows`: `Schema.$Array`\<`Schema.Struct`\<\{ `index`: `Schema.Int`; `output`: `Schema.Unknown`; `runId`: `Schema.String`; `scores`: `Schema.$Array`\<`Schema.Struct`\<\{ `message`: `Schema.optionalKey`\<`Schema.String`\>; `passed`: `Schema.Boolean`; `scorer`: `Schema.String`; `value`: `Schema.Finite`; \}\>\>; \}\>\>; \}\>

***

<a id="suiterow-1"></a>

### SuiteRow

> `const` **SuiteRow**: `Schema.Struct`\<\{ `index`: `Schema.Int`; `output`: `Schema.Unknown`; `runId`: `Schema.String`; `scores`: `Schema.$Array`\<`Schema.Struct`\<\{ `message`: `Schema.optionalKey`\<`Schema.String`\>; `passed`: `Schema.Boolean`; `scorer`: `Schema.String`; `value`: `Schema.Finite`; \}\>\>; \}\>

***

<a id="toolcalledatmost"></a>

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

<a id="usageunder"></a>

### usageUnder

> `const` **usageUnder**: (`limit`) => [`Scorer`](#scorer)

#### Parameters

##### limit

[`UsageLimit`](#usagelimit)

#### Returns

[`Scorer`](#scorer)
