# Durable agent driver

The driver pins executable identity and checkpoints each nondeterministic Agent operation around dispatch. A Runtime host journals those checkpoints and replays recorded outcomes instead of repeating unsafe work.

## Usage

```ts
import { Effect } from "effect"
import { Prompt } from "effect/unstable/ai"
import { DurableDriver, RunBudget } from "generalist"

const program = Effect.gen(function* () {
  const driver = DurableDriver.makeTracer([{ text: "done" }])
  const checkpoint = yield* driver.initial({
    prompt: Prompt.make("hello"),
    budget: RunBudget.make({ modelCalls: 3, toolCalls: 2 }),
  })
  const decision = yield* driver.decide(checkpoint)
  if (decision._tag !== "Execute") return decision
  const applied = yield* DurableDriver.applyOperation(driver, checkpoint, { _tag: "Succeeded", value: {} })
  return yield* driver.decide(applied) // Complete("done")
})
```

`makeTracer` is the in-memory conformance driver: it covers deterministic model/tool/wait keys, budget charging, and rejection of unknown outcomes without entering the live Agent loop.

## What runs

```text
Agent.generate() / Agent.stream()
└── DurableDriver.layerForRun()          one interpreter per Run
    ├── model/tool/memory/... boundary
    │   ├── driver.decide(checkpoint)    -> Execute(operation)
    │   ├── journal.onScheduled(op, checkpoint)
    │   │   ├── recorded outcome         -> replay, no dispatch
    │   │   └── void                     -> dispatch Effect
    │   ├── driver.apply(checkpoint, outcome)
    │   └── journal.onCompleted(op, outcome, checkpoint)
    └── checkpoint-only mutation
        └── journal.onCheckpoint(checkpoint)
```

The Agent loop still chooses control flow. `DriverInterpreter` validates pending operations, charges budget, records outcomes, and mutates checkpoints; `decide` does not yet drive the whole loop. Inline interpretation preserves Effect failures, interruption, retry barriers, authorization, Prompt/Response behavior, and `AgentEvent` order. `DurableDriver.recorded` exposes the in-Run log to tests.

## Data flow

```text
OperationSpec
{ key: "turn:0:model", kind: "model", input: { turn: 0 },
  replayPolicy: "never" }
        │ makeOperation() + canonical JSON SHA-256
        ▼
DriverOperation
{ key: "turn:0:model", kind: "model", input: { turn: 0 },
  inputDigest: "<64 lowercase hex>", replayPolicy: "never" }
        │ apply({ _tag: "Succeeded", value: ... })
        ▼
DriverCheckpoint
{ driverVersion: "1", turn: 0, executable: { executable, active },
  budget: { allocation, remaining, depth }, state: ... }
```

Intercepted boundaries are model attempts (`never`), tools (executor-selected `provider-idempotent`, otherwise `never`), same-Run handoffs, proactive compaction, memory recall/remember and Session sync, structured output, and suspension checkpoints. Reactive overflow compaction stays inside its active model operation. Runtime messaging intercepts `send` separately as `never`.

## Failure and recovery

```text
restart from last fenced checkpoint
├── persisted Succeeded / Failed -> decode and apply; no redispatch
├── pure / provider-idempotent   -> host may redispatch same identity
└── never + Unknown
    └── DriverUnknownReplay / Runtime needs-resolution
        └── explicit host resolution required
```

For model work, call count is charged before dispatch; terminal and failed-attempt token usage settles with the completed response before `onCompleted`. A paid token overrun commits that response and zero budget, then fails typed before any authored tool starts.

Explicit `Runtime.cancel` first closes admission for the Run tree and marks admitted cancellable tool operations `cancelling`; return acknowledges durable admission plus local interrupt request, not terminal cancellation. After the owned execution exits, the same concrete executor may answer `Cancelled` or `AlreadyTerminal`; the Run stays cancelling until marked operations and descendants settle, while loss before acknowledgement leaves same-identity cancellation claimable. Non-cancellable ambiguous `never` work remains `unknown`/`needs-resolution`; ordinary interruption follows replay policy and is not semantic cancellation. Cancellation is the only preemptive Runtime control. Steering admitted during active model/tool work remains durable input for the next safe model boundary without interrupting or reclassifying current work; budgets also act only at safe boundaries.

## Invariants

