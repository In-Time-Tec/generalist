# BatonFX Context

This file is the canonical vocabulary for BatonFX. Keep implementation details and provider-specific examples out unless they clarify a stable concept. `SPEC.md` is the specification index; the detailed contract lives under `docs/spec/`.

## Positioning

BatonFX is a standalone, **non-durable**, Effect-native agent framework — a model-turn loop over `effect/unstable/ai`. You compose it as Effect layers directly inside your own application, on your own models and tools. Baton is the agent; a durable runtime such as [Relay](https://github.com/In-Time-Tec/relayfx) is the durable race it runs in. Use Baton alone when you just need an agent or chat streaming; compose it behind a durable runtime when you need suspend/resume durability. Baton depends on `effect` only and never on any durable runtime's schema, event log, or database.

## Domain model

- **Agent**: an agent definition value (name, instructions, toolkit, model, turn policy) carrying its own defaults. `Agent.make` builds it; `Agent.stream` is the loop primitive and `Agent.generate` is derived from it. An Agent is not a user, bot, or account.
- **Turn**: one model call plus the sequential execution of the tool calls it emits. Turn 0 always runs; follow-up turns re-feed tool results via `Ai.Prompt.fromResponseParts(...)`.
- **TurnPolicy**: a plain, `Schedule`-inspired value (not a service) that decides whether to run another turn when tool results are pending. Constructors: `recurs`, `untilToolCall`, `both`, `make`. Default `recurs(8)`.
- **ToolExecutor**: the tool-call execution seam. `execute(request) => Effect<Outcome>` where `Outcome` is `Success | Failure | Suspend`. Default `fromToolkit` runs the toolkit's own handlers in-process; hosts swap in their own.
- **ToolContext**: the per-call ambient service provided while a framework-executed tool is running. It carries the run `sessionId`, an `AbortSignal` that is aborted when the run/tool scope is interrupted, and `emit(progress)` for in-flight progress updates.
- **ToolOutputStore**: the optional spill seam for oversized successful tool outputs. Baton can store the full output out of context and re-feed a bounded inline `ToolOutput` envelope with `outputPaths`; absent or no-op stores preserve inline results unchanged.
- **Approvals**: the enforcement point for `Ai.Tool.needsApproval` (which `effect/unstable/ai` declares but never enforces). `check(request) => Effect<Decision>` where `Decision` is `Approved | Denied | Pending`. `Denied` re-feeds a failed tool result; `Pending` suspends the run.
- **AgentEvent**: the closed union of loop events hosts observe and optionally persist (`ModelPart`, `TurnStarted`, `TurnCompleted`, `ApprovalRequested`, `Completed`, tool execution and progress events).
- **AgentError**: a `Schema.TaggedErrorClass` for loop failures (policy stop with pending results, middleware bugs, misconfiguration).
- **AgentSuspended**: a typed error on the stream's error channel signalling the run did not finish and must be re-entered via `RunOptions.resume` once the host resolves the suspension `token`. Reasons: `tool-wait` (from a `Suspend` outcome) or `approval` (from a `Pending` decision).
- **ModelRegistry**: the provider-agnostic registry that maps a model selection to a concrete Effect AI `LanguageModel` layer. Missing registrations fail typed, not silently.
- **ModelMiddleware**: the interceptor seam for everything going into (`transformPrompt`) or out of (`transformPart`) the model — PII scrubbing, prompt-injection screening, output filtering, logging. Ships a `identityLayer` default and no built-in filters.
- **Chat persistence seam**: `RunOptions.persistence` runs the loop on a persisted `Ai.Chat` instead of a fresh one. Baton delegates all chat storage to `effect/unstable/ai`'s `Chat.Persistence`; it adds no chat store of its own.
- **Tool output spill seam**: `ToolOutputStore` stores oversized tool outputs out of context when present and when `RunOptions.toolOutputMaxBytes` is exceeded. It is non-durable in core; durable blob stores belong to hosts such as Relay.

## Invariants

- Baton depends on `effect` only. It never imports from any durable runtime's schema, event log, or database. In this repo the rule is enforced by the `no-relayfx-imports` ast-grep rule.
- Payload vocabulary is `Ai.Prompt`/`Ai.Response`. Baton adds loop framing only — no second wire format.
- Every exported symbol is `@experimental` while `effect/unstable/ai` is itself unstable.
- Errors that cross a service boundary are `Schema.TaggedErrorClass`.
- No `Date.now()` or raw platform time/concurrency/randomness — use Effect primitives.
- Pending tool results are never silently dropped: a `Stop` policy with pending results fails the run.
- `TurnPolicy` is a plain value, not a service — agents carry their own default like `Schedule` values.
- Every behavior-bearing seam exposes a test or memory layer (`testLayer`) so tests swap implementations through Effect layers.
- Spec documents are part of the architecture: new concepts require a `docs/spec/` doc; stable decisions require an ADR.

## Spec branches

- Agent framework contract: `docs/spec/01-baton-agent-framework.md`
