---
title: "Policies and gating"
description: "Policy, Approvals, and Permissions: every decision union and layer constructor."
---

Three namespaces of generalist gate what a run may do next: Policy decides follow-up turns, Approvals enforces needsApproval, and Permissions evaluates allow/deny/ask rules per tool call.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist
```

## Policy

A policy is `Policy<R> = { decide: (info: TurnInfo) => Effect<Decision, Error, R> }`, consulted before each follow-up turn. `TurnInfo` carries `turn` (0-based count of completed model turns), `history`, and `pendingToolResults`.

| Export                                                    | Notes                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `decision.continue(overrides?)` / `decision.stop(reason)` | `Decision` constructors; `TurnOverrides` may set `instructions`, `model` (a LanguageModel layer), and `activeTools` for the next turn |
| `make<R>(decide)`                                         | Policy from a decide Effect whose R remains in Agent run requirements                                                                 |
| `forever`                                                 | Continue after every turn; the run still completes naturally without pending tool results                                             |
| `recurs(n)`                                               | Continue for at most `n` follow-up turns after the first                                                                              |
| `untilToolCall(name)`                                     | Continue while the named tool has not yet been called this run                                                                        |
| `both(first, second)`                                     | Both must continue; overrides merge with `second` winning                                                                             |
| `defaultPolicy`                                           | `forever`                                                                                                                             |

## Approvals

Resolution flow for permission asks and `Ai.Tool.needsApproval`, which `effect/unstable/ai` declares but never enforces. The interface is `resolve: (pending: Pending) => Effect<Resolution>`; absent host policy uses the auto-approve default.

| Resolution | Fields      | Loop behavior                                                |
| ---------- | ----------- | ------------------------------------------------------------ |
| `Approved` | `remember?` | The optional rule is remembered, then the tool executes      |
| `Denied`   | `reason?`   | The model receives a failed tool result with `reason`        |
| `Pending`  | `token`     | The run suspends with `AgentSuspended{ reason: "approval" }` |

| Layer                                 | Behavior                                                      |
| ------------------------------------- | ------------------------------------------------------------- |
| `Approvals.layerAutoApprove`          | Every resolution returns Approved, the default choice         |
| `Approvals.layerDenyAll`              | Every resolution returns Denied; useful in tests and lockdown |
| `Approvals.layerTest(implementation)` | Layer from an explicit service                                |

## Permissions

The rule matcher consulted before Approvals. Its only member is `evaluate: (request: ToolAuthorization.AccessRequest) => Effect<Decision, PermissionError>`. Absent host policy uses allow-all permissions and an in-memory RuleStore.

| Type            | Members                                   | Notes                                                                                  |
| --------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `Level`         | `"allow" \| "deny" \| "ask"`              | What a matched rule grants                                                             |
| `Rule`          | `pattern`, `level`, `reason?`             | Pattern is `tool` or `tool:params` with `*` globs matched against projected param text |
| `Ruleset`       | `rules`, `fallback?`                      | Last matching rule wins; fallback defaults to `"ask"`                                  |
| `AccessRequest` | `call`, `agentName`, `turn`, `sessionId?` | The shared access-boundary request                                                     |
| `Decision`      | `Allow \| Deny{reason?} \| Ask{token}`    | Resolved policy decision for one call                                                  |

| Export                                | Notes                                                          |
| ------------------------------------- | -------------------------------------------------------------- |
| `matches(pattern, tool, params)`      | Match one permission pattern against a tool call               |
| `evaluate(ruleset, tool, params)`     | Pure ruleset evaluation to a `Level` with last-match semantics |
| `layerRuleset(ruleset)`               | Policy layer from a static ruleset                             |
| `layerAllowAll`                       | Policy layer that allows every call                            |
| `layerRuleStoreMemory(initialRules?)` | Non-durable in-memory remembered-rule store                    |
| `layerTest` / `layerRuleStoreTest`    | Layers from explicit services                                  |
| `PermissionError`                     | Tagged error with `message`                                    |

<Note title="Deny rules fail closed">
When a params projection is incomplete (non-text leaves), a matching deny-level tool pattern applies regardless of its params pattern.
</Note>

See [How to control turn budgets](/guides/turn-policy), [How to require human approval for a tool](/guides/approvals), and [How to gate tools with permission rules](/guides/permissions).