- `AgentPin`, `ProgramPin`, `ModelPin`, `CapabilityPin`, and `ExecutablePin` encode kind, version, SHA-256 algorithm, and a 64-lowercase-hex digest; wrong kinds and malformed digests fail decoding.
- Canonical identity uses synchronous pure-TypeScript SHA-256 over canonical UTF-8 JSON, with empty-string and `abc` vectors and no weak fallback; constructors remain synchronous and platform-independent.
- Version-2 `AgentManifest` pins exact instructions, model, named tools/skills/services, portable-or-opaque policy, tool scheduling and parallel-safe names, compaction/program authority when present, budget defaults, and child-selection names.
- `AgentManifest.make` rejects duplicate names, pins, scheduling names, and child selections, sorts unordered arrays, and owns the digest; callers never provide manifest digests.
- `fromLiveAgent` requires tool pins to exactly cover the toolkit, portable policy and budget to equal live snapshots, and a pinned policy only for an opaque live policy; model, service, skill, and opaque-policy identity stays caller-supplied.
- Version-2 `ExecutableManifest` has one canonical profile registry and finite Agent/Program entry closure. Every declared selection resolves to an included Agent, every profile is declared, and every entry/profile affects the digest.
- Profiles are selection lookup, not digest graph edges, so profiles may self- or mutually select. Direct Program-to-Agent capability edges remain closed and acyclic.
- Executable construction verifies entry digests, sorted uniqueness, root/active membership, profile completeness, and exact connected closure. Public decode accepts only `{ ref, manifest }` and reruns all checks.
- `ExecutableRef { executable, active }` is the durable Runtime reference. A persisted checkpoint requires exact executable pin, active pin, and driver version; standalone execution may omit pins, but a supplied durable checkpoint may not.
- A successful pinned handoff commits its exact target Agent pin as `active` in the same checkpoint commit; restart requires that identity.
- `RunBudget` separately tracks allocation, remaining capacity, and depth for model calls, tool calls, tokens, child runs, handoffs, depth, and ISO deadline; a Run override can only narrow the Agent default.
- `make` creates a root budget; `reserveChild` consumes one child slot and a grant, `narrowChild` refunds the reduction, `charge` deducts use, and `refundUnused` returns remaining child capacity. Widening is `GrantWidened`; schedule-boundary exhaustion is `Exhausted`, never mid-provider-stream.
- `childRuns` and `depth` govern only inline `AgentTool`/`delegateTool` nesting via reserve, inherited budget, and refund. Runtime child/group/spawn/fan-out admission uses only root-pinned `TreePolicy`; Runtime fallback budgets omit those dimensions.
- A checkpoint contains driver version, optional active executable ref, nonnegative finite integer turn, budget, and opaque state—not manifests, model coordinates, tool digests, or policy projections. Operation scheduling separately requires a nonnegative safe-integer turn and rejects regression; turnless setup retains the restored turn.
- Operation kinds are `model`, `tool`, `memory`, `compaction`, `handoff`, `send`, `wait`, and `structured-output`; outcomes are `Succeeded`, `Failed`, or `Unknown`; decisions are `Execute`, `Wait`, `Continue`, or `Complete`.
- Operation input alone determines `inputDigest`. A tool replay selector runs synchronously before scheduling; only explicit `provider-idempotent` opt-in may redispatch with the same `ToolContext.operationKey`/`idempotencyKey`.
- Only a concrete executor exposing `cancel` is cancellable, and its exact request is persisted with the operation. Static tools, handoffs, skill activation, and routes without opt-in remain non-replayable and non-cancellable.
- One authored-order batch checkpoint owns each sibling call's `Ready`, `Scheduled`, `Waiting`, `Completed`, `Unknown`, or `Cancelled` state. `Scheduled` binds digest and replay policy, charges once, and prevents repeated authorization; resume updates only validated targets.
- Runtime operation rows remain dispatch and ambiguity authority; the batch checkpoint remains reconstruction authority. Restored semantic turn and next model ordinal keep operation/call/attempt identity stable and skip settled or waiting siblings.
- Session is only the model-transcript projection. Durable persistence, events, keyed waits, same-Run resume, and worker orchestration belong to `generalist/runtime`.
- A `send` crash between journal admission and mailbox insertion becomes `Unknown`; replayed success returns its recorded receipt without crossing messaging again.
- Isolated `Handoff.register` and `fanOut` children do not inherit the parent interpreter; inline tree-budget reservation covers only `AgentTool`/`delegateTool` children.

## Related

- Source: `packages/generalist/src/core/durable/driver.ts`, `packages/generalist/src/core/durable/driver/`, `packages/generalist/src/core/durable/manifest/`, `packages/generalist/src/core/durable/run-budget.ts`
- Site: `/docs/learn/native-runtime`, `/docs/learn/sessions-and-history`
- Decisions/tradeoffs: [`runtime-outside-core`](../decisions/runtime-outside-core.md), [`authoritative-session-history`](../decisions/authoritative-session-history.md)
