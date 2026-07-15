# 04 — Permissions Policy

Baton's `Permissions` module is the compatibility policy seam for framework-executed local tool calls. `ToolAuthorization` combines its answer with remembered rules, the current turn's active-tool set, and a tool's own `needsApproval` / `Approvals` gate before `ToolExecutor` can run.

## Scope

Baton owns:

- the `Level`, `Rule`, `Ruleset`, `Decision`, `Answer`, and `Pending` model;
- pure `matches(pattern, tool, params)` and `evaluate(ruleset, tool, params)` helpers;
- in-process `Permissions` and optional readable `RuleStore` service boundaries;
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
- `await` returning `Approved` allows the current call to proceed to `needsApproval`; it does not execute or approve the tool by itself.
- `await` returning `Denied` fails with `FrameworkFailure { stage: "authorization" }`.
- `await` returning `Always` remembers an allow rule for that tool when `RuleStore` is present, then allows the current call to proceed to `needsApproval`; it does not override a static or dynamic approval requirement.

Provider-executed tool calls are not gated by `Permissions` because Baton does not dispatch them.

## Deferred HITL pattern

Core's interactive layer is non-durable. A host can implement `onAsk(pending)` by registering an Effect `Deferred`, surfacing `pending.token` to an approver, and completing the Deferred with `Answer`. If no in-process answer is available, `fromRuleset` returns `Option.none()` from `await`, which makes the Agent suspend. Relay can provide a durable implementation of the same service boundary.

## Agent integration

`Agent.stream` resolves `Permissions`, `RuleStore`, and `Approvals` optionally and adapts them into one `ToolAuthorization.ToolAuthorizer` unless the agent supplies an explicit `authorization`. Existing services therefore remain source-compatible while every call reaches one final decision.

`ToolAuthorizer<R>` preserves custom Effect requirements in the Agent and all run APIs. A layer-provided `ToolAuthorizerService` is dependency-closed (`R = never`); dependency-bearing authorizers use the explicit Agent field so requirements remain visible to callers.

For a framework-executed local tool call, Baton runs:

1. reject a tool absent from the exact active toolkit for the turn;
2. read matching remembered rules and evaluate optional `Permissions` policy;
3. resolve permission conflicts with `deny > allow > ask`; a remembered allow suppresses a repeated permission ask, but never suppresses `needsApproval`;
4. emit `ApprovalRequested` before a permission wait, then evaluate `Ai.Tool.needsApproval` fail-closed and emit the event before consulting `Approvals` when required;
5. return exactly one final `Execute`, `Deny`, or `Suspend` authorization;
6. call `ToolExecutor.execute` only for `Execute`.

Remembered rules use the same glob matching and last-match semantics as ordinary rules. A later remembered rule with the same pattern replaces the earlier value, which is the in-process invalidation mechanism. A `RuleStore` implementation that omits the additive `rules` read operation remains writable for compatibility but cannot suppress future asks. Memory-layer reads and writes are atomic through Effect `Ref`, so concurrent calls observe complete rule snapshots rather than partial updates. The memory layer's scope bounds the lifetime of remembered rules.

An explicit current or remembered deny always wins. Any allow wins over ask. If neither source answers, ask wins. A matched remembered ask without a `Permissions` answer source suspends fail-closed. Active-tool exclusion has higher precedence than all policy and approval answers, including explicit custom authorizers. A required static or dynamic approval is evaluated after permission resolution and cannot be bypassed by `Approved` or `Always`.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0007-permissions-policy-seam.md`
