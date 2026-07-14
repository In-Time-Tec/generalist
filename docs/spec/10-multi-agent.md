# 10 — In-process multi-agent

Baton's multi-agent support is same-process and non-durable. It composes existing `Agent.generate`, `Ai.Toolkit`, and `ToolExecutor` primitives so one agent can call another as a tool, route through handoff tools, or fan out to several children in parallel.

Durable, addressable, cross-process child executions remain outside Baton and belong to Relay or another host runtime.

## Scope

Baton owns:

- `AgentTool.asTool`, which exposes an agent as an `Ai.Toolkit.WithHandler`;
- `Handoff.transferTool`, a conventionally named transfer tool;
- `Handoff.fanOut`, bounded same-process child-run fan-out;
- `Handoff.supervisor`, a convenience builder for a routing agent and handled transfer toolkit;
- conversion of child run failures at a tool boundary into failed tool results;
- conversion of child suspension at a tool boundary into failed tool results.

Baton does not own durable child state, address books, cross-process routing, shared transcripts, streaming child events into the parent stream, or handoff input filters in this milestone.

## Agent as tool

`AgentTool.asTool(agent, options?)` returns a handled toolkit containing one tool. The tool defaults to `agent.name`, `Schema.Struct({ prompt: Schema.String })` parameters, `params.prompt` as the child prompt, `Schema.String` success, and `result.text` as the output.

The handler runs `Agent.generate` for the child in the current Effect context. It does not provide or override `Ai.LanguageModel.LanguageModel`, `ToolExecutor`, `Approvals`, or `ModelMiddleware`; callers decide what services child runs inherit.

At the tool boundary, child `AgentError`, `TurnPolicyError`, `TurnPolicyStopped`, `TurnLimitExceeded`, `MiddlewareViolation`, and defects thrown by prompt/result mappers become a failed tool result with a string message. Child policy requirements remain in the returned tool handler's Effect requirements.

Child `AgentSuspended` is also collapsed into a failed tool result. The parent agent receives the failure as ordinary tool context and can decide whether to continue, retry, ask the user, or transfer elsewhere. Durable cross-process HITL remains a host concern.

## Handoff

`Handoff.transferTool(target, options?)` delegates to `AgentTool.asTool` and defaults the tool name to `transfer_to_<target.name>`. The returned tool is only a routing convention; model policy still decides when to call it.

`Handoff.supervisor(options)` builds transfer tools for specialists, a supervisor agent whose toolkit advertises those transfer tools, and a handled toolkit for `ToolExecutor.fromToolkit`. It is pure sugar over `transferTool`, `Ai.Toolkit.make`, and `Agent.make`.

## Fan-out

`Handoff.fanOut(children, options?)` runs isolated `Agent.generate` calls with `Effect.forEach` and bounded concurrency. Results preserve input order. Default concurrency is 4.

`fanOut` is not a tool boundary, so child `RunError` values propagate to the caller. Invalid concurrency fails with `AgentError`.

Policy requirements from transfer targets, specialists, supervisors, and fan-out children remain visible in the composed toolkit, Agent, or fan-out Effect requirements.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0013-in-process-multi-agent.md`
