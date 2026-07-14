# ADR-0030 — Effectful Turn Policy Stop Reasons

## Status

Accepted.

## Context

`TurnPolicy.decide` previously defaulted both Effect's error and requirement channels to `never`. Custom policies therefore could not expose ordinary Effect service requirements or expected evaluation failures in Agent run types. Every successful `Stop` was also rewritten as `TurnLimitExceeded`, even when a policy stopped because a goal was satisfied, a budget was exhausted, or a host-specific condition applied.

Policy stops occur while framework tool results are pending. The terminal contract must preserve that complete checkpoint so a host can classify the stop without losing the calls that were not re-fed.

## Decision

`TurnPolicy<R>` has `decide(info) => Effect<Decision, TurnPolicyError, R>`. The policy requirement `R` is retained by `Agent` and included in all Agent run requirements. `TurnPolicyError` is a schema-backed tagged boundary error with a message and optional defect cause; the loop propagates the exact instance and does not wrap or erase it.

`Stop` carries a schema-backed `StopReason`: `TurnLimit { limit }`, `GoalSatisfied`, `BudgetExhausted { budget }`, or `Policy { detail }`. `recurs(n)` supplies `TurnLimit { limit: n }` for finite counts; opaque non-finite recurrence counts retain their previous continue/stop behavior and use a `Policy` detail if they stop. `untilToolCall(name)` supplies `GoalSatisfied`; `both` returns the first stop unchanged and unions both policies' requirements.

A `TurnLimit` stop produces `TurnLimitExceeded { turn, limit, pending }`. Every other successful stop produces `TurnPolicyStopped { turn, reason, pending }`. Both terminal errors preserve the complete pending tool-call checkpoint. Policy evaluation occurs once at the existing post-turn boundary.

`decision.stop(reason)` is the canonical constructor. Deprecated `fromLegacy` adapts a reasonless `Continue | Stop` policy and maps `Stop` to `Policy { detail: "Legacy policy stopped" }`. It preserves the legacy Effect's typed error and requirement channels by mapping only the success value.

## Consequences

- Requirementful custom policies compose through normal Effect layers and remain visible in Agent run signatures.
- Policy failures remain typed and retain their specific causes.
- Hosts can distinguish limits, satisfied goals, exhausted budgets, and custom policy stops without parsing strings.
- Existing built-ins remain deterministic, requirement-free, snapshot-compatible, and ergonomic.
- The stop decision shape is a breaking change; `fromLegacy` provides a bounded migration path for reasonless policies. Policy requirements use a new trailing Agent generic that defaults to `never`, preserving all prior explicit generic positions.
- No retry, product-specific budget evaluator, tool-ordering change, detached work, resource acquisition, or new concurrency is introduced.
