[**generalist**](../index.md)

***

[generalist](../index.md) / generalist

# generalist

## Namespaces

- [ActiveModelResponse](./namespaces/ActiveModelResponse.md)
- [Agent](./namespaces/Agent.md)
- [AgentEvent](./namespaces/AgentEvent.md)
- [AgentManifest](./namespaces/AgentManifest.md)
- [AgentProgram](./namespaces/AgentProgram.md)
- [AgentTool](./namespaces/AgentTool.md)
- [Approvals](./namespaces/Approvals.md)
- [BlobStore](./namespaces/BlobStore.md)
- [CodeExecutor](./namespaces/CodeExecutor.md)
- [Compaction](./namespaces/Compaction.md)
- [ContextOverflow](./namespaces/ContextOverflow.md)
- [DurableDriver](./namespaces/DurableDriver.md)
- [ExecutableManifest](./namespaces/ExecutableManifest.md)
- [Gate](./namespaces/Gate.md)
- [Guardrail](./namespaces/Guardrail.md)
- [Handoff](./namespaces/Handoff.md)
- [Hooks](./namespaces/Hooks.md)
- [Instructions](./namespaces/Instructions.md)
- [Media](./namespaces/Media.md)
- [Memo](./namespaces/Memo.md)
- [Memory](./namespaces/Memory.md)
- [ModelMiddleware](./namespaces/ModelMiddleware.md)
- [ModelRegistry](./namespaces/ModelRegistry.md)
- [ModelResilience](./namespaces/ModelResilience.md)
- [ModelStreamTermination](./namespaces/ModelStreamTermination.md)
- [ModelTelemetry](./namespaces/ModelTelemetry.md)
- [ModelToolCallValidation](./namespaces/ModelToolCallValidation.md)
- [NestedOperation](./namespaces/NestedOperation.md)
- [Permissions](./namespaces/Permissions.md)
- [Pins](./namespaces/Pins.md)
- [Policy](./namespaces/Policy-1.md)
- [ProgramCapabilities](./namespaces/ProgramCapabilities.md)
- [ProgramHandlers](./namespaces/ProgramHandlers.md)
- [ProgramManifest](./namespaces/ProgramManifest.md)
- [ProgramRunner](./namespaces/ProgramRunner.md)
- [RunBudget](./namespaces/RunBudget.md)
- [Session](./namespaces/Session.md)
- [SessionHistory](./namespaces/SessionHistory.md)
- [SessionSync](./namespaces/SessionSync.md)
- [SkillCatalog](./namespaces/SkillCatalog.md)
- [Steering](./namespaces/Steering.md)
- [Tasks](./namespaces/Tasks.md)
- [ToolAuthorization](./namespaces/ToolAuthorization.md)
- [ToolContext](./namespaces/ToolContext.md)
- [ToolExecutor](./namespaces/ToolExecutor.md)
- [ToolOutput](./namespaces/ToolOutput.md)
- [ToolPlacement](./namespaces/ToolPlacement.md)
- [Triggers](./namespaces/Triggers.md)
- [Watcher](./namespaces/Watcher.md)

## Type Aliases

<a id="runid"></a>

### RunId

> **RunId** = *typeof* `RunId.Type`

Stable identity of one Agent execution.

## Variables

<a id="runid-1"></a>

### RunId

> `const` **RunId**: `Schema.String`

Stable identity of one Agent execution.

***

<a id="withcachebreakpoints"></a>

### withCacheBreakpoints

> `const` **withCacheBreakpoints**: `WithCacheBreakpoints`

Provider cache breakpoints derived for one send; markers are never persisted.
