[**generalist**](../../index)

***

[generalist](../../index) / [repl](../index) / KernelPool

# KernelPool

## Classes

### KernelPool

#### Extends

- `KernelPool_base`

#### Constructors

##### Constructor

> **new KernelPool**(`_`): [`KernelPool`](#kernelpool)

###### Parameters

###### \_

`never`

###### Returns

[`KernelPool`](#kernelpool)

###### Inherited from

`KernelPool_base.constructor`

## Interfaces

### Binding

One live binding in the kernel namespace.

#### Properties

##### name

> `readonly` **name**: `string`

##### snapshotable

> `readonly` **snapshotable**: `boolean`

##### type

> `readonly` **type**: `string`

***

### ExecuteRequest

One cell submitted to the kernel owning a Session.

#### Properties

##### cellId

> `readonly` **cellId**: `string`

##### code

> `readonly` **code**: `string`

##### sessionId

> `readonly` **sessionId**: `string`

***

### Execution

A cell's streamed lifecycle plus its terminal outcome.

#### Properties

##### events

> `readonly` **events**: `Stream`\<\{ `cellId`: `string`; `epoch`: `number`; `sequence`: `number`; `sessionId`: `string`; \} \| \{ `cellId`: `string`; `epoch`: `number`; `profileDigest`: `string`; `sequence`: `number`; `sessionId`: `string`; \} \| \{ `cellId`: `string`; `sequence`: `number`; `text`: `string`; \} \| \{ `cellId`: `string`; `sequence`: `number`; `text`: `string`; \} \| \{ `cellId`: `string`; `durationMillis?`: `number`; `inputSummary`: `string`; `message?`: `string`; `module`: `string`; `operation`: `string`; `requestId`: `string`; `sequence`: `number`; `status`: `"failed"` \| `"started"` \| `"returned"`; \} \| \{ `cellId`: `string`; `durationMillis`: `number`; `sequence`: `number`; `value`: `string`; \} \| \{ `cellId`: `string`; `data`: `string`; `mediaType`: `string`; `name?`: `string`; `sequence`: `number`; \} \| \{ `cellId`: `string`; `epoch`: `number`; `names`: readonly `string`[]; `restoredBySource`: readonly `string`[]; `sequence`: `number`; \} \| \{ `cellId`: `string`; `droppedNames`: readonly `string`[]; `epoch`: `number`; `reason`: `"function"` \| `"module"` \| `"class"` \| `"live-handle"` \| `"oversized"` \| `"unserializable"`; `sequence`: `number`; \} \| \{ `cellId`: `string`; `epoch`: `number`; `reason`: `"requested"` \| `"killed"` \| `"crashed"` \| `"profile-changed"`; `sequence`: `number`; `sessionId`: `string`; \}, [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

##### result

> `readonly` **result**: `Effect`\<\{ `cellId`: `string`; `durationMillis`: `number`; `epoch`: `number`; `sequence`: `number`; `stderr`: `string`; `stdout`: `string`; `value`: `string`; \}, [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

***

### Inspection

Current kernel namespace and epoch.

#### Properties

##### bindings

> `readonly` **bindings**: readonly [`Binding`](#binding)[]

##### epoch

> `readonly` **epoch**: `number`

##### profile

> `readonly` **profile**: `object`

###### bindingsDigest

> `readonly` **bindingsDigest**: `string`

###### checkpoints

> `readonly` **checkpoints**: `object`

###### checkpoints.filesystem

> `readonly` **filesystem**: `boolean`

###### checkpoints.liveProcess

> `readonly` **liveProcess**: `boolean`

###### checkpoints.namespace

> `readonly` **namespace**: `boolean`

###### contractVersion

> `readonly` **contractVersion**: `2`

###### image

> `readonly` **image**: `object`

###### image.digest

> `readonly` **digest**: `string`

###### image.kind

> `readonly` **kind**: `"image"` \| `"runtime"` \| `"template"`

###### image.reference

> `readonly` **reference**: `string`

###### isolation

> `readonly` **isolation**: `"container"` \| `"microvm"` \| `"host-process"`

###### limits

> `readonly` **limits**: `object`

###### limits.cellDeadlineMillis

> `readonly` **cellDeadlineMillis**: `number`

###### limits.sourceBytes

> `readonly` **sourceBytes**: `number`

###### protocolVersion

> `readonly` **protocolVersion**: `1`

###### provider

> `readonly` **provider**: `string`

###### runtime

> `readonly` **runtime**: `object`

###### runtime.digest

> `readonly` **digest**: `string`

###### runtime.name

> `readonly` **name**: `string`

###### runtime.version

> `readonly` **version**: `string`

###### workspace

> `readonly` **workspace**: `object`

###### workspace.dataRoot

> `readonly` **dataRoot**: `string`

###### workspace.root

> `readonly` **root**: `string`

##### recovery

> `readonly` **recovery**: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`

What actually continued when this epoch was most recently recovered.

##### sessionId

> `readonly` **sessionId**: `string`

***

### InspectRequest

A read-only namespace question that never evaluates model-authored source.

#### Properties

##### name?

> `readonly` `optional` **name?**: `string`

##### sessionId

> `readonly` **sessionId**: `string`

***

### Interruption

Result of asking a running cell to stop.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Interrupted"` \| `"NotRunning"` \| `"Unresponsive"`

##### cellId

> `readonly` **cellId**: `string`

##### sessionId

> `readonly` **sessionId**: `string`

***

### Restart

Result of starting a new kernel epoch for a Session.

#### Properties

##### droppedNames

> `readonly` **droppedNames**: readonly `string`[]

##### epoch

> `readonly` **epoch**: `number`

##### reason

> `readonly` **reason**: `"requested"` \| `"killed"` \| `"crashed"` \| `"profile-changed"`

##### recovery

> `readonly` **recovery**: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`

The checkpoint used for the replacement epoch, never a generic persistence claim.

##### restoredNames

> `readonly` **restoredNames**: readonly `string`[]

##### sessionId

> `readonly` **sessionId**: `string`

***

### Service

The kernel lifecycle port. One live kernel per Session identity, exclusive per
Session and authored-order; the pool owns process lifetime, generation, and lease.

#### Properties

##### close

> `readonly` **close**: (`sessionId`) => `Effect`\<`void`, [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<`void`, [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`Execution`](#execution), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown), `Scope`\>

###### Parameters

###### request

[`ExecuteRequest`](#executerequest)

###### Returns

`Effect`\<[`Execution`](#execution), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown), `Scope`\>

##### inspect

> `readonly` **inspect**: (`request`) => `Effect`\<[`Inspection`](#inspection), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

###### Parameters

###### request

[`InspectRequest`](#inspectrequest)

###### Returns

`Effect`\<[`Inspection`](#inspection), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

##### interrupt

> `readonly` **interrupt**: (`sessionId`, `cellId`) => `Effect`\<[`Interruption`](#interruption), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

###### Parameters

###### sessionId

`string`

###### cellId

`string`

###### Returns

`Effect`\<[`Interruption`](#interruption), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

##### restart

> `readonly` **restart**: (`sessionId`, `reason`) => `Effect`\<[`Restart`](#restart), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

###### Parameters

###### sessionId

`string`

###### reason

`"requested"` \| `"killed"` \| `"crashed"` \| `"profile-changed"`

###### Returns

`Effect`\<[`Restart`](#restart), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>
