# Multi-agent

An agent can fan out typed work to isolated child Runs, call one child as a tool, or hand the current Run to another active agent. Delegation isolates identity; handoff preserves it.

## Usage

```ts
import { Effect, Layer } from "effect"
import { Toolkit } from "effect/unstable/ai"
import { Agent, AgentTool, Handoff, RunBudget, ToolExecutor } from "generalist"
import { Runtime } from "generalist/runtime"

const researcher = Agent.make({ name: "researcher" })

// Process-local typed children. Each tuple position retains its Agent output type.
const local = Agent.fanOut([Agent.child(researcher, "Research A"), Agent.child(researcher, "Research B")] as const, {
  concurrency: 2,
  onFailure: "collect",
})

// Runtime-owned fan-out selected by the parent model. No static handler is required.
const delegateResearch = AgentTool.fanOut({
  name: "delegate_research",
  description: "Run researchers in parallel on independent questions",
  agents: { researcher: { agent: researcher } },
  maxChildren: 8,
})
const lead = Agent.make({ name: "lead", toolkit: Toolkit.make(delegateResearch) })

const durable = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  yield* runtime.register(lead)
  return yield* runtime.start(lead, "Research the alternatives", {
    budget: RunBudget.make({ tokens: 80_000, children: 8 }),
  })
})

const billingAgent = Agent.make({
  name: "billing",
  instructions: "Resolve billing requests.",
})

// Isolated child Run: fresh Run ID, inbox, and model telemetry.
// `model` is optional — omit it and the child inherits the ambient model.
const askBilling = AgentTool.asTool(billingAgent, { name: "ask_billing", model: cheapModel })
const parent = Agent.make({ name: "parent", toolkit: Toolkit.make(askBilling.tool) })

// Same Run: the billing agent becomes active on the next turn, on its own model.
const supervisor = Handoff.supervisor({
  name: "front-desk",
  specialists: [Handoff.target(billingAgent, { model: billingModel })],
})
const handoffLayer = Layer.mergeAll(ToolExecutor.layerToolkit(supervisor.toolkit), supervisor.catalog)
const run = Agent.run(supervisor.agent, "Refund order 42")
```

Provide the local Effects and `handoffLayer` with the model, permissions, approvals, middleware, and Agent requirements. Provide `durable` with a Runtime host plus the same Agent requirements. The model calls `delegate_research` with ordered `{ agent, input }` members and optional `concurrency` and `onFailure`; inheritance is fixed by each declared agent profile and is not model-authored. It calls `handoff_to_billing` with `{ prompt: "Refund order 42", reason: "billing request" }`. A child's `model` option is any closed `Layer<LanguageModel>` — typically a provider's `layerModel` over its `layerConfig` client; omitting it means the child inherits the ambient model.

## Child inheritance

`Agent.child(agent, input, { inherit })` and each `AgentTool.fanOut` profile use the same normalized record. For example, declare `agents: { researcher: { agent: researcher, inherit: { history: "full", budget: { usd: 1 } } } }`. Omitted fields use these defaults:

| Field          | Values                                         | Default       | Behavior                                                                                                    |
| -------------- | ---------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| `history`      | `"none"`, `"summary"`, `"full"`                | `"none"`      | Fresh transcript; latest user message; or the exact encoded parent prefix for provider prompt-cache reuse   |
| `tools`        | `"attenuate"`, `"same"`, `Capability.Handle[]` | `"attenuate"` | Child subset, parent set, or exact scoped capability handles                                                |
| `permissions`  | `"inherit"`, `"fresh"`                         | `"inherit"`   | Parent authorization and remembered rules, or a fresh authorization context under the same parent authority |
| `budget`       | `BudgetLimits`                                 | parent share  | Narrows the reserved `parent remaining / maxChildren` share                                                 |
| `sandbox`      | `"share"`, `"fork"`, `"fresh"`                 | `"fork"`      | Parent sandbox, snapshot/fork of it, or the child profile's fresh sandbox                                   |
| `instructions` | `"inherit"`, `"own"`                           | `"inherit"`   | Parent instructions or the child Agent's instructions                                                       |
| `memory`       | `"inherit"`, `"fresh"`                         | `"inherit"`   | Parent memory key or no inherited memory                                                                    |
| `tasks`        | `"read"`, `"none"`                             | `"none"`      | Read-only admission-time snapshot of the parent's current task list, or no parent task context              |

