# Multi-agent

An agent can call another agent as an isolated child Run, or hand the current Run to another active agent. Delegation isolates identity; handoff preserves it.

## Usage

```ts
import { Layer } from "effect"
import { Toolkit } from "effect/unstable/ai"
import { Agent, AgentTool, Handoff, ToolExecutor } from "generalist"

const billingAgent = Agent.make({
  name: "billing",
  instructions: "Resolve billing requests.",
})

// Isolated child Run: fresh Run ID, inbox, and model telemetry.
const askBilling = AgentTool.asTool(billingAgent, { name: "ask_billing" })
const parent = Agent.make({ name: "parent", toolkit: Toolkit.make(askBilling.tool) })

// Same Run: the billing agent becomes active on the next turn.
const supervisor = Handoff.supervisor({
  name: "front-desk",
  specialists: [Handoff.target(billingAgent)],
})
const handoffLayer = Layer.mergeAll(ToolExecutor.layerToolkit(supervisor.toolkit), supervisor.catalog)
const run = Agent.generate(supervisor.agent, { prompt: "Refund order 42" })
```

Provide `handoffLayer` with the model, approvals, middleware, and target requirements. The model calls `handoff_to_billing` with `{ prompt: "Refund order 42", reason: "billing request" }`.

## What runs

```text
Agent.generate(front-desk)                 Run ID: run-1
└── model turn: front-desk
    └── tool call handoff_to_billing
        ├── resolve Catalog["billing"]
        ├── validate limits, target, and projected history
        └── record "handoff"; commit active = "billing"
            └── model turn: billing           Run ID: run-1

Agent.generate(parent)                     Run ID: run-2
└── tool call ask_billing
    ├── DriverInterpreter.reserveChild(...)
    ├── Agent.generate(billing)             Run ID: run-3
    └── DriverInterpreter.refundChild(...)
```

`Handoff.delegateTool(registration)` follows the second path, names the tool `delegate_to_<agent>`, and runs `Registration.run`.

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
- Inherited Effect services, including `SessionDirectory`, do not confer inbox or active Session identity.
- An inline child without `sessionId` has no Session.
- Reusing the active parent's Session ID fails before the child model call; it does not wait on the parent's lane.
- Parent, child, and sibling control inputs never cross Run boundaries.
- Same-run handoff retains the Run ID, inbox, Session identity, `DriverInterpreter`, tree `RunBudget`, cancellation scope, approval context, accumulated usage, and event order.
- A producer holding the original `RunHandle` can keep steering after handoff.
- Same-run handoff tools execute through the agent loop, never direct toolkit invocation.
- The catalog resolves targets but does not provide target requirements.
- A projection may not leave unresolved tool calls in projected history.
- Each handoff charges `RunBudget.handoffs`; run options can only narrow the active agent's default budget.
- A repeated `source:target` edge defaults to limit `1`; configure `handoffOptions.maxRepeatedEdge`.
- Handoff operation IDs are deterministic; model-requirement rejection uses a separate deterministic `handoff:rejected` key.
- State records source, target, optional reason, turn, edge and handoff counts, and the exact target pin when pinned.
- The target's tools, permissions, model, and budget apply after handoff but cannot widen parent authority or budget.
- `Handoff.register`, `Registration.run`, and `Handoff.fanOut` create isolated child Runs; fan-out has explicit concurrency and shares neither the parent driver seam nor same-run handoff state.
- Durable or cross-process delegation belongs to a host Runtime.

## Related

- Source: `packages/generalist/src/core/agent/handoff/`, `packages/generalist/src/core/agent/tool.ts`, `packages/generalist/src/core/policy/handoff.ts`, `packages/generalist/src/core/policy/handoff-*.ts`
- Site: `/docs/guides/multi-agent`, `/docs/guides/addressed-messaging`
