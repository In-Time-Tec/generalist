[**generalist**](../index)

***

[generalist](../index) / generalist

# generalist

## Namespaces

- [ActiveModelResponse](./namespaces/ActiveModelResponse)
- [Agent](./namespaces/Agent)
- [AgentEvent](./namespaces/AgentEvent)
- [AgentManifest](./namespaces/AgentManifest)
- [AgentProgram](./namespaces/AgentProgram)
- [AgentTool](./namespaces/AgentTool)
- [Approvals](./namespaces/Approvals)
- [BlobStore](./namespaces/BlobStore)
- [CodeExecutor](./namespaces/CodeExecutor)
- [Compaction](./namespaces/Compaction)
- [ContextOverflow](./namespaces/ContextOverflow)
- [DurableDriver](./namespaces/DurableDriver)
- [ExecutableManifest](./namespaces/ExecutableManifest)
- [Gate](./namespaces/Gate)
- [Guardrail](./namespaces/Guardrail)
- [Handoff](./namespaces/Handoff)
- [Hooks](./namespaces/Hooks)
- [Instructions](./namespaces/Instructions)
- [Media](./namespaces/Media)
- [Memo](./namespaces/Memo)
- [Memory](./namespaces/Memory)
- [ModelMiddleware](./namespaces/ModelMiddleware)
- [ModelRegistry](./namespaces/ModelRegistry)
- [ModelResilience](./namespaces/ModelResilience)
- [ModelStreamTermination](./namespaces/ModelStreamTermination)
- [ModelTelemetry](./namespaces/ModelTelemetry)
- [ModelToolCallValidation](./namespaces/ModelToolCallValidation)
- [NestedOperation](./namespaces/NestedOperation)
- [Permissions](./namespaces/Permissions)
- [Pins](./namespaces/Pins)
- [Policy](./namespaces/Policy-1)
- [ProgramCapabilities](./namespaces/ProgramCapabilities)
- [ProgramHandlers](./namespaces/ProgramHandlers)
- [ProgramManifest](./namespaces/ProgramManifest)
- [ProgramRunner](./namespaces/ProgramRunner)
- [RunBudget](./namespaces/RunBudget)
- [Session](./namespaces/Session)
- [SessionHistory](./namespaces/SessionHistory)
- [SessionSync](./namespaces/SessionSync)
- [SkillCatalog](./namespaces/SkillCatalog)
- [Steering](./namespaces/Steering)
- [Tasks](./namespaces/Tasks)
- [ToolAuthorization](./namespaces/ToolAuthorization)
- [ToolContext](./namespaces/ToolContext)
- [ToolExecutor](./namespaces/ToolExecutor)
- [ToolOutput](./namespaces/ToolOutput)
- [ToolPlacement](./namespaces/ToolPlacement)
- [Triggers](./namespaces/Triggers)
- [Watcher](./namespaces/Watcher)

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