The declaration, not the model call, owns this policy. `tools: [handle]` accepts only live values from `Capability.grant` or `Capability.attenuate`; it serializes their verified authority lineage for durable child recovery, never a model-authored rule or ID. Every child tool must have a distinct matching handle, and a constrained parent may pass only descendant handles. A child tool, custom authorization policy, or sandbox absent from the parent fails at spawn with `ChildExceedsParent { field }`; no child Run or model call is admitted. Durable fan-out includes the normalized record in its admission digest and `ChildLinked` event, so restart reattaches with the same history, authority, budget, sandbox, instructions, memory, task, and capability choices. A `tasks: "read"` child receives an immutable snapshot; its own task writes remain local to its Run.

## What runs

```text
Agent.fanOut([child(A), child(B)])
├── scoped fiber -> Agent.run(A) -> Exit
└── scoped fiber -> Agent.run(B) -> Exit
    └── results retain authored order

Runtime parent Run
└── model call delegate_research
    ├── admit one existing durable child group
    ├── journal ChildLinked + reserved budget for each member
    ├── suspend parent while children run
    ├── FanOutJoined reactivates the same parent Run
    └── encode ordered child Exits as the tool result

Agent.run(parent)                          Run ID: run-2
└── tool call ask_billing
    ├── DriverInterpreter.reserveChild(...)
    ├── Agent.run(billing)                  Run ID: run-3
    │   └── child-scoped DriverInterpreter and journal
    └── DriverInterpreter.refundChild(...)

Agent.run(front-desk)                      Run ID: run-1
└── handoff_to_billing
    └── commit active = "billing"          Run ID: run-1
```

`AgentTool.asTool` and `Handoff.delegateTool` run one isolated process-local child. Same-Run `Handoff.supervisor` changes the active Agent without creating a child Run.

## Fan-out failures and budgets

With `onFailure: "collect"`, every child settles and the result contains one `Exit` per authored member. A failed child is encoded into that tool result, so the parent model continues. With `"failFast"`, the first child failure fails the parent call; process-local sibling fibers are interrupted and a durable group requests cancellation of its unsettled children.

A durable fan-out reserves one child slot and `parent remaining / maxChildren` for each admitted member. The profile's optional `inherit.budget` may narrow that share but cannot widen it. The child's journaled usage remains charged and settlement returns its unused reservation. `Runtime.inspect(parentRunId)` returns the direct children and their current statuses alongside the journal-derived parent budget.

## Handoff data flow

```text
Handoff.Input { prompt: "Refund 42", reason: "billing" }
        │ defaultContextProjection(history, input)
        ▼
{ history: Prompt, prompt: "Refund 42" }
        │ executeSameRunHandoff()
        ▼
HandoffAccepted { source: "front-desk", target: "billing",
                  handoffId: "<deterministic key>" }
```

`defaultContextProjection` retains valid history and rejects unresolved tool-call/tool-result pairs. `filterContextProjection(predicate)` filters first, then validates. The commit removes system messages.

## Failure and suspension paths

```text
handoff_to_billing
├── no catalog target ─────────── generalist/core/TargetMissing
├── target model unavailable ─── generalist/core/HandoffRequirementsMissing
├── total/edge limit reached ──── generalist/core/HandoffLimitExceeded
└── invalid input/projection/pin ─ generalist/core/HandoffRejected

target tool suspends
├── suspensionPropagation: "propagate" (default)
│   └── AgentSuspended with invocation_path
└── "collapse-to-domain-failure"
    └── tool domain failure: { reason: "suspended", ... }
```

An isolated `AgentTool` converts child failures and suspensions to its declared string domain failure; it never changes the parent's active agent.

## Invariants

