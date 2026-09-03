[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / DurableDriver

# DurableDriver

## Classes

### DriverError

#### Extends

- `DriverError_base`

#### Constructors

##### Constructor

> **new DriverError**(...`args`): [`DriverError`](#drivererror)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`DriverError`](#drivererror)

###### Inherited from

`DriverError_base.constructor`

#### Properties

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`DriverError_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`DriverError_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`DriverError_base.message`

***

### DriverInterpreter

#### Extends

- `DriverInterpreter_base`

#### Constructors

##### Constructor

> **new DriverInterpreter**(`_`): [`DriverInterpreter`](#driverinterpreter)

###### Parameters

###### \_

`never`

###### Returns

[`DriverInterpreter`](#driverinterpreter)

###### Inherited from

`DriverInterpreter_base.constructor`

***

### DriverJournal

Optional host journal service merged into Agent.stream driver layers.

#### Extends

- `DriverJournal_base`

#### Constructors

##### Constructor

> **new DriverJournal**(`_`): [`DriverJournal`](#driverjournal)

###### Parameters

###### \_

`never`

###### Returns

[`DriverJournal`](#driverjournal)

###### Inherited from

`DriverJournal_base.constructor`

***

### DriverStateInvalid

#### Extends

- `DriverStateInvalid_base`

#### Constructors

##### Constructor

> **new DriverStateInvalid**(...`args`): [`DriverStateInvalid`](#driverstateinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`DriverStateInvalid`](#driverstateinvalid)

###### Inherited from

`DriverStateInvalid_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`DriverStateInvalid_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`DriverStateInvalid_base.message`

***

### DriverUnknownReplay

#### Extends

- `DriverUnknownReplay_base`

#### Constructors

##### Constructor

> **new DriverUnknownReplay**(...`args`): [`DriverUnknownReplay`](#driverunknownreplay)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`DriverUnknownReplay`](#driverunknownreplay)

###### Inherited from

`DriverUnknownReplay_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`DriverUnknownReplay_base.hint`

##### operationId

> `readonly` **operationId**: `string`

###### Inherited from

`DriverUnknownReplay_base.operationId`

##### operationKey

> `readonly` **operationKey**: `string`

###### Inherited from

`DriverUnknownReplay_base.operationKey`

***

### DriverVersionMismatch

#### Extends

- `DriverVersionMismatch_base`

#### Constructors

##### Constructor

> **new DriverVersionMismatch**(...`args`): [`DriverVersionMismatch`](#driverversionmismatch)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`DriverVersionMismatch`](#driverversionmismatch)

###### Inherited from

`DriverVersionMismatch_base.constructor`

#### Properties

##### actual

> `readonly` **actual**: `string`

###### Inherited from

`DriverVersionMismatch_base.actual`

##### expected

> `readonly` **expected**: `string`

###### Inherited from

`DriverVersionMismatch_base.expected`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`DriverVersionMismatch_base.hint`

## Interfaces

### DriverInput

Input used to construct the first checkpoint for one run.

#### Properties

##### budget

> `readonly` **budget**: `object`

###### allocation

> `readonly` **allocation**: `object`

###### allocation.children?

> `readonly` `optional` **children?**: `number`

###### allocation.duration?

> `readonly` `optional` **duration?**: `number`

###### allocation.tokens?

> `readonly` `optional` **tokens?**: `number`

###### allocation.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### allocation.usd?

> `readonly` `optional` **usd?**: `number`

###### remaining

> `readonly` **remaining**: `object`

###### remaining.children?

> `readonly` `optional` **children?**: `number`

###### remaining.duration?

> `readonly` `optional` **duration?**: `number`

###### remaining.tokens?

> `readonly` `optional` **tokens?**: `number`

###### remaining.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### remaining.usd?

> `readonly` `optional` **usd?**: `number`

##### executable?

> `readonly` `optional` **executable?**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

##### prompt

> `readonly` **prompt**: `Prompt`

##### resume?

> `readonly` `optional` **resume?**: `unknown`

***

### DurableAgentDriver

Versioned durable agent driver shared by inline and runtime execution.

#### Properties

##### apply

> `readonly` **apply**: (`checkpoint`, `outcome`) => `Effect`\<\{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \}, [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>

###### Parameters

###### checkpoint

###### budget

\{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}

###### budget.allocation

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### budget.allocation.children?

`number`

###### budget.allocation.duration?

`number`

###### budget.allocation.tokens?

`number`

###### budget.allocation.toolCalls?

`number`

###### budget.allocation.usd?

`number`

###### budget.remaining

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### budget.remaining.children?

`number`

###### budget.remaining.duration?

`number`

###### budget.remaining.tokens?

`number`

###### budget.remaining.toolCalls?

`number`

###### budget.remaining.usd?

`number`

###### driverVersion

`string`

###### executable?

\{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}

###### executable.active

`string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable.executable

`string` & `Brand`\<`"generalist/executable-pin"`\>

###### state

`unknown`

###### turn

`number`

###### outcome

\{ `_tag`: `"Succeeded"`; `value`: `unknown`; \} \| \{ `_tag`: `"Failed"`; `error`: `unknown`; \} \| \{ `_tag`: `"Unknown"`; `operationId`: `string`; \}

###### Returns

`Effect`\<\{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \}, [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>

##### decide

> `readonly` **decide**: (`checkpoint`) => `Effect`\<\{ `_tag`: `"Execute"`; `operation`: \{ `input`: `unknown`; `inputDigest`: `string`; `key`: `string`; `kind`: `"compaction"` \| `"send"` \| `"model"` \| `"structured-output"` \| `"tool"` \| `"memory"` \| `"wait"` \| `"handoff"`; `replayPolicy`: `"pure"` \| `"provider-idempotent"` \| `"never"`; \}; \} \| \{ `_tag`: `"Wait"`; `wait`: \{ `reason`: `string`; `replayToken?`: `string`; `waitId`: `string`; \}; \} \| \{ `_tag`: `"Continue"`; `checkpoint`: \{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \}; \} \| \{ `_tag`: `"Complete"`; `result`: \{ `text`: `string`; `turns`: `number`; \}; \}, [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>

###### Parameters

###### checkpoint

###### budget

\{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}

###### budget.allocation

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### budget.allocation.children?

`number`

###### budget.allocation.duration?

`number`

###### budget.allocation.tokens?

`number`

###### budget.allocation.toolCalls?

`number`

###### budget.allocation.usd?

`number`

###### budget.remaining

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### budget.remaining.children?

`number`

###### budget.remaining.duration?

`number`

###### budget.remaining.tokens?

`number`

###### budget.remaining.toolCalls?

`number`

###### budget.remaining.usd?

`number`

###### driverVersion

`string`

###### executable?

\{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}

###### executable.active

`string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable.executable

`string` & `Brand`\<`"generalist/executable-pin"`\>

###### state

`unknown`

###### turn

`number`

###### Returns

`Effect`\<\{ `_tag`: `"Execute"`; `operation`: \{ `input`: `unknown`; `inputDigest`: `string`; `key`: `string`; `kind`: `"compaction"` \| `"send"` \| `"model"` \| `"structured-output"` \| `"tool"` \| `"memory"` \| `"wait"` \| `"handoff"`; `replayPolicy`: `"pure"` \| `"provider-idempotent"` \| `"never"`; \}; \} \| \{ `_tag`: `"Wait"`; `wait`: \{ `reason`: `string`; `replayToken?`: `string`; `waitId`: `string`; \}; \} \| \{ `_tag`: `"Continue"`; `checkpoint`: \{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \}; \} \| \{ `_tag`: `"Complete"`; `result`: \{ `text`: `string`; `turns`: `number`; \}; \}, [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>

##### initial

> `readonly` **initial**: (`input`) => `Effect`\<\{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \}, [`DriverError`](#drivererror)\>

###### Parameters

###### input

[`DriverInput`](#driverinput)

###### Returns

`Effect`\<\{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}; `state`: `unknown`; `turn`: `number`; \}, [`DriverError`](#drivererror)\>

##### version

> `readonly` **version**: `string`

***

### Journal

Host hook surface for durable operation journaling without runtime imports.

#### Properties

##### onCheckpoint

> `readonly` **onCheckpoint**: (`checkpoint`) => `Effect`\<`void`, [`DriverError`](#drivererror)\>

###### Parameters

###### checkpoint

###### budget

\{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}

###### budget.allocation

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### budget.allocation.children?

`number`

###### budget.allocation.duration?

`number`

###### budget.allocation.tokens?

`number`

###### budget.allocation.toolCalls?

`number`

###### budget.allocation.usd?

`number`

###### budget.remaining

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### budget.remaining.children?

`number`

###### budget.remaining.duration?

`number`

###### budget.remaining.tokens?

`number`

###### budget.remaining.toolCalls?

`number`

###### budget.remaining.usd?

`number`

###### driverVersion

`string`

###### executable?

\{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}

###### executable.active

`string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable.executable

`string` & `Brand`\<`"generalist/executable-pin"`\>

###### state

`unknown`

###### turn

`number`

###### Returns

`Effect`\<`void`, [`DriverError`](#drivererror)\>

##### onCompleted

> `readonly` **onCompleted**: (`operation`, `outcome`, `checkpoint`) => `Effect`\<`void`, [`DriverError`](#drivererror)\>

###### Parameters

###### operation

###### input

`unknown`

###### inputDigest

`string`

###### key

`string`

###### kind

`"compaction"` \| `"send"` \| `"model"` \| `"structured-output"` \| `"tool"` \| `"memory"` \| `"wait"` \| `"handoff"`

###### replayPolicy

`"pure"` \| `"provider-idempotent"` \| `"never"`

###### outcome

\{ `_tag`: `"Succeeded"`; `value`: `unknown`; \} \| \{ `_tag`: `"Failed"`; `error`: `unknown`; \} \| \{ `_tag`: `"Unknown"`; `operationId`: `string`; \}

###### checkpoint

###### budget

\{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}

###### budget.allocation

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### budget.allocation.children?

`number`

###### budget.allocation.duration?

`number`

###### budget.allocation.tokens?

`number`

###### budget.allocation.toolCalls?

`number`

###### budget.allocation.usd?

`number`

###### budget.remaining

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### budget.remaining.children?

`number`

###### budget.remaining.duration?

`number`

###### budget.remaining.tokens?

`number`

###### budget.remaining.toolCalls?

`number`

###### budget.remaining.usd?

`number`

###### driverVersion

`string`

###### executable?

\{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}

###### executable.active

`string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable.executable

`string` & `Brand`\<`"generalist/executable-pin"`\>

###### state

`unknown`

###### turn

`number`

###### Returns

`Effect`\<`void`, [`DriverError`](#drivererror)\>

##### onScheduled

> `readonly` **onScheduled**: (`operation`, `checkpoint`) => `Effect`\<`void` \| \{ `_tag`: `"Succeeded"`; `value`: `unknown`; \} \| \{ `_tag`: `"Failed"`; `error`: `unknown`; \} \| \{ `_tag`: `"Unknown"`; `operationId`: `string`; \}, [`DriverError`](#drivererror)\>

###### Parameters

###### operation

###### input

`unknown`

###### inputDigest

`string`

###### key

`string`

###### kind

`"compaction"` \| `"send"` \| `"model"` \| `"structured-output"` \| `"tool"` \| `"memory"` \| `"wait"` \| `"handoff"`

###### replayPolicy

`"pure"` \| `"provider-idempotent"` \| `"never"`

###### checkpoint

###### budget

\{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}

###### budget.allocation

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### budget.allocation.children?

`number`

###### budget.allocation.duration?

`number`

###### budget.allocation.tokens?

`number`

###### budget.allocation.toolCalls?

`number`

###### budget.allocation.usd?

`number`

###### budget.remaining

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### budget.remaining.children?

`number`

###### budget.remaining.duration?

`number`

###### budget.remaining.tokens?

`number`

###### budget.remaining.toolCalls?

`number`

###### budget.remaining.usd?

`number`

###### driverVersion

`string`

###### executable?

\{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}

###### executable.active

`string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable.executable

`string` & `Brand`\<`"generalist/executable-pin"`\>

###### state

`unknown`

###### turn

`number`

###### Returns

`Effect`\<`void` \| \{ `_tag`: `"Succeeded"`; `value`: `unknown`; \} \| \{ `_tag`: `"Failed"`; `error`: `unknown`; \} \| \{ `_tag`: `"Unknown"`; `operationId`: `string`; \}, [`DriverError`](#drivererror)\>

***

### OperationSpec

Operation scheduled at one agent-loop effect boundary.

#### Extends

- `OperationInput`

#### Type Parameters

##### Success

`Success`

##### Failure

`Failure`

##### SuccessDecodingServices

`SuccessDecodingServices` = `never`

##### SuccessEncodingServices

`SuccessEncodingServices` = `never`

##### FailureDecodingServices

`FailureDecodingServices` = `never`

##### FailureEncodingServices

`FailureEncodingServices` = `never`

#### Properties

##### applyCheckpoint?

> `readonly` `optional` **applyCheckpoint?**: (`checkpoint`, `outcome`) => `object`

###### Parameters

###### checkpoint

###### budget

\{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}

###### budget.allocation

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### budget.allocation.children?

`number`

###### budget.allocation.duration?

`number`

###### budget.allocation.tokens?

`number`

###### budget.allocation.toolCalls?

`number`

###### budget.allocation.usd?

`number`

###### budget.remaining

\{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}

###### budget.remaining.children?

`number`

###### budget.remaining.duration?

`number`

###### budget.remaining.tokens?

`number`

###### budget.remaining.toolCalls?

`number`

###### budget.remaining.usd?

`number`

###### driverVersion

`string`

###### executable?

\{ `active`: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>; `executable`: `string` & `Brand`\<`"generalist/executable-pin"`\>; \}

###### executable.active

`string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable.executable

`string` & `Brand`\<`"generalist/executable-pin"`\>

###### state

`unknown`

###### turn

`number`

###### outcome

\{ `_tag`: `"Succeeded"`; `value`: `unknown`; \} \| \{ `_tag`: `"Failed"`; `error`: `unknown`; \} \| \{ `_tag`: `"Unknown"`; `operationId`: `string`; \}

###### Returns

`object`

###### budget

> `readonly` **budget**: `object`

###### budget.allocation

> `readonly` **allocation**: `object`

###### budget.allocation.children?

> `readonly` `optional` **children?**: `number`

###### budget.allocation.duration?

> `readonly` `optional` **duration?**: `number`

###### budget.allocation.tokens?

> `readonly` `optional` **tokens?**: `number`

###### budget.allocation.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### budget.allocation.usd?

> `readonly` `optional` **usd?**: `number`

###### budget.remaining

> `readonly` **remaining**: `object`

###### budget.remaining.children?

> `readonly` `optional` **children?**: `number`

###### budget.remaining.duration?

> `readonly` `optional` **duration?**: `number`

###### budget.remaining.tokens?

> `readonly` `optional` **tokens?**: `number`

###### budget.remaining.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### budget.remaining.usd?

> `readonly` `optional` **usd?**: `number`

###### driverVersion

> `readonly` **driverVersion**: `string`

###### executable?

> `readonly` `optional` **executable?**: `object`

###### executable.active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable.executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### state

> `readonly` **state**: `unknown`

###### turn

> `readonly` **turn**: `number`

##### failure

> `readonly` **failure**: `Codec`\<`Failure`, `unknown`, `FailureDecodingServices`, `FailureEncodingServices`\>

##### input

> `readonly` **input**: `unknown`

###### Inherited from

`OperationInput.input`

##### key

> `readonly` **key**: `string`

###### Inherited from

`OperationInput.key`

##### kind

> `readonly` **kind**: `"compaction"` \| `"send"` \| `"model"` \| `"structured-output"` \| `"tool"` \| `"memory"` \| `"wait"` \| `"handoff"`

###### Inherited from

`OperationInput.kind`

##### replayPolicy

> `readonly` **replayPolicy**: `"pure"` \| `"provider-idempotent"` \| `"never"`

###### Inherited from

`OperationInput.replayPolicy`

##### success

> `readonly` **success**: `Codec`\<`Success`, `unknown`, `SuccessDecodingServices`, `SuccessEncodingServices`\>

##### turn?

> `readonly` `optional` **turn?**: `number`

***

### RecordedOperation

Recorded operation for tests and future runtime journaling.

#### Properties

##### checkpoint

> `readonly` **checkpoint**: `object`

###### budget

> `readonly` **budget**: `object`

###### budget.allocation

> `readonly` **allocation**: `object`

###### budget.allocation.children?

> `readonly` `optional` **children?**: `number`

###### budget.allocation.duration?

> `readonly` `optional` **duration?**: `number`

###### budget.allocation.tokens?

> `readonly` `optional` **tokens?**: `number`

###### budget.allocation.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### budget.allocation.usd?

> `readonly` `optional` **usd?**: `number`

###### budget.remaining

> `readonly` **remaining**: `object`

###### budget.remaining.children?

> `readonly` `optional` **children?**: `number`

###### budget.remaining.duration?

> `readonly` `optional` **duration?**: `number`

###### budget.remaining.tokens?

> `readonly` `optional` **tokens?**: `number`

###### budget.remaining.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### budget.remaining.usd?

> `readonly` `optional` **usd?**: `number`

###### driverVersion

> `readonly` **driverVersion**: `string`

###### executable?

> `readonly` `optional` **executable?**: `object`

###### executable.active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable.executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### state

> `readonly` **state**: `unknown`

###### turn

> `readonly` **turn**: `number`

##### operation

> `readonly` **operation**: `object`

###### input

> `readonly` **input**: `unknown`

###### inputDigest

> `readonly` **inputDigest**: `string`

###### key

> `readonly` **key**: `string`

###### kind

> `readonly` **kind**: `"compaction"` \| `"send"` \| `"model"` \| `"structured-output"` \| `"tool"` \| `"memory"` \| `"wait"` \| `"handoff"`

###### replayPolicy

> `readonly` **replayPolicy**: `"pure"` \| `"provider-idempotent"` \| `"never"`

##### outcome

> `readonly` **outcome**: \{ `_tag`: `"Succeeded"`; `value`: `unknown`; \} \| \{ `_tag`: `"Failed"`; `error`: `unknown`; \} \| \{ `_tag`: `"Unknown"`; `operationId`: `string`; \}

***

### StreamSuccessCodec

Caller-owned successful stream result and replay codec.

#### Type Parameters

##### A

`A`

##### Success

`Success`

##### ReplayError

`ReplayError` = `never`

##### ReplayServices

`ReplayServices` = `never`

#### Properties

##### complete

> `readonly` **complete**: () => `Success`

###### Returns

`Success`

##### isComplete?

> `readonly` `optional` **isComplete?**: () => `boolean`

Whether the source reached its authored semantic terminal value rather than a downstream consumer stopping early.

###### Returns

`boolean`

##### observe

> `readonly` **observe**: (`value`) => `void`

###### Parameters

###### value

`A`

###### Returns

`void`

##### replay

> `readonly` **replay**: (`success`) => `Stream`\<`A`, `ReplayError`, `ReplayServices`\>

###### Parameters

###### success

`Success`

###### Returns

`Stream`\<`A`, `ReplayError`, `ReplayServices`\>

***

### TracerModelStep

Scripted model response used by the tracer driver.

#### Properties

##### text?

> `readonly` `optional` **text?**: `string`

##### toolCalls?

> `readonly` `optional` **toolCalls?**: readonly `object`[]

##### wait?

> `readonly` `optional` **wait?**: `object`

###### reason

> `readonly` **reason**: `string`

###### waitId

> `readonly` **waitId**: `string`

## Type Aliases

### DriverCheckpoint

> **DriverCheckpoint** = *typeof* `DriverCheckpoint.Type`

Reconstructable durable checkpoint for one agent run.

***

### DriverDecision

> **DriverDecision** = *typeof* `DriverDecision.Type`

Next step chosen deterministically from one checkpoint.

***

### DriverOperation

> **DriverOperation** = *typeof* `DriverOperation.Type`

One schedulable nondeterministic operation with deterministic identity.

***

### DriverOperationKind

> **DriverOperationKind** = *typeof* `DriverOperationKind.Type`

Bounded operation kinds the driver may schedule.

***

### DriverResult

> **DriverResult** = *typeof* `DriverResult.Type`

Terminal structured result carried by a Complete decision.

***

### DriverVersion

> **DriverVersion** = *typeof* `DriverVersion.Type`

Version string for a durable driver implementation.

***

### OperationOutcome

> **OperationOutcome** = *typeof* `OperationOutcome.Type`

Persisted outcome for one operation attempt.

***

### ReplayPolicy

> **ReplayPolicy** = *typeof* `ReplayPolicy.Type`

How a host may replay one persisted operation after recovery.

***

### TracerState

> **TracerState** = *typeof* `TracerState.Type`

Internal tracer state serialized in DriverCheckpoint.state.

***

### WaitDefinition

> **WaitDefinition** = *typeof* `WaitDefinition.Type`

Wait the driver requests before the next decision.

## Variables

### abortPending

> `const` **abortPending**: (`error`) => `Effect.Effect`\<`void`, [`DriverError`](#drivererror) \| [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverUnknownReplay`](#driverunknownreplay), [`DriverInterpreter`](#driverinterpreter)\>

#### Parameters

##### error

*typeof* `Schema.Unknown.Type`

#### Returns

`Effect.Effect`\<`void`, [`DriverError`](#drivererror) \| [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverUnknownReplay`](#driverunknownreplay), [`DriverInterpreter`](#driverinterpreter)\>

***

### applyOperation

> `const` **applyOperation**: \{(`checkpoint`, `outcome`): (`driver`) => `Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<..., ...\>, `Schema.brand`\<..., ...\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>; (`driver`, `checkpoint`, `outcome`): `Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>; \}

Advance one Execute decision using a supplied outcome.

#### Call Signature

> (`checkpoint`, `outcome`): (`driver`) => `Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<..., ...\>, `Schema.brand`\<..., ...\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>

##### Parameters

###### checkpoint

###### budget

`Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>

###### driverVersion

`Schema.String`

###### executable?

`Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>

###### state

`Schema.Unknown`

###### turn

`Schema.Finite`

###### outcome

\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}

##### Returns

(`driver`) => `Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<..., ...\>, `Schema.brand`\<..., ...\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>

#### Call Signature

> (`driver`, `checkpoint`, `outcome`): `Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>

##### Parameters

###### driver

[`DurableAgentDriver`](#durableagentdriver)

###### checkpoint

###### budget

`Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>

###### driverVersion

`Schema.String`

###### executable?

`Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>

###### state

`Schema.Unknown`

###### turn

`Schema.Finite`

###### outcome

\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}

##### Returns

`Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>

***

### arrayStreamCodec

> `const` **arrayStreamCodec**: \<`A`\>() => [`StreamSuccessCodec`](#streamsuccesscodec)\<`A`, `ReadonlyArray`\<`A`\>\>

Collect and replay one stream as its emitted values.

#### Type Parameters

##### A

`A`

#### Returns

[`StreamSuccessCodec`](#streamsuccesscodec)\<`A`, `ReadonlyArray`\<`A`\>\>

***

### chargeUsage

> `const` **chargeUsage**: (`usage`) => `Effect.Effect`\<`void`, [`DriverError`](#drivererror) \| [`Exhausted`](./RunBudget#exhausted), [`DriverInterpreter`](#driverinterpreter)\>

#### Parameters

##### usage

[`BudgetLimits`](./RunBudget#budgetlimits)

#### Returns

`Effect.Effect`\<`void`, [`DriverError`](#drivererror) \| [`Exhausted`](./RunBudget#exhausted), [`DriverInterpreter`](#driverinterpreter)\>

***

### checkpoint

> `const` **checkpoint**: `Effect.Effect`\<\{ `budget`: \{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}; `driverVersion`: `string`; `executable?`: \{ `active`: `string` & `Brand` \| `string` & `Brand`; `executable`: `string` & `Brand`; \}; `state`: `unknown`; `turn`: `number`; \}, `never`, [`DriverInterpreter`](#driverinterpreter)\>

***

### completeFromCheckpoint

> `const` **completeFromCheckpoint**: (`checkpoint`) => `Effect.Effect`\<`Extract`\<[`DriverDecision`](#driverdecision), \{ `_tag`: `"Complete"`; \}\>, [`DriverStateInvalid`](#driverstateinvalid)\>

Produce a Complete decision from a terminal tracer checkpoint.

#### Parameters

##### checkpoint

[`DriverCheckpoint`](#drivercheckpoint)

#### Returns

`Effect.Effect`\<`Extract`\<[`DriverDecision`](#driverdecision), \{ `_tag`: `"Complete"`; \}\>, [`DriverStateInvalid`](#driverstateinvalid)\>

***

### currentDriverVersion

> `const` **currentDriverVersion**: `"1"`

Current durable driver contract version.

***

### decodeCheckpoint

> `const` **decodeCheckpoint**: \{(`input`, `options?`): `Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, `SchemaError`, `never`\>; (`options?`): (`input`) => `Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<..., ...\>, `Schema.brand`\<..., ...\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, `SchemaError`, `never`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, `SchemaError`, `never`\>

##### Parameters

###### input

###### budget

`Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>

###### driverVersion

`Schema.String`

###### executable?

`Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>

###### state

`Schema.Unknown`

###### turn

`Schema.Finite`

###### options?

`ParseOptions`

##### Returns

`Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, `SchemaError`, `never`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<..., ...\>, `Schema.brand`\<..., ...\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, `SchemaError`, `never`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<..., ...\>, `Schema.brand`\<..., ...\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, `SchemaError`, `never`\>

***

### decodeDecision

> `const` **decodeDecision**: \{(`input`, `options?`): `Effect`\<\{ `_tag`: `Schema.tag`\<`"Execute"`\>; `operation`: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Wait"`\>; `wait`: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Continue"`\>; `checkpoint`: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<...\>; `duration`: `Schema.optionalKey`\<...\>; `tokens`: `Schema.optionalKey`\<...\>; `toolCalls`: `Schema.optionalKey`\<...\>; `usd`: `Schema.optionalKey`\<...\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<...\>; `duration`: `Schema.optionalKey`\<...\>; `tokens`: `Schema.optionalKey`\<...\>; `toolCalls`: `Schema.optionalKey`\<...\>; `usd`: `Schema.optionalKey`\<...\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly ...\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Complete"`\>; `result`: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>; \}, `SchemaError`, `never`\>; (`options?`): (`input`) => `Effect`\<\{ `_tag`: `Schema.tag`\<`"Execute"`\>; `operation`: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Wait"`\>; `wait`: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Continue"`\>; `checkpoint`: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: ...; `duration`: ...; `tokens`: ...; `toolCalls`: ...; `usd`: ...; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: ...; `duration`: ...; `tokens`: ...; `toolCalls`: ...; `usd`: ...; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<...\>; `executable`: `Schema.brand`\<..., ...\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Complete"`\>; `result`: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>; \}, `SchemaError`, `never`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<\{ `_tag`: `Schema.tag`\<`"Execute"`\>; `operation`: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Wait"`\>; `wait`: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Continue"`\>; `checkpoint`: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<...\>; `duration`: `Schema.optionalKey`\<...\>; `tokens`: `Schema.optionalKey`\<...\>; `toolCalls`: `Schema.optionalKey`\<...\>; `usd`: `Schema.optionalKey`\<...\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<...\>; `duration`: `Schema.optionalKey`\<...\>; `tokens`: `Schema.optionalKey`\<...\>; `toolCalls`: `Schema.optionalKey`\<...\>; `usd`: `Schema.optionalKey`\<...\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly ...\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Complete"`\>; `result`: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>; \}, `SchemaError`, `never`\>

##### Parameters

###### input

\{ `_tag`: `Schema.tag`\<`"Execute"`\>; `operation`: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Wait"`\>; `wait`: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Continue"`\>; `checkpoint`: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[..., ...\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Complete"`\>; `result`: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>; \}

###### options?

`ParseOptions`

##### Returns

`Effect`\<\{ `_tag`: `Schema.tag`\<`"Execute"`\>; `operation`: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Wait"`\>; `wait`: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Continue"`\>; `checkpoint`: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<...\>; `duration`: `Schema.optionalKey`\<...\>; `tokens`: `Schema.optionalKey`\<...\>; `toolCalls`: `Schema.optionalKey`\<...\>; `usd`: `Schema.optionalKey`\<...\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<...\>; `duration`: `Schema.optionalKey`\<...\>; `tokens`: `Schema.optionalKey`\<...\>; `toolCalls`: `Schema.optionalKey`\<...\>; `usd`: `Schema.optionalKey`\<...\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly ...\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Complete"`\>; `result`: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>; \}, `SchemaError`, `never`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<\{ `_tag`: `Schema.tag`\<`"Execute"`\>; `operation`: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Wait"`\>; `wait`: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Continue"`\>; `checkpoint`: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: ...; `duration`: ...; `tokens`: ...; `toolCalls`: ...; `usd`: ...; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: ...; `duration`: ...; `tokens`: ...; `toolCalls`: ...; `usd`: ...; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<...\>; `executable`: `Schema.brand`\<..., ...\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Complete"`\>; `result`: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>; \}, `SchemaError`, `never`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<\{ `_tag`: `Schema.tag`\<`"Execute"`\>; `operation`: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Wait"`\>; `wait`: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Continue"`\>; `checkpoint`: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: ...; `duration`: ...; `tokens`: ...; `toolCalls`: ...; `usd`: ...; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: ...; `duration`: ...; `tokens`: ...; `toolCalls`: ...; `usd`: ...; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<...\>; `executable`: `Schema.brand`\<..., ...\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Complete"`\>; `result`: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>; \}, `SchemaError`, `never`\>

***

### decodeOutcome

> `const` **decodeOutcome**: \{(`input`, `options?`): `Effect`\<\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}, `SchemaError`, `never`\>; (`options?`): (`input`) => `Effect`\<\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}, `SchemaError`, `never`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}, `SchemaError`, `never`\>

##### Parameters

###### input

\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}

###### options?

`ParseOptions`

##### Returns

`Effect`\<\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}, `SchemaError`, `never`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}, `SchemaError`, `never`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}, `SchemaError`, `never`\>

***

### DriverCheckpoint

> `const` **DriverCheckpoint**: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>

Reconstructable durable checkpoint for one agent run.

***

### DriverDecision

> `const` **DriverDecision**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Execute"`\>; `operation`: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Wait"`\>; `wait`: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Continue"`\>; `checkpoint`: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: ...; `duration`: ...; `tokens`: ...; `toolCalls`: ...; `usd`: ...; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: ...; `duration`: ...; `tokens`: ...; `toolCalls`: ...; `usd`: ...; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<...\>; `executable`: `Schema.brand`\<..., ...\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Complete"`\>; `result`: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>; \}\>\]\>

Next step chosen deterministically from one checkpoint.

***

### DriverOperation

> `const` **DriverOperation**: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>

One schedulable nondeterministic operation with deterministic identity.

***

### DriverOperationKind

> `const` **DriverOperationKind**: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>

Bounded operation kinds the driver may schedule.

***

### DriverResult

> `const` **DriverResult**: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>

Terminal structured result carried by a Complete decision.

***

### DriverVersion

> `const` **DriverVersion**: `Schema.String`

Version string for a durable driver implementation.

***

### encodeCheckpoint

> `const` **encodeCheckpoint**: \{(`input`, `options?`): `Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, `SchemaError`, `never`\>; (`options?`): (`input`) => `Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<..., ...\>, `Schema.brand`\<..., ...\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, `SchemaError`, `never`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, `SchemaError`, `never`\>

##### Parameters

###### input

###### budget

`Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>

###### driverVersion

`Schema.String`

###### executable?

`Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>

###### state

`Schema.Unknown`

###### turn

`Schema.Finite`

###### options?

`ParseOptions`

##### Returns

`Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, `SchemaError`, `never`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<..., ...\>, `Schema.brand`\<..., ...\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, `SchemaError`, `never`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable?`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<..., ...\>, `Schema.brand`\<..., ...\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}, `SchemaError`, `never`\>

***

### encodeDecision

> `const` **encodeDecision**: \{(`input`, `options?`): `Effect`\<\{ `_tag`: `Schema.tag`\<`"Execute"`\>; `operation`: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Wait"`\>; `wait`: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Continue"`\>; `checkpoint`: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<...\>; `duration`: `Schema.optionalKey`\<...\>; `tokens`: `Schema.optionalKey`\<...\>; `toolCalls`: `Schema.optionalKey`\<...\>; `usd`: `Schema.optionalKey`\<...\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<...\>; `duration`: `Schema.optionalKey`\<...\>; `tokens`: `Schema.optionalKey`\<...\>; `toolCalls`: `Schema.optionalKey`\<...\>; `usd`: `Schema.optionalKey`\<...\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly ...\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Complete"`\>; `result`: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>; \}, `SchemaError`, `never`\>; (`options?`): (`input`) => `Effect`\<\{ `_tag`: `Schema.tag`\<`"Execute"`\>; `operation`: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Wait"`\>; `wait`: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Continue"`\>; `checkpoint`: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: ...; `duration`: ...; `tokens`: ...; `toolCalls`: ...; `usd`: ...; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: ...; `duration`: ...; `tokens`: ...; `toolCalls`: ...; `usd`: ...; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<...\>; `executable`: `Schema.brand`\<..., ...\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Complete"`\>; `result`: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>; \}, `SchemaError`, `never`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<\{ `_tag`: `Schema.tag`\<`"Execute"`\>; `operation`: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Wait"`\>; `wait`: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Continue"`\>; `checkpoint`: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<...\>; `duration`: `Schema.optionalKey`\<...\>; `tokens`: `Schema.optionalKey`\<...\>; `toolCalls`: `Schema.optionalKey`\<...\>; `usd`: `Schema.optionalKey`\<...\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<...\>; `duration`: `Schema.optionalKey`\<...\>; `tokens`: `Schema.optionalKey`\<...\>; `toolCalls`: `Schema.optionalKey`\<...\>; `usd`: `Schema.optionalKey`\<...\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly ...\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Complete"`\>; `result`: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>; \}, `SchemaError`, `never`\>

##### Parameters

###### input

\{ `_tag`: `Schema.tag`\<`"Execute"`\>; `operation`: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Wait"`\>; `wait`: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Continue"`\>; `checkpoint`: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[..., ...\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Complete"`\>; `result`: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>; \}

###### options?

`ParseOptions`

##### Returns

`Effect`\<\{ `_tag`: `Schema.tag`\<`"Execute"`\>; `operation`: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Wait"`\>; `wait`: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Continue"`\>; `checkpoint`: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<...\>; `duration`: `Schema.optionalKey`\<...\>; `tokens`: `Schema.optionalKey`\<...\>; `toolCalls`: `Schema.optionalKey`\<...\>; `usd`: `Schema.optionalKey`\<...\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<...\>; `duration`: `Schema.optionalKey`\<...\>; `tokens`: `Schema.optionalKey`\<...\>; `toolCalls`: `Schema.optionalKey`\<...\>; `usd`: `Schema.optionalKey`\<...\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly ...\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Complete"`\>; `result`: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>; \}, `SchemaError`, `never`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<\{ `_tag`: `Schema.tag`\<`"Execute"`\>; `operation`: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Wait"`\>; `wait`: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Continue"`\>; `checkpoint`: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: ...; `duration`: ...; `tokens`: ...; `toolCalls`: ...; `usd`: ...; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: ...; `duration`: ...; `tokens`: ...; `toolCalls`: ...; `usd`: ...; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<...\>; `executable`: `Schema.brand`\<..., ...\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Complete"`\>; `result`: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>; \}, `SchemaError`, `never`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<\{ `_tag`: `Schema.tag`\<`"Execute"`\>; `operation`: `Schema.Struct`\<\{ `input`: `Schema.Unknown`; `inputDigest`: `Schema.String`; `key`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>; `replayPolicy`: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Wait"`\>; `wait`: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Continue"`\>; `checkpoint`: `Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: ...; `duration`: ...; `tokens`: ...; `toolCalls`: ...; `usd`: ...; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: ...; `duration`: ...; `tokens`: ...; `toolCalls`: ...; `usd`: ...; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<...\>; `executable`: `Schema.brand`\<..., ...\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>; \} \| \{ `_tag`: `Schema.tag`\<`"Complete"`\>; `result`: `Schema.Struct`\<\{ `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>; \}, `SchemaError`, `never`\>

***

### encodeOutcome

> `const` **encodeOutcome**: \{(`input`, `options?`): `Effect`\<\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}, `SchemaError`, `never`\>; (`options?`): (`input`) => `Effect`\<\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}, `SchemaError`, `never`\>; \}

#### Call Signature

> (`input`, `options?`): `Effect`\<\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}, `SchemaError`, `never`\>

##### Parameters

###### input

\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}

###### options?

`ParseOptions`

##### Returns

`Effect`\<\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}, `SchemaError`, `never`\>

#### Call Signature

> (`options?`): (`input`) => `Effect`\<\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}, `SchemaError`, `never`\>

##### Parameters

###### options?

`ParseOptions`

##### Returns

(`input`) => `Effect`\<\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}, `SchemaError`, `never`\>

***

### guardUnknownNeverReplay

> `const` **guardUnknownNeverReplay**: \{(`outcome`): (`operation`) => `Effect`\<`void`, [`DriverUnknownReplay`](#driverunknownreplay)\>; (`operation`, `outcome`): `Effect`\<`void`, [`DriverUnknownReplay`](#driverunknownreplay)\>; \}

#### Call Signature

> (`outcome`): (`operation`) => `Effect`\<`void`, [`DriverUnknownReplay`](#driverunknownreplay)\>

##### Parameters

###### outcome

\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}

##### Returns

(`operation`) => `Effect`\<`void`, [`DriverUnknownReplay`](#driverunknownreplay)\>

#### Call Signature

> (`operation`, `outcome`): `Effect`\<`void`, [`DriverUnknownReplay`](#driverunknownreplay)\>

##### Parameters

###### operation

###### input

`Schema.Unknown`

###### inputDigest

`Schema.String`

###### key

`Schema.String`

###### kind

`Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"memory"`, `"compaction"`, `"handoff"`, `"send"`, `"wait"`, `"structured-output"`\]\>

###### replayPolicy

`Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>

###### outcome

\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \} \| \{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}

##### Returns

`Effect`\<`void`, [`DriverUnknownReplay`](#driverunknownreplay)\>

***

### inputDigest

> `const` **inputDigest**: (`input`) => `string`

#### Parameters

##### input

`Parameters`\<*typeof* [`digest`](./Pins#digest)\>\[`0`\]

#### Returns

`string`

***

### intercept

> `const` **intercept**: \{\<`A`, `E`, `SRD`, `SRE`, `FRD`, `FRE`\>(`spec`): \<`R`\>(`effect`) => `Effect`\<`A`, [`Exhausted`](./RunBudget#exhausted) \| [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror) \| [`DriverUnknownReplay`](#driverunknownreplay) \| `E`, [`DriverInterpreter`](#driverinterpreter) \| `SRD` \| `SRE` \| `FRD` \| `FRE` \| `R`\>; \<`A`, `E`, `R`, `SRD`, `SRE`, `FRD`, `FRE`\>(`spec`, `effect`): `Effect`\<`A`, [`Exhausted`](./RunBudget#exhausted) \| [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror) \| [`DriverUnknownReplay`](#driverunknownreplay) \| `E`, [`DriverInterpreter`](#driverinterpreter) \| `R` \| `SRD` \| `SRE` \| `FRD` \| `FRE`\>; \}

#### Call Signature

> \<`A`, `E`, `SRD`, `SRE`, `FRD`, `FRE`\>(`spec`): \<`R`\>(`effect`) => `Effect`\<`A`, [`Exhausted`](./RunBudget#exhausted) \| [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror) \| [`DriverUnknownReplay`](#driverunknownreplay) \| `E`, [`DriverInterpreter`](#driverinterpreter) \| `SRD` \| `SRE` \| `FRD` \| `FRE` \| `R`\>

##### Type Parameters

###### A

`A`

###### E

`E`

###### SRD

`SRD`

###### SRE

`SRE`

###### FRD

`FRD`

###### FRE

`FRE`

##### Parameters

###### spec

[`OperationSpec`](#operationspec)\<`A`, `E`, `SRD`, `SRE`, `FRD`, `FRE`\>

##### Returns

\<`R`\>(`effect`) => `Effect`\<`A`, [`Exhausted`](./RunBudget#exhausted) \| [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror) \| [`DriverUnknownReplay`](#driverunknownreplay) \| `E`, [`DriverInterpreter`](#driverinterpreter) \| `SRD` \| `SRE` \| `FRD` \| `FRE` \| `R`\>

#### Call Signature

> \<`A`, `E`, `R`, `SRD`, `SRE`, `FRD`, `FRE`\>(`spec`, `effect`): `Effect`\<`A`, [`Exhausted`](./RunBudget#exhausted) \| [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror) \| [`DriverUnknownReplay`](#driverunknownreplay) \| `E`, [`DriverInterpreter`](#driverinterpreter) \| `R` \| `SRD` \| `SRE` \| `FRD` \| `FRE`\>

##### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

###### SRD

`SRD`

###### SRE

`SRE`

###### FRD

`FRD`

###### FRE

`FRE`

##### Parameters

###### spec

[`OperationSpec`](#operationspec)\<`A`, `E`, `SRD`, `SRE`, `FRD`, `FRE`\>

###### effect

`Effect`\<`A`, `E`, `R`\>

##### Returns

`Effect`\<`A`, [`Exhausted`](./RunBudget#exhausted) \| [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror) \| [`DriverUnknownReplay`](#driverunknownreplay) \| `E`, [`DriverInterpreter`](#driverinterpreter) \| `R` \| `SRD` \| `SRE` \| `FRD` \| `FRE`\>

***

### interceptStream

> `const` **interceptStream**: \{\<`A`, `E`, `SRD`, `SRE`, `FRD`, `FRE`\>(`spec`): \<`R`\>(`stream`) => `Stream`\<`A`, [`Exhausted`](./RunBudget#exhausted) \| [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror) \| [`DriverUnknownReplay`](#driverunknownreplay) \| `E`, [`DriverInterpreter`](#driverinterpreter) \| `SRD` \| `SRE` \| `FRD` \| `FRE` \| `R`\>; \<`A`, `E`, `R`, `SRD`, `SRE`, `FRD`, `FRE`\>(`spec`, `stream`): `Stream`\<`A`, [`Exhausted`](./RunBudget#exhausted) \| [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror) \| [`DriverUnknownReplay`](#driverunknownreplay) \| `E`, [`DriverInterpreter`](#driverinterpreter) \| `R` \| `SRD` \| `SRE` \| `FRD` \| `FRE`\>; \}

#### Call Signature

> \<`A`, `E`, `SRD`, `SRE`, `FRD`, `FRE`\>(`spec`): \<`R`\>(`stream`) => `Stream`\<`A`, [`Exhausted`](./RunBudget#exhausted) \| [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror) \| [`DriverUnknownReplay`](#driverunknownreplay) \| `E`, [`DriverInterpreter`](#driverinterpreter) \| `SRD` \| `SRE` \| `FRD` \| `FRE` \| `R`\>

##### Type Parameters

###### A

`A`

###### E

`E`

###### SRD

`SRD`

###### SRE

`SRE`

###### FRD

`FRD`

###### FRE

`FRE`

##### Parameters

###### spec

[`OperationSpec`](#operationspec)\<readonly `A`[], `E`, `SRD`, `SRE`, `FRD`, `FRE`\>

##### Returns

\<`R`\>(`stream`) => `Stream`\<`A`, [`Exhausted`](./RunBudget#exhausted) \| [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror) \| [`DriverUnknownReplay`](#driverunknownreplay) \| `E`, [`DriverInterpreter`](#driverinterpreter) \| `SRD` \| `SRE` \| `FRD` \| `FRE` \| `R`\>

#### Call Signature

> \<`A`, `E`, `R`, `SRD`, `SRE`, `FRD`, `FRE`\>(`spec`, `stream`): `Stream`\<`A`, [`Exhausted`](./RunBudget#exhausted) \| [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror) \| [`DriverUnknownReplay`](#driverunknownreplay) \| `E`, [`DriverInterpreter`](#driverinterpreter) \| `R` \| `SRD` \| `SRE` \| `FRD` \| `FRE`\>

##### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

###### SRD

`SRD`

###### SRE

`SRE`

###### FRD

`FRD`

###### FRE

`FRE`

##### Parameters

###### spec

[`OperationSpec`](#operationspec)\<readonly `A`[], `E`, `SRD`, `SRE`, `FRD`, `FRE`\>

###### stream

`Stream`\<`A`, `E`, `R`\>

##### Returns

`Stream`\<`A`, [`Exhausted`](./RunBudget#exhausted) \| [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror) \| [`DriverUnknownReplay`](#driverunknownreplay) \| `E`, [`DriverInterpreter`](#driverinterpreter) \| `R` \| `SRD` \| `SRE` \| `FRD` \| `FRE`\>

***

### isFailedOutcome

> `const` **isFailedOutcome**: (`outcome`) => `outcome is Extract<OperationOutcome, { _tag: "Failed" }>`

#### Parameters

##### outcome

[`OperationOutcome`](#operationoutcome)

#### Returns

`outcome is Extract<OperationOutcome, { _tag: "Failed" }>`

***

### isSucceededOutcome

> `const` **isSucceededOutcome**: (`outcome`) => `outcome is Extract<OperationOutcome, { _tag: "Succeeded" }>`

#### Parameters

##### outcome

[`OperationOutcome`](#operationoutcome)

#### Returns

`outcome is Extract<OperationOutcome, { _tag: "Succeeded" }>`

***

### isUnknownOutcome

> `const` **isUnknownOutcome**: (`outcome`) => `outcome is Extract<OperationOutcome, { _tag: "Unknown" }>`

#### Parameters

##### outcome

[`OperationOutcome`](#operationoutcome)

#### Returns

`outcome is Extract<OperationOutcome, { _tag: "Unknown" }>`

***

### layerForRun

> `const` **layerForRun**: \{\<`Tools`, `R`, `P`, `A`\>(`options`, `prompt`, `budget?`): (`agent`) => `Layer`\<[`DriverInterpreter`](#driverinterpreter), [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>; \<`Tools`, `R`, `P`, `A`\>(`agent`, `options`, `prompt`, `budget?`): `Layer`\<[`DriverInterpreter`](#driverinterpreter), [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>; \}

Construct the inline driver Layer for one Agent run.

#### Call Signature

> \<`Tools`, `R`, `P`, `A`\>(`options`, `prompt`, `budget?`): (`agent`) => `Layer`\<[`DriverInterpreter`](#driverinterpreter), [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

###### P

`P`

###### A

`A`

##### Parameters

###### options

[`RunOptions`](./Agent#runoptions)

###### prompt

`Prompt`

###### budget?

###### allocation

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

##### Returns

(`agent`) => `Layer`\<[`DriverInterpreter`](#driverinterpreter), [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>

#### Call Signature

> \<`Tools`, `R`, `P`, `A`\>(`agent`, `options`, `prompt`, `budget?`): `Layer`\<[`DriverInterpreter`](#driverinterpreter), [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

###### P

`P`

###### A

`A`

##### Parameters

###### agent

[`Agent`](./Agent#agent)\<`Tools`, `R`, `P`, `A`, `Top`, `Top`\>

###### options

[`RunOptions`](./Agent#runoptions)

###### prompt

`Prompt`

###### budget?

###### allocation

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

###### remaining

`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

##### Returns

`Layer`\<[`DriverInterpreter`](#driverinterpreter), [`DriverStateInvalid`](#driverstateinvalid) \| [`DriverError`](#drivererror)\>

***

### layerInline

> `const` **layerInline**: (`input`) => `Layer.Layer`\<[`DriverInterpreter`](#driverinterpreter)\>

#### Parameters

##### input

###### driver

[`DurableAgentDriver`](#durableagentdriver)

###### initial

[`DriverCheckpoint`](#drivercheckpoint)

###### journal?

[`Journal`](#journal)

#### Returns

`Layer.Layer`\<[`DriverInterpreter`](#driverinterpreter)\>

***

### layerTest

> `const` **layerTest**: (`input`) => `Layer.Layer`\<[`DriverInterpreter`](#driverinterpreter)\>

#### Parameters

##### input

###### driver

[`DurableAgentDriver`](#durableagentdriver)

###### initial

[`DriverCheckpoint`](#drivercheckpoint)

###### journal?

[`Journal`](#journal)

#### Returns

`Layer.Layer`\<[`DriverInterpreter`](#driverinterpreter)\>

***

### logicalOperationId

> `const` **logicalOperationId**: `Effect.Effect`\<`string`, [`DriverStateInvalid`](#driverstateinvalid), [`DriverInterpreter`](#driverinterpreter)\>

***

### makeInline

> `const` **makeInline**: (`input`) => `Effect.Effect`\<`Service`\>

#### Parameters

##### input

###### driver

[`DurableAgentDriver`](#durableagentdriver)

###### initial

[`DriverCheckpoint`](#drivercheckpoint)

###### journal?

[`Journal`](#journal)

#### Returns

`Effect.Effect`\<`Service`\>

***

### makeLoopDriver

> `const` **makeLoopDriver**: (`options`) => [`DurableAgentDriver`](#durableagentdriver)

Production durable driver backing inline Agent.stream runs.

#### Parameters

##### options

`LoopDriverOptions`

#### Returns

[`DurableAgentDriver`](#durableagentdriver)

***

### makeOperation

> `const` **makeOperation**: (`input`) => [`DriverOperation`](#driveroperation)

#### Parameters

##### input

###### input

`unknown`

###### key

`string`

###### kind

[`DriverOperationKind`](#driveroperationkind)

###### replayPolicy

[`ReplayPolicy`](#replaypolicy-1)

#### Returns

[`DriverOperation`](#driveroperation)

***

### makeTracer

> `const` **makeTracer**: (`script`) => [`DurableAgentDriver`](#durableagentdriver)

Canonical in-memory driver for checkpoint/decision/apply conformance tests.

#### Parameters

##### script

`ReadonlyArray`\<[`TracerModelStep`](#tracermodelstep)\>

#### Returns

[`DurableAgentDriver`](#durableagentdriver)

***

### operationKey

> `const` **operationKey**: (`parts`) => `string`

#### Parameters

##### parts

`ReadonlyArray`\<`string` \| `number`\>

#### Returns

`string`

***

### OperationOutcome

> `const` **OperationOutcome**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Succeeded"`\>; `value`: `Schema.Unknown`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Failed"`\>; `error`: `Schema.Unknown`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Unknown"`\>; `operationId`: `Schema.String`; \}\>\]\>

Persisted outcome for one operation attempt.

***

### recorded

> `const` **recorded**: `Effect.Effect`\<readonly [`RecordedOperation`](#recordedoperation)[], `never`, [`DriverInterpreter`](#driverinterpreter)\>

***

### refundChildBudget

> `const` **refundChildBudget**: (`child`) => `Effect.Effect`\<`void`, [`DriverError`](#drivererror), [`DriverInterpreter`](#driverinterpreter)\>

#### Parameters

##### child

[`RunBudget`](./RunBudget#runbudget)

#### Returns

`Effect.Effect`\<`void`, [`DriverError`](#drivererror), [`DriverInterpreter`](#driverinterpreter)\>

***

### ReplayPolicy

> `const` **ReplayPolicy**: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>

How a host may replay one persisted operation after recovery.

***

### requireDriverVersion

> `const` **requireDriverVersion**: \{(`version`): (`checkpoint`) => `Effect`\<`void`, [`DriverVersionMismatch`](#driverversionmismatch)\>; (`checkpoint`, `version`): `Effect`\<`void`, [`DriverVersionMismatch`](#driverversionmismatch)\>; \}

#### Call Signature

> (`version`): (`checkpoint`) => `Effect`\<`void`, [`DriverVersionMismatch`](#driverversionmismatch)\>

##### Parameters

###### version

`string`

##### Returns

(`checkpoint`) => `Effect`\<`void`, [`DriverVersionMismatch`](#driverversionmismatch)\>

#### Call Signature

> (`checkpoint`, `version`): `Effect`\<`void`, [`DriverVersionMismatch`](#driverversionmismatch)\>

##### Parameters

###### checkpoint

`Pick`\<[`DriverCheckpoint`](#drivercheckpoint), `"driverVersion"`\>

###### version

`string`

##### Returns

`Effect`\<`void`, [`DriverVersionMismatch`](#driverversionmismatch)\>

***

### reserveChildBudget

> `const` **reserveChildBudget**: (`grant`) => `Effect.Effect`\<\{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}, [`DriverError`](#drivererror) \| [`Exhausted`](./RunBudget#exhausted) \| [`Invalid`](./RunBudget#invalid), [`DriverInterpreter`](#driverinterpreter)\>

#### Parameters

##### grant

[`BudgetLimits`](./RunBudget#budgetlimits)

#### Returns

`Effect.Effect`\<\{ `allocation`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; `remaining`: \{ `children?`: `number`; `duration?`: `number`; `tokens?`: `number`; `toolCalls?`: `number`; `usd?`: `number`; \}; \}, [`DriverError`](#drivererror) \| [`Exhausted`](./RunBudget#exhausted) \| [`Invalid`](./RunBudget#invalid), [`DriverInterpreter`](#driverinterpreter)\>

***

### setBudget

> `const` **setBudget**: (`budget`) => `Effect.Effect`\<`void`, [`DriverError`](#drivererror), [`DriverInterpreter`](#driverinterpreter)\>

#### Parameters

##### budget

[`RunBudget`](./RunBudget#runbudget)

#### Returns

`Effect.Effect`\<`void`, [`DriverError`](#drivererror), [`DriverInterpreter`](#driverinterpreter)\>

***

### setToolBatch

> `const` **setToolBatch**: (`toolBatch`) => `Effect.Effect`\<`void`, [`DriverError`](#drivererror) \| [`DriverStateInvalid`](#driverstateinvalid), [`DriverInterpreter`](#driverinterpreter)\>

**`Internal`**

Replace the one current authored-order tool batch checkpoint.

#### Parameters

##### toolBatch

`ToolBatchCheckpoint` \| `undefined`

#### Returns

`Effect.Effect`\<`void`, [`DriverError`](#drivererror) \| [`DriverStateInvalid`](#driverstateinvalid), [`DriverInterpreter`](#driverinterpreter)\>

***

### TracerState

> `const` **TracerState**: `Schema.Struct`\<\{ `modelIndex`: `Schema.Finite`; `pendingTools`: `Schema.$Array`\<`Schema.Struct`\<\{ `name`: `Schema.String`; `params`: `Schema.Unknown`; \}\>\>; `phase`: `Schema.Literals`\<readonly \[`"model"`, `"tool"`, `"wait-resume"`, `"done"`\]\>; `promptText`: `Schema.String`; `script`: `Schema.$Array`\<`Schema.Struct`\<\{ `text`: `Schema.optionalKey`\<`Schema.String`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Struct`\<\{ `name`: `Schema.String`; `params`: `Schema.Unknown`; \}\>\>\>; `wait`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `reason`: `Schema.String`; `waitId`: `Schema.String`; \}\>\>; \}\>\>; `text`: `Schema.String`; `toolIndex`: `Schema.Finite`; `waitId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

Internal tracer state serialized in DriverCheckpoint.state.

***

### updateToolBatch

> `const` **updateToolBatch**: (`update`) => `Effect.Effect`\<\{ `activatedSkills`: readonly `string`[]; `activeTools`: readonly `string`[]; `authorizationContextDigest`: `string`; `calls`: readonly `object`[]; `invocationPath`: readonly `string`[]; `turn`: `number`; \}, [`DriverError`](#drivererror) \| [`DriverStateInvalid`](#driverstateinvalid), [`DriverInterpreter`](#driverinterpreter)\>

**`Internal`**

Apply one exact tool-call state transition to the current batch checkpoint.

#### Parameters

##### update

(`checkpoint`) => `ToolBatchCheckpoint`

#### Returns

`Effect.Effect`\<\{ `activatedSkills`: readonly `string`[]; `activeTools`: readonly `string`[]; `authorizationContextDigest`: `string`; `calls`: readonly `object`[]; `invocationPath`: readonly `string`[]; `turn`: `number`; \}, [`DriverError`](#drivererror) \| [`DriverStateInvalid`](#driverstateinvalid), [`DriverInterpreter`](#driverinterpreter)\>

***

### WaitDefinition

> `const` **WaitDefinition**: `Schema.Struct`\<\{ `reason`: `Schema.String`; `replayToken`: `Schema.optionalKey`\<`Schema.String`\>; `waitId`: `Schema.String`; \}\>

Wait the driver requests before the next decision.
