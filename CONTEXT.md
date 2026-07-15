# BatonFX Context

This file is the canonical vocabulary for BatonFX. Keep implementation details and provider-specific examples out unless they clarify a stable concept. `SPEC.md` is the specification index; the detailed contract lives under `docs/spec/`.

## Positioning

BatonFX is a standalone, **non-durable**, Effect-native agent framework — a model-turn loop over `effect/unstable/ai`. You compose it as Effect layers directly inside your own application, on your own models and tools. Baton is the agent; a durable runtime such as [Relay](https://github.com/In-Time-Tec/relayfx) is the durable race it runs in. Use Baton alone when you just need an agent or chat streaming; compose it behind a durable runtime when you need suspend/resume durability. Baton depends on `effect` only and never on any durable runtime's schema, event log, or database.

## Domain model

- **Agent**: an agent definition value (name, instructions, toolkit, model selection, memory key, turn policy, and metadata) carrying its own defaults. `Agent.make` builds it; `Agent.stream` is the text loop primitive, `Agent.generate` is derived from it, and `Agent.streamObject` / `Agent.generateObject` run the same loop followed by one terminal structured-output turn. An Agent is not a user, bot, or account.
- **Turn**: one model call plus the sequential execution of the tool calls it emits. Turn 0 always runs; follow-up turns re-feed tool results via `Ai.Prompt.fromResponseParts(...)`.
- **TurnPolicy**: a plain, `Schedule`-inspired Effect program (not a service) that decides whether to run another turn when tool results are pending. Its requirements remain visible on the Agent run, evaluation fails with `TurnPolicyError`, and stops carry a serializable `StopReason`. Finite `recurs`, `untilToolCall`, and fully portable `both` values carry inert serializable snapshots for durable hosts; non-finite recurrence counts and `make` remain opaque runtime policies. Default `recurs(8)`.
- **ToolExecutor**: the tool-call execution seam. `execute(request) => Effect<Outcome, FrameworkFailure | RemoteRetryError>` where `Outcome` is `Success | DomainFailure | Suspend`. Domain failures retain decoded and schema-encoded values; schema, handler-boundary, routing, placement, and authorization failures are schema-backed framework errors. `RemoteRetryError` reports retry-policy configuration faults before they become placement failures. Default `fromToolkit` runs the toolkit's own handlers in-process; hosts swap in their own.
- **ToolContext**: the per-call ambient service provided while a framework-executed tool is running. It carries the run `sessionId`, an `AbortSignal` that is aborted when the run/tool scope is interrupted, and `emit(progress)` for in-flight progress updates.
- **ToolOutputStore**: the optional spill seam for oversized successful tool outputs. Baton can store the full output out of context and re-feed a bounded inline `ToolOutput` envelope with `outputPaths`; absent or no-op stores preserve inline results unchanged.
- **Approvals**: the enforcement point for `Ai.Tool.needsApproval` (which `effect/unstable/ai` declares but never enforces). `check(request) => Effect<Decision>` where `Decision` is `Approved | Denied | Pending`. `Denied` fails the run with an authorization `FrameworkFailure`; `Pending` suspends the run.
- **AgentEvent**: the closed union of loop events hosts observe and optionally persist (`ModelPart`, `TurnStarted`, `TurnCompleted`, `StructuredOutput`, `ApprovalRequested`, `Completed`, tool execution and progress events).
- **AgentError**: a `Schema.TaggedErrorClass` for general loop failures and wrapped external failures. Policy stops, middleware violations, suspensions, and tool framework failures retain their own typed run errors.
- **AgentSuspended**: a typed error on the stream's error channel signalling the run did not finish and must be re-entered via `RunOptions.resume` once the host resolves the suspension `token`. Reasons: `tool-wait` (from a `Suspend` outcome) or `approval` (from a `Pending` decision).
- **Permissions**: the optional policy seam consulted for every framework-executed local tool call before `ToolExecutor` and before `Ai.Tool.needsApproval` / `Approvals`. It evaluates declarative allow/deny/ask rules. Allow continues to the existing approval path, deny fails with an authorization `FrameworkFailure`, and ask suspends via `AgentSuspended { reason: "approval" }` unless an in-process host answers.
- **ModelRegistry**: the provider-agnostic registry that maps a model selection to a concrete Effect AI `LanguageModel` layer. Missing registrations fail typed, not silently.
- **Providers**: the optional `@batonfx/providers` helper package that adapts upstream `@effect/ai-*` providers into `ModelRegistry` registrations and exposes embedding layers over Effect AI's `EmbeddingModel` tag. Core remains provider-agnostic.
- **TestModel**: the scripted Effect AI language model in `@batonfx/test`. A stateful fixture owns one atomic response cursor, captures normalized provider requests, and exposes direct and `ModelRegistry` layers for deterministic prompt, tool, steering, queue, compaction, structured-output, and retry tests without credentials.
- **ModelCatalog**: the optional provider-package service for static model metadata such as context windows, output limits, pricing, and modalities. It lives in `@batonfx/providers`; core never depends on it.
- **MCP OAuth**: the `@batonfx/mcp` authorization lifecycle for authenticated remote servers. Baton owns discovery, PKCE, callback exchange, refresh integration, and typed failures; hosts own browser/callback UI and redacted token persistence.
- **MCP BatonTools**: the scoped `@batonfx/mcp/baton` route result that keeps one discovered toolkit, its Effect AI handlers, the Baton `ToolExecutor` layer, and the owning MCP connection lifetime together.
- **ModelResilience**: the optional model-call retry seam. It classifies live model-call failures as `transient` or `terminal` and supplies the retry schedule applied inside a single model call; streamed turns retry only before any part has been emitted.
- **ModelMiddleware**: the interceptor seam for everything going into (`transformPrompt`) or out of (`transformPart`) the model — PII scrubbing, prompt-injection screening, output filtering, logging. Ships a `layerIdentity` default and no built-in filters.
- **Guardrail**: ergonomic `ModelMiddleware.Middleware` combinators for input validation, prompt/output regex redaction, and output filtering. Guardrails are not a separate subsystem; they compose through `ModelMiddleware.layer([...])`.
- **Instructions**: the ordered context-source registry. `openEpoch` renders baseline sources once into the run's system-message baseline. Baton does not inject dynamic updates; the deprecated `renderUpdate` export remains only for compatibility with hosts that own transcript insertion and persistence. Filesystem, skills, and memory sources are contributed by later packages/seams.
- **Memory**: the optional recall/remember/forget seam. `RunOptions.memory.key` is host-chosen; recall inserts one user message after the system message and before the run prompt; remember runs after completed turns; forget is a host-requested lifecycle cleanup operation for a whole key or one remembered item id. Non-durable working-memory and semantic-recall implementations live in `@batonfx/memory`; durable memory remains host-owned.
- **SkillSource**: the optional source seam for agentskills.io `SKILL.md` skills. Startup context receives selected listings only; bodies load lazily when the model calls Baton's `activate_skill` tool. Concrete filesystem and manifest-backed HTTP, S3, and GitHub adapters live in `@batonfx/skills`, not core; hosted catalogs are Baton integration contracts rather than Agent Skills standard protocols.
- **Session**: an append-only conversation entry log with a current leaf pointer for branch navigation. `Session.buildContext(path)` is the pure projector from a root-to-leaf path into an `Ai.Prompt`; durable/addressable storage belongs to hosts such as Relay. The transport `SessionRegistry` may serialize and queue top-level runs per session in memory, but that queue is not durable session history.
- **Transport capability**: the endpoint-owned server-frame validation policy. `fixed` uses the startup toolkit for exact tool names and parameter/result schemas; `runtime-dynamic` keeps frame and common event fields strict while accepting string tool names and unknown tool payloads for skill-activated or runtime-discovered tools. The registry and browser client retain honest loose frame values; SSE and WebSocket endpoints select one capability when constructed and never change policy per frame.
- **Steering**: the optional live-input seam with two queues. Steering input drains after tool results and before the next model turn; follow-up input drains only when the run would otherwise complete. Queue interruption leaves undrained messages in the service layer.
- **Compaction**: the optional context-shrinking seam for long runs. A strategy decides whether to compact, chooses a safe session cut point, and summarizes old context into a checkpoint after first trying tool-output microcompaction. Strategy parts independently configure lossless tool-output bounding, validated structured summaries, and a token-denominated recent suffix before compiling to the same strategy contract.
- **Chat persistence seam**: `Agent.persisted` and the other persisted entrypoints run the loop on a persisted `Ai.Chat` instead of a fresh one and expose `Chat.Persistence` in their requirements. Baton delegates all chat storage to `effect/unstable/ai`'s `Chat.Persistence`; it adds no chat store of its own.
- **Tool output spill seam**: `ToolOutputStore` stores oversized tool outputs out of context when present and when `RunOptions.toolOutputMaxBytes` is exceeded. It is non-durable in core; durable blob stores belong to hosts such as Relay.

## Invariants

- Baton depends on `effect` only. It never imports from any durable runtime's schema, event log, or database. In this repo the rule is enforced by the `no-relayfx-imports` ast-grep rule.
- Payload vocabulary is `Ai.Prompt`/`Ai.Response`. Baton adds loop framing only — no second wire format.
- Every exported symbol is `@experimental` while `effect/unstable/ai` is itself unstable.
- Public APIs use package-root module namespaces and noun-after-`layer` service Layer variants; established subpaths and superseded Layer names follow ADR-0024 compatibility policy.
- Errors that cross a service boundary are `Schema.TaggedErrorClass`.
- Every post-middleware tool-call ID is unique within its model response. Duplicate transformed IDs fail typed before the duplicate can initiate authorization, execution, or persistence.
- No `Date.now()` or raw platform time/concurrency/randomness — use Effect primitives.
- Pending tool results are never silently dropped: a `Stop` policy with pending results fails the run.
- Completed framework tool results enter Chat exactly once in call order before Session synchronization, Memory retention, policy evaluation, persistence, and `TurnCompleted`; follow-up turns consume that checkpoint without appending the results again.
- Permission policy is optional. Absent `Permissions` preserves existing tool execution and `needsApproval` behavior exactly.
- Instructions context baselines are opened at run start. Baton has no automatic dynamic-instruction update contract. TurnPolicy instruction overrides are independent: the policy prepends one system message to the selected follow-up prompt, which `Ai.Chat` then retains in transcript history.
- SkillSource is optional and standalone. Absent `SkillSource`, the Agent loop does not advertise skill listings or the `activate_skill` tool.
- Memory is optional and host-chosen. Baton never derives a memory subject; hosts pass either `Agent.make({ memory })` as an agent default or `RunOptions.memory.key` for a run-specific override.
- Memory forget is host-requested cleanup. Baton never infers memory retention or calls forget from the agent loop. `ForgetInput.id` narrows cleanup to one implementation-owned memory item within the exact key; omitting it drops the whole key.
- Provider helpers are optional and standalone. Core never imports provider SDKs; provider dependencies live in `@batonfx/providers`.
- Steering is optional. Absent `Steering` preserves current turn and completion behavior exactly.
- Compaction is optional. Absent `Compaction` preserves current turn, session, and completion behavior exactly.
- Session context is derived from a root-to-leaf path, not stored separately.
- `TurnPolicy` is a plain value, not a service — agents carry their own default like `Schedule` values.
- Turn policy requirements remain visible in Agent run requirements, policy failures remain typed, and successful non-limit stops are never reported as `TurnLimitExceeded`.
- A `TurnPolicy` snapshot describes built-in constructor data only. It never serializes a decision function, Effect, Layer, or service and does not change standalone decision semantics.
- Every behavior-bearing seam exposes a test or memory layer (`testLayer`) so tests swap implementations through Effect layers.
- Transport run queues are opt-in, FIFO per session, and process-local. Accepted queued prompts are lost when the registry layer is released; durable work belongs to hosts such as Relay.
- Transport endpoints with a fixed toolkit validate exact tool payload schemas; endpoints serving skill activation or runtime-discovered tools explicitly select the runtime-dynamic capability and validate those tool payloads as unknown without weakening common event or frame structure.
- Spec documents are part of the architecture: new concepts require a `docs/spec/` doc; stable decisions require an ADR.

## Spec branches

- Agent framework contract: `docs/spec/01-baton-agent-framework.md`
- Session event-log contract: `docs/spec/02-session-event-log.md`
- Instructions and context-epoch contract: `docs/spec/03-instructions-and-context-epoch.md`
- Permissions policy contract: `docs/spec/04-permissions-policy.md`
- Steering and interrupts contract: `docs/spec/05-steering-and-interrupts.md`
- Compaction strategy contract: `docs/spec/06-compaction.md`
- Skills contract: `docs/spec/07-skills.md`
- Providers contract: `docs/spec/08-providers.md`
- Memory contract: `docs/spec/09-memory.md`
- Deterministic test-kit contract: `docs/spec/13-test-kit.md`
- MCP Baton tools contract: `docs/spec/16-mcp-baton-tools.md`
