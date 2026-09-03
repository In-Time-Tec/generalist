[**generalist**](../../index)

***

[generalist](../../index) / [repl](../index) / KernelPool

# KernelPool

## Classes

<a id="kernelpool"></a>

### KernelPool

#### Extends

- `KernelPool_base`

#### Constructors

<a id="constructor"></a>

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

<a id="binding"></a>

### Binding

One live binding in the kernel namespace.

#### Properties

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="snapshotable"></a>

##### snapshotable

> `readonly` **snapshotable**: `boolean`

<a id="type"></a>

##### type

> `readonly` **type**: `string`

***

<a id="executerequest"></a>

### ExecuteRequest

One cell submitted to the kernel owning a Session.

#### Properties

<a id="cellid"></a>

##### cellId

> `readonly` **cellId**: `string`

<a id="code"></a>

##### code

> `readonly` **code**: `string`

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

***

<a id="execution"></a>

### Execution

A cell's streamed lifecycle plus its terminal outcome.

#### Properties

<a id="events"></a>

##### events

> `readonly` **events**: `Stream`\<\{ `cellId`: `string`; `epoch`: `number`; `sequence`: `number`; `sessionId`: `string`; \} \| \{ `cellId`: `string`; `epoch`: `number`; `profileDigest`: `string`; `sequence`: `number`; `sessionId`: `string`; \} \| \{ `cellId`: `string`; `sequence`: `number`; `text`: `string`; \} \| \{ `cellId`: `string`; `sequence`: `number`; `text`: `string`; \} \| \{ `cellId`: `string`; `durationMillis?`: `number`; `inputSummary`: `string`; `message?`: `string`; `module`: `string`; `operation`: `string`; `requestId`: `string`; `sequence`: `number`; `status`: `"failed"` \| `"started"` \| `"returned"`; \} \| \{ `cellId`: `string`; `durationMillis`: `number`; `sequence`: `number`; `value`: `string`; \} \| \{ `cellId`: `string`; `data`: `string`; `mediaType`: `string`; `name?`: `string`; `sequence`: `number`; \} \| \{ `cellId`: `string`; `epoch`: `number`; `names`: readonly `string`[]; `restoredBySource`: readonly `string`[]; `sequence`: `number`; \} \| \{ `cellId`: `string`; `droppedNames`: readonly `string`[]; `epoch`: `number`; `reason`: `"function"` \| `"module"` \| `"class"` \| `"live-handle"` \| `"oversized"` \| `"unserializable"`; `sequence`: `number`; \} \| \{ `cellId`: `string`; `epoch`: `number`; `reason`: `"requested"` \| `"killed"` \| `"crashed"` \| `"profile-changed"`; `sequence`: `number`; `sessionId`: `string`; \}, [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

<a id="result"></a>

##### result

> `readonly` **result**: `Effect`\<\{ `cellId`: `string`; `durationMillis`: `number`; `epoch`: `number`; `sequence`: `number`; `stderr`: `string`; `stdout`: `string`; `value`: `string`; \}, [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

***

<a id="inspection"></a>

### Inspection

Current kernel namespace and epoch.

#### Properties

<a id="bindings"></a>

##### bindings

> `readonly` **bindings**: readonly [`Binding`](#binding)[]

<a id="epoch"></a>

##### epoch

> `readonly` **epoch**: `number`

<a id="profile"></a>

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

<a id="recovery"></a>

##### recovery

> `readonly` **recovery**: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`

What actually continued when this epoch was most recently recovered.

<a id="sessionid-1"></a>

##### sessionId

> `readonly` **sessionId**: `string`

***

<a id="inspectrequest"></a>

### InspectRequest

A read-only namespace question that never evaluates model-authored source.

#### Properties

<a id="name-1"></a>

##### name?

> `readonly` `optional` **name?**: `string`

<a id="sessionid-2"></a>

##### sessionId

> `readonly` **sessionId**: `string`

***

<a id="interruption"></a>

### Interruption

Result of asking a running cell to stop.

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"Interrupted"` \| `"NotRunning"` \| `"Unresponsive"`

<a id="cellid-1"></a>

##### cellId

> `readonly` **cellId**: `string`

<a id="sessionid-3"></a>

##### sessionId

> `readonly` **sessionId**: `string`

***

<a id="restart"></a>

### Restart

Result of starting a new kernel epoch for a Session.

#### Properties

<a id="droppednames"></a>

##### droppedNames

> `readonly` **droppedNames**: readonly `string`[]

<a id="epoch-1"></a>

##### epoch

> `readonly` **epoch**: `number`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `"requested"` \| `"killed"` \| `"crashed"` \| `"profile-changed"`

<a id="recovery-1"></a>

##### recovery

> `readonly` **recovery**: `"filesystem"` \| `"namespace"` \| `"live-process"` \| `"restart-only"`

The checkpoint used for the replacement epoch, never a generic persistence claim.

<a id="restorednames"></a>

##### restoredNames

> `readonly` **restoredNames**: readonly `string`[]

<a id="sessionid-4"></a>

##### sessionId

> `readonly` **sessionId**: `string`

***

<a id="service"></a>

### Service

The kernel lifecycle port. One live kernel per Session identity, exclusive per
Session and authored-order; the pool owns process lifetime, generation, and lease.

#### Properties

<a id="close"></a>

##### close

> `readonly` **close**: (`sessionId`) => `Effect`\<`void`, [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<`void`, [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

<a id="execute"></a>

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`Execution`](#execution), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown), `Scope`\>

###### Parameters

###### request

[`ExecuteRequest`](#executerequest)

###### Returns

`Effect`\<[`Execution`](#execution), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown), `Scope`\>

<a id="inspect"></a>

##### inspect

> `readonly` **inspect**: (`request`) => `Effect`\<[`Inspection`](#inspection), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

###### Parameters

###### request

[`InspectRequest`](#inspectrequest)

###### Returns

`Effect`\<[`Inspection`](#inspection), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

<a id="interrupt"></a>

##### interrupt

> `readonly` **interrupt**: (`sessionId`, `cellId`) => `Effect`\<[`Interruption`](#interruption), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

###### Parameters

###### sessionId

`string`

###### cellId

`string`

###### Returns

`Effect`\<[`Interruption`](#interruption), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

<a id="restart-1"></a>

##### restart

> `readonly` **restart**: (`sessionId`, `reason`) => `Effect`\<[`Restart`](#restart), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>

###### Parameters

###### sessionId

`string`

###### reason

`"requested"` \| `"killed"` \| `"crashed"` \| `"profile-changed"`

###### Returns

`Effect`\<[`Restart`](#restart), [`CellExecutionFailed`](./Cell#cellexecutionfailed) \| [`KernelUnavailable`](./Cell#kernelunavailable) \| [`KernelProtocolViolation`](./Cell#kernelprotocolviolation) \| [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\>
