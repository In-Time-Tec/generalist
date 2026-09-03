[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Memory

# Memory

## Classes

<a id="memory"></a>

### Memory

#### Extends

- `Memory_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new Memory**(`_`): [`Memory`](#memory)

###### Parameters

###### \_

`never`

###### Returns

[`Memory`](#memory)

###### Inherited from

`Memory_base.constructor`

***

<a id="memoryerror"></a>

### MemoryError

#### Extends

- `MemoryError_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new MemoryError**(...`args`): [`MemoryError`](#memoryerror)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`MemoryError`](#memoryerror)

###### Inherited from

`MemoryError_base.constructor`

#### Properties

<a id="cause"></a>

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`MemoryError_base.cause`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`MemoryError_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`MemoryError_base.message`

<a id="reason"></a>

##### reason?

> `readonly` `optional` **reason?**: `"version"` \| `"embedding"` \| `"vector-store"` \| `"language-model"` \| `"unsupported"`

###### Inherited from

`MemoryError_base.reason`

## Interfaces

<a id="forgetinput"></a>

### ForgetInput

#### Properties

<a id="id"></a>

##### id?

> `readonly` `optional` **id?**: `string`

<a id="key"></a>

##### key

> `readonly` **key**: [`Key`](#key-1)

***

<a id="historyentry"></a>

### HistoryEntry

#### Properties

<a id="appliedat"></a>

##### appliedAt

> `readonly` **appliedAt**: `string`

<a id="evidence"></a>

##### evidence

> `readonly` **evidence**: readonly `object`[]

<a id="supersedes"></a>

##### supersedes?

> `readonly` `optional` **supersedes?**: `number`

<a id="text"></a>

##### text

> `readonly` **text**: `string`

<a id="version"></a>

##### version

> `readonly` **version**: `number`

***

<a id="item"></a>

### Item

#### Properties

<a id="content"></a>

##### content

> `readonly` **content**: readonly `UserMessagePart`[]

<a id="id-1"></a>

##### id

> `readonly` **id**: `string`

<a id="metadata"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

***

<a id="key-1"></a>

### Key

#### Properties

<a id="agent"></a>

##### agent

> `readonly` **agent**: `string`

<a id="subject"></a>

##### subject

> `readonly` **subject**: `string`

***

<a id="recallinput"></a>

### RecallInput

#### Properties

<a id="key-2"></a>

##### key

> `readonly` **key**: [`Key`](#key-1)

<a id="prompt"></a>

##### prompt

> `readonly` **prompt**: `Prompt`

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="rememberinput"></a>

### RememberInput

#### Properties

<a id="entryid"></a>

##### entryId?

> `readonly` `optional` **entryId?**: `string`

<a id="evidence-1"></a>

##### evidence

> `readonly` **evidence**: readonly `object`[]

<a id="key-3"></a>

##### key

> `readonly` **key**: [`Key`](#key-1)

<a id="supersedes-1"></a>

##### supersedes?

> `readonly` `optional` **supersedes?**: `number`

<a id="terminal"></a>

##### terminal

> `readonly` **terminal**: `boolean`

<a id="transcript"></a>

##### transcript

> `readonly` **transcript**: `Prompt`

<a id="turn-1"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="revertinput"></a>

### RevertInput

#### Properties

<a id="to"></a>

##### to

> `readonly` **to**: `number`

***

<a id="service"></a>

### Service

#### Properties

<a id="forget"></a>

##### forget

> `readonly` **forget**: (`input`) => `Effect`\<`void`, [`MemoryError`](#memoryerror)\>

###### Parameters

###### input

[`ForgetInput`](#forgetinput)

###### Returns

`Effect`\<`void`, [`MemoryError`](#memoryerror)\>

<a id="history"></a>

##### history

> `readonly` **history**: (`entryId`) => `Effect`\<readonly [`HistoryEntry`](#historyentry)[], [`MemoryError`](#memoryerror)\>

###### Parameters

###### entryId

`string`

###### Returns

`Effect`\<readonly [`HistoryEntry`](#historyentry)[], [`MemoryError`](#memoryerror)\>

<a id="recall"></a>

##### recall

> `readonly` **recall**: (`input`) => `Effect`\<readonly [`Item`](#item)[], [`MemoryError`](#memoryerror)\>

###### Parameters

###### input

[`RecallInput`](#recallinput)

###### Returns

`Effect`\<readonly [`Item`](#item)[], [`MemoryError`](#memoryerror)\>

<a id="remember"></a>

##### remember

> `readonly` **remember**: (`input`) => `Effect`\<`void`, [`MemoryError`](#memoryerror)\>

###### Parameters

###### input

[`RememberInput`](#rememberinput)

###### Returns

`Effect`\<`void`, [`MemoryError`](#memoryerror)\>

<a id="revert"></a>

##### revert

> `readonly` **revert**: (`entryId`, `input`) => `Effect`\<`void`, [`MemoryError`](#memoryerror)\>

###### Parameters

###### entryId

`string`

###### input

[`RevertInput`](#revertinput)

###### Returns

`Effect`\<`void`, [`MemoryError`](#memoryerror)\>

## Type Aliases

<a id="itempart"></a>

### ItemPart

> **ItemPart** = `Prompt.UserMessagePart`

***

<a id="metadata-1"></a>

### Metadata

> **Metadata** = `Readonly`\<`Record`\<`string`, *typeof* `Schema.Unknown.Type`\>\>

***

<a id="operationref"></a>

### OperationRef

> **OperationRef** = *typeof* `OperationRef.Type`

***

<a id="version-1"></a>

### Version

> **Version** = *typeof* `Version.Type`

## Variables

<a id="ismessagefromrecall"></a>

### isMessageFromRecall

> `const` **isMessageFromRecall**: (`message`) => `boolean`

#### Parameters

##### message

`Prompt.Message`

#### Returns

`boolean`

***

<a id="itemfrompromptpart"></a>

### itemFromPromptPart

> `const` **itemFromPromptPart**: (`a`) => `Option.Option`\<`Prompt.UserMessagePart`\>

#### Parameters

##### a

`Prompt.Part`

#### Returns

`Option.Option`\<`Prompt.UserMessagePart`\>

***

<a id="layernoop"></a>

### layerNoop

> `const` **layerNoop**: `Layer.Layer`\<[`Memory`](#memory)\>

Memory implementation that recalls and records nothing.

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Memory`](#memory)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`Memory`](#memory)\>

***

<a id="merge"></a>

### merge

> `const` **merge**: \{(`second`): (`first`) => [`Service`](#service); (`first`, `second`): [`Service`](#service); \}

#### Call Signature

> (`second`): (`first`) => [`Service`](#service)

##### Parameters

###### second

[`Service`](#service)

##### Returns

(`first`) => [`Service`](#service)

#### Call Signature

> (`first`, `second`): [`Service`](#service)

##### Parameters

###### first

[`Service`](#service)

###### second

[`Service`](#service)

##### Returns

[`Service`](#service)

***

<a id="messagefromrecall"></a>

### messageFromRecall

> `const` **messageFromRecall**: (`content`) => `Prompt.UserMessage`

#### Parameters

##### content

`ReadonlyArray`\<[`ItemPart`](#itempart)\>

#### Returns

`Prompt.UserMessage`

***

<a id="operationref-1"></a>

### OperationRef

> `const` **OperationRef**: `Schema.Struct`\<\{ `runId`: `Schema.String`; `turn`: `Schema.Int`; \}\>

***

<a id="projecttranscript"></a>

### projectTranscript

> `const` **projectTranscript**: (`transcript`) => `Prompt.Prompt`

#### Parameters

##### transcript

`Prompt.Prompt`

#### Returns

`Prompt.Prompt`

***

<a id="recalledmessageidentity"></a>

### recalledMessageIdentity

> `const` **recalledMessageIdentity**: (`message`) => `Prompt.Message`

#### Parameters

##### message

`Prompt.Message`

#### Returns

`Prompt.Message`

***

<a id="replacerecalledmessage"></a>

### replaceRecalledMessage

> `const` **replaceRecalledMessage**: \{(`content`): (`message`) => `UserMessage`; (`message`, `content`): `UserMessage`; \}

#### Call Signature

> (`content`): (`message`) => `UserMessage`

##### Parameters

###### content

readonly `UserMessagePart`[]

##### Returns

(`message`) => `UserMessage`

#### Call Signature

> (`message`, `content`): `UserMessage`

##### Parameters

###### message

`UserMessage`

###### content

readonly `UserMessagePart`[]

##### Returns

`UserMessage`

***

<a id="version-2"></a>

### Version

> `const` **Version**: `Schema.Int`
