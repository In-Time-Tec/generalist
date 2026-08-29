# TenetKit

Effect-native agent framework. Import core from `tenetkit`. The `tenetkit/ai` entry contains only provider-neutral `Catalog`, `Deterministic`, and `ModelRoute`; install a selected optional provider peer and import its exact `tenetkit/ai/*` subpath.

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
