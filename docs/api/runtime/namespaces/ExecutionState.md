[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / ExecutionState

# ExecutionState

## Type Aliases

### AgentExecutionResult

> **AgentExecutionResult** = *typeof* `AgentExecutionResult.Type`

Terminal value produced by an Agent execution.

***

### ExecutionCheckpoint

> **ExecutionCheckpoint** = *typeof* `ExecutionCheckpoint.Type`

Executable-neutral persisted continuation state.

***

### ExecutionResult

> **ExecutionResult** = *typeof* `ExecutionResult.Type`

Executable-neutral terminal result.

***

### ExecutionSuspension

> **ExecutionSuspension** = [`AgentSuspended`](../../generalist/namespaces/AgentEvent#agentsuspended) \| [`ProgramSuspended`](../../generalist/namespaces/ProgramCapabilities#programsuspended) \| [`UnknownAgent`](./Errors#unknownagent) \| [`BudgetExhausted`](../../generalist/namespaces/RunBudget#budgetexhausted) \| [`Suspended`](../../generalist/namespaces/NestedOperation#suspended)

Executable-neutral persisted suspension state.

***

### ProgramCheckpoint

> **ProgramCheckpoint** = *typeof* `ProgramCheckpoint.Type`

Fresh-sandbox replay frontier for an Agent Program.

***

### ProgramExecutionResult

> **ProgramExecutionResult** = *typeof* `ProgramExecutionResult.Type`

Terminal value produced by an Agent Program execution.

***

### SessionCursor

> **SessionCursor** = *typeof* `SessionCursor.Type`

## Variables

### AgentExecutionResult

> `const` **AgentExecutionResult**: `Schema.Struct`\<\{ `output`: `Schema.optionalKey`\<`Schema.Unknown`\>; `session`: `Schema.Struct`\<\{ `leafId`: `Schema.NullOr`\<`Schema.String`\>; `sessionId`: `Schema.String`; \}\>; `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>

Terminal value produced by an Agent execution.

***

### ExecutionCheckpoint

> `const` **ExecutionCheckpoint**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `budget`: `Schema.Struct`\<\{ `allocation`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; `remaining`: `Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>; \}\>; `driverVersion`: `Schema.String`; `executable`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[..., ...\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>\>; `state`: `Schema.Unknown`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"Program"`, \{ `version`: `Schema.Literal`\<`"1"`\>; \}\>\]\>

Executable-neutral persisted continuation state.

***

### ExecutionResult

> `const` **ExecutionResult**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `output`: `Schema.optionalKey`\<`Schema.Unknown`\>; `session`: `Schema.Struct`\<\{ `leafId`: `Schema.NullOr`\<`Schema.String`\>; `sessionId`: `Schema.String`; \}\>; `text`: `Schema.String`; `turns`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"Program"`, \{ `value`: `Schema.Unknown`; \}\>\]\>

Executable-neutral terminal result.

***

### ExecutionSuspension

> **ExecutionSuspension**: `Codec`\<[`ExecutionSuspension`](#executionsuspension), `unknown`, `never`, `never`\>

***

### ProgramCheckpoint

> `const` **ProgramCheckpoint**: `Schema.TaggedStruct`\<`"Program"`, \{ `version`: `Schema.Literal`\<`"1"`\>; \}\>

Fresh-sandbox replay frontier for an Agent Program.

***

### ProgramExecutionResult

> `const` **ProgramExecutionResult**: `Schema.TaggedStruct`\<`"Program"`, \{ `value`: `Schema.Unknown`; \}\>

Terminal value produced by an Agent Program execution.

***

### SessionCursor

> `const` **SessionCursor**: `Schema.Struct`\<\{ `leafId`: `Schema.NullOr`\<`Schema.String`\>; `sessionId`: `Schema.String`; \}\>