- Every inline child and fan-out member gets a fresh process-local Run ID, inbox, invocation identity, and its own telemetry.
- Every durable `AgentTool.fanOut` member is admitted through the Runtime's existing child-group journal under the parent Run ID; there is no second child state machine.
- `Agent.fanOut` requires explicit positive concurrency. Collect returns ordered typed `Exit` values; fail-fast interrupts sibling fibers.
- `AgentTool.fanOut` accepts between one and `maxChildren` model-authored members and needs no caller-supplied handler.
- Durable collect returns failed children as encoded `Exit` values. Durable fail-fast fails the parent and requests cancellation of unsettled siblings.
- Durable child budget grants and refunds are derived from journal facts. A profile's `inherit.budget` can only narrow its `parent / maxChildren` share.
- Runtime recovery resolves the registered child Agent graph from persisted executable pins and reattaches the parent's fan-out wait by `parentRunId` and group ID without redispatch.
- Interrupting a durable parent closes child admission and cascades cancellation through its existing Run tree.
- `Runtime.inspect(parent)` always includes its direct children with status and readiness.
- Inherited Effect services, including `SessionDirectory`, do not confer inbox or active Session identity.
- An inline child without `sessionId` has no Session.
- Reusing the active parent's Session ID fails before the child model call; it does not wait on the parent's lane.
- Parent, child, and sibling control inputs never cross Run boundaries.
- Parent tasks cross a child boundary only as the explicit `tasks: "read"` snapshot; children cannot mutate the parent's list.
- Capability handles cross a child boundary only through explicit `tools: [handle]` inheritance; the child cannot widen scope or expiry, and its capability decisions stay in its own Run checkpoint.
- A durable Runtime journals an inline child as the parent's AgentTool operation. The child loop keeps its own process-local driver journal and never writes child checkpoints or model responses into the parent's Runtime journal or Session; replay of a completed parent tool operation returns the recorded child result without redispatch.
- Same-run handoff retains the Run ID, inbox, Session identity, `DriverInterpreter`, tree `RunBudget`, cancellation scope, approval context, accumulated usage, and event order.
- On the target's first turn, its instructions are live system context only; the `Handoff` projection remains the active Session history, and the target's non-system conversation appends after it.
- A producer holding the original `RunHandle` can keep steering after handoff.
- Same-run handoff tools execute through the agent loop, never direct toolkit invocation.
- The catalog resolves targets but does not provide target requirements.
- Children inherit the ambient `LanguageModel`; a `model` layer on `AgentTool.asTool` or `Handoff.target` overrides it for exactly that child, and a declared specialist model selection that cannot resolve under an ambient run fails loudly at handoff commit rather than being ignored.
- A projection may not leave unresolved tool calls in projected history.
- Each handoff charges `RunBudget.handoffs`; run options can only narrow the active agent's default budget.
- A repeated `source:target` edge defaults to limit `1`; configure `handoffOptions.maxRepeatedEdge`.
- Handoff operation IDs are deterministic; model-requirement rejection uses a separate deterministic `handoff:rejected` key.
- State records source, target, optional reason, turn, edge and handoff counts, and the exact target pin when pinned.
- The target's tools, permissions, model, and budget apply after handoff but cannot widen parent authority or budget.
- `Handoff.register`, `Registration.run`, and the older policy-level `Handoff.fanOut` remain process-local isolated-child APIs; they share neither the parent driver seam nor same-run handoff state.
- Durable or cross-process fan-out is owned by `AgentTool.fanOut` under a host Runtime.

## Related

- Source: `packages/generalist/src/core/agent/lifecycle/fan-out.ts`, `packages/generalist/src/core/agent/tool/fan-out.ts`, `packages/generalist/src/runtime/child/`, `packages/generalist/src/core/agent/handoff/`, `packages/generalist/src/core/policy/handoff.ts`
- Site: `/docs/guides/multi-agent`, `/docs/guides/addressed-messaging`
- Sibling feature docs: [`capabilities.md`](./capabilities.md), [`tasks.md`](./tasks.md)
