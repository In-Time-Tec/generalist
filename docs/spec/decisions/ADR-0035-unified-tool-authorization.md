# ADR-0035 — Unified Tool Authorization

## Status

Accepted.

## Context

`Permissions` answers and Effect AI `Tool.needsApproval` were implemented as separate execution paths. An interactive `Approved` or `Always` answer executed directly and bypassed a tool's static or dynamic approval requirement. `Always` wrote `RuleStore` but the Agent never read it. Per-turn `activeTools` filtered model advertisement without preventing a transformed or non-conforming model call from resolving against the full toolkit.

## Decision

Introduce the public `ToolAuthorization` module and one final `ToolAuthorizer.authorize` call before every framework-executed tool attempt. The request carries the call, resolved tool, exact active-tool membership, model messages, and execution identity. The result is exactly one `Execute`, `Deny`, or `Suspend`; execution starts only for `Execute`.

The default authorizer adapts existing `Permissions`, `RuleStore`, and `Approvals` services. `fromPermissions` and `fromApprovals` expose the same compatibility composition to consumers, and `Agent.make({ authorization })` allows an explicit authorizer without removing legacy services.

Authorization precedence is deterministic: Agent-owned inactive-tool membership denies before all other checks, including a custom authorizer; any current or remembered deny beats allow; allow beats ask; permission approval then proceeds to `needsApproval`; a required approval is decided by `Approvals`, with absence denying fail-closed. A remembered ask without an answer source suspends. Dynamic approval predicate failure or defect remains fail-closed. Interruption remains interruption. The authorizer notifies the Agent before blocking on a permission or approval answer so `ApprovalRequested` preserves its lifecycle ordering.

Authorization suspension carries its token, permission-or-approval stage, exact active-tool names, and activated-skill names. The Agent normalizes custom suspensions to its own call identity and snapshot. Resume derives the unresolved call and its preceding model-input messages from the checkpoint, verifies the supplied identity assertion including params, rehydrates non-conflicting selected skill tool definitions, and authorizes only within the captured active set. The in-process transport forwards the token and snapshot and routes its one-shot answer only to the captured stage. Permission-stage resume consumes that captured answer even if live policy or remembered rules now allow the call; a current deny still wins, and a missing answer source re-suspends with the original token. Permission approval evaluates dynamic approval against the original model-input messages; approval-stage resume skips both the completed permission phase and the already-established dynamic predicate, then resolves the required approval directly. A synthetic one-shot permission adapter resolves remembered asks when no `Permissions` service exists.

`ToolAuthorizer<R>` and Agent run APIs preserve an explicit authorizer's Effect requirements. Authorization resolves tools from the immutable advertised turn toolkit. Skill-contributed tools may not collide with static, built-in, or already activated names, preventing authorization/execution definition drift.

`RuleStore` gains an additive optional read operation. Remembered rules use existing matching and last-match behavior. The memory store atomically replaces an earlier identical pattern when remembering a later rule, providing invalidation without a second store API. Legacy write-only implementations remain accepted but cannot influence later calls.

## Consequences

- No affirmative permission answer accidentally authorizes a dynamically gated tool.
- `Always` affects future equivalent calls while preserving stronger denials and tool-declared approval.
- Static and activated-skill tools outside the exact turn toolkit cannot execute.
- Denials and suspensions remain schema-backed and replay-safe.
- Existing service layers remain compatible through one adapter path; removal is deferred to a later breaking release.
- Authorization remains sequential with tool-call execution, while atomic `Ref` updates make the in-memory rule store safe when authorizers are called concurrently.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/04-permissions-policy.md`
