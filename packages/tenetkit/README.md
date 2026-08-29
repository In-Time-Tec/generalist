# TenetKit

Effect-native agent framework. Import core from `tenetkit`, or use the explicit Worker-safe alias `tenetkit/core`. The `tenetkit/ai` entry contains only provider-neutral `Catalog`, `Deterministic`, and `ModelRoute`; install a selected optional provider peer and import its exact `tenetkit/ai/*` subpath.

## Worker-safe entrypoints

The packed-artifact smoke suite bundles and executes these public entrypoints under workerd without `nodejs_compat`:

- `tenetkit/core`
- `tenetkit/mcp`, `tenetkit/mcp/client`, `tenetkit/mcp/client/http`, `tenetkit/mcp/oauth`, and `tenetkit/mcp/tools`
- `tenetkit/ai/openrouter`
- `tenetkit/runtime`

Construct MCP Streamable HTTP transports at `tenetkit/mcp/client/http`. `tenetkit/mcp/client/stdio` is the explicit Node/Bun-only transport. Bun SQLite stays at `tenetkit/runtime/sqlite-bun`; SQL claims and hosted worker loops stay at `tenetkit/runtime/driver/sql/run/claims` and `tenetkit/runtime/driver/sql/worker`. Optional model providers remain exact opt-in `tenetkit/ai/*` imports.

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
