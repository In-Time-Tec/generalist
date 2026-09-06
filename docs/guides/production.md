---
title: "Operate an agent service"
description: "Choose who owns access, limits, shutdown, and recovery before accepting user work."
---

Use this guide before exposing a Host through `generalist/server`. First run the [transport guide](/guides/serve-transport) and [SQLite reopen example](/start/examples#local-and-sqlite-in-five-minutes). You need a persistent store if accepted work must survive a restart, plus application-owned authentication, authorization, and operational access.

## Authenticate and authorize at the host boundary

`Server.authBearer(Config.redacted("SERVICE_TOKEN"))` authenticates one shared bearer token. It does not establish tenant identity or authorize access to a particular Session, Run, blob, or approval. `Server.Authentication` lets the application supply authentication middleware; a caller-supplied operator string is an audit field, not proof of identity.

Use separate tenant-owned Hosts and stores, or an application gateway that authorizes **every** endpoint against the authenticated principal: reads, writes, event streams, WebSockets, blobs, approvals, and operator actions. Prevent clients from bypassing that gateway. Derive operator identity from authenticated context rather than trusting request payloads. Tool `Permissions` do not replace resource authorization.

The tutorial's pass-through auth, allow-all permissions, and permissive CORS are demonstrations only. Use TLS, restrict origins, keep model keys on the server, and test cross-tenant denials before accepting traffic. Generalist does not supply a secure multi-tenant Server or a production sandbox. The local Bun kernel runs with host OS permissions; use an isolation provider appropriate to your workload before executing untrusted code.

## Bound work before admission

Core defaults to `Policy.forever`. Set a finite `Policy.recurs(n)` on a tool-calling agent; it limits follow-up turns, not the initial call. Use `Effect.timeout` for a process-local caller deadline and interruptible APIs inside handlers. A disconnected observer or timed-out wait is not a durable cancellation request.

For Runtime work, pass `RunBudget.make({ tokens, usd, duration, toolCalls, children })` as `runtime.start`'s `budget`. `runtime.inspect(runId).budget` reports remaining limits. Unknown model pricing makes USD remaining `"unknown"`, not zero cost. These budgets are not a hard provider billing cap: configure provider-side spending limits too.

Budget exhaustion parks durable work with `BudgetExhausted`; it does not silently fail or grant more budget. An authorized operator can inspect it and use `runtime.operator.extendBudget`. See [budgets](/features/budget) and [turn policy](/guides/turn-policy) for their distinct contracts.

## Trace and shut down deliberately

Use Effect tracing at the application boundary and in tool services (`Effect.withSpan` / named `Effect.fn`). Configure your tracer exporter in the host Layer. Correlate logs and traces with Run IDs and operation IDs, and use Runtime inspection and the journal for durable facts. Do not log tokens, full prompts, tool payloads, or personal data by default. A successful HTTP request is not evidence that a Run completed.

Keep one visible owner for the service Layer. Launch with the platform runtime, or close a `ManagedRuntime` with `dispose()` when its owner exits. Stop accepting new work before shutdown, then close the owned scope. Runtime shutdown interrupts owned execution for recovery; it does not mean the user canceled the work. If cancellation is intended, request it explicitly and observe terminal state rather than treating request acceptance as completion. Closing an SSE/WebSocket connection does not cancel a hosted Run.

## Resolve approvals and unknown outcomes

With durable approvals, consume the exact opaque token from `ApprovalRequested`. Show the tool name and arguments to an authorized human; resolve that token with the authenticated operator identity. Never predict tokens or replace a missing approval with auto-approve. Approval admits the tool attempt; it does not prove its external effect succeeded.

After a crash or lost response, start with read-only `runtime.operator.explain(runId)` and `verify(runId)`. The former projects outstanding obligations; the latter also reports drift between stored state and journal facts. `scanObligations()` finds work that needs attention. Re-read before acting because another worker or operator may have changed the Run.

For `Unknown`, check the external system using the operation's business/idempotency reference. Only after obtaining evidence should an authorized operator call `resolveUnknown` with a succeeded result or failed error. Do not redispatch an uncertain payment, write, or cell. If the outcome cannot be established, leave it unresolved and escalate. Use `retry` only when the projected decision is `RetryOperation`; illegal transitions fail rather than becoming no-ops. See [typed recovery actions](/features/recovery).

## Rehearse storage recovery

Keep the authoritative database, journal, and required blobs across deploys. Memory Layers lose data on process exit. Back up and restore the database using your storage provider's procedure; do not repair recovery by deleting journal rows or inventing completion events. Keep executable registrations available so stored work can resolve its pinned executable.

Run [five-minutes](/start/examples#local-and-sqlite-in-five-minutes) to see an accepted Run reopen with the same ID and result. Then exercise your actual storage adapter through close/reopen, interrupted operations, approvals, and unknown outcomes before rollout. A passing SQLite demo is not PostgreSQL/MySQL recovery evidence, and a skipped database suite is not a pass.

Next: use the [Runtime reference](/reference/runtime) for exact APIs and the [recovery reference](/features/recovery) when a Run needs operator attention.
