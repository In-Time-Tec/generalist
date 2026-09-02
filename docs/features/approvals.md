# Approval adapters

Approvals is the single human-decision seam for permission asks and Effect AI tools marked `needsApproval`. Immediate adapters return `Approved` or `Denied`; the durable adapter returns the existing `Pending { token }` decision so Runtime uses its ordinary suspension and recovery path.

`Hooks.onToolCall` may return `Hooks.Ask()` to force this same seam even when Permissions and the tool declaration would otherwise execute immediately. `Hooks.onApprovalRequest` runs before `Approvals.resolve`; `Block` denies without invoking the adapter. Both decisions use the Agent driver's existing checkpoint and replay path.

## Console

`layerConsole()` displays the tool name, arguments, Permissions level, and reason through Effect `Terminal`, then reads one line. `y` and `yes` approve; every other answer denies. A quit or terminal failure denies rather than silently approving.

```ts
import { Approvals } from "generalist"

const approvals = Approvals.layerConsole()
```

Provide an Effect `Terminal` implementation at the application boundary. Tests can provide `Terminal.make(...)` without replacing standard input or output.

## Tiered

`layerTiered` auto-approves below its inclusive threshold and delegates at or above it. Current Permissions levels are ordered `allow < ask < deny`; a threshold of `ask` therefore delegates policy asks while allowing lower-level `needsApproval` calls.

```ts
const approvals = Approvals.layerTiered({
  askAbove: "ask",
  ask: Approvals.layerConsole(),
})
```

## Durable

`layerDurable` is for webhooks, chat systems, and other operator interfaces that may answer after the process restarts. It requires Runtime and calls `notify` once with `{ runId, tool, args, level, reason, token }`. The run then suspends through its existing approval wait.

```ts
const approvals = Approvals.layerDurable({
  notify: (request) => sendApprovalNotification(request),
})
```

Resolve the exact emitted token through `Approvals.resolve`. Provide the same `Permissions.RuleStore` authority used by the Agent; an explicit `remember` rule is persisted before the Runtime wait closes.

```ts
const approve = (token: string) =>
  Approvals.resolve(
    token,
    Approvals.Approved({
      remember: { pattern: "publish:*", level: "allow" },
    }),
  )
```

Hosted approval tokens carry an encoded Run ID, so token-only resolution remains unambiguous after restart. Runtime still validates the persisted approval identity and terminal decision transactionally. A stale, mismatched, or duplicate conflicting answer fails typed and never dispatches the tool.

## Choosing an adapter

- Use `layerConsole` for one interactive local operator.
- Use `layerTiered` when lower permission levels may proceed without interruption.
- Use `layerDurable` when the answer crosses a process lifetime or external delivery boundary.
- Use `layerAutoApprove` only for trusted jobs and tests; use `layerDenyAll` for an explicit fail-closed posture.
