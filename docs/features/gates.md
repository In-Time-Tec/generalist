# Completion gates

Completion gates fence model-proposed terminal output before Generalist emits `Completed`. An Agent owns an ordered gate list and chooses whether the first rejection starts a corrective turn or fails the Run.

## Usage

```ts
import { Effect, Schema } from "effect"
import { Agent, Gate } from "generalist"

const verifier = Agent.make({
  name: "release-verifier",
  output: Gate.VerifierOutput,
  instructions: "Score only the supplied proposed output.",
})

const release = Agent.make({
  name: "release",
  output: Schema.Struct({ summary: Schema.String }),
  gates: [
    Gate.command({ name: "tests", run: "bun test" }),
    Gate.verifier({ name: "review", agent: verifier, threshold: 0.9 }),
    Gate.predicate({
      name: "summary-present",
      check: (output: { readonly summary: string }) => Effect.succeed(output.summary.length > 0),
    }),
  ],
  onGateFailure: "retry",
  sandbox,
})
```

`onGateFailure` defaults to `"fail"`. Gate names must be non-empty and unique. Verifier thresholds are inclusive numbers from 0 through 1. Invalid options throw `TypeError` while `Agent.make` constructs the definition.

`Gate.command` requires the Agent's concrete `sandbox` option to declare the `Process` capability. `Agent.make` rejects a missing or incapable Sandbox synchronously; command execution never discovers that configuration fault during a Run. The gate invokes `sh -lc <run>` inside that Sandbox and records command, exit code, stdout, and stderr. Exit code zero passes.

`Gate.predicate` receives the decoded proposed output. Its check may return a boolean or an Effect; Effect requirements remain visible in the Agent's run requirements. A false result or failure rejects the completion, while interruption remains interruption.

`Gate.verifier` requires an Agent whose output decodes through `Gate.VerifierOutput`:

```ts
{ score: number /* 0..1 */, evidence: Schema.Json }
```

The score passes when it is greater than or equal to `threshold`.

## Isolation

Each verifier attempt allocates a fresh process-local Agent Run. Its only task input is the proposed output. Generalist does not pass the proposer's system prompt, transcript, memory key, tools, gates, Sandbox, lifecycle hooks, model middleware, or activated skills. The verifier keeps its own name, instructions, model selection, policy, and output Schema. Its Run ID, turn count, score, threshold, and JSON evidence become the parent gate evidence.

This is intentionally not a separately addressable durable Runtime child. The parent checkpoint and `GateResult` event are the durable authority. Child inheritance policy #346 can replace the explicit stripping at this isolation boundary later; it must preserve no proposer history and an empty or explicitly attenuated toolkit.

## Ordering and replay

```text
model proposes terminal output
└── gate 0
    ├── pass → checkpoint + GateResult → gate 1
    └── fail → checkpoint + GateResult
        ├── onGateFailure: "retry" → evidence prompt → next model turn
        └── onGateFailure: "fail"  → GateFailed
all gates pass
└── onRunEnd → Completed
```

Every verdict is a `GateResult { turn, name, verdict, evidence }`. Before that event is exposed, the result is recorded under its turn and declaration index in `LoopDriverState.gates` through the existing `DriverJournal` checkpoint path. Recovery reuses the recorded prefix and does not execute a command, predicate, or verifier again. Runtime stores `GateResult` as a normal semantic Run event; `runtime.snapshot`, `runtime.inspect`, and `Trajectory.fromJournal` expose the ordered deduplicated results.

A failed retry adds one user prompt containing the JSON evidence. It is an ordinary next turn, so the existing model-call budget charge applies. Budget exhaustion suspends through `RunBudgetExhausted`; no `Completed` event has been emitted. After the budget is extended, recovery reconstructs that retry turn from the checkpointed evidence without re-running the rejected gate. External follow-up or steering accepted before terminal gate evaluation keeps its existing precedence and delays gate execution.

`onRunEnd` runs only after every gate passes and immediately before `Completed`. Its trusted host replacement remains the final output; gates fence the model-proposed value before that host boundary.

## Evaluation

`Eval.gatesPassed()` scores the latest result for every gate name. This means an initial rejection followed by a passing retry scores as passed. A trajectory with no gates passes vacuously.

## Invariants

- Gates run in declaration order and stop at the first rejection for each proposed output.
- Every gate result is JSON-serializable and is checkpointed before live publication or the next gate.
- A rejected output never emits `Completed`.
- Retry evidence starts a new turn and consumes the existing Run budget; exhaustion never becomes completion.
- Runtime terminal failure preserves `GateFailed.gate` inside `AgentExecutionFailure.failure`.
- Verifier isolation is explicit and does not depend on ambient child inheritance.

## Related

- Source: `packages/generalist/src/core/agent/gates/`, `packages/generalist/src/core/durable/loop-driver-state.ts`
- Sibling feature docs: [`agent-loop.md`](./agent-loop.md), [`hooks.md`](./hooks.md), [`evals.md`](./evals.md), [`sandbox.md`](./sandbox.md)
