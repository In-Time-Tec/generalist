[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Memory

# Memory

## Classes

### Memory

#### Extends

- `Memory_base`

#### Constructors

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

### MemoryError

#### Extends

- `MemoryError_base`

#### Constructors

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

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`MemoryError_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`MemoryError_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`MemoryError_base.message`

##### reason?

> `readonly` `optional` **reason?**: `"version"` \| `"embedding"` \| `"vector-store"` \| `"language-model"` \| `"unsupported"`

###### Inherited from

`MemoryError_base.reason`

## Interfaces

### ForgetInput

#### Properties

##### id?

> `readonly` `optional` **id?**: `string`

##### key

> `readonly` **key**: [`Key`](#key-1)

***

### HistoryEntry

#### Properties

##### appliedAt

> `readonly` **appliedAt**: `string`

##### evidence

> `readonly` **evidence**: readonly `object`[]

##### supersedes?

> `readonly` `optional` **supersedes?**: `number`

##### text

> `readonly` **text**: `string`

##### version

> `readonly` **version**: `number`

***

### Item

#### Properties

##### content

> `readonly` **content**: readonly `UserMessagePart`[]

##### id

> `readonly` **id**: `string`

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

***

### Key

#### Properties

##### agent

> `readonly` **agent**: `string`

##### subject

> `readonly` **subject**: `string`

***

### RecallInput

#### Properties

##### key

> `readonly` **key**: [`Key`](#key-1)

##### prompt

> `readonly` **prompt**: `Prompt`

##### turn

> `readonly` **turn**: `number`

***

### RememberInput

#### Properties

##### entryId?

> `readonly` `optional` **entryId?**: `string`

##### evidence

> `readonly` **evidence**: readonly `object`[]

##### key

> `readonly` **key**: [`Key`](#key-1)

##### supersedes?

> `readonly` `optional` **supersedes?**: `number`

##### terminal

> `readonly` **terminal**: `boolean`

##### transcript

> `readonly` **transcript**: `Prompt`

##### turn

> `readonly` **turn**: `number`

***

### RevertInput

#### Properties

##### to

> `readonly` **to**: `number`

***

### Service

#### Properties

##### forget

> `readonly` **forget**: (`input`) => `Effect`\<`void`, [`MemoryError`](#memoryerror)\>

###### Parameters

###### input

[`ForgetInput`](#forgetinput)

###### Returns

`Effect`\<`void`, [`MemoryError`](#memoryerror)\>

##### history

> `readonly` **history**: (`entryId`) => `Effect`\<readonly [`HistoryEntry`](#historyentry)[], [`MemoryError`](#memoryerror)\>

###### Parameters

###### entryId

`string`

###### Returns

`Effect`\<readonly [`HistoryEntry`](#historyentry)[], [`MemoryError`](#memoryerror)\>

##### recall

> `readonly` **recall**: (`input`) => `Effect`\<readonly [`Item`](#item)[], [`MemoryError`](#memoryerror)\>

###### Parameters

###### input

[`RecallInput`](#recallinput)

###### Returns

`Effect`\<readonly [`Item`](#item)[], [`MemoryError`](#memoryerror)\>

##### remember

> `readonly` **remember**: (`input`) => `Effect`\<`void`, [`MemoryError`](#memoryerror)\>

###### Parameters

###### input

[`RememberInput`](#rememberinput)

###### Returns

`Effect`\<`void`, [`MemoryError`](#memoryerror)\>

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

### ItemPart

> **ItemPart** = `Prompt.UserMessagePart`

***

### Metadata

> **Metadata** = `Readonly`\<`Record`\<`string`, *typeof* `Schema.Unknown.Type`\>\>

***

### OperationRef

> **OperationRef** = *typeof* `OperationRef.Type`

***

### Version

> **Version** = *typeof* `Version.Type`

## Variables

### isMessageFromRecall

> `const` **isMessageFromRecall**: (`message`) => `boolean`

#### Parameters

##### message

`Prompt.Message`

#### Returns

`boolean`

***

### itemFromPromptPart

> `const` **itemFromPromptPart**: (`a`) => `Option.Option`\<`Prompt.UserMessagePart`\>

#### Parameters

##### a

`Prompt.Part`

#### Returns

`Option.Option`\<`Prompt.UserMessagePart`\>

***

### layerNoop

> `const` **layerNoop**: `Layer.Layer`\<[`Memory`](#memory)\>

Memory implementation that recalls and records nothing.

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Memory`](#memory)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`Memory`](#memory)\>

***

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

### messageFromRecall

> `const` **messageFromRecall**: (`content`) => `Prompt.UserMessage`

#### Parameters

##### content

`ReadonlyArray`\<[`ItemPart`](#itempart)\>

#### Returns

`Prompt.UserMessage`

***

### OperationRef

> `const` **OperationRef**: `Schema.Struct`\<\{ `runId`: `Schema.String`; `turn`: `Schema.Int`; \}\>

***

### projectTranscript

> `const` **projectTranscript**: (`transcript`) => `Prompt.Prompt`

#### Parameters

##### transcript

`Prompt.Prompt`

#### Returns

`Prompt.Prompt`

***

### recalledMessageIdentity

> `const` **recalledMessageIdentity**: (`message`) => `Prompt.Message`

#### Parameters

##### message

`Prompt.Message`

#### Returns

`Prompt.Message`

***

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

### Version

> `const` **Version**: `Schema.Int`
