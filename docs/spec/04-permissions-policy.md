# 04 — Permissions Policy

Baton's `Permissions` module is the optional policy seam for framework-executed local tool calls. It evaluates declarative allow/deny/ask rules before `ToolExecutor` and before a tool's own `needsApproval` / `Approvals` gate.

## Scope

Baton owns:

- the `Level`, `Rule`, `Ruleset`, `Decision`, `Answer`, and `Pending` model;
- pure `matches(pattern, tool, params)` and `evaluate(ruleset, tool, params)` helpers;
- in-process `Permissions` and optional `RuleStore` service boundaries;
- static, allow-all, interactive, and test layers;
- Agent integration for local tool calls before execution and before tool-declared approval checks.

Baton does not own durable permission waits, cross-process approval delivery, approval UI, command AST parsing, or Relay integration. Durable hosts provide their own `Permissions` / `RuleStore` layers.

## Rule model

- `Level` is `"allow" | "deny" | "ask"`.
- `Rule` has a `pattern` and a `level`.
- `Ruleset` is an ordered list of rules plus an optional `fallback`; fallback defaults to `"ask"`.
- Later matching rules win.
- A pattern without `:` matches the tool name. A pattern with `:` matches `<tool>:<argument-text>`.
- Glob matching is intentionally minimal: `*` matches any run of characters.

Argument matching is shape-independent: the params value is recursively projected into candidate strings — every string, number, boolean, and bigint leaf, a space-joined form of each array's primitive elements, and a stable string representation of the whole value — and the argument pattern matches when it matches any candidate. When a params value cannot be fully projected (non-JSON leaves such as functions or symbols, or cyclic references), `deny` rules with an argument pattern fail closed and match; `allow` and `ask` rules match only on the candidates that could be projected.

## Decision model

- `Allow` continues to the existing `needsApproval` / `Approvals` path.
- `Deny` fails with `FrameworkFailure { stage: "authorization" }` and does not emit `ToolExecutionStarted`.
- `Ask` emits `ApprovalRequested` and calls `Permissions.await(pending)`.
- `await` returning `Option.none()` suspends the run with `AgentSuspended { reason: "approval" }`.
- `await` returning `Approved` executes the current call.
- `await` returning `Denied` fails with `FrameworkFailure { stage: "authorization" }`.
- `await` returning `Always` executes the current call and, when `RuleStore` is present, remembers an allow rule for that tool.

Provider-executed tool calls are not gated by `Permissions` because Baton does not dispatch them.

## Deferred HITL pattern

Core's interactive layer is non-durable. A host can implement `onAsk(pending)` by registering an Effect `Deferred`, surfacing `pending.token` to an approver, and completing the Deferred with `Answer`. If no in-process answer is available, `fromRuleset` returns `Option.none()` from `await`, which makes the Agent suspend. Relay can provide a durable implementation of the same service boundary.

## Agent integration

`Agent.stream` resolves `Permissions` optionally so its static requirement set does not grow. If the service is absent, the existing behavior is unchanged: ungated tools execute and `needsApproval` tools use `Approvals`.

For a framework-executed local tool call, Baton runs:

1. optional `Permissions.evaluate` / `Permissions.await`;
2. existing `Ai.Tool.needsApproval` / `Approvals.check`;
3. `ToolExecutor.execute`.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0007-permissions-policy-seam.md`
