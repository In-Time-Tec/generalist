[**generalist**](../../index)

***

[generalist](../../index) / [repl](../index) / Cell

# Cell

## Classes

<a id="cellexecutionfailed"></a>

### CellExecutionFailed

The cell threw. This is model input, not a framework failure: the namespace, the
kernel, and every prior binding survive.

#### Extends

- `CellExecutionFailed_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new CellExecutionFailed**(...`args`): [`CellExecutionFailed`](#cellexecutionfailed)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`CellExecutionFailed`](#cellexecutionfailed)

###### Inherited from

`CellExecutionFailed_base.constructor`

#### Properties

<a id="cellid"></a>

##### cellId

> `readonly` **cellId**: `string`

###### Inherited from

`CellExecutionFailed_base.cellId`

<a id="durationmillis"></a>

##### durationMillis

> `readonly` **durationMillis**: `number`

###### Inherited from

`CellExecutionFailed_base.durationMillis`

<a id="epoch"></a>

##### epoch

> `readonly` **epoch**: `number`

###### Inherited from

`CellExecutionFailed_base.epoch`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`CellExecutionFailed_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`CellExecutionFailed_base.message`

<a id="name"></a>

##### name

> `readonly` **name**: `string`

###### Inherited from

`CellExecutionFailed_base.name`

<a id="sequence"></a>

##### sequence

> `readonly` **sequence**: `number`

###### Inherited from

`CellExecutionFailed_base.sequence`

<a id="stack"></a>

##### stack?

> `readonly` `optional` **stack?**: `string`

###### Inherited from

`CellExecutionFailed_base.stack`

<a id="stderr"></a>

##### stderr

> `readonly` **stderr**: `string`

###### Inherited from

`CellExecutionFailed_base.stderr`

<a id="stdout"></a>

##### stdout

> `readonly` **stdout**: `string`

###### Inherited from

`CellExecutionFailed_base.stdout`

***

<a id="celloutcomeunknown"></a>

### CellOutcomeUnknown

The cell may or may not have committed its effects. It is never replayed; a host
resolves it explicitly.

#### Extends

