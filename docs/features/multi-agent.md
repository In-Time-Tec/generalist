# Multi-agent

Core distinguishes **inline delegation** from **same-run handoff**.

## Inline delegation (`AgentTool` / `Handoff.delegateTool`)

`AgentTool.asTool` and `Handoff.delegateTool` expose a child agent as a tool with its own child invocation identity. The parent run schedules a nested `generate`/`Registration.run` through `reserveChildBudget` / `refundChildBudget`. Child failures and suspension collapse to the tool's declared domain failure unless the host configures otherwise. This path does not switch the active agent for subsequent turns in the parent stream.

## Same-run handoff (`Handoff.supervisor`, `Handoff.transferTool`)

Same-run handoff switches the **active agent** for subsequent turns inside one `Agent.stream` invocation. The run keeps one session identity, one `DriverInterpreter`, one tree `RunBudget`, cancellation scope, approval context, accumulated usage, and event ordering.

`Handoff.supervisor` builds a supervisor agent plus:

- `toolkit` — same-run handoff tools (`handoff_to_<specialist>`)
- `catalog` — `Handoff.Catalog` layer resolving `HandoffTarget` entries

Provide `supervisor.catalog` in the run layer alongside the supervisor agent.

### Handoff input and context projection

Handoff tools accept schema-backed `Handoff.Input` (`prompt`, `reason`, `context`). On success they return `HandoffAccepted` with stable `handoffId`, `source`, and `target` agent IDs.

`defaultContextProjection` preserves valid prompt history and rejects unresolved tool-call/tool-result pairs. `filterContextProjection` applies a message predicate then runs the same validation. Custom projections must never emit malformed tool history.

### Limits and durable operations

Each scheduled handoff charges the tree budget (`RunBudget.handoffs`). Repeated edges (`source:target`) are bounded via `handoffOptions.maxRepeatedEdge` (default `1`). Total handoffs honor `RunBudget.handoffs` from agent defaults and per-run narrowing.

The durable driver records `handoff` operations with deterministic keys:

- `…/handoff/requested/…`
- `…/handoff/completed/…`
- `…/handoff/rejected/…`

Each records `handoffId`, source/target `ExecutableRef` IDs, reason, and turn.

After handoff, the target agent's tool registry, permissions, and model selection apply without widening parent authority or budget. Missing catalog entries, projection failures, and missing target requirements fail typed (`HandoffTargetMissing`, `Handoff.Rejected`, `HandoffRequirementsMissing`, `Handoff.ProjectionInvalid`, `HandoffLimitExceeded`).

### Suspension propagation

`RunOptions.suspensionPropagation` defaults to `"propagate"`. Tool and approval suspensions during an active handoff path include `invocation_path` on `AgentSuspended`. Set `"collapse-to-domain-failure"` explicitly to convert suspensions into tool domain failures instead.

## Isolated registration runs

`Handoff.register` + `Registration.run` and `Handoff.fanOut` remain isolated child runs with explicit concurrency. They do not share the parent driver seam or same-run handoff state.

Durable or cross-process delegation belongs to a host runtime.
