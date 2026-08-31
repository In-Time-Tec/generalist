# Suspension and resume

A tool outcome `{ _tag: "Suspend", token }`, or an approval resolved as `Pending`, stops the run with typed `AgentSuspended`. Resume returns that exact suspension through `RunOptions.resume`; its checkpoint proves which authored calls may advance.

## Usage

```ts
import { Effect, Stream } from "effect"
import * as Agent from "generalist"

Effect.gen(function* () {
  const suspended = yield* Agent.stream(agent, { prompt: "deploy" }).pipe(Stream.runDrain, Effect.flip)
  if (suspended._tag !== "generalist/core/AgentSuspended") return yield* Effect.fail(suspended)

  // Persist this exact value and the transcript captured from TurnCompleted.
  const wait = suspended.waits[0]!
  yield* Agent.stream(agent, {
    prompt: "ignored",
    history: transcript,
    resume: {
      suspension: suspended,
      resolutions: [{ waitId: wait.waitId, resolution: { _tag: "Approved" } }],
    },
  }).pipe(Stream.runDrain)
})
```

`Approved` is valid for an `approval` wait. A `tool-wait` instead accepts `ToolResult` or a `Signal` whose `name` equals its wait ID.

## What runs

```text
Agent.stream(agent, { prompt: "deploy" })
└── model authors tool calls
    └── approval returns Pending / executor returns Suspend
        ├── settle admitted sibling calls into checkpoint states
        └── fail with AgentSuspended { reason: "approval" | "tool-wait" }

Agent.stream(agent, { history, resume })
├── rebuild transcript from Session or supplied history
├── validate suspension + resolutions against checkpoint
├── advance only the resolved waits
└── continue tools; call model only when all calls resolve
```

## State machine

```text
Ready ──admit once──> Scheduled ──Suspend/Pending──> Waiting
                         │                              │
                         │ result                       │ resolution
                         ▼                              ▼
                      Completed <────────────────── Completed
Waiting ──Approved──> Ready(stage: "execution") ──execute──> Completed
Waiting ──Denied/ToolResult/Signal─────────> Completed
```

Resolving one wait leaves sibling waits open. Siblings may resolve in any order; a later exclusive authored call remains behind the current scheduling-stage barrier.

## Failure paths

```text
RunOptions.resume
└── validate before side effects
    ├── checkpoint absent from transcript
    │   └── ResumeMismatch { reason: "checkpoint-not-found" }
    └── stale/changed/fabricated/duplicate/malformed identity
        └── ResumeMismatch { reason: "identity-mismatch" }
            └── no skill load, authorization, tool, model, or Session write
```

Identity covers wait ID, token, reason, call index, canonical call, resolution kind, active tools, activated skill, invocation path, and provider-executed metadata. Canonical calls include ID, name, parameters, provider-executed status, and provider metadata decoded from Effect Prompt tool-call options.

## Durable runtime

Runtime maps every `approval` wait to `Approval` and every `tool-wait` to `ToolWait`, then persists one immutable row keyed by `(runId, waitId)`. The row stores identity, reason, `open` or terminal status, schema-decoded resolution, and timestamps while Runtime retains the checkpoint and suspension.

Every response, approval, signal, timer, child, external child, fan-out, or cancellation close must prove one `open -> terminal` transition before appending its durable event. An identical duplicate is read-only success; a conflicting duplicate is typed failure; terminal history cannot reopen. Runtime removes suspension only in the durable transition that commits completion, failure, cancellation, pending steering, or another pending terminal outcome.

## Invariants

- Waits and checkpoint calls remain in model-authored order; every call has exactly one state: `Ready`, `Scheduled`, `Waiting`, `Completed`, `Unknown`, or `Cancelled`.
- The schema-backed batch checkpoint is the sole reconstruction authority; Session is only a model-transcript projection.
- `Scheduled` records admission, operation digest, and replay policy—not a live fiber—and charges a call exactly once; recovery neither charges nor authorizes it again.
- `Scheduled`, `Waiting`, and `Completed` never re-enter authorization; `Waiting` and `Completed` never re-enter tool execution.
- Stable operation keys belong to calls; there is no batch ID, scheduler ledger, queue, or persisted fiber.
- Admitted concurrent siblings settle before suspension commits; completed results enter transcript and Session exactly once in authored order.
- Resume may resolve any subset, but each resolution changes only its wait and call; unresolved siblings remain waiting.
- Resume validation precedes every resume side effect; hosted and standalone resume use the same semantic checkpoint.
- Process-local resume validates checkpoints; cross-process locking and durable exactly-once execution belong to a durable host.
- A durable wait makes at most one `open -> terminal` transition.

## Related

- Source: `packages/generalist/src/core/agent/suspension.ts`
- Source: `packages/generalist/src/core/agent/service.ts`
- Site: `/docs/learn/suspension`
- Site: `/docs/guides/approvals`
