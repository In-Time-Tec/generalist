[**generalist**](../../index)

***

[generalist](../../index) / [repl](../index) / CellTool

# CellTool

## Type Aliases

### Parameters

> **Parameters** = *typeof* `Parameters.Type`

The cell source parameter.

## Variables

### layer

> `const` **layer**: `Layer.Layer`\<[`ToolExecutor`](../../generalist/namespaces/ToolExecutor#toolexecutor), `never`, [`SandboxProvider`](../../sandbox#sandboxprovider)\>

***

### maxProgressBytes

> `const` **maxProgressBytes**: `16384` = `16384`

Largest encoded cell event carried in one progress record.

***

### maxSourceBytes

> `const` **maxSourceBytes**: `65536` = `65536`

Maximum authored source accepted in one cell.

***

### name

> `const` **name**: `"typescript"` = `"typescript"`

The only name a Generalist REPL host advertises to a model.

***

### Parameters

> `const` **Parameters**: `Schema.Struct`\<\{ `code`: `Schema.String`; \}\>

The cell source parameter.

***

### route

> `const` **route**: [`Route`](../../generalist/namespaces/ToolPlacement#route)\<[`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext) \| [`SandboxProvider`](../../sandbox#sandboxprovider)\>

The cell route: one tool, ToolContext progress and interruption, typed cell outcomes.

***

### SandboxSnapshot

> `const` **SandboxSnapshot**: `Schema.TaggedStruct`\<`"SandboxSnapshot"`, \{ `snapshotId`: `Schema.String`; \}\>

A durable marker naming the Sandbox image committed after a cell.

***

### SandboxSnapshotUnavailable

> `const` **SandboxSnapshotUnavailable**: `Schema.TaggedStruct`\<`"SandboxSnapshotUnavailable"`, \{ \}\>

A durable marker recording that cell state cannot be restored.

***

### scheduling

> `const` **scheduling**: [`ToolSchedulingPolicy`](../../generalist/namespaces/Agent#toolschedulingpolicy)

One shared namespace means one cell at a time: the cell tool is never parallel-safe
and every call is an authored-order exclusive barrier.

***

### tool

> `const` **tool**: `Tool.Tool`\<`"typescript"`, \{ `failure`: `Schema.Union`\<readonly \[[`CellExecutionFailed`](./Cell#cellexecutionfailed), *typeof* [`KernelUnavailable`](./Cell#kernelunavailable), *typeof* [`KernelProtocolViolation`](./Cell#kernelprotocolviolation), [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\]\>; `failureMode`: `"return"`; `parameters`: `Schema.Struct`\<\{ `code`: `Schema.String`; \}\>; `success`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `durationMillis`: `Schema.Int`; `epoch`: `Schema.Int`; `sequence`: `Schema.Int`; `stderr`: `Schema.String`; `stdout`: `Schema.String`; `value`: `Schema.String`; \}\>; \}, `never`\>

The one Effect AI tool a conversational Generalist agent advertises.

***

### toolkit

> `const` **toolkit**: `Toolkit.Toolkit`\<\{ `typescript`: `Tool.Tool`\<`"typescript"`, \{ `failure`: `Schema.Union`\<readonly \[[`CellExecutionFailed`](./Cell#cellexecutionfailed), *typeof* [`KernelUnavailable`](./Cell#kernelunavailable), *typeof* [`KernelProtocolViolation`](./Cell#kernelprotocolviolation), [`CellOutcomeUnknown`](./Cell#celloutcomeunknown)\]\>; `failureMode`: `"return"`; `parameters`: `Schema.Struct`\<\{ `code`: `Schema.String`; \}\>; `success`: `Schema.Struct`\<\{ `cellId`: `Schema.String`; `durationMillis`: `Schema.Int`; `epoch`: `Schema.Int`; `sequence`: `Schema.Int`; `stderr`: `Schema.String`; `stdout`: `Schema.String`; `value`: `Schema.String`; \}\>; \}, `never`\>; \}\>