- `CellOutcomeUnknown_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new CellOutcomeUnknown**(...`args`): [`CellOutcomeUnknown`](#celloutcomeunknown)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`CellOutcomeUnknown`](#celloutcomeunknown)

###### Inherited from

`CellOutcomeUnknown_base.constructor`

#### Properties

<a id="cellid-1"></a>

##### cellId

> `readonly` **cellId**: `string`

###### Inherited from

`CellOutcomeUnknown_base.cellId`

<a id="epoch-1"></a>

##### epoch

> `readonly` **epoch**: `number`

###### Inherited from

`CellOutcomeUnknown_base.epoch`

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`CellOutcomeUnknown_base.hint`

<a id="message-1"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`CellOutcomeUnknown_base.message`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `"host-terminated"` \| `"kernel-killed"` \| `"transport-lost"`

###### Inherited from

`CellOutcomeUnknown_base.reason`

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`CellOutcomeUnknown_base.sessionId`

***

<a id="kernelprotocolviolation"></a>

### KernelProtocolViolation

The kernel broke the cell protocol: out-of-order sequence, unknown frame, or malformed payload.

#### Extends

- `KernelProtocolViolation_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new KernelProtocolViolation**(...`args`): [`KernelProtocolViolation`](#kernelprotocolviolation)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`KernelProtocolViolation`](#kernelprotocolviolation)

###### Inherited from

`KernelProtocolViolation_base.constructor`

#### Properties

<a id="cellid-2"></a>

##### cellId?

> `readonly` `optional` **cellId?**: `string`

###### Inherited from

`KernelProtocolViolation_base.cellId`

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`KernelProtocolViolation_base.hint`

<a id="message-2"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`KernelProtocolViolation_base.message`

<a id="sessionid-1"></a>

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`KernelProtocolViolation_base.sessionId`

***

<a id="kernelunavailable"></a>

### KernelUnavailable

No kernel was available to run the cell. Nothing was evaluated.

#### Extends

- `KernelUnavailable_base`

#### Constructors

<a id="constructor-3"></a>

##### Constructor

> **new KernelUnavailable**(...`args`): [`KernelUnavailable`](#kernelunavailable)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`KernelUnavailable`](#kernelunavailable)

###### Inherited from

`KernelUnavailable_base.constructor`

#### Properties

<a id="hint-3"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`KernelUnavailable_base.hint`

<a id="message-3"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`KernelUnavailable_base.message`

<a id="reason-1"></a>

##### reason

> `readonly` **reason**: `"start-failed"` \| `"closed"` \| `"lease-lost"` \| `"profile-mismatch"` \| `"deadline-exceeded"`

###### Inherited from

`KernelUnavailable_base.reason`

<a id="sessionid-2"></a>

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`KernelUnavailable_base.sessionId`

## Interfaces

<a id="sequencerun"></a>

### SequenceRun

#### Properties

<a id="events"></a>

##### events

> `readonly` **events**: readonly (\{ `cellId`: `string`; `epoch`: `number`; `sequence`: `number`; `sessionId`: `string`; \} \| \{ `cellId`: `string`; `epoch`: `number`; `profileDigest`: `string`; `sequence`: `number`; `sessionId`: `string`; \} \| \{ `cellId`: `string`; `sequence`: `number`; `text`: `string`; \} \| \{ `cellId`: `string`; `sequence`: `number`; `text`: `string`; \} \| \{ `cellId`: `string`; `durationMillis?`: `number`; `inputSummary`: `string`; `message?`: `string`; `module`: `string`; `operation`: `string`; `requestId`: `string`; `sequence`: `number`; `status`: `"failed"` \| `"started"` \| `"returned"`; \} \| \{ `cellId`: `string`; `durationMillis`: `number`; `sequence`: `number`; `value`: `string`; \} \| \{ `cellId`: `string`; `data`: `string`; `mediaType`: `string`; `name?`: `string`; `sequence`: `number`; \} \| \{ `cellId`: `string`; `epoch`: `number`; `names`: readonly `string`[]; `restoredBySource`: readonly `string`[]; `sequence`: `number`; \} \| \{ `cellId`: `string`; `droppedNames`: readonly `string`[]; `epoch`: `number`; `reason`: `"function"` \| `"module"` \| `"class"` \| `"live-handle"` \| `"oversized"` \| `"unserializable"`; `sequence`: `number`; \} \| \{ `cellId`: `string`; `epoch`: `number`; `reason`: `"requested"` \| `"killed"` \| `"crashed"` \| `"profile-changed"`; `sequence`: `number`; `sessionId`: `string`; \})[]

<a id="sessionid-3"></a>

##### sessionId

> `readonly` **sessionId**: `string`

## Type Aliases

<a id="cellevent"></a>

### CellEvent

> **CellEvent** = *typeof* `CellEvent.Type`

Closed union of cell lifecycle events, ordered by a cell-local monotonic sequence.

***

<a id="cellfailure"></a>

### CellFailure

> **CellFailure** = *typeof* `CellFailure.Type`

Closed union of everything a cell call can fail with.

***

<a id="cellid-3"></a>

### CellId

> **CellId** = *typeof* `CellId.Type`

Identity of one authored cell execution.

***

<a id="cellresult"></a>

### CellResult

> **CellResult** = *typeof* `CellResult.Type`

Terminal value of a cell that completed without throwing.

***

<a id="channel"></a>

### Channel

> **Channel** = *typeof* `Channel.Type`

Output channel of one cell.

***

<a id="dropreason"></a>

### DropReason

> **DropReason** = *typeof* `DropReason.Type`

Why a kernel binding did not survive a snapshot restore.

***

<a id="epoch-2"></a>

### Epoch

> **Epoch** = *typeof* `Epoch.Type`

Kernel generation. A restart or profile change starts a new epoch.

***

<a id="restartreason"></a>

### RestartReason

> **RestartReason** = *typeof* `RestartReason.Type`

Why the kernel started a new epoch.

***

<a id="sequence-1"></a>

### Sequence

> **Sequence** = *typeof* `Sequence.Type`

Cell-local monotonic event ordinal. Starts at 0 and increases by one per emitted event.

***

<a id="sessionid-4"></a>

### SessionId

> **SessionId** = *typeof* `SessionId.Type`

Generalist Session identity that owns exactly one kernel.

***

<a id="unavailablereason"></a>

### UnavailableReason

> **UnavailableReason** = *typeof* `UnavailableReason.Type`

Why no kernel could run the cell.

***

<a id="unknownreason"></a>

### UnknownReason

> **UnknownReason** = *typeof* `UnknownReason.Type`

Why the cell outcome is uncertain.

## Variables

<a id="cellevent-1"></a>

### CellEvent

> `const` **CellEvent**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"KernelStarting"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"KernelReady"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `profileDigest`: `Schema.String`; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Stdout"`, \{ `cellId`: `Schema.String`; `sequence`: `Schema.Int`; `text`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Stderr"`, \{ `cellId`: `Schema.String`; `sequence`: `Schema.Int`; `text`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"HostCall"`, \{ `cellId`: `Schema.String`; `durationMillis`: `Schema.optionalKey`\<`Schema.Int`\>; `inputSummary`: `Schema.String`; `message`: `Schema.optionalKey`\<`Schema.String`\>; `module`: `Schema.String`; `operation`: `Schema.String`; `requestId`: `Schema.String`; `sequence`: `Schema.Int`; `status`: `Schema.Literals`\<readonly \[`"started"`, `"returned"`, `"failed"`\]\>; \}\>, `Schema.TaggedStruct`\<`"Result"`, \{ `cellId`: `Schema.String`; `durationMillis`: `Schema.Int`; `sequence`: `Schema.Int`; `value`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Display"`, \{ `cellId`: `Schema.String`; `data`: `Schema.String`; `mediaType`: `Schema.String`; `name`: `Schema.optionalKey`\<`Schema.String`\>; `sequence`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"StateRestored"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `names`: `Schema.$Array`\<`Schema.String`\>; `restoredBySource`: `Schema.$Array`\<`Schema.String`\>; `sequence`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"StateLost"`, \{ `cellId`: `Schema.String`; `droppedNames`: `Schema.$Array`\<`Schema.String`\>; `epoch`: `Schema.Int`; `reason`: `Schema.Literals`\<readonly \[`"function"`, `"class"`, `"module"`, `"live-handle"`, `"oversized"`, `"unserializable"`\]\>; `sequence`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"KernelRestarted"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `reason`: `Schema.Literals`\<readonly \[`"requested"`, `"killed"`, `"crashed"`, `"profile-changed"`\]\>; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>\]\>

Closed union of cell lifecycle events, ordered by a cell-local monotonic sequence.

***

<a id="cellfailure-1"></a>

### CellFailure

> `const` **CellFailure**: `Schema.Union`\<readonly \[*typeof* [`CellExecutionFailed`](#cellexecutionfailed), *typeof* [`KernelUnavailable`](#kernelunavailable), *typeof* [`KernelProtocolViolation`](#kernelprotocolviolation), *typeof* [`CellOutcomeUnknown`](#celloutcomeunknown)\]\>

Closed union of everything a cell call can fail with.

***

<a id="cellid-4"></a>

### CellId

> `const` **CellId**: `Schema.String`

Identity of one authored cell execution.

***

<a id="cellresult-1"></a>

### CellResult

> `const` **CellResult**: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `durationMillis`: `Schema.Int`; `epoch`: `Schema.Int`; `sequence`: `Schema.Int`; `stderr`: `Schema.String`; `stdout`: `Schema.String`; `value`: `Schema.String`; \}\>

Terminal value of a cell that completed without throwing.

***

<a id="channel-1"></a>

### Channel

> `const` **Channel**: `Schema.Literals`\<readonly \[`"stdout"`, `"stderr"`, `"result"`, `"display"`\]\>

Output channel of one cell.

***

<a id="display"></a>

### Display

> `const` **Display**: `Schema.TaggedStruct`\<`"Display"`, \{ `cellId`: `Schema.String`; `data`: `Schema.String`; `mediaType`: `Schema.String`; `name`: `Schema.optionalKey`\<`Schema.String`\>; `sequence`: `Schema.Int`; \}\>

A host-rendered artifact emitted by the cell.

***

<a id="dropreason-1"></a>

### DropReason

> `const` **DropReason**: `Schema.Literals`\<readonly \[`"function"`, `"class"`, `"module"`, `"live-handle"`, `"oversized"`, `"unserializable"`\]\>

Why a kernel binding did not survive a snapshot restore.

***

<a id="epoch-3"></a>

### Epoch

> `const` **Epoch**: `Schema.Int`

Kernel generation. A restart or profile change starts a new epoch.

***

<a id="eventtags"></a>

### eventTags

> `const` **eventTags**: `ReadonlyArray`\<[`CellEvent`](#cellevent)\[`"_tag"`\]\>

Every event tag in the closed cell event union.

***

<a id="failuretags"></a>

### failureTags

> `const` **failureTags**: `ReadonlyArray`\<[`CellFailure`](#cellfailure)\[`"_tag"`\]\>

Every failure tag in the closed cell failure union.

***

<a id="hostcall"></a>

### HostCall

> `const` **HostCall**: `Schema.TaggedStruct`\<`"HostCall"`, \{ `cellId`: `Schema.String`; `durationMillis`: `Schema.optionalKey`\<`Schema.Int`\>; `inputSummary`: `Schema.String`; `message`: `Schema.optionalKey`\<`Schema.String`\>; `module`: `Schema.String`; `operation`: `Schema.String`; `requestId`: `Schema.String`; `sequence`: `Schema.Int`; `status`: `Schema.Literals`\<readonly \[`"started"`, `"returned"`, `"failed"`\]\>; \}\>

One lifecycle transition for a host binding invoked by the cell.

***

<a id="kernelready"></a>

### KernelReady

> `const` **KernelReady**: `Schema.TaggedStruct`\<`"KernelReady"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `profileDigest`: `Schema.String`; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>

The kernel is bootstrapped and the cell is about to evaluate.

***

<a id="kernelrestarted"></a>

### KernelRestarted

> `const` **KernelRestarted**: `Schema.TaggedStruct`\<`"KernelRestarted"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `reason`: `Schema.Literals`\<readonly \[`"requested"`, `"killed"`, `"crashed"`, `"profile-changed"`\]\>; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>

The kernel started a new epoch.

***

<a id="kernelstarting"></a>

### KernelStarting

> `const` **KernelStarting**: `Schema.TaggedStruct`\<`"KernelStarting"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>

A kernel process is starting for this cell.

***

<a id="restartreason-1"></a>

### RestartReason

> `const` **RestartReason**: `Schema.Literals`\<readonly \[`"requested"`, `"killed"`, `"crashed"`, `"profile-changed"`\]\>

Why the kernel started a new epoch.

***

<a id="result"></a>

### Result

> `const` **Result**: `Schema.TaggedStruct`\<`"Result"`, \{ `cellId`: `Schema.String`; `durationMillis`: `Schema.Int`; `sequence`: `Schema.Int`; `value`: `Schema.String`; \}\>

The cell's terminal value.

***

<a id="sequence-2"></a>

### Sequence

> `const` **Sequence**: `Schema.Int`

Cell-local monotonic event ordinal. Starts at 0 and increases by one per emitted event.

***

<a id="sequenceof"></a>

### sequenceOf

> `const` **sequenceOf**: (`event`) => `number`

The cell-local ordinal carried by any cell event.

#### Parameters

##### event

[`CellEvent`](#cellevent)

#### Returns

`number`

***

<a id="sessionid-5"></a>

### SessionId

> `const` **SessionId**: `Schema.String`

Generalist Session identity that owns exactly one kernel.

***

<a id="statelost"></a>

### StateLost

> `const` **StateLost**: `Schema.TaggedStruct`\<`"StateLost"`, \{ `cellId`: `Schema.String`; `droppedNames`: `Schema.$Array`\<`Schema.String`\>; `epoch`: `Schema.Int`; `reason`: `Schema.Literals`\<readonly \[`"function"`, `"class"`, `"module"`, `"live-handle"`, `"oversized"`, `"unserializable"`\]\>; `sequence`: `Schema.Int`; \}\>

These bindings did not survive and will not come back.

***

<a id="staterestored"></a>

### StateRestored

> `const` **StateRestored**: `Schema.TaggedStruct`\<`"StateRestored"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `names`: `Schema.$Array`\<`Schema.String`\>; `restoredBySource`: `Schema.$Array`\<`Schema.String`\>; `sequence`: `Schema.Int`; \}\>

Snapshot restore put these bindings back into the namespace.

***

<a id="stderr-1"></a>

### Stderr

> `const` **Stderr**: `Schema.TaggedStruct`\<`"Stderr"`, \{ `cellId`: `Schema.String`; `sequence`: `Schema.Int`; `text`: `Schema.String`; \}\>

Stderr produced by the running cell.

***

<a id="stdout-1"></a>

### Stdout

> `const` **Stdout**: `Schema.TaggedStruct`\<`"Stdout"`, \{ `cellId`: `Schema.String`; `sequence`: `Schema.Int`; `text`: `Schema.String`; \}\>

Stdout produced by the running cell.

***

<a id="unavailablereason-1"></a>

### UnavailableReason

> `const` **UnavailableReason**: `Schema.Literals`\<readonly \[`"start-failed"`, `"closed"`, `"lease-lost"`, `"profile-mismatch"`, `"deadline-exceeded"`\]\>

Why no kernel could run the cell.

***

<a id="unknownreason-1"></a>

### UnknownReason

> `const` **UnknownReason**: `Schema.Literals`\<readonly \[`"host-terminated"`, `"kernel-killed"`, `"transport-lost"`\]\>

Why the cell outcome is uncertain.

***

<a id="validatesequence"></a>

### validateSequence

> `const` **validateSequence**: (`run`) => [`KernelProtocolViolation`](#kernelprotocolviolation) \| `undefined`

Verify one cell's event order. A kernel must emit strictly increasing sequences
starting at 0 for exactly one cell; anything else is a protocol violation.

#### Parameters

##### run

[`SequenceRun`](#sequencerun)

#### Returns

[`KernelProtocolViolation`](#kernelprotocolviolation) \| `undefined`
