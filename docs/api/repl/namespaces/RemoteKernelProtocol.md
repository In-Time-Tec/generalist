[**generalist**](../../index)

***

[generalist](../../index) / [repl](../index) / RemoteKernelProtocol

# RemoteKernelProtocol

## Type Aliases

<a id="command"></a>

### Command

> **Command** = *typeof* `Command.Type`

The complete provider-neutral remote KernelPool command union.

***

<a id="response"></a>

### Response

> **Response** = *typeof* `Response.Type`

The complete remote response union. A transport drop after `Admitted` without one
of the exact terminal frames is `CellOutcomeUnknown`; source is never inferred safe to replay.

## Variables

<a id="admitted"></a>

### Admitted

> `const` **Admitted**: `Schema.TaggedStruct`\<`"Admitted"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; \}\>

The remote boundary durably admitted this exact command before acting.

***

<a id="close"></a>

### Close

> `const` **Close**: `Schema.TaggedStruct`\<`"Close"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; \}\>

Delete the current live or paused resource.

***

<a id="closed"></a>

### Closed

> `const` **Closed**: `Schema.TaggedStruct`\<`"Closed"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; \}\>

Proven provider deletion for the exact admitted close command.

***

<a id="command-1"></a>

### Command

> `const` **Command**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Execute"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `code`: `Schema.String`; `deadlineMillis`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"Inspect"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `name`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"Interrupt"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `expectedCell`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Restart"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `reason`: `Schema.Literals`\<readonly \[`"requested"`, `"killed"`, `"crashed"`, `"profile-changed"`\]\>; \}\>, `Schema.TaggedStruct`\<`"Close"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; \}\>\]\>

The complete provider-neutral remote KernelPool command union.

***

<a id="event"></a>

### Event

> `const` **Event**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Event"`\>; `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `event`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"KernelStarting"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"KernelReady"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `profileDigest`: `Schema.String`; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Stdout"`, \{ `cellId`: `Schema.String`; `sequence`: `Schema.Int`; `text`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Stderr"`, \{ `cellId`: `Schema.String`; `sequence`: `Schema.Int`; `text`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"HostCall"`, \{ `cellId`: `Schema.String`; `durationMillis`: `Schema.optionalKey`\<`Schema.Int`\>; `inputSummary`: `Schema.String`; `message`: `Schema.optionalKey`\<`Schema.String`\>; `module`: `Schema.String`; `operation`: `Schema.String`; `requestId`: `Schema.String`; `sequence`: `Schema.Int`; `status`: `Schema.Literals`\<readonly \[`"started"`, `"returned"`, `"failed"`\]\>; \}\>, `Schema.TaggedStruct`\<`"Result"`, \{ `cellId`: `Schema.String`; `durationMillis`: `Schema.Int`; `sequence`: `Schema.Int`; `value`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Display"`, \{ `cellId`: `Schema.String`; `data`: `Schema.String`; `mediaType`: `Schema.String`; `name`: `Schema.optionalKey`\<`Schema.String`\>; `sequence`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"StateRestored"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `names`: `Schema.$Array`\<`Schema.String`\>; `restoredBySource`: `Schema.$Array`\<`Schema.String`\>; `sequence`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"StateLost"`, \{ `cellId`: `Schema.String`; `droppedNames`: `Schema.$Array`\<`Schema.String`\>; `epoch`: `Schema.Int`; `reason`: `Schema.Literals`\<readonly \[`"function"`, `"class"`, `"module"`, `"live-handle"`, `"oversized"`, `"unserializable"`\]\>; `sequence`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"KernelRestarted"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `reason`: `Schema.Literals`\<readonly \[`"requested"`, `"killed"`, `"crashed"`, `"profile-changed"`\]\>; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>\]\>; \}\>

One ordered event for the exact admitted cell.

***

<a id="execute"></a>

### Execute

> `const` **Execute**: `Schema.TaggedStruct`\<`"Execute"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `code`: `Schema.String`; `deadlineMillis`: `Schema.Int`; \}\>

Execute one authored cell under an exact storage-issued command claim.

***

<a id="failure"></a>

### Failure

> `const` **Failure**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Failure"`\>; `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `failure`: `Schema.Union`\<readonly \[[`CellExecutionFailed`](./Cell#cellexecutionfailed), [`KernelUnavailable`](./Cell#kernelunavailable), [`KernelProtocolViolation`](./Cell#kernelprotocolviolation), [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\]\>; \}\>

Proven terminal failure for the exact admitted cell.

***

<a id="inspect"></a>

### Inspect

> `const` **Inspect**: `Schema.TaggedStruct`\<`"Inspect"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `name`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

Inspect one live namespace under the same fenced boundary as execution.

***

<a id="inspected"></a>

### Inspected

> `const` **Inspected**: `Schema.TaggedStruct`\<`"Inspected"`, \{ `bindings`: `Schema.$Array`\<`Schema.Struct`\<\{ `name`: `Schema.String`; `snapshotable`: `Schema.Boolean`; `type`: `Schema.String`; \}\>\>; `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; \}\>

Remote namespace inspection, bound to the admitted control-cell identity.

***

<a id="interrupt"></a>

### Interrupt

