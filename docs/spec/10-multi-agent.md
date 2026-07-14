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

The handler runs `Agent.generate(agent, { prompt })` for the child in the current Effect context. `AgentTool` itself does not provide or override `Ai.LanguageModel.LanguageModel`, `ToolExecutor`, `Approvals`, or `ModelMiddleware`; callers decide what services child runs inherit. It also does not copy values from the parent's `RunOptions` into the child call.

## Two-channel child runs

An in-process child invocation has two independent channels. The Effect Context channel is ambient and follows normal nested Effect evaluation. The Run/orchestration channel consists of ordinary arguments to the child call plus state owned by an outer transport; it is not copied merely because Context services remain visible.

```text
Parent Agent.generate
│
├── Channel 1: Effect Context (inherited by nested child effect)
│   ├── LanguageModel.LanguageModel
│   ├── ToolExecutor / Approvals
│   └── ModelMiddleware and other required services
│
└── AgentTool handler ──▶ Child Agent.generate({ prompt })
    │
    └── Channel 2: run options / orchestration (not implicitly inherited)
        ├── sessionId defaults independently
        ├── persistence/chatId absent unless explicitly supplied
        └── transport runId, queue, and scheduling remain transport-owned
```

| Value or service                   | Channel                            | Child behavior                                                                                                                                                 |
| ---------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LanguageModel.LanguageModel`      | Effect Context                     | An unpinned child uses the ambient service. A child with `agent.model` resolves its selection through the ambient `ModelRegistry`; `AgentTool` copies neither. |
| `ToolExecutor`                     | Effect Context                     | The child sees the ambient optional executor; no executor value is copied from parent options.                                                                 |
| `Approvals`                        | Effect Context                     | The child sees the ambient optional approval service.                                                                                                          |
| `ModelMiddleware`                  | Effect Context                     | The child sees the ambient optional middleware service.                                                                                                        |
| `sessionId`                        | Child `RunOptions`                 | Not inherited. When omitted by `AgentTool`, it defaults to `"local"` for the child run, independently of the parent's identity.                                |
| persistence / chat ID              | Child `RunOptions.persistence`     | Not inherited. When omitted by `AgentTool`, the child uses a fresh chat and does not join the parent's transcript or persistence record.                       |
| transport `runId`                  | Transport-owned orchestration      | Not inherited. Core child invocation does not create or join a transport run.                                                                                  |
| transport queue                    | Transport-owned orchestration      | Not inherited. The child runs inside the current tool effect rather than entering the parent's `SessionRegistry` queue.                                        |
| transport scheduling / run permits | Transport-owned scoped concurrency | The child gets no separate schedule or permit. It is scoped inside the parent run, so the parent keeps its permit until the nested work completes.             |

The child-as-tool handler is equivalent to this child call for identity purposes:

```ts
const child = Agent.generate(childAgent, { prompt })
```

The surrounding application provides the handler's required services once through `Effect.provide(...)`; the nested effect evaluates in that Context. Supplying `{ prompt }` does not inspect the parent's `RunOptions`. A caller that invokes `Agent.generate` directly can explicitly choose a child `sessionId` or `persistence`, but `AgentTool.asTool` intentionally exposes no hidden identity-forwarding behavior.

At the tool boundary, child `Agent.RunError` values and defects thrown by prompt/result mappers become a declared `Schema.String` domain failure. The executor encodes that string through the child tool's failure schema before emitting a failed tool-result part. Child policy requirements remain in the returned tool handler's Effect requirements, and collision messages retain the conflicting name and ordered origin evidence.

Child `AgentSuspended` is also collapsed into the same declared string domain failure. The parent agent receives the schema-valid failure as ordinary tool context and can decide whether to continue, retry, ask the user, or transfer elsewhere. Durable cross-process HITL remains a host concern.

The handled tool retains the child Agent's complete requirement parameter. Transfer tools do the same. Fan-out unions every child operation requirement, including run-specific memory, and supervisor construction retains every specialist requirement through its transfer-tool handlers.

The runnable child-as-tool example in the public multi-agent guide provisions the model, toolkit handlers, executor, approvals, and middleware as ambient layers while omitting child run options. Current behavior is anchored by `packages/core/src/agent-tool.ts`, `packages/core/src/agent.ts`, and `packages/transport/src/session-registry.ts`; `packages/core/test/agent-tool.test.ts` covers the child tool boundary and `packages/core/test/handoff.test.ts` covers bounded isolated fan-out.

## Handoff

`Handoff.transferTool(target, options?)` delegates to `AgentTool.asTool` and defaults the tool name to `transfer_to_<target.name>`. The returned tool is only a routing convention; model policy still decides when to call it.

`Handoff.supervisor(options)` builds transfer tools for specialists, a supervisor agent whose toolkit advertises those transfer tools, and a handled toolkit for `ToolExecutor.fromToolkit`. It is pure sugar over `transferTool`, `Ai.Toolkit.make`, and `Agent.make`.

Supervisor construction retains each transfer declaration's `Handoff { specialist }` origin before Effect AI toolkit construction can collapse equal names. The supervisor run validates all transfer declarations as one set and fails with `ToolNameCollision` before its first model request when two specialists produce the same transfer name. Unique specialists preserve input advertisement and dispatch order. The same validated entry selects both the advertised schema and handler; Handoff has no independent first-wins or last-wins map.

## Fan-out

`Handoff.fanOut(children, options?)` runs isolated `Agent.generate` calls with `Effect.forEach` and bounded concurrency. Results preserve input order. Default concurrency is 4.

`fanOut` is not a tool boundary, so child `RunError` values propagate to the caller. Invalid concurrency fails with `AgentError`.

Policy requirements from transfer targets, specialists, supervisors, and fan-out children remain visible in the composed toolkit, Agent, or fan-out Effect requirements.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0013-in-process-multi-agent.md`
- `docs/spec/decisions/ADR-0033-truthful-agent-requirements.md`
