# BatonFX Context

This file is the canonical vocabulary for BatonFX. Keep implementation details and provider-specific examples out unless they clarify a stable concept. `SPEC.md` is the specification index; the detailed contract lives under `docs/spec/`.

## Positioning

BatonFX is a standalone, **non-durable**, Effect-native agent framework — a model-turn loop over `effect/unstable/ai`. You compose it as Effect layers directly inside your own application, on your own models and tools. Baton is the agent; a durable runtime such as [Relay](https://github.com/In-Time-Tec/relayfx) is the durable race it runs in. Use Baton alone when you just need an agent or chat streaming; compose it behind a durable runtime when you need suspend/resume durability. Baton depends on `effect` only and never on any durable runtime's schema, event log, or database.

## Domain model

- **Agent**: an agent definition value (name, instructions, toolkit, model, turn policy) carrying its own defaults. `Agent.make` builds it; `Agent.stream` is the text loop primitive, `Agent.generate` is derived from it, and `Agent.streamObject` / `Agent.generateObject` run the same loop followed by one terminal structured-output turn. An Agent is not a user, bot, or account.
- **Turn**: one model call plus the sequential execution of the tool calls it emits. Turn 0 always runs; follow-up turns re-feed tool results via `Ai.Prompt.fromResponseParts(...)`.
- **TurnPolicy**: a plain, `Schedule`-inspired value (not a service) that decides whether to run another turn when tool results are pending. Constructors: `recurs`, `untilToolCall`, `both`, `make`. Default `recurs(8)`.
- **ToolExecutor**: the tool-call execution seam. `execute(request) => Effect<Outcome>` where `Outcome` is `Success | Failure | Suspend`. Default `fromToolkit` runs the toolkit's own handlers in-process; hosts swap in their own.
- **ToolContext**: the per-call ambient service provided while a framework-executed tool is running. It carries the run `sessionId`, an `AbortSignal` that is aborted when the run/tool scope is interrupted, and `emit(progress)` for in-flight progress updates.
- **ToolOutputStore**: the optional spill seam for oversized successful tool outputs. Baton can store the full output out of context and re-feed a bounded inline `ToolOutput` envelope with `outputPaths`; absent or no-op stores preserve inline results unchanged.
- **Approvals**: the enforcement point for `Ai.Tool.needsApproval` (which `effect/unstable/ai` declares but never enforces). `check(request) => Effect<Decision>` where `Decision` is `Approved | Denied | Pending`. `Denied` re-feeds a failed tool result; `Pending` suspends the run.
- **AgentEvent**: the closed union of loop events hosts observe and optionally persist (`ModelPart`, `TurnStarted`, `TurnCompleted`, `StructuredOutput`, `ApprovalRequested`, `Completed`, tool execution and progress events).
- **AgentError**: a `Schema.TaggedErrorClass` for loop failures (policy stop with pending results, middleware bugs, misconfiguration).
- **AgentSuspended**: a typed error on the stream's error channel signalling the run did not finish and must be re-entered via `RunOptions.resume` once the host resolves the suspension `token`. Reasons: `tool-wait` (from a `Suspend` outcome) or `approval` (from a `Pending` decision).
- **Permissions**: the optional policy seam consulted for every framework-executed local tool call before `ToolExecutor` and before `Ai.Tool.needsApproval` / `Approvals`. It evaluates declarative allow/deny/ask rules. Allow continues to the existing approval path, deny re-feeds a failed tool result, and ask suspends via `AgentSuspended { reason: "approval" }` unless an in-process host answers.
- **ModelRegistry**: the provider-agnostic registry that maps a model selection to a concrete Effect AI `LanguageModel` layer. Missing registrations fail typed, not silently.
- **ModelResilience**: the optional model-call retry seam. It classifies live model-call failures as `transient` or `terminal` and supplies the retry schedule applied inside a single model call; streamed turns retry only before any part has been emitted.
- **ModelMiddleware**: the interceptor seam for everything going into (`transformPrompt`) or out of (`transformPart`) the model — PII scrubbing, prompt-injection screening, output filtering, logging. Ships a `identityLayer` default and no built-in filters.
- **Guardrail**: ergonomic `ModelMiddleware.Middleware` combinators for input validation, prompt/output regex redaction, and output filtering. Guardrails are not a separate subsystem; they compose through `ModelMiddleware.layer([...])`.
- **Instructions**: the ordered context-source registry. `openEpoch` renders baseline sources once into the run's system-message baseline and keeps dynamic sources for later `renderUpdate` calls; filesystem, skills, and memory sources are contributed by later packages/seams.
- **Session**: an append-only conversation entry log with a current leaf pointer for branch navigation. `Session.buildContext(path)` is the pure projector from a root-to-leaf path into an `Ai.Prompt`; durable/addressable storage belongs to hosts such as Relay.
- **Steering**: the optional live-input seam with two queues. Steering input drains after tool results and before the next model turn; follow-up input drains only when the run would otherwise complete. Queue interruption leaves undrained messages in the service layer.
- **Chat persistence seam**: `RunOptions.persistence` runs the loop on a persisted `Ai.Chat` instead of a fresh one. Baton delegates all chat storage to `effect/unstable/ai`'s `Chat.Persistence`; it adds no chat store of its own.
- **Tool output spill seam**: `ToolOutputStore` stores oversized tool outputs out of context when present and when `RunOptions.toolOutputMaxBytes` is exceeded. It is non-durable in core; durable blob stores belong to hosts such as Relay.

## Invariants

- Baton depends on `effect` only. It never imports from any durable runtime's schema, event log, or database. In this repo the rule is enforced by the `no-relayfx-imports` ast-grep rule.
- Payload vocabulary is `Ai.Prompt`/`Ai.Response`. Baton adds loop framing only — no second wire format.
- Every exported symbol is `@experimental` while `effect/unstable/ai` is itself unstable.
- Errors that cross a service boundary are `Schema.TaggedErrorClass`.
- No `Date.now()` or raw platform time/concurrency/randomness — use Effect primitives.
- Pending tool results are never silently dropped: a `Stop` policy with pending results fails the run.
- Permission policy is optional. Absent `Permissions` preserves existing tool execution and `needsApproval` behavior exactly.
- Instructions context baselines are opened at run start; dynamic context updates are rendered separately and are not injected until the compaction/update contract does so.
- Steering is optional. Absent `Steering` preserves current turn and completion behavior exactly.
- Session context is derived from a root-to-leaf path, not stored separately.
- `TurnPolicy` is a plain value, not a service — agents carry their own default like `Schedule` values.
- Every behavior-bearing seam exposes a test or memory layer (`testLayer`) so tests swap implementations through Effect layers.
- Spec documents are part of the architecture: new concepts require a `docs/spec/` doc; stable decisions require an ADR.

## Spec branches

- Agent framework contract: `docs/spec/01-baton-agent-framework.md`
- Session event-log contract: `docs/spec/02-session-event-log.md`
- Instructions and context-epoch contract: `docs/spec/03-instructions-and-context-epoch.md`
- Permissions policy contract: `docs/spec/04-permissions-policy.md`
- Steering and interrupts contract: `docs/spec/05-steering-and-interrupts.md`
