[**generalist**](../../index)

***

[generalist](../../index) / [repl](../index) / Cell

# Cell

## Classes

### CellExecutionFailed

The cell threw. This is model input, not a framework failure: the namespace, the
kernel, and every prior binding survive.

#### Extends

- `CellExecutionFailed_base`

#### Constructors

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

##### cellId

> `readonly` **cellId**: `string`

###### Inherited from

`CellExecutionFailed_base.cellId`

##### durationMillis

> `readonly` **durationMillis**: `number`

###### Inherited from

`CellExecutionFailed_base.durationMillis`

##### epoch

> `readonly` **epoch**: `number`

###### Inherited from

`CellExecutionFailed_base.epoch`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`CellExecutionFailed_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`CellExecutionFailed_base.message`

##### name

> `readonly` **name**: `string`

###### Inherited from

`CellExecutionFailed_base.name`

##### sequence

> `readonly` **sequence**: `number`

###### Inherited from

`CellExecutionFailed_base.sequence`

##### stack?

> `readonly` `optional` **stack?**: `string`

###### Inherited from

`CellExecutionFailed_base.stack`

##### stderr

> `readonly` **stderr**: `string`

###### Inherited from

`CellExecutionFailed_base.stderr`

##### stdout

> `readonly` **stdout**: `string`

###### Inherited from

`CellExecutionFailed_base.stdout`

***

### CellOutcomeUnknown

The cell may or may not have committed its effects. It is never replayed; a host
resolves it explicitly.

#### Extends

- `CellOutcomeUnknown_base`

#### Constructors

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

##### cellId

> `readonly` **cellId**: `string`

###### Inherited from

`CellOutcomeUnknown_base.cellId`

##### epoch

> `readonly` **epoch**: `number`

###### Inherited from

`CellOutcomeUnknown_base.epoch`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`CellOutcomeUnknown_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`CellOutcomeUnknown_base.message`

##### reason

> `readonly` **reason**: `"host-terminated"` \| `"kernel-killed"` \| `"transport-lost"`

###### Inherited from

`CellOutcomeUnknown_base.reason`

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`CellOutcomeUnknown_base.sessionId`

***

### KernelProtocolViolation

The kernel broke the cell protocol: out-of-order sequence, unknown frame, or malformed payload.

#### Extends

- `KernelProtocolViolation_base`

#### Constructors

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

##### cellId?

> `readonly` `optional` **cellId?**: `string`

###### Inherited from

