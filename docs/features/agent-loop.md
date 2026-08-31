# Agent loop

An `Agent` is a plain definition; `Agent.stream` runs model turns, schedules framework tools, and emits the authoritative event stream. `Agent.generate` consumes that same stream into a final text or structured result.

## Usage

```ts
import { Effect, Stream } from "effect"
import { Agent } from "generalist"

const agent = Agent.make({
  name: "docs-assistant",
  toolkit,
  toolScheduling: { maxConcurrency: 4, parallelSafe: ["search_docs"] },
})

const program = Effect.gen(function* () {
  const events = yield* Agent.stream(agent, { prompt: "Find toolkit docs" }).pipe(Stream.runCollect)
  const result = yield* Agent.generate(agent, { prompt: "Summarize them" })
  return { tags: events.map((event) => event._tag), answer: result.text }
})
```

## What runs

```text
Agent.stream(agent, { prompt: "Find toolkit docs" })
└── allocateRun()                         scoped Run ID + inbox
    └── TurnStarted { turn: 0 }
        └── instrumented model call
            ├── ModelCallStarted
            ├── ModelAttemptStarted { attempt: 0 }
            ├── ModelPart { part: tool-call "search_docs" }
            └── ModelResponseCommitted
        └── schedule framework tool batch
            ├── ToolExecutionStarted
            └── ToolExecutionCompleted
        └── TurnCompleted { turn: 0 }
            └── policy.decide() → Continue
                └── TurnStarted { turn: 1 }
                    └── model call → final text
                        └── TurnCompleted → Completed
```

## Failure paths

```text
model attempt fails
├── no replay-sensitive output escaped
│   ├── transient → ModelRetryScheduled → next attempt
│   └── invalid schema-backed call → correction attempt
└── text/reasoning/tool-call escaped → terminal failure

terminal unstructured turn
├── assistant text → Completed
└── no assistant text → TurnCompleted → RunEndedWithoutOutput
```

## Invariants

