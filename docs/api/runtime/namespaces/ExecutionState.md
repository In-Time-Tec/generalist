[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / ExecutionState

# ExecutionState

## Type Aliases

<a id="agentexecutionresult"></a>

### AgentExecutionResult

> **AgentExecutionResult** = *typeof* `AgentExecutionResult.Type`

Terminal value produced by an Agent execution.

***

<a id="executioncheckpoint"></a>

### ExecutionCheckpoint

> **ExecutionCheckpoint** = *typeof* `ExecutionCheckpoint.Type`

Executable-neutral persisted continuation state.

***

<a id="executionresult"></a>

### ExecutionResult

> **ExecutionResult** = *typeof* `ExecutionResult.Type`

Executable-neutral terminal result.

***

<a id="executionsuspension"></a>

### ExecutionSuspension

> **ExecutionSuspension** = [`AgentSuspended`](../../generalist/namespaces/AgentEvent#agentsuspended) \| [`ProgramSuspended`](../../generalist/namespaces/ProgramCapabilities#programsuspended) \| [`UnknownAgent`](./Errors#unknownagent) \| [`BudgetExhausted`](../../generalist/namespaces/RunBudget#budgetexhausted) \| [`Suspended`](../../generalist/namespaces/NestedOperation#suspended)

Executable-neutral persisted suspension state.

***

<a id="programcheckpoint"></a>

### ProgramCheckpoint

> **ProgramCheckpoint** = *typeof* `ProgramCheckpoint.Type`

Fresh-sandbox replay frontier for an Agent Program.

***

<a id="programexecutionresult"></a>

### ProgramExecutionResult

> **ProgramExecutionResult** = *typeof* `ProgramExecutionResult.Type`

Terminal value produced by an Agent Program execution.

***

<a id="sessioncursor"></a>

### SessionCursor

> **SessionCursor** = *typeof* `SessionCursor.Type`

## Variables

<a id="agentexecutionresult-1"></a>

### AgentExecutionResult

> `const` **AgentExecutionResult**: `Schema.Struct`\<\{ `output`: `Schema.optionalKey`\<`Schema.Unknown`\>; `session`: `Schema.Struct`\<\{ `leafId`: `Schema.NullOr`\<`Schema.String`\>; `sessionId`: `Schema.String`; \}\>; `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>

Terminal value produced by an Agent execution.

***

<a id="executioncheckpoint-1"></a>

### ExecutionCheckpoint

> `const` **ExecutionCheckpoint**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[..., ...\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"Program"`, \{ `version`: `Schema.Literal`\<`"1"`\>; \}\>\]\>

Executable-neutral persisted continuation state.

***

<a id="executionresult-1"></a>

### ExecutionResult

> `const` **ExecutionResult**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `output`: `Schema.optionalKey`\<`Schema.Unknown`\>; `session`: `Schema.Struct`\<\{ `leafId`: `Schema.NullOr`\<`Schema.String`\>; `sessionId`: `Schema.String`; \}\>; `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"Program"`, \{ `value`: `Schema.Unknown`; \}\>\]\>

Executable-neutral terminal result.

***

<a id="executionsuspension-1"></a>

### ExecutionSuspension

> **ExecutionSuspension**: `Codec`\<[`ExecutionSuspension`](#executionsuspension), `unknown`, `never`, `never`\>

***

<a id="programcheckpoint-1"></a>

### ProgramCheckpoint

> `const` **ProgramCheckpoint**: `Schema.TaggedStruct`\<`"Program"`, \{ `version`: `Schema.Literal`\<`"1"`\>; \}\>

Fresh-sandbox replay frontier for an Agent Program.

***

<a id="programexecutionresult-1"></a>

### ProgramExecutionResult

> `const` **ProgramExecutionResult**: `Schema.TaggedStruct`\<`"Program"`, \{ `value`: `Schema.Unknown`; \}\>

Terminal value produced by an Agent Program execution.

***

<a id="sessioncursor-1"></a>

### SessionCursor

> `const` **SessionCursor**: `Schema.Struct`\<\{ `leafId`: `Schema.NullOr`\<`Schema.String`\>; `sessionId`: `Schema.String`; \}\>
