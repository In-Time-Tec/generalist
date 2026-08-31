# Generalist

Effect-native agent framework. Import the Worker-safe agent API from `generalist`. Provider-neutral catalog, deterministic model, and route owners live at `generalist/ai/model-catalog`, `generalist/ai/deterministic`, and `generalist/ai/model-route`; optional providers remain exact `generalist/ai/*` leaves.

```bash
bun add effect@4.0.0-rc.112 generalist@0.44.0
```

Install only package names. `generalist/runtime`, `generalist/ai/deterministic`, and the other `generalist/*` names below are import subpaths of `generalist`, not separate packages. Core, generic Runtime, the model catalog and route, and `generalist/ai/deterministic` require no optional provider peer. Each exact provider or integration subpath requires the optional peer named by its reference documentation.

## Worker-safe entrypoints

The packed-artifact smoke suite bundles and executes these public entrypoints under workerd without `nodejs_compat`:

- `generalist`
- `generalist/mcp`, `generalist/mcp/client`, `generalist/mcp/client/http`, `generalist/mcp/oauth`, and `generalist/mcp/tools`
- `generalist/ai/openrouter`
- `generalist/runtime`

Construct MCP Streamable HTTP transports at `generalist/mcp/client/http`. `generalist/mcp/client/stdio` is the explicit Node/Bun-only transport. Bun SQLite stays at `generalist/runtime/sqlite-bun`; SQL adapter claims and hosted worker loops use the exact `generalist/runtime/sql-driver` SPI. Optional model providers remain exact opt-in `generalist/ai/*` imports.

## TypeScript REPL kernels

`generalist/repl` defines one persistent, ordered TypeScript namespace per Session. `KernelPool` exposes only `execute`, `inspect`, `interrupt`, `restart`, and `close`. It is intentionally separate from `CodeExecutor`, whose Agent Program executions are fresh and stateless.

`KernelProfile` pins the provider, exact runtime and runtime/image/template identity, physical isolation, checkpoint capabilities, host bindings, workspace, and limits for one epoch. Its content-addressed digest excludes credentials, ownership generations, and mutable provider resource IDs. Recovery reports one exact kind: `live-process`, `filesystem`, `namespace`, or `restart-only`.

`generalist/repl/bun` is the trusted-local child-process implementation. Hosted providers are explicit Layers and use the host-owned `KernelResourceAuthority` authority to fence every command by Session, ownership generation, epoch, profile digest, resource, and cell identity. Provider create/pause/resume details do not enter `KernelPool`; uncertain admitted source is never replayed, and failed cleanup remains visible until exact deletion is proven.

Provider packages can register the reusable `KernelProviderConformance.kernelProviderConformance` suite from `generalist/test`. It covers the common Bun lifecycle and deterministic remote ownership, reconnection, recovery, uncertainty, pause, and cleanup semantics. Deterministic fixtures do not prove a hosted vendor's isolation or billing deletion; those require live provider tests.

## External model tool calls

Use `Agent.streamToolCalls` when another realtime or hosted model loop has completed an Effect AI tool call. Submit every call that must share authored ordering and concurrency in one non-empty batch. Generalist strictly decodes the original tool schemas and applies the Agent's active-tool snapshot, authorization, scheduling, budget, deadline, `ToolExecutor`, `ToolContext`, output bound, durable replay, and suspension path without invoking a `LanguageModel`.

Fresh admission requires `_tag: "Start"`, `calls`, `activeTools`, authorization `messages`, `sessionId`, `logicalOperationId`, and `turn`. Persist checkpoints through `DurableDriver.DriverJournal`; recover with `_tag: "Resume"`, that exact `driverCheckpoint`, its matching `executableRef`, and the same authorization messages. Add `resume` only to resolve an emitted `AgentSuspended` wait. The recovery form does not accept replacement calls, active tools, indexes, identities, or budgets.

## Durable tool cancellation

An executor or route opts into Runtime-owned semantic cancellation by defining `cancel`. A direct executor may additionally define `cancellable(request)` to narrow which execute requests are admitted as cancellable. `layerRouter` uses the same first matching route for execute and cancel.

```ts
const tools = ToolExecutor.layerRouter([
  ToolExecutor.route({
    tools: ["run_cell"],
    execute: executeCell,
    cancel: ({ operationKey, attempt, runId, toolCallId, execution }) =>
      cancelCell({ operationKey, attempt, runId, toolCallId, params: execution.call.params }),
  }),
])
```

The callback receives the stable operation key, attempt, Session, Run, root Run, tool-call, tool-name, and original execute request. It must be idempotent for that identity and acknowledge only a definitive terminal with `{ _tag: "Cancelled" }` or `{ _tag: "AlreadyTerminal", outcome }`. A failed or interrupted callback is redelivered after Runtime reclaims the durable cancellation; host shutdown, lease loss, and ordinary Effect interruption do not call it. `Runtime.cancel` returning means the durable request was admitted and local interruption was requested, not that the Run is terminal. Observe `inspect`, events, or a terminal waiting API. Ambiguous non-cancellable work remains `unknown` / `needs-resolution`.
