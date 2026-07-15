# 01 — Baton Agent Framework

Baton (`@batonfx/core`, directory `packages/core`) is a standalone, **non-durable**, Effect-native agent loop over `effect/unstable/ai`. Baton is the agent; a durable runtime such as [Relay](https://github.com/In-Time-Tec/relayfx) is the durable race it runs in. Use Baton alone when you just need an agent or chat streaming; compose it with a durable runtime when you need durability.

Baton is the _Effect_ version of an agent framework, not a port of AI SDK/Mastra vocabulary. Payload vocabulary is `Ai.Prompt`/`Ai.Response` from `effect/unstable/ai` — Baton adds loop framing only, no second wire format. `@batonfx/core` directly re-exports selected Effect AI modules (`Tool`, `Toolkit`, `LanguageModel`, `Prompt`, `Response`, `Chat`, `Tokenizer`, and related modules) as identity-preserving convenience exports; those values remain owned by Effect AI.

Compatibility: this spec is tested against `effect` and `@effect/vitest` `4.0.0-beta.93`.

## Agent definition defaults

`Agent.make(name, options)` and the object form build a plain agent definition value with these defaults:

```ts
type AgentOptions<PolicyServices = never, AuthorizationServices = never> = {
  readonly instructions?: string
  readonly toolkit?: Toolkit.Toolkit<any>
  readonly tools?: ReadonlyArray<Tool.Any>
  readonly policy?: TurnPolicy.TurnPolicy<PolicyServices>
  readonly model?: ModelRegistry.ModelSelection
  readonly memory?: Memory.Key
  readonly authorization?: ToolAuthorization.ToolAuthorizer<AuthorizationServices>
  readonly metadata?: Readonly<Record<string, unknown>>
}
```

`toolkit` is an Effect AI `Toolkit`; Baton does not introduce another tool definition model. `tools` is the mutually exclusive, origin-preserving static declaration form and is converted to the same Effect AI `Toolkit` after validation. Use `tools` when Baton must detect duplicate static declarations: pinned Effect AI's `Toolkit.make` has already collapsed an input list by name before Baton receives it, so a duplicate erased inside a pre-built toolkit cannot be reconstructed. `policy` defaults to `TurnPolicy.recurs(8)`. `model`, `memory`, and `metadata` are data carried by the agent definition so standalone Baton apps and durable hosts can reuse one coherent authoring shape. Durable hosts persist their own explicit projection; an Agent value contains runtime objects and is not itself a serialization format.

`Agent<Tools, R>` is opaque and invariant in both parameters. `R` truthfully retains every service required by the definition: a direct-model agent requires `LanguageModel`, a selected-model agent requires `ModelRegistry.Service`, configured memory adds `Memory`, and a static toolkit adds its handler tags plus tool decoding, encoding, and handler services. Widened optional configuration conservatively retains every service that may be selected at runtime. Transformations preserve `R` and remove only requirements they actually provide.

Built-in turn policies expose optional inert constructor data through `TurnPolicy.snapshot`:

```ts
type Snapshot =
  | { readonly _tag: "Recurs"; readonly count: number }
  | { readonly _tag: "UntilToolCall"; readonly name: string }
  | { readonly _tag: "Both"; readonly first: Snapshot; readonly second: Snapshot }
```

`recurs` with a finite count and `untilToolCall` carry their corresponding snapshot. Non-finite recurrence counts keep their existing standalone behavior but carry no snapshot because JSON cannot preserve them. `both` carries a snapshot only when both operands do. `make(decide)` is deliberately opaque and carries none. The snapshot is descriptive data for hosts that choose a supported durable projection; Baton never serializes decision closures, Effects, Layers, or services, and the snapshot does not participate in standalone policy evaluation.

When `agent.model` is present, streamed and generated runs resolve the selected model through `ModelRegistry`. The registry owns the selected layer scope and optional governance permit until the complete model operation exits: streamed calls retain both through full consumption, early downstream termination, failure, defect, or interruption, and terminal structured calls retain both until their Effect exits. If the registry is absent, the run fails before the first model call with a typed `AgentError`. Per-turn `TurnPolicy` model overrides still take precedence for the affected turn.

When `agent.memory` is present, it is the default `Memory.Key` for runs that omit `RunOptions.memory`; an explicit `RunOptions.memory.key` overrides the agent default. Baton never derives a memory key from the agent name, session id, or prompt.

## Scope

Baton owns:

- the model-turn loop: build an `Ai.Chat`, stream the active `LanguageModel` against the Chat history, transform and commit one authoritative response, fold those transformed parts, execute tool calls, re-feed tool results via `Ai.Prompt.fromResponseParts(...)`, repeat per policy, and optionally run one terminal structured-output turn;
- the closed loop-event union (`AgentEvent.Event`) that hosts observe and optionally persist;
- the standalone `Instructions` context-source registry and context-epoch projector;
- the standalone `Session` event-log seam and pure context projector;
- the loop seams: optional `ToolExecutor`, `ToolContext`, `ToolOutputStore`, `Permissions`, `Steering`, `Compaction`, `Memory`, `ModelResilience`, optional `Approvals`, optional `ModelMiddleware`, and `TurnPolicy` (a plain value, not a service);
- the suspension contract (`AgentSuspended` on the error channel, resumable via `RunOptions.resume`);
- the provider-agnostic `ModelRegistry` for `LanguageModel` layer registration and selection.

Baton does not own (deferred, see ADR-0001): UI helpers, concrete memory implementations, evals, model-judge guardrails or detection heuristics, durable/addressable multi-agent, or durability of any kind. Baton owns same-process **AgentTool** and **Handoff** helpers for in-process multi-agent composition. Baton owns ergonomic **Guardrail** combinators over `ModelMiddleware`, but no separate guardrail subsystem. Baton owns a standalone **Instructions** registry, a **Memory** seam, and **Session** event-log seam, but no filesystem context loaders, memory stores, skills catalog source, or durable/addressable session implementation. Baton owns distinct persisted run entrypoints but no persistence _implementation_ — consumers provide upstream `Chat.Persistence` layers. Baton also owns a non-durable **tool output spill seam** (`ToolOutputStore`, see below); durable blob stores remain host-side.

## Boundary rule

**Baton depends on `effect` only.** Baton has zero dependencies on any durable runtime's schema package, event log, or Postgres. A durable host composes Baton behind its own unchanged agent-loop interface and adapts its own vocabulary (e.g. snake_case identifiers, its own tool-call model, execution events) on the host side. In this repository the boundary is enforced structurally: the `no-relayfx-imports` ast-grep rule bans any `@relayfx/*` import — BatonFX must never depend on Relay.

## Module inventory

`packages/core/src` contains these intentional public module namespaces exported from `src/index.ts`. In addition to Baton-owned modules, the root entrypoint re-exports selected Effect AI modules directly from `effect/unstable/ai` so applications can import the agent loop and the upstream tool/model primitives from one place without Baton inventing a parallel tool model.

| Effect AI export     | Baton stance                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `Tool`, `Toolkit`    | Public tool definition/runtime primitives; used unchanged by `Agent.make` and `ToolExecutor`.     |
| `LanguageModel`      | Upstream model service consumed by `Agent.stream`, `Agent.generate`, and `ModelRegistry`.         |
| `Prompt`, `Response` | Upstream payload vocabulary for prompts, stream parts, tool calls, tool results, and transcripts. |
| `Chat`, `Tokenizer`  | Upstream chat persistence and token-counting primitives used by Baton seams when provided.        |
| other AI modules     | Transparent convenience exports only; ownership and semantics stay in Effect AI.                  |

The Baton-owned modules are:

| Module                  | Export namespace    | Purpose                                                                                                   |
| ----------------------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| `agent.ts`              | `Agent`             | Agent definition value, `make`, text `stream`/`generate`, and structured `streamObject`/`generateObject`. |
| `agent-event.ts`        | `AgentEvent`        | Closed union of loop events, including `StructuredOutput`, plus tagged run errors.                        |
| `agent-tool.ts`         | `AgentTool`         | Expose same-process child agents as handled Effect AI toolkits.                                           |
| `approvals.ts`          | `Approvals`         | Enforcement point for `Ai.Tool.needsApproval`; `autoApprove`, `denyAll`, and `testLayer`.                 |
| `compaction.ts`         | `Compaction`        | Optional context-shrinking strategy seam and default two-stage compaction implementation.                 |
| `guardrail.ts`          | `Guardrail`         | Ergonomic input/output guardrail combinators that produce `ModelMiddleware.Middleware` values.            |
| `handoff.ts`            | `Handoff`           | Transfer tools, supervisor construction, and bounded same-process fan-out.                                |
| `instructions.ts`       | `Instructions`      | Ordered baseline context-source registry, context epoch opener, and test layer.                           |
| `memory.ts`             | `Memory`            | Optional recall/remember seam for per-run long-term memory integration.                                   |
| `model-middleware.ts`   | `ModelMiddleware`   | Interceptor seam for model input (prompt) and output (stream parts); `layerIdentity` default.             |
| `model-registry.ts`     | `ModelRegistry`     | Provider-agnostic `LanguageModel` registration/selection.                                                 |
| `model-resilience.ts`   | `ModelResilience`   | Optional retry seam for model-call failures inside the loop.                                              |
| `permissions.ts`        | `Permissions`       | Compatibility allow/deny/ask policy seam adapted into final tool authorization.                           |
| `session.ts`            | `Session`           | Append-only session event-log seam, memory layer, and pure `buildContext` projector.                      |
| `skill-source.ts`       | `SkillSource`       | Optional agentskills.io skill listing and lazy body source seam.                                          |
| `steering.ts`           | `Steering`          | Optional two-queue live-input seam for steering and follow-up prompts plus test layer.                    |
| `tool-authorization.ts` | `ToolAuthorization` | Final active-tool, policy, remembered-rule, and dynamic-approval decision boundary.                       |
| `tool-context.ts`       | `ToolContext`       | Per-tool-call ambient context: abort signal, progress emitter, and session identity.                      |
| `tool-executor.ts`      | `ToolExecutor`      | Optional tool-call execution seam; local toolkit adapter, placement route constructors, and `testLayer`.  |
| `tool-output.ts`        | `ToolOutput`        | Optional spill seam for oversized successful tool outputs.                                                |
| `turn-policy.ts`        | `TurnPolicy`        | Schedule-inspired turn continuation values plus portable snapshots for built-in policies.                 |

Module conventions: consumers import module namespaces from `@batonfx/core`; services use the `Service`/`Interface`/`layer`/`testLayer` pattern and noun-after-`layer` variants such as `layerMemory`, `layerNoop`, and `layerIdentity`. Superseded names remain deprecated aliases under ADR-0024. Every exported symbol carries an `@experimental` JSDoc tag; errors are `Schema.TaggedErrorClass`; no `Date.now()` anywhere (callers pass timestamps if ever needed — v1 needs none).

## Turn semantics

- Turn 0 always runs (it is the initial model call; the policy is never consulted for it).
- Before turn 0 or resume execution, Baton atomically validates the complete advertised tool set. Every name maps to one schema, permission/approval subject, dispatch path, and origin. The immutable validated snapshot used for model advertisement is also used for permission/approval lookup and dispatch during that turn. Conflicts fail with `ToolNameCollision` before model advertisement or candidate execution; names and all participant origins retain declaration order. Each run owns its tool state, so concurrent runs cannot observe another run's activation or a partially assembled set.
- When an `Instructions` service is present and neither `options.system` nor `options.history` is set, Baton opens a context epoch at `{ agentName, turn: 0 }` and uses its non-empty baseline as the system message. Absent `Instructions`, explicit `options.system`, and explicit `options.history` preserve the previous system-message behavior. Baton does not render or inject dynamic instruction updates. The deprecated `Instructions.renderUpdate` export is a compatibility utility for hosts that own transcript insertion and persistence; it is not part of the Agent loop contract.
- When a `SkillSource` service is present and `options.history` is absent, Baton appends token-budgeted selected skill listings to the first-turn system baseline and advertises the built-in `activate_skill` tool. The listing budget is applied through `SkillSource.selectListings`; skill bodies are not read at startup. Absent `SkillSource`, system-message and toolkit derivation are unchanged.
- When `RunOptions.memory` or `agent.memory` is set and `Memory` is present, Baton recalls once before non-resume turn 0. Recalled `Memory.Item.content` values contain only Effect AI user-message parts, become one user message inserted after an initial system message and before the run prompt, and require no runtime part-kind narrowing. All-empty item content inserts no message. Recall occurs before model middleware. After each completed streamed turn, Baton remembers the full transcript with `terminal` indicating whether the run would otherwise complete. Suspension does not remember at the suspension point; resumed completed turns remember normally.
- Before each model turn calls the active `LanguageModel`, Baton resolves `ModelResilience` optionally. If absent, model-call behavior is unchanged. If present, Baton wraps the active `Ai.LanguageModel.Service` for that turn, including any per-turn `TurnPolicy` model override. Streaming retry is allowed only while the attempted model call has emitted no parts. Once any part is emitted, the turn is never re-run; a later typed stream failure becomes one `error` part and then follows the normal `AgentError` path. Defects, interruption, and compound Causes are never converted into an `error` part or classified as context overflow: Baton re-fails the original Cause so supervision, telemetry, and diagnostics retain every reason. Provider-emitted in-band `error` parts are normal stream parts and are not classified or retried.
- Every model stream part that survives `ModelMiddleware` is part of one ordered authoritative response. Baton emits it as `ModelPart { turn, part }`, uses it for text accumulation and tool dispatch, and commits that same transformed sequence to Chat history. Text is accumulated from authoritative `text-delta` parts across all turns into `Completed.text`. Authoritative `finish` parts also flow through as `ModelPart`s.
- Framework-executed `tool-call` stream parts (`providerExecuted !== true`) are executed sequentially in stream order. Agent-owned exact-turn membership first rejects inactive or unknown tools, then every attempt reaches one `ToolAuthorization` boundary over the immutable, origin-preserving registry advertised for that turn. The boundary combines remembered rules, optional `Permissions`, and dynamic `needsApproval` / `Approvals`; `Approved` and `Always` permission answers continue to approval rather than bypassing it. `ApprovalRequested` is emitted before each blocking permission or approval operation, and only `Execute` emits `ToolExecutionStarted`. The built-in `activate_skill` uses the same boundary before Baton executes it over `SkillSource`. Skill activation prospectively validates contributed tools, preserves collision and restore behavior, and publishes its registry only after success. Missing and non-model-invocable skills become declared `DomainFailure` outcomes; malformed input, missing services, inactive tools, and authorization denials become `FrameworkFailure`. Outcomes map to schema-valid tool-result parts (`Success` uses `result` / `encodedResult` with `isFailure: false`; `DomainFailure` uses `failure` / `encodedFailure` with `isFailure: true`) and are re-fed to the model. Framework faults fail the run and never become tool-result parts. Provider-executed parts pass through only as `ModelPart`s.
- Each framework-executed tool runs with a fresh `ToolContext` whose `signal` aborts when the tool/run scope is interrupted, whose `sessionId` is the active `RunOptions.sessionId` or `"local"`, and whose `emit` surfaces progress as `ToolProgress { turn, toolCallId, message?, data? }`. Progress crosses a per-tool bounded Effect `Queue`; `RunOptions.toolProgress` selects `Backpressure`, `Dropping`, `Sliding`, or `Fail` and requires a positive safe-integer capacity. The default is `{ _tag: "Backpressure", capacity: 64 }`. `Backpressure` suspends `emit` interruptibly, `Dropping` discards the newest update, `Sliding` discards the oldest retained update, and `Fail` ends the run with `ProgressOverflowError`. Lossy policies report `{ toolProgress: { dropped } }` in the terminal `ToolExecutionCompleted.metadata` when execution returns a success or tool failure and loss occurred. The queue and execution fiber are scoped and shut down on completion, failure, or downstream cancellation. Retained progress remains FIFO per tool call. Event order for a locally executed tool is `ToolExecutionStarted`, zero or more retained `ToolProgress`, then `ToolExecutionCompleted` or suspension/failure. `ToolProgress` is observational only: it is never added to pending tool results and is never re-fed to the model.
- Tools in the agent's static toolkit execute locally through their handlers. Tools contributed by an activated skill dispatch through `ToolExecutor`; without that service, the run fails with a `missing-handler` `FrameworkFailure`.
- Successful tool outcomes may be bounded before they become tool-result parts. If `RunOptions.toolOutputMaxBytes` is set and `encodedResult` exceeds that byte limit, Baton attempts an optional `ToolOutputStore` spill. A successful spill stores `{ result, encodedResult }` out of context; an absent, declining, or typed-failing store instead keeps a deterministic UTF-8-bounded preview inline. Both cases replace `result` and `encodedResult` with `ToolOutput { inline, outputPaths }` and return the same path list on the bounded success. Store interruption propagates. Inputs already represented by a Baton output envelope preserve their exact ordered paths and are never stored again. Under-limit outputs preserve their full inline result, and failures are never spilled.
- After each turn, `TurnCompleted { turn, transcript, usage?, finishReason? }` is emitted with the full chat history — hosts that persist conversation state read it from here. `usage`/`finishReason` come from that turn's transformed `finish` part when the model reported one.
- If `pendingToolResults` is empty after a turn, the loop emits `Completed { turns, text, transcript, usage? }` and ends — the policy is **not** consulted. `Completed.usage` is the fieldwise cumulative usage across all turns that reported usage.
- Same-process child agents compose through `AgentTool.asTool` and `Handoff.transferTool`; child run errors at a tool boundary become failed tool results, not parent suspensions. `Handoff.fanOut` is not a tool boundary and propagates child run errors.
- If a `Steering` service is present, Baton drains follow-up input at this same would-complete boundary before `Completed` or terminal structured output. Non-empty follow-up emits `SteeringDrained { turn, queue: "followUp", count }` after `TurnCompleted` and starts another normal streamed turn. If follow-up is empty, completion proceeds unchanged. If a terminal structured-output run has queued follow-up input, the structured turn is delayed until follow-ups are exhausted.
- If a `Compaction` service is present, Baton may shrink projected context immediately before a streamed model turn. Proactive compaction requires finite usage/window data; reactive compaction handles a pre-emission context-overflow failure by compacting and retrying the same turn once. If `Compaction` is absent, Baton does not touch `SessionStore` for compaction and current behavior is unchanged.
- In structured mode (`Agent.streamObject` / `Agent.generateObject`), Baton first runs the normal tool loop unchanged. When the loop would otherwise complete, Baton runs one additional terminal structured turn on the same live `Ai.Chat` using `chat.generateObject({ prompt: objectPrompt, schema, objectName, toolChoice: "none" })`. This call runs in its own `Baton.Agent.turn` span at the terminal turn index, as a sibling of the preceding model-turn span under `Baton.Agent.run`. The terminal turn emits `StructuredOutput { turn, value, content }` immediately before `Completed`. `value` is `unknown` in the event union because the union is closed and non-generic; `Agent.generateObject` returns it typed as the caller's schema type. `content` is the raw structured response parts, including any `finish` part. `Completed.text` remains the accumulated normal streamed text; `Completed.transcript` and `Completed.usage` include the structured exchange. No `TurnStarted`, `ModelPart`, or `TurnCompleted` event is emitted for the non-streaming structured turn; it is represented by `StructuredOutput`.
- If `pendingToolResults` is non-empty, the loop evaluates `policy.decide(info)` exactly once. `Continue` selects `overrides` for the next model call: model layer and active tools affect that call, while instructions are prepended once as a system message to its prompt and then retained by `Ai.Chat` in transcript history. If `Steering` is present, Baton drains steering input after the policy continues, emits `SteeringDrained { turn, queue: "steering", count }`, and prepends the drained prompts before the tool-result prompt with `Ai.Prompt.concat`. `Stop { reason: TurnLimit }` fails with `TurnLimitExceeded { turn, limit, pending }`; every other `Stop` fails with `TurnPolicyStopped { turn, reason, pending }`. Pending results remain attached as the complete stop checkpoint and are never silently dropped. A failed policy Effect propagates its exact `TurnPolicyError`, and steering does not bypass a stop.
- The default policy is `TurnPolicy.recurs(8)` (an eight-follow-up-turn cap).
- Built-in policy snapshots describe constructor data only. Hosts must reject an absent or unsupported snapshot instead of silently substituting different policy behavior.

## Usage & telemetry

`AgentEvent.addUsage(a, b)` fieldwise-sums upstream `Ai.Response.Usage` values. Numeric leaves that are absent on both sides stay absent; a value present on either side is summed with the other side treated as zero. Structured-output finish usage contributes to `Completed.usage`; per-turn usage remains on normal `TurnCompleted` events while the structured turn's raw usage remains available in `StructuredOutput.content`.

Baton wraps the whole run stream in an OpenTelemetry span named `Baton.Agent.run` with attribute `baton.agent.name`, and each model turn in `Baton.Agent.turn` with attribute `baton.turn`. Streamed and terminal structured model calls own separate sibling turn spans. When a `finish` part is captured, Baton annotates that model call's turn span with Effect AI GenAI attributes for operation `chat`, reported input/output token totals, and the finish reason. Effect owns each span's lifetime, so success, typed failure, defect, and interruption all close the corresponding turn span with the matching exit.

## Run errors

`Agent.RunError` is the error channel of `Agent.stream` and `Agent.generate`: `AgentError | AgentSuspended | TurnPolicyError | TurnPolicyStopped | TurnLimitExceeded | MiddlewareViolation | ProgressOverflowError | ToolNameCollision | AiError | LanguageModelNotRegistered | FrameworkFailure`. Sole typed model failures are converted to `AgentError`; `AiError` and `LanguageModelNotRegistered` remain in the declared channel because an unchanged compound Cause can retain either branch alongside a defect, interruption, or another failure. These errors keep stable tags, and consumers match typed tags and structured fields rather than diagnostic strings and inspect compound failures at the Cause boundary.

- **`AgentError`** carries `{ message, turn, cause? }` for general loop failures and wrapped external failures. `cause` is an optional `Schema.Defect()` value preserving the live underlying error for host classification.
- Structured-output generation or schema-decoding failures map to `AgentError` at the terminal structured turn index.
- **`AgentSuspended`** carries `{ token, reason, tool_call_id, tool_name, tool_params, authorization_stage?, active_tools?, activated_skills? }` when the run must be resumed out-of-band. Authorization suspension includes its `permission` or `approval` stage and the exact active-tool and activated-skill snapshot. Agent-owned normalization prevents a custom authorizer from replacing or broadening that identity and snapshot.
- **`TurnPolicyError`** carries `{ message, cause? }` when policy evaluation fails. `cause` preserves the specific live cause for host classification.
- **`TurnPolicyStopped`** carries `{ turn, reason, pending }` for successful policy stops other than a configured turn limit. `reason` is the schema-backed `StopReason`; `pending` is the complete array of `{ tool_call_id, tool_name }` waiting at that boundary.
- **`TurnLimitExceeded`** carries `{ turn, limit, pending }` only when `StopReason.TurnLimit` reports actual configured turn-limit exhaustion.
- **`MiddlewareViolation`** carries `{ turn, detail }` for host middleware contract bugs such as dropping a `tool-call` part.
- **`ProgressOverflowError`** carries `{ turn, toolCallId, capacity }` when an explicitly selected `Fail` progress policy cannot retain another update.
- **`ToolNameCollision`** carries `{ name, origins }`, where every ordered origin is `Static { agent }`, `Builtin { builtin: "activate_skill" }`, `Skill { skill }`, or `Handoff { specialist }`. It is schema-backed and is never wrapped as `AgentError`.
- **`FrameworkFailure`** carries `{ stage, tool, message }` when tool input decoding, handler boundaries, output encoding, routing, placement, or authorization fails outside the tool's declared domain failure schema.

## Service seams

- **`ToolExecutor`** — optional override seam. When absent, Baton executes local tool calls through active Effect AI toolkit handlers. When present, `execute(request) => Effect<Outcome, FrameworkFailure | RemoteRetryError>` and `Outcome` is `Success | DomainFailure | Suspend`. Domain failures retain decoded and schema-encoded values; framework failures preserve typed stage evidence. Placement tool parameter decoding and success/failure encoding schemas must be service-free because placement routes execute behind the requirement-closed `ToolExecutor` service; route constructors reject toolkits with schema service requirements at compile time. Client, MCP, sandbox, custom, and non-retry-safe remote routes execute once. Retry-safe remote routes require endpoint deduplication, a stable non-empty operation key, finite non-negative `maxRetries`, and a typed schedule. Only typed placement infrastructure failures are retried; returned `DomainFailure`, defects, interruption, `AgentError`, `FrameworkFailure`, and `RemoteRetryError` are not retried. Exhausted infrastructure failures become placement `FrameworkFailure`; Agent preserves framework failures and maps `RemoteRetryError` to `AgentError` with its typed cause retained.

  Baton evaluates the operation key before every attempt and fails with `RemoteRetryError` before another remote call if the key is empty, missing, or changed. The supplied schedule is bounded by `maxRetries` even when otherwise unbounded. Returned domain outcomes, successful responses, defects, `FrameworkFailure`, `RemoteRetryError`, and interruption are never retried.

- **`ToolContext`** — ambient per-call context available while `ToolExecutor.execute` runs. `ToolContext` carries `{ signal, emit, sessionId }`; the loop provides it around execution, and `layerDefault` provides a standalone never-aborting/no-op context with session `"local"` for direct tests or tools run outside the loop. `emit({ toolCallId, message?, data? })` becomes a `ToolProgress` event for the current turn through the run's bounded per-tool progress queue.
- **`ToolOutputStore`** — optional output spill seam used by `ToolOutput.bound`. `put(toolCallId, content) => Effect<Option<string>, ToolOutputError>` stores overflow and returns `Some(path)` when it spilled or `None` when the store declines; absent stores and `layerNoop` decline spill. The in-memory layer returns `mem:<id>` references and is non-durable. `ToolOutput.bound` returns a non-failing `BoundedSuccess` with `outputPaths`: `[path]` after a successful spill and `[]` after absent, declined, or typed-failed storage. It replaces both `result` and `encodedResult` with `ToolOutput { inline: { truncated: true, bytes, maxBytes, preview }, outputPaths }`; `preview` is a deterministic UTF-8 string no larger than `maxBytes`. The store retains its typed error channel, but this optional boundary recovers `ToolOutputError` only; interruption remains interruption. Rebounding an existing `ToolOutput` envelope returns its original path sequence without another store call.
- **`ToolAuthorization`** — the single final decision boundary. `ToolAuthorizer.authorize(request)` receives exact-turn active membership, the resolved origin-preserving declaration, model messages, and execution identity and returns `Execute | Deny | Suspend`. `Agent.make({ authorization })` accepts a custom authorizer and includes its inferred Effect requirement in the Agent's unified `R`; otherwise the loop adapts optional `Permissions`, `RuleStore`, and `Approvals` services. Agent-owned normalization prevents custom decisions from broadening call identity or resume snapshots.
- **`Permissions`** — optional compatibility policy consulted through `ToolAuthorization` before `ToolExecutor` and before `Ai.Tool.needsApproval` / `Approvals`. `matches(pattern, tool, params)` and `evaluate(ruleset, tool, params)` are pure; `Permissions.evaluate(request)` returns `Allow | Deny | Ask`. `Deny` fails the run with an authorization `FrameworkFailure`; `Ask` emits `ApprovalRequested` and calls `await(pending)`; `Option.none()` suspends. `Approved` and `Always` proceed to `needsApproval`, and `Always` may remember an allow without bypassing tool-declared approval.
- **`Steering`** — optional two-queue live-input seam. `steer(message)` queues input drained after tool results and before the next model turn; `followUp(message)` queues input drained only when the run would otherwise complete. `takeSteering` / `takeFollowUp` are non-blocking, FIFO, and controlled by `DrainMode` (`"all" | "one-at-a-time"`). `Steering.layer` accepts explicit `QueuePolicy` values for bounded capacity and overflow (`"suspend" | "fail" | "drop-newest" | "drop-oldest"`), implemented with Effect `Queue`. Non-empty drains emit `SteeringDrained` events. `Agent.stream` resolves `Steering` optionally so its requirement set does not grow.
- **`Compaction`** — optional context-shrinking seam. `maybeCompact(request)` can return a rebuilt chat history and current prompt before a streamed turn or after a pre-emission overflow. The default strategy checks `contextTokens > contextWindow - reserveTokens`, tries tool-output microcompaction, then summarizes an older session prefix into a checkpoint while keeping the recent suffix verbatim. Ordered strategy parts can independently select bounded tool outputs, token-denominated recent retention, and schema-validated structured summaries while compiling to the same host-decoratable `Strategy`. `Agent.stream` resolves `Compaction`, `SessionStore`, and `Ai.Tokenizer` optionally so its static requirement set does not grow.
- **`Memory`** — recall/remember seam. `recall({ key, turn: 0, prompt })` returns `Memory.Item` values whose `content` is exactly Effect AI `Prompt.UserMessagePart` content to insert into one user message before the first model turn; `itemFromPromptPart` explicitly converts legacy broad parts without reinterpreting protocol content. `remember({ key, turn, transcript, terminal })` records completed turn transcripts. Memory remains ambient when no key is selected. Configuring `RunOptions.memory` or `agent.memory` adds `Memory` to the operation or Agent requirement, and an unsafe caller that omits it fails before the first model call.
- **`Instructions`** — optional ordered baseline context-source registry. `openEpoch(instructions, context)` renders baseline sources once, omits `Option.none()` outputs, joins fragments with blank lines, and retains dynamic sources only for deprecated direct callers. `staticSource(id, text)` builds a baseline source for fixed instructions. `Agent.stream` resolves `Instructions` optionally so its requirement set does not grow and never calls `renderUpdate`. TurnPolicy `Continue.overrides.instructions` is independent: it prepends one system message to the selected follow-up prompt, which `Ai.Chat` retains in transcript history.
- **`SkillSource`** — optional agentskills.io skill source. `all` supplies startup listings; `get(name)` supplies one lazy skill body. `Agent.stream` resolves `SkillSource` optionally so its requirement set does not grow. When present, Baton appends selected listings to the system baseline and handles `activate_skill` tool calls through the same `SkillSource.Interface` that durable hosts such as Relay provide over pinned skill snapshots.
- **`ModelResilience`** — optional model-call retry seam. `classify(error) => "transient" | "terminal"` sees a typed provider failure before Baton wraps or stringifies it; defects, interruption, and compound Causes bypass classification unchanged. `retrySchedule` controls retries. `defaultClassify` treats retryable `Ai.AiError` values as transient and everything else as terminal. `none` disables retry, `make`/`layer` build policies, `testLayer` swaps exact behavior in tests, and `apply(model, policy)` wraps `streamText`, `generateText`, and `generateObject`. `Agent.stream` resolves this service optionally so its requirement set does not grow.
- **`Approvals`** — optional enforcement point for `Ai.Tool.needsApproval`, which `effect/unstable/ai` declares but never enforces for Baton's disabled tool-resolution loop. `check(request) => Effect<Decision>` where `Decision` is `Approved | Denied | Pending`. `needsApproval: true` gates the call; `false` or `undefined` does not. A `NeedsApprovalFunction` is evaluated with the actual call params and `{ toolCallId, messages }`; a thrown exception, failure, or defect fails closed by treating the call as gated. Tools without an approval requirement never touch the service. If a gated call needs approval and `Approvals` is absent, or if it returns `Denied`, Baton fails with an authorization `FrameworkFailure`; `Pending` suspends the run.
- **`TurnPolicy<R>`** — a plain value carried by the agent (like `Schedule` values), not a service. `decide(info) => Effect<Decision, TurnPolicyError, R>` with per-turn `overrides` on `Continue`. `R` is part of `Agent<..., R>` and every run function's requirements. `Decision.Stop` carries one schema-backed `StopReason`: `TurnLimit { limit }`, `GoalSatisfied`, `BudgetExhausted { budget }`, or `Policy { detail }`. Built-ins remain requirement-free. `fromLegacy` is a deprecated migration adapter that maps a reasonless legacy stop to `Policy { detail: "Legacy policy stopped" }`.
- **`ModelRegistry`** — selected model operations run through `operate(selection, effect)` or `stream(selection, stream)`. Both build the registered model layer and hold an optional semaphore permit around actual use. `stream` keeps the layer scope and permit until stream exit rather than only until stream construction. `provide` remains a deprecated source-compatible alias of `operate` until a separately planned major release under ADR-0024.

## Model middleware

`ModelMiddleware` (`model-middleware.ts`) is the interceptor seam for everything that goes **into** or comes **out of** the model. It is where PII scrubbing, prompt-injection screening, output filtering, and prompt logging plug in without forking the loop. Baton ships the seam, an identity default, and `Guardrail` middleware combinators only — no model-judge guardrails or detection heuristics.

- **Service** — `ModelMiddleware` holds a `ReadonlyArray<Middleware>` (the chain), applied in array order. If the service is absent, Baton uses the empty chain. `layerIdentity` is available for explicit composition and tests; the deprecated `identityLayer` compatibility alias remains under ADR-0024. `layer(middleware)` provides an explicit chain. `Agent.stream` / `Agent.generate` do not require `ModelMiddleware` unless a caller chooses to provide it.
- **A `Middleware`** has two optional hooks; an omitted hook is identity:
  - `transformPrompt(prompt, context) => Effect<Ai.Prompt.Prompt, AgentError>` — transform the prompt for a turn before it is sent to the model. Runs for both the initial turn and every follow-up (`Ai.Prompt.fromResponseParts(...)`) turn.
  - `transformPart(part, context) => Effect<Option<Ai.Response.StreamPart>, AgentError>` — transform or drop a single model stream part before the loop processes it. `Option.none()` drops the part: it is not folded, not emitted as `ModelPart`, not persisted.
  - `context` is `TurnContext { agentName, turn }` (0-based turn).
- **Ordering** — `transformPrompt` hooks run in array order (`m2(m1(prompt))`). `transformPart` hooks run in array order; the first hook that returns `Option.none()` short-circuits — remaining hooks are skipped and the part is dropped.
- **Tool-call-drop prohibition** — `tool-call` parts may be transformed but MUST NOT be dropped. Dropping a tool-call is a middleware bug; the loop fails the run with `MiddlewareViolation { turn, detail }`.
- **Error semantics** — a hook that fails on the error channel fails the whole run with that `AgentError` (middleware are host bugs, not model failures). A `transformPrompt` failure fails the turn **before** the model is called — no model call happens.
- **Placement and authority** — middleware runs once **before** the fold that dispatches tool calls and accumulates text and before Chat history mutation. Middleware sees raw model output; the resulting ordered transformed response is the sole source for `AgentEvent`s, tool dispatch, Chat history, persistence, memory, Session synchronization, and compaction. Dropped parts reach none of those consumers. Rewritten tool-call identifiers are therefore shared by dispatch, subsequent tool results, and every transcript projection. Chat commits the transformed parts pulled from the stream exactly once when that stream scope closes, including typed failure, defect, interruption, and downstream early termination; it never independently commits the raw model stream.
- **Structured output** — `transformPrompt` applies to the terminal `objectPrompt` with the structured turn index. `transformPart` does not apply to the structured response because the terminal turn uses non-streaming `chat.generateObject`; consumers observe that response via `StructuredOutput.content`.

### Guardrails

`Guardrail` (`guardrail.ts`) exports typed combinators that return plain `ModelMiddleware.Middleware` values and compose through `ModelMiddleware.layer([...])` in the same array order as any other middleware. They add no new service, ordering rule, or loop state.

- `validateInput(check)` runs in `transformPrompt`. `check(prompt, context)` returns `Effect<Option<string>>`; `None` allows the prompt unchanged, and `Some(reason)` blocks the run with `AgentError { turn: context.turn }` before the model is called.
- `redactInput({ pattern, replacement? })` rewrites text-bearing prompt fields before the model sees them. It redacts system message content, prompt text parts, reasoning text, and tool approval-response reasons; it leaves file data, tool-call params, tool-result payloads, identifiers, and provider options unchanged.
- `redactOutput({ pattern, replacement? })` rewrites streamed `text-delta.delta` values before they are folded, emitted, or persisted. It is per-part and does not detect matches split across stream chunks.
- `filterOutput(keep)` runs in `transformPart` and returns `Option.none()` for non-tool parts when `keep(part, context)` is false. Tool-call parts are never dropped by this combinator, preserving tool execution and avoiding accidental middleware violations.
- Output guardrails do not apply to the terminal structured-output response because that path is non-streaming; `StructuredOutput.content` is emitted as returned by upstream `chat.generateObject`.

## Suspension contract

The run suspends by failing the stream with `AgentSuspended` on the error channel:

- a `ToolExecutor` outcome of `Suspend { token }` fails with `AgentSuspended { token, reason: "tool-wait", tool_call_id, tool_name, tool_params }`;
- an `Approvals` decision of `Pending { token }`, or a permission `Ask` whose `await` returns `Option.none()`, fails with `AgentSuspended { token, reason: "approval", ... }`.

The run did NOT finish; the host resolves `token` out-of-band and re-enters via `RunOptions.resume` with the pending call. For authorization suspension the host also copies `token`, `authorization_stage`, `active_tools`, and `activated_skills` to the corresponding `Resume` fields; the transport registry does this automatically. Baton rehydrates listed selected-skill tools before authorization, rejects name collisions, derives the sole unresolved call and its original model-input message prefix from the checkpoint, requires the supplied call assertion to match its id, name, and params, and authorizes only within the captured active set. The transport routes the client decision to a one-shot `Permissions.await` or `Approvals.check` override according to the captured stage. A permission-stage resume consumes the captured answer even when live policy or remembered rules have since changed to allow; a current deny may still short-circuit, while a missing answer source re-suspends with the original token. A permission approval then continues through `needsApproval` with the original message context; a later approval-stage resume resolves the already-required approval without re-evaluating either permissions or the dynamic predicate. This prevents changed policy, rules, checkpoint context, or either answer from consuming or bypassing the other stage, including remembered asks without a backing `Permissions` service. On resume, the initial model call is skipped: the resumed call resolves authorization first, its tool-result part becomes the pending result of pseudo-turn 0, `TurnCompleted` is emitted with the current transcript, and the loop proceeds through the normal policy-gated follow-up turns. `Agent.stream` emits a trailing `TurnCompleted { transcript, usage?, finishReason? }` before re-failing with `AgentSuspended`, so a durable host can persist the finalized transcript. That suspension transcript is a provider-valid resumable checkpoint: it includes every sibling tool result completed before suspension exactly once in call order and leaves only the suspending call unresolved. Resuming appends that call's result without re-executing completed siblings.

Before resume dispatch, Baton restores successful prior `activate_skill` results from the supplied or persisted transcript in transcript order. It resolves each skill through the current `SkillSource`, revalidates its contributed tools, and restores the checkpointed body without evaluating `Skill.body` again. Resuming an activated-skill tool therefore requires the same compatible `SkillSource`; missing skills or new collisions fail before dispatch.

Interrupting the fiber running `Agent.stream` is the v1 abort primitive. The current model stream and scoped tool executions are interrupted by Effect. Baton does not clear `Steering` queues on interruption; undrained messages remain in the service layer.

## Chat persistence

`SessionStore` is an ambient optional service and is not added to an Agent requirement. `Agent.stream` continues to construct and operate on `Ai.Chat`; `Session` is a standalone seam for compaction and host adapters.

`RunOptions.sessionId` is an opaque host-assigned identity for the active run/session. It defaults to `"local"` and is threaded into `ToolExecutor.Request`, `Approvals.Request`, and `ToolContext.sessionId`. `RunOptions.toolOutputMaxBytes` is an optional non-negative finite byte limit for successful tool-result `encodedResult` values; invalid values fail before the first model call with `AgentError`. Oversized results are bounded whether storage succeeds, declines, fails, or is absent. `RunOptions.toolProgress` is an optional `ProgressOverflowPolicy`; omitting it migrates the former implicit unbounded queue to bounded backpressure with capacity 64. Selecting `Dropping` or `Sliding` is explicitly lossy and records dropped-update counts on terminal tool metadata when execution returns a success or tool failure; suspension, execution-channel failure, and downstream cancellation do not emit that completion metadata. Selecting `Fail` surfaces typed overflow instead of dropping.

Baton's loop builds its `Ai.Chat` internally and discards it when the run ends, so a standalone Baton app has no conversation continuity between runs. Baton adds exactly one seam — a way to run the loop on a **persisted** chat instead of a fresh one — and delegates all storage to `effect/unstable/ai`'s `Chat.Persistence` primitive. Baton adds **no** `BackingPersistence` implementation, store schema, or package; consumers provide upstream layers (`Chat.layerPersisted({ storeId })` over a `BackingPersistence` layer such as `Persistence.layerBackingMemory` or `Persistence.layerBackingSql`).

**Contract.** `PersistedRunOptions.persistence` is `{ readonly chatId: string; readonly timeToLive?: Duration.Input }` (`@experimental`). `Agent.persisted`, `Agent.persistedObject`, `Agent.generatePersisted`, and `Agent.generatePersistedObject` execute on the chat identified by `chatId`, which is created on first use and accumulates history across runs. Their environments add `Chat.Persistence`. Ordinary run options reject persistence, and persisted options reject `history`.

**Chat-construction decision table** (replaces the unconditional `Chat.fromPrompt`):

| Entrypoint | Chat construction                                               |
| ---------- | --------------------------------------------------------------- |
| ordinary   | Fresh `Chat.fromPrompt([system])`, `history` verbatim, or empty |
| persisted  | `Chat.Persistence.getOrCreate(chatId, { timeToLive })`          |

**System-message seeding.** On a persisted chat, inspect `yield* Ref.get(chat.history)`. If the history is empty, prepend Baton's system message by including it in the **first turn's** prompt (`Ai.Prompt.fromMessages([system, ...user])`). If the history is non-empty, do **not** re-add the system message — it is already stored from the first run. This keeps stored history self-contained and prevents duplicate system messages accumulating run over run.

**Save points.** Each streamed turn commits its authoritative transformed response to Chat and then saves a persisted Chat when the stream scope closes. Baton additionally issues one explicit `chat.save` in two places: (a) after the final turn, before emitting `Completed`; (b) before propagating `AgentSuspended`, so a suspended conversation's history — including the pending transformed tool call — survives to the resume. Raw model parts are never saved through a competing Chat stream path. `PersistenceError`/`AiError` from explicit `save` or `getOrCreate` map to `AgentError` with the cause message and `cause` value.

**Mutual exclusivity.** `RunOptions.history` belongs only to ordinary runs and persistence belongs only to persisted runs. TypeScript rejects combining them. The internal loop retains defensive validation for JavaScript and unsafe callers. `ChatNotFoundError` cannot occur because Baton uses `getOrCreate`.

## Required and ambient services

Requirements selected by configuration are visible in `Agent<Tools, R>` or the selected operation: direct or selected models, configured or run-specific memory, static tool handlers and their services, schema decoding services, and persisted chat execution. `Agent.provideModel` discharges only `LanguageModel` and adds the supplied model layer's requirements.

Services whose behavior is intentionally enabled only when they are ambiently available remain optional and do not grow `R`: `Approvals`, `Compaction`, `Instructions`, `ModelMiddleware`, `ModelResilience`, `Permissions`, `SessionStore`, `SkillSource`, `Steering`, `Tokenizer`, `ToolExecutor`, and `ToolOutputStore`.

## Integrations

- **MCP** arrives via `@batonfx/mcp`, not Baton core. The `@batonfx/mcp/baton` `route` acquires one scoped connection and returns `BatonTools`: the `Ai.Tool.dynamic` toolkit Baton consumes as-is plus a ready-to-provide `ToolExecutor` layer that proxies calls to the same server. Each `tools/call` passes the fiber's `AbortSignal` and the optional configured `callTimeout` as SDK `RequestOptions`, so interrupting a run aborts the in-flight request and a hung server cannot wedge the loop. Connection failures stay typed on route acquisition; MCP call errors become structured failed tool results so the Agent can continue. Baton core keeps its `effect`-only dependency rule; the MCP SDK dependency lives entirely in `@batonfx/mcp`.
- **Transport** arrives via `@batonfx/transport`, not Baton core. It converts `AgentEvent` streams into replayable wire frames and owns an in-process `SessionRegistry`; durable registries remain host-side.

## Composing with a durable runtime

Baton is designed to be composed behind a durable runtime's own agent-loop interface: Baton owns turn iteration, tool-dispatch ordering, tool-result re-feed, the turn cap, and an optional model-call retry seam; the durable host owns everything durable (sequence allocation, an execution-event fold, prompt assembly, structured output, blob/artifact stores). The host provides the `ToolExecutor`, `Approvals`, optional `ToolOutputStore`, optional `ModelResilience`, `ModelMiddleware`, and `LanguageModel` seams per run and folds Baton's `AgentEvent` stream into its own durable events. The reference composition is [Relay](https://github.com/In-Time-Tec/relayfx); its host-side wiring, retry policy selection, blob store, and event fold live in that repository, not here.

## Related docs

- `docs/spec/decisions/ADR-0001-baton-standalone-agent-framework.md`
- `docs/spec/decisions/ADR-0002-tool-context-output-spill.md`
- `docs/spec/decisions/ADR-0003-model-resilience.md`
- `docs/spec/decisions/ADR-0004-guardrail-combinators.md`
- `docs/spec/decisions/ADR-0005-session-event-log.md`
- `docs/spec/decisions/ADR-0006-instructions-context-epoch.md`
- `docs/spec/decisions/ADR-0007-permissions-policy-seam.md`
- `docs/spec/decisions/ADR-0008-steering-and-run-interrupts.md`
- `docs/spec/decisions/ADR-0009-compaction-strategy-seam.md`
- `docs/spec/decisions/ADR-0010-adopt-agentskills-standard.md`
- `docs/spec/decisions/ADR-0011-provider-registration-helpers.md`
- `docs/spec/decisions/ADR-0012-model-metadata-catalog.md`
- `docs/spec/decisions/ADR-0024-public-api-import-and-layer-conventions.md`
- `docs/spec/decisions/ADR-0025-authoritative-transformed-response.md`
- `docs/spec/decisions/ADR-0027-memory-item-user-content.md`
- `docs/spec/decisions/ADR-0028-scoped-mcp-baton-tools.md`
- `docs/spec/decisions/ADR-0030-effectful-turn-policy-stop-reasons.md`
- `docs/spec/decisions/ADR-0033-truthful-agent-requirements.md`
- `docs/spec/decisions/ADR-0034-tool-domain-and-framework-failures.md`
- `docs/spec/decisions/ADR-0035-unified-tool-authorization.md`
- `docs/spec/02-session-event-log.md`
- `docs/spec/03-instructions-and-context-epoch.md`
- `docs/spec/04-permissions-policy.md`
- `docs/spec/05-steering-and-interrupts.md`
- `docs/spec/06-compaction.md`
- `docs/spec/07-skills.md`
- `docs/spec/08-providers.md`
- `docs/spec/09-memory.md`
- `docs/spec/10-multi-agent.md`
- `docs/spec/11-transport.md`
- `docs/spec/16-mcp-baton-tools.md`
- `README.md`