- Turn zero always runs; turn numbers and attempt ordinals are zero-based.
- A later turn requires pending tool results accepted by policy, or steering/follow-up input committed at its boundary.
- `Policy.forever` is the default and adds no follow-up cap; natural completion still occurs when no tool results or queued input remain.
- `Policy.recurs(n)` caps follow-up turns; stopping with pending results fails as `TurnLimitExceeded` or `PolicyStopped` and never drops them.
- `Agent.allocateRun` allocates one scoped process-local Run ID, lazy event stream, and producer-only `steer`/`followUp` handle; `stream` and `generate` are scoped projections of it.
- `output` selects structured output; `history` seeds the process-local transcript verbatim; `sessionId` selects an authoritative Session, not an inbox.
- Optional seams are discovered only for optional behavior; each behavior-bearing seam has a test or memory Layer.
- Each Run has separate steering and follow-up lanes: steering drains all pending inputs after tools, while follow-up drains one when completion is otherwise possible.
- Each lane defaults to 64 entries; together they allow 1 MiB of canonical encoded prompts.
- Overload is typed unless backpressure is requested; offer, drain, completion, and close share one transactional state.
- An offer committed before completion causes another turn; completion committed first closes admission.
- Failure, interruption, or scope close discards queued process-local input and wakes blocked producers; core keeps no Run registry or terminal tombstone, so process loss loses both lanes.
- Middleware-transformed response parts are authoritative for events, history, tools, memory, Sessions, and compaction.
- Transformed tool-call IDs must be unique within one response; duplicates fail before execution; transformed calls are schema-validated again and invalid transformations fail as `MiddlewareViolation`.
- The visible `model` selection is the only agent default and is resolved at run time by `ModelRegistry`; without a registry selection, `LanguageModel` remains a visible requirement supplied at the run boundary.
- Requirements remain visible through model selection, direct model provision, memory, tools, policy, handoffs, and transport composition.
- Every instrumented attempt masks Effect's `ResponseIdTracker`, preventing an untracked incremental-request fallback; any future optimization must use the same attempt state machine.
- Framework tool results enter `Chat` exactly once, in provider order, before Session sync, memory retention, policy evaluation, and `TurnCompleted`.
- One agent-owned scheduling policy governs framework calls; default scheduling makes every call an exclusive authored-order barrier.
- `parallelSafe` names bounded concurrent tools; unlisted calls block earlier and later work from crossing their barrier.
- Every admitted stage sibling settles as `Waiting`, `Completed`, `Unknown`, or `Cancelled`; waiting/completed siblings are checkpointed and not rerun on partial resume.
- Concurrent lifecycle/progress events retain production order, while results, Session projection, and follow-up input retain provider order; the next model call waits for every authored framework call.
- Provider-executed calls are not run locally; declared tool failures remain schema-valid results; routing, schema, handler-boundary, placement, and authorization failures are typed `FrameworkFailure` values.
- Provider `error` parts become typed `AiError` failed attempts before telemetry/replay accounting; released OpenAI, Anthropic, and OpenRouter registrations preserve known semantics.
- Unknown custom payloads become bounded terminal `UnknownError`; custom `ModelResilience.resolve` may map known payloads before classification.
- Default resilience retries rate-limit, internal, and transport failures twice, after 2 and 4 seconds, within 30 seconds.
- A supplied `ModelResilience` replaces defaults; `ModelResilience.none` disables retries; every accepted retry emits `ModelRetryScheduled` with category and delay.
- A clean stream end without `finish` is `ModelStreamTruncated` with category `truncated-stream`; an idle deadline may produce `ModelStreamTimeout` with category `timeout`.
- `streamIdleTimeout` is opt-in; there is no hidden deadline; metadata is withheld and cannot block retry, but reasoning, text, or tool-call output does because replay would duplicate output.
- Metadata and errors from discarded attempts never escape.
- `invalidToolCallCorrectionLimit` is a safe integer from 0 through 2 and applies only to Generalist's pre-output, schema-backed `InvalidToolCallParameters`; generic `AiError.InvalidOutputError` and raw JSON Schema dynamic tools are excluded.
- Correction exposes the exact permissive provider JSON Schema, validates with original Effect schemas, and releases only decoded calls; invalid attempts discard metadata and `tool-params-*` staging parts but retain terminal usage.
- Correction feedback is bounded to the tool name, starts another instrumented attempt in the same call, and emits `ModelRetryScheduled` with `invalid-tool-call-correction`.
- Direct/custom registrations need `ModelRegistry.withToolJsonSchemaCompiler`; released providers attach exact compilers, and OpenRouter selects Anthropic, OpenAI, or default compilation by upstream adapter prefix.
- Every loop model call emits call, attempt, retry, and compaction lifecycle events; one `modelCallId` spans attempts, while `modelAttemptId` and zero-based `attempt` identify each invocation and `ModelPart`.
- Purposes are `conversation`, `structured-output`, or `compaction-summary`; `ModelPart` is process-local, while Runtime stores normalized completion or terminal interruption.
- Effect Clock timestamps mark actual lifecycle boundaries; events stay causal and flush at the next boundary or stream end; external interruption withholds in-flight telemetry from that consumer.
- Completed attempts require `finish`, usage, `usageAt`, and finish reason; non-empty provider metadata is unchanged, provider-specific usage/cost is preserved, and absent IDs/model/tier/metadata mean unknown, not zero.
- Failure categories are bounded and provider-neutral; attempt/call failures include classification, and output-blocked retries preserve attempt classification while the call reports `terminal`.
- Delivery IDs are stable through checkpoint/replay; an optional sink receives immutable ordered `{ sessionId, events }` batches with backpressure before live emission.
- Successful sink delivery acknowledges exactly its batch; typed failure neither acknowledges nor emits it, interruption stays interruption, ambiguous failure requires sink reconciliation, and Session reconciles only an exact checkpointed batch.
- Hosts deduplicate by `(sessionId, deliveryId)`; without Session, callback durability is only the sink host's durability.
- A completed model operation has one deterministic token charge: terminal input plus output usage, or the context estimate when terminal usage is absent, plus reported failed-attempt usage.
- The driver settles charge before completion journaling; overrun commits the paid response with zero tokens remaining, then fails typed before tools or another model call.
- `Completed.text` is final-turn assistant text; turn text/state reset at each boundary, so intermediate narration is excluded.
- An unstructured terminal turn requires non-empty text; otherwise it emits `TurnCompleted`, then `RunEndedWithoutOutput`; earlier turns may be textless.
- That failure carries provider finish reason (`"unknown"` means no reason; absence means no terminal event) and pre-middleware provider text/reasoning character totals across all attempts.
- Zero text with reasoning means reasoning-only; both zero means no output; nonzero uncommitted text means middleware removed it or its attempt was discarded.
- Structured runs complete by schema value and may have no terminal text.
- Nested `AgentTool` runs get fresh Run IDs, inboxes, and telemetry, so one provider invocation never emits to two Runs; same-run handoffs retain all three.

## Related

- Source: `packages/generalist/src/core/agent/`, `packages/generalist/src/core/model/`, `packages/generalist/src/core/turn/policy.ts`
- Site: `/docs/learn/agent-loop`
- Site: `/docs/reference/core-agent`
- Site: `/docs/reference/core-events`
- Site: `/docs/reference/core-models`
- Site: `/docs/reference/core-policies`
