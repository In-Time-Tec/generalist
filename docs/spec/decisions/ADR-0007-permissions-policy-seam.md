# ADR-0007 — Permissions Policy Seam

## Status

Accepted.

## Context

Tool-declared `needsApproval` is not enough for host policy. Consumers need a declarative way to allow, deny, or ask for local tool calls without encoding policy on every tool and without replacing Baton’s existing `Approvals` enforcement point.

## Decision

Introduce `Permissions` in `@batonfx/core` as an optional policy service consulted before local tool execution and before tool-declared approval checks. Baton ships pure rule matching/evaluation helpers and non-durable in-process layers. `ask` reuses the existing `ApprovalRequested` event and `AgentSuspended { reason: "approval" }` contract instead of adding a second suspension path.

`Approvals` remains the enforcement point for `Ai.Tool.needsApproval`. `Permissions.Allow` means “continue to the existing approval path,” not “bypass all approvals.” Durable waits and persisted rule stores belong to hosts such as Relay.

## Consequences

- Hosts can express broad local tool policy independently from individual tool definitions.
- Existing Baton apps keep current behavior unless they provide a `Permissions` layer.
- Static `ask` rules suspend the run; in-process or durable hosts provide the answer source.
- Baton remains Effect-only and non-durable.

## Related docs

- `docs/spec/04-permissions-policy.md`
- `docs/spec/01-baton-agent-framework.md`