`KernelProtocolViolation_base.cellId`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`KernelProtocolViolation_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`KernelProtocolViolation_base.message`

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`KernelProtocolViolation_base.sessionId`

***

### KernelUnavailable

No kernel was available to run the cell. Nothing was evaluated.

#### Extends

- `KernelUnavailable_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`KernelUnavailable_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`KernelUnavailable_base.message`

##### reason

> `readonly` **reason**: `"start-failed"` \| `"closed"` \| `"lease-lost"` \| `"profile-mismatch"` \| `"deadline-exceeded"`

###### Inherited from

`KernelUnavailable_base.reason`

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`KernelUnavailable_base.sessionId`

## Interfaces

### SequenceRun

#### Properties

##### events

> `readonly` **events**: readonly (\{ `cellId`: `string`; `epoch`: `number`; `sequence`: `number`; `sessionId`: `string`; \} \| \{ `cellId`: `string`; `epoch`: `number`; `profileDigest`: `string`; `sequence`: `number`; `sessionId`: `string`; \} \| \{ `cellId`: `string`; `sequence`: `number`; `text`: `string`; \} \| \{ `cellId`: `string`; `sequence`: `number`; `text`: `string`; \} \| \{ `cellId`: `string`; `durationMillis?`: `number`; `inputSummary`: `string`; `message?`: `string`; `module`: `string`; `operation`: `string`; `requestId`: `string`; `sequence`: `number`; `status`: `"failed"` \| `"started"` \| `"returned"`; \} \| \{ `cellId`: `string`; `durationMillis`: `number`; `sequence`: `number`; `value`: `string`; \} \| \{ `cellId`: `string`; `data`: `string`; `mediaType`: `string`; `name?`: `string`; `sequence`: `number`; \} \| \{ `cellId`: `string`; `epoch`: `number`; `names`: readonly `string`[]; `restoredBySource`: readonly `string`[]; `sequence`: `number`; \} \| \{ `cellId`: `string`; `droppedNames`: readonly `string`[]; `epoch`: `number`; `reason`: `"function"` \| `"module"` \| `"class"` \| `"live-handle"` \| `"oversized"` \| `"unserializable"`; `sequence`: `number`; \} \| \{ `cellId`: `string`; `epoch`: `number`; `reason`: `"requested"` \| `"killed"` \| `"crashed"` \| `"profile-changed"`; `sequence`: `number`; `sessionId`: `string`; \})[]

##### sessionId

> `readonly` **sessionId**: `string`

## Type Aliases

### CellEvent

> **CellEvent** = *typeof* `CellEvent.Type`

Closed union of cell lifecycle events, ordered by a cell-local monotonic sequence.

***

### CellFailure

> **CellFailure** = *typeof* `CellFailure.Type`

Closed union of everything a cell call can fail with.

***

### CellId

> **CellId** = *typeof* `CellId.Type`

Identity of one authored cell execution.

***

### CellResult

> **CellResult** = *typeof* `CellResult.Type`

Terminal value of a cell that completed without throwing.

***

### Channel

> **Channel** = *typeof* `Channel.Type`

Output channel of one cell.

***

### DropReason

> **DropReason** = *typeof* `DropReason.Type`

Why a kernel binding did not survive a snapshot restore.

***

### Epoch

> **Epoch** = *typeof* `Epoch.Type`

Kernel generation. A restart or profile change starts a new epoch.

***

### RestartReason

> **RestartReason** = *typeof* `RestartReason.Type`

Why the kernel started a new epoch.

***

### Sequence

> **Sequence** = *typeof* `Sequence.Type`

Cell-local monotonic event ordinal. Starts at 0 and increases by one per emitted event.

***

### SessionId

> **SessionId** = *typeof* `SessionId.Type`

Generalist Session identity that owns exactly one kernel.

***

### UnavailableReason

> **UnavailableReason** = *typeof* `UnavailableReason.Type`

Why no kernel could run the cell.

***

### UnknownReason

> **UnknownReason** = *typeof* `UnknownReason.Type`

Why the cell outcome is uncertain.

## Variables

### CellEvent

> `const` **CellEvent**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"KernelStarting"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"KernelReady"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `profileDigest`: `Schema.String`; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Stdout"`, \{ `cellId`: `Schema.String`; `sequence`: `Schema.Int`; `text`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Stderr"`, \{ `cellId`: `Schema.String`; `sequence`: `Schema.Int`; `text`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"HostCall"`, \{ `cellId`: `Schema.String`; `durationMillis`: `Schema.optionalKey`\<`Schema.Int`\>; `inputSummary`: `Schema.String`; `message`: `Schema.optionalKey`\<`Schema.String`\>; `module`: `Schema.String`; `operation`: `Schema.String`; `requestId`: `Schema.String`; `sequence`: `Schema.Int`; `status`: `Schema.Literals`\<readonly \[`"started"`, `"returned"`, `"failed"`\]\>; \}\>, `Schema.TaggedStruct`\<`"Result"`, \{ `cellId`: `Schema.String`; `durationMillis`: `Schema.Int`; `sequence`: `Schema.Int`; `value`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Display"`, \{ `cellId`: `Schema.String`; `data`: `Schema.String`; `mediaType`: `Schema.String`; `name`: `Schema.optionalKey`\<`Schema.String`\>; `sequence`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"StateRestored"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `names`: `Schema.$Array`\<`Schema.String`\>; `restoredBySource`: `Schema.$Array`\<`Schema.String`\>; `sequence`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"StateLost"`, \{ `cellId`: `Schema.String`; `droppedNames`: `Schema.$Array`\<`Schema.String`\>; `epoch`: `Schema.Int`; `reason`: `Schema.Literals`\<readonly \[`"function"`, `"class"`, `"module"`, `"live-handle"`, `"oversized"`, `"unserializable"`\]\>; `sequence`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"KernelRestarted"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `reason`: `Schema.Literals`\<readonly \[`"requested"`, `"killed"`, `"crashed"`, `"profile-changed"`\]\>; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>\]\>

Closed union of cell lifecycle events, ordered by a cell-local monotonic sequence.

***

### CellFailure

> `const` **CellFailure**: `Schema.Union`\<readonly \[*typeof* [`CellExecutionFailed`](#cellexecutionfailed), *typeof* [`KernelUnavailable`](#kernelunavailable), *typeof* [`KernelProtocolViolation`](#kernelprotocolviolation), *typeof* [`CellOutcomeUnknown`](#celloutcomeunknown)\]\>

Closed union of everything a cell call can fail with.

***

### CellId

> `const` **CellId**: `Schema.String`

Identity of one authored cell execution.

***

### CellResult

> `const` **CellResult**: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `durationMillis`: `Schema.Int`; `epoch`: `Schema.Int`; `sequence`: `Schema.Int`; `stderr`: `Schema.String`; `stdout`: `Schema.String`; `value`: `Schema.String`; \}\>

Terminal value of a cell that completed without throwing.

***

### Channel

> `const` **Channel**: `Schema.Literals`\<readonly \[`"stdout"`, `"stderr"`, `"result"`, `"display"`\]\>

Output channel of one cell.

***

### Display

> `const` **Display**: `Schema.TaggedStruct`\<`"Display"`, \{ `cellId`: `Schema.String`; `data`: `Schema.String`; `mediaType`: `Schema.String`; `name`: `Schema.optionalKey`\<`Schema.String`\>; `sequence`: `Schema.Int`; \}\>

A host-rendered artifact emitted by the cell.

***

### DropReason

> `const` **DropReason**: `Schema.Literals`\<readonly \[`"function"`, `"class"`, `"module"`, `"live-handle"`, `"oversized"`, `"unserializable"`\]\>

Why a kernel binding did not survive a snapshot restore.

***

### Epoch

> `const` **Epoch**: `Schema.Int`

Kernel generation. A restart or profile change starts a new epoch.

***

### eventTags

> `const` **eventTags**: `ReadonlyArray`\<[`CellEvent`](#cellevent)\[`"_tag"`\]\>

Every event tag in the closed cell event union.

***

### failureTags

> `const` **failureTags**: `ReadonlyArray`\<[`CellFailure`](#cellfailure)\[`"_tag"`\]\>

Every failure tag in the closed cell failure union.

***

### HostCall

> `const` **HostCall**: `Schema.TaggedStruct`\<`"HostCall"`, \{ `cellId`: `Schema.String`; `durationMillis`: `Schema.optionalKey`\<`Schema.Int`\>; `inputSummary`: `Schema.String`; `message`: `Schema.optionalKey`\<`Schema.String`\>; `module`: `Schema.String`; `operation`: `Schema.String`; `requestId`: `Schema.String`; `sequence`: `Schema.Int`; `status`: `Schema.Literals`\<readonly \[`"started"`, `"returned"`, `"failed"`\]\>; \}\>

One lifecycle transition for a host binding invoked by the cell.

***

### KernelReady

> `const` **KernelReady**: `Schema.TaggedStruct`\<`"KernelReady"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `profileDigest`: `Schema.String`; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>

The kernel is bootstrapped and the cell is about to evaluate.

***

### KernelRestarted

> `const` **KernelRestarted**: `Schema.TaggedStruct`\<`"KernelRestarted"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `reason`: `Schema.Literals`\<readonly \[`"requested"`, `"killed"`, `"crashed"`, `"profile-changed"`\]\>; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>

The kernel started a new epoch.

***

### KernelStarting

> `const` **KernelStarting**: `Schema.TaggedStruct`\<`"KernelStarting"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>

A kernel process is starting for this cell.

***

### RestartReason

> `const` **RestartReason**: `Schema.Literals`\<readonly \[`"requested"`, `"killed"`, `"crashed"`, `"profile-changed"`\]\>

Why the kernel started a new epoch.

***

### Result

> `const` **Result**: `Schema.TaggedStruct`\<`"Result"`, \{ `cellId`: `Schema.String`; `durationMillis`: `Schema.Int`; `sequence`: `Schema.Int`; `value`: `Schema.String`; \}\>

The cell's terminal value.

***

### Sequence

> `const` **Sequence**: `Schema.Int`

Cell-local monotonic event ordinal. Starts at 0 and increases by one per emitted event.

***

### sequenceOf

> `const` **sequenceOf**: (`event`) => `number`

The cell-local ordinal carried by any cell event.

#### Parameters

##### event

[`CellEvent`](#cellevent)

#### Returns

`number`

***

### SessionId

> `const` **SessionId**: `Schema.String`

Generalist Session identity that owns exactly one kernel.

***

### StateLost

> `const` **StateLost**: `Schema.TaggedStruct`\<`"StateLost"`, \{ `cellId`: `Schema.String`; `droppedNames`: `Schema.$Array`\<`Schema.String`\>; `epoch`: `Schema.Int`; `reason`: `Schema.Literals`\<readonly \[`"function"`, `"class"`, `"module"`, `"live-handle"`, `"oversized"`, `"unserializable"`\]\>; `sequence`: `Schema.Int`; \}\>

These bindings did not survive and will not come back.

***

### StateRestored

> `const` **StateRestored**: `Schema.TaggedStruct`\<`"StateRestored"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `names`: `Schema.$Array`\<`Schema.String`\>; `restoredBySource`: `Schema.$Array`\<`Schema.String`\>; `sequence`: `Schema.Int`; \}\>

Snapshot restore put these bindings back into the namespace.

***

### Stderr

> `const` **Stderr**: `Schema.TaggedStruct`\<`"Stderr"`, \{ `cellId`: `Schema.String`; `sequence`: `Schema.Int`; `text`: `Schema.String`; \}\>

Stderr produced by the running cell.

***

### Stdout

> `const` **Stdout**: `Schema.TaggedStruct`\<`"Stdout"`, \{ `cellId`: `Schema.String`; `sequence`: `Schema.Int`; `text`: `Schema.String`; \}\>

Stdout produced by the running cell.

***

### UnavailableReason

> `const` **UnavailableReason**: `Schema.Literals`\<readonly \[`"start-failed"`, `"closed"`, `"lease-lost"`, `"profile-mismatch"`, `"deadline-exceeded"`\]\>

Why no kernel could run the cell.

***

### UnknownReason

> `const` **UnknownReason**: `Schema.Literals`\<readonly \[`"host-terminated"`, `"kernel-killed"`, `"transport-lost"`\]\>

Why the cell outcome is uncertain.

***

### validateSequence

> `const` **validateSequence**: (`run`) => [`KernelProtocolViolation`](#kernelprotocolviolation) \| `undefined`

Verify one cell's event order. A kernel must emit strictly increasing sequences
starting at 0 for exactly one cell; anything else is a protocol violation.

#### Parameters

##### run

[`SequenceRun`](#sequencerun)

#### Returns

[`KernelProtocolViolation`](#kernelprotocolviolation) \| `undefined`