> `const` **Interrupt**: `Schema.TaggedStruct`\<`"Interrupt"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `expectedCell`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; \}\>

Interrupt an earlier admitted cell under the current owner's distinct authority.

***

<a id="interrupted"></a>

### Interrupted

> `const` **Interrupted**: `Schema.TaggedStruct`\<`"Interrupted"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `expectedCell`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `outcome`: `Schema.Literals`\<readonly \[`"Interrupted"`, `"NotRunning"`, `"Unresponsive"`\]\>; \}\>

Remote interruption outcome, bound to the admitted cell identity.

***

<a id="response-1"></a>

### Response

> `const` **Response**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Admitted"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Event"`\>; `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `event`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"KernelStarting"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"KernelReady"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `profileDigest`: `Schema.String`; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Stdout"`, \{ `cellId`: `Schema.String`; `sequence`: `Schema.Int`; `text`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Stderr"`, \{ `cellId`: `Schema.String`; `sequence`: `Schema.Int`; `text`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"HostCall"`, \{ `cellId`: `Schema.String`; `durationMillis`: `Schema.optionalKey`\<...\>; `inputSummary`: `Schema.String`; `message`: `Schema.optionalKey`\<...\>; `module`: `Schema.String`; `operation`: `Schema.String`; `requestId`: `Schema.String`; `sequence`: `Schema.Int`; `status`: `Schema.Literals`\<...\>; \}\>, `Schema.TaggedStruct`\<`"Result"`, \{ `cellId`: `Schema.String`; `durationMillis`: `Schema.Int`; `sequence`: `Schema.Int`; `value`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Display"`, \{ `cellId`: `Schema.String`; `data`: `Schema.String`; `mediaType`: `Schema.String`; `name`: `Schema.optionalKey`\<...\>; `sequence`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"StateRestored"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `names`: `Schema.$Array`\<...\>; `restoredBySource`: `Schema.$Array`\<...\>; `sequence`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"StateLost"`, \{ `cellId`: `Schema.String`; `droppedNames`: `Schema.$Array`\<...\>; `epoch`: `Schema.Int`; `reason`: `Schema.Literals`\<...\>; `sequence`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"KernelRestarted"`, \{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `reason`: `Schema.Literals`\<...\>; `sequence`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>\]\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Result"`\>; `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `result`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `durationMillis`: `Schema.Int`; `epoch`: `Schema.Int`; `sequence`: `Schema.Int`; `stderr`: `Schema.String`; `stdout`: `Schema.String`; `value`: `Schema.String`; \}\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Failure"`\>; `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `failure`: `Schema.Union`\<readonly \[[`CellExecutionFailed`](./Cell#cellexecutionfailed), [`KernelUnavailable`](./Cell#kernelunavailable), [`KernelProtocolViolation`](./Cell#kernelprotocolviolation), [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\]\>; \}\>, `Schema.TaggedStruct`\<`"Inspected"`, \{ `bindings`: `Schema.$Array`\<`Schema.Struct`\<\{ `name`: `Schema.String`; `snapshotable`: `Schema.Boolean`; `type`: `Schema.String`; \}\>\>; `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; \}\>, `Schema.TaggedStruct`\<`"Interrupted"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `expectedCell`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `outcome`: `Schema.Literals`\<readonly \[`"Interrupted"`, `"NotRunning"`, `"Unresponsive"`\]\>; \}\>, `Schema.TaggedStruct`\<`"Restarted"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `droppedNames`: `Schema.$Array`\<`Schema.String`\>; `epoch`: `Schema.Int`; `reason`: `Schema.Literals`\<readonly \[`"requested"`, `"killed"`, `"crashed"`, `"profile-changed"`\]\>; `recovery`: `Schema.Literals`\<readonly \[`"live-process"`, `"filesystem"`, `"namespace"`, `"restart-only"`\]\>; `restoredNames`: `Schema.$Array`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"Closed"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; \}\>\]\>

The complete remote response union. A transport drop after `Admitted` without one
of the exact terminal frames is `CellOutcomeUnknown`; source is never inferred safe to replay.

***

<a id="restart"></a>

### Restart

> `const` **Restart**: `Schema.TaggedStruct`\<`"Restart"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `reason`: `Schema.Literals`\<readonly \[`"requested"`, `"killed"`, `"crashed"`, `"profile-changed"`\]\>; \}\>

Start a new epoch without exposing provider replacement primitives.

***

<a id="restarted"></a>

### Restarted

> `const` **Restarted**: `Schema.TaggedStruct`\<`"Restarted"`, \{ `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `droppedNames`: `Schema.$Array`\<`Schema.String`\>; `epoch`: `Schema.Int`; `reason`: `Schema.Literals`\<readonly \[`"requested"`, `"killed"`, `"crashed"`, `"profile-changed"`\]\>; `recovery`: `Schema.Literals`\<readonly \[`"live-process"`, `"filesystem"`, `"namespace"`, `"restart-only"`\]\>; `restoredNames`: `Schema.$Array`\<`Schema.String`\>; \}\>

Remote epoch replacement with an honest account of the recovery used.

***

<a id="result"></a>

### Result

> `const` **Result**: `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Result"`\>; `claim`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `epoch`: `Schema.Int`; `generation`: `Schema.Int`; `ownerId`: `Schema.String`; `profileDigest`: `Schema.String`; `sessionId`: `Schema.String`; \}\>; `result`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `durationMillis`: `Schema.Int`; `epoch`: `Schema.Int`; `sequence`: `Schema.Int`; `stderr`: `Schema.String`; `stdout`: `Schema.String`; `value`: `Schema.String`; \}\>; \}\>

Proven terminal success for the exact admitted cell.
