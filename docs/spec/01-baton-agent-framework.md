# 01 — Baton Agent Framework

Baton (`@batonfx/core`, directory `packages/core`) is a standalone, **non-durable**, Effect-native agent loop over `effect/unstable/ai`. Baton is the agent; a durable runtime such as [Relay](https://github.com/In-Time-Tec/relayfx) is the durable race it runs in. Use Baton alone when you just need an agent or chat streaming; compose it with a durable runtime when you need durability.

Baton is the _Effect_ version of an agent framework, not a port of AI SDK/Mastra vocabulary. Payload vocabulary is `Ai.Prompt`/`Ai.Response` from `effect/unstable/ai` — Baton adds loop framing only, no second wire format. `@batonfx/core` directly re-exports selected Effect AI modules (`Tool`, `Toolkit`, `LanguageModel`, `Prompt`, `Response`, `Chat`, `Tokenizer`, and related modules) as identity-preserving convenience exports; those values remain owned by Effect AI.

Compatibility: this spec is tested against `effect` and `@effect/vitest` `4.0.0-beta.93`.

## Agent definition defaults

`Agent.make(name, options)` and the object form build a plain agent definition value with these defaults:

```ts
type AgentOptions = {
  readonly instructions?: string
  readonly toolkit?: Toolkit.Toolkit<any>
  readonly policy?: TurnPolicy.TurnPolicy
  readonly model?: ModelRegistry.ModelSelection
  readonly memory?: Memory.Key
  readonly metadata?: Readonly<Record<string, unknown>>
}
```

`toolkit` is an Effect AI `Toolkit`; Baton does not introduce another tool definition model. `policy` defaults to `TurnPolicy.recurs(8)`. `model`, `memory`, and `metadata` are data carried by the agent definition so standalone Baton apps and durable hosts can reuse one coherent authoring shape. Durable hosts persist their own explicit projection; an Agent value contains runtime objects and is not itself a serialization format.

Built-in turn policies expose optional inert constructor data through `TurnPolicy.snapshot`:

```ts
type Snapshot =
  | { readonly _tag: "Recurs"; readonly count: number }
  | { readonly _tag: "UntilToolCall"; readonly name: string }
  | { readonly _tag: "Both"; readonly first: Snapshot; readonly second: Snapshot }
```

`recurs` with a finite count and `untilToolCall` carry their corresponding snapshot. Non-finite recurrence counts keep their existing standalone behavior but carry no snapshot because JSON cannot preserve them. `both` carries a snapshot only when both operands do. `make(decide)` is deliberately opaque and carries none. The snapshot is descriptive data for hosts that choose a supported durable projection; Baton never serializes decision closures, Effects, Layers, or services, and the snapshot does not participate in standalone policy evaluation.

When `agent.model` is present, streamed and generated runs resolve the selected model through `ModelRegistry`. If the registry is absent, the run fails before the first model call with a typed `AgentError`. Per-turn `TurnPolicy` model overrides still take precedence for the affected turn.

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

Baton does not own (deferred, see ADR-0001): UI helpers, concrete memory implementations, evals, model-judge guardrails or detection heuristics, durable/addressable multi-agent, or durability of any kind. Baton owns same-process **AgentTool** and **Handoff** helpers for in-process multi-agent composition. Baton owns ergonomic **Guardrail** combinators over `ModelMiddleware`, but no separate guardrail subsystem. Baton owns a standalone **Instructions** registry, a **Memory** seam, and **Session** event-log seam, but no filesystem context loaders, memory stores, skills catalog source, or durable/addressable session implementation. Baton owns a **chat persistence seam** (`RunOptions.persistence`, see below) but no persistence _implementation_ — consumers provide upstream `Chat.Persistence` layers. Baton also owns a non-durable **tool output spill seam** (`ToolOutputStore`, see below); durable blob stores remain host-side.

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

| Module                | Export namespace  | Purpose                                                                                                   |
| --------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| `agent.ts`            | `Agent`           | Agent definition value, `make`, text `stream`/`generate`, and structured `streamObject`/`generateObject`. |
| `agent-event.ts`      | `AgentEvent`      | Closed union of loop events, including `StructuredOutput`, plus tagged run errors.                        |
| `agent-tool.ts`       | `AgentTool`       | Expose same-process child agents as handled Effect AI toolkits.                                           |
| `approvals.ts`        | `Approvals`       | Enforcement point for `Ai.Tool.needsApproval`; `autoApprove`, `denyAll`, and `testLayer`.                 |
| `compaction.ts`       | `Compaction`      | Optional context-shrinking strategy seam and default two-stage compaction implementation.                 |
| `guardrail.ts`        | `Guardrail`       | Ergonomic input/output guardrail combinators that produce `ModelMiddleware.Middleware` values.            |
| `handoff.ts`          | `Handoff`         | Transfer tools, supervisor construction, and bounded same-process fan-out.                                |
| `instructions.ts`     | `Instructions`    | Ordered baseline context-source registry, context epoch opener, and test layer.                           |
| `memory.ts`           | `Memory`          | Optional recall/remember seam for per-run long-term memory integration.                                   |
| `model-middleware.ts` | `ModelMiddleware` | Interceptor seam for model input (prompt) and output (stream parts); `layerIdentity` default.             |
| `model-registry.ts`   | `ModelRegistry`   | Provider-agnostic `LanguageModel` registration/selection.                                                 |
| `model-resilience.ts` | `ModelResilience` | Optional retry seam for model-call failures inside the loop.                                              |
| `permissions.ts`      | `Permissions`     | Optional allow/deny/ask policy seam for local tool calls before execution and tool-declared approvals.    |
| `session.ts`          | `Session`         | Append-only session event-log seam, memory layer, and pure `buildContext` projector.                      |
| `skill-source.ts`     | `SkillSource`     | Optional agentskills.io skill listing and lazy body source seam.                                          |
| `steering.ts`         | `Steering`        | Optional two-queue live-input seam for steering and follow-up prompts plus test layer.                    |
| `tool-context.ts`     | `ToolContext`     | Per-tool-call ambient context: abort signal, progress emitter, and session identity.                      |
| `tool-executor.ts`    | `ToolExecutor`    | Optional tool-call execution seam; local toolkit adapter, placement route constructors, and `testLayer`.  |
| `tool-output.ts`      | `ToolOutput`      | Optional spill seam for oversized successful tool outputs.                                                |
| `turn-policy.ts`      | `TurnPolicy`      | Schedule-inspired turn continuation values plus portable snapshots for built-in policies.                 |

Module conventions: consumers import module namespaces from `@batonfx/core`; services use the `Service`/`Interface`/`layer`/`testLayer` pattern and noun-after-`layer` variants such as `layerMemory`, `layerNoop`, and `layerIdentity`. Superseded names remain deprecated aliases under ADR-0024. Every exported symbol carries an `@experimental` JSDoc tag; errors are `Schema.TaggedErrorClass`; no `Date.now()` anywhere (callers pass timestamps if ever needed — v1 needs none).

## Turn semantics

- Turn 0 always runs (it is the initial model call; the policy is never consulted for it).
- When an `Instructions` service is present and neither `options.system` nor `options.history` is set, Baton opens a context epoch at `{ agentName, turn: 0 }` and uses its non-empty baseline as the system message. Absent `Instructions`, explicit `options.system`, and explicit `options.history` preserve the previous system-message behavior. Baton does not render or inject dynamic instruction updates. The deprecated `Instructions.renderUpdate` export is a compatibility utility for hosts that own transcript insertion and persistence; it is not part of the Agent loop contract.
- When a `SkillSource` service is present and `options.history` is absent, Baton appends token-budgeted selected skill listings to the first-turn system baseline and advertises the built-in `activate_skill` tool. The listing budget is applied through `SkillSource.selectListings`; skill bodies are not read at startup. Absent `SkillSource`, system-message and toolkit derivation are unchanged.
- When `RunOptions.memory` or `agent.memory` is set and `Memory` is present, Baton recalls once before non-resume turn 0. Recalled `Memory.Item.content` values contain only Effect AI user-message parts, become one user message inserted after an initial system message and before the run prompt, and require no runtime part-kind narrowing. All-empty item content inserts no message. Recall occurs before model middleware. After each completed streamed turn, Baton remembers the full transcript with `terminal` indicating whether the run would otherwise complete. Suspension does not remember at the suspension point; resumed completed turns remember normally.
- Before each model turn calls the active `LanguageModel`, Baton resolves `ModelResilience` optionally. If absent, model-call behavior is unchanged. If present, Baton wraps the active `Ai.LanguageModel.Service` for that turn, including any per-turn `TurnPolicy` model override. Streaming retry is allowed only while the attempted model call has emitted no parts. Once any part is emitted, the turn is never re-run; a later typed stream failure becomes one `error` part and then follows the normal `AgentError` path. Interruption is never converted into an `error` part: a cancelled or timed-out model stream propagates its interrupt cause so the run is cancelled, not failed. Provider-emitted in-band `error` parts are normal stream parts and are not classified or retried.
- Every model stream part that survives `ModelMiddleware` is part of one ordered authoritative response. Baton emits it as `ModelPart { turn, part }`, uses it for text accumulation and tool dispatch, and commits that same transformed sequence to Chat history. Text is accumulated from authoritative `text-delta` parts across all turns into `Completed.text`. Authoritative `finish` parts also flow through as `ModelPart`s.
- Framework-executed `tool-call` stream parts (`providerExecuted !== true`) are executed sequentially in stream order: local calls run optional `Permissions` policy first, approval gating next (when the tool declares `needsApproval`), then execution. The built-in `activate_skill` tool uses the same gates, then Baton handles execution over `SkillSource` instead of delegating to `ToolExecutor`. Skill activation resolves `SkillSource.get(name)`, evaluates the lazy body, adds contributed `Skill.tools` to the active toolkit, and returns a successful tool result containing `{ name, body, allowedTools }`; that tool result is re-fed to the next model turn like any other pending tool result. Permission `Allow` continues to the existing approval path, `Deny` re-feeds a failed tool result without starting execution, and `Ask` emits `ApprovalRequested` and either receives an in-process answer or suspends with `AgentSuspended { reason: "approval" }`. Outcomes map to tool-result parts (`Success` → `isFailure: false`, `Failure` → `isFailure: true` with `{ error: message }`) that are collected as the turn's `pendingToolResults` and re-fed to the model on the next turn. Provider-executed `tool-call` parts (`providerExecuted === true`) and their provider `tool-result` parts pass through only as `ModelPart`s; Baton never gates, dispatches, or pends them.
- Each framework-executed tool runs with a fresh `ToolContext` whose `signal` aborts when the tool/run scope is interrupted, whose `sessionId` is the active `RunOptions.sessionId` or `"local"`, and whose `emit` surfaces progress as `ToolProgress { turn, toolCallId, message?, data? }`. Event order for a locally executed tool is `ToolExecutionStarted`, zero or more `ToolProgress`, then `ToolExecutionCompleted` or suspension/failure. `ToolProgress` is observational only: it is never added to pending tool results and is never re-fed to the model.
- Tools in the agent's static toolkit execute locally through their handlers. Tools contributed by an activated skill dispatch through `ToolExecutor`; without that service, the call returns a visible failed tool result.
- Successful tool outcomes may be bounded before they become tool-result parts. If `RunOptions.toolOutputMaxBytes` is set, `encodedResult` exceeds that byte limit, and a `ToolOutputStore` is present and chooses to store the overflow, Baton stores `{ result, encodedResult }` out of context and replaces both `result` and `encodedResult` with `ToolOutput { inline, outputPaths }`. Absent/no-op stores and under-limit outputs preserve today's full inline result exactly. Failures are never spilled.
- After each turn, `TurnCompleted { turn, transcript, usage?, finishReason? }` is emitted with the full chat history — hosts that persist conversation state read it from here. `usage`/`finishReason` come from that turn's transformed `finish` part when the model reported one.
- If `pendingToolResults` is empty after a turn, the loop emits `Completed { turns, text, transcript, usage? }` and ends — the policy is **not** consulted. `Completed.usage` is the fieldwise cumulative usage across all turns that reported usage.
- Same-process child agents compose through `AgentTool.asTool` and `Handoff.transferTool`; child run errors at a tool boundary become failed tool results, not parent suspensions. `Handoff.fanOut` is not a tool boundary and propagates child run errors.
- If a `Steering` service is present, Baton drains follow-up input at this same would-complete boundary before `Completed` or terminal structured output. Non-empty follow-up emits `SteeringDrained { turn, queue: "followUp", count }` after `TurnCompleted` and starts another normal streamed turn. If follow-up is empty, completion proceeds unchanged. If a terminal structured-output run has queued follow-up input, the structured turn is delayed until follow-ups are exhausted.
- If a `Compaction` service is present, Baton may shrink projected context immediately before a streamed model turn. Proactive compaction requires finite usage/window data; reactive compaction handles a pre-emission context-overflow failure by compacting and retrying the same turn once. If `Compaction` is absent, Baton does not touch `SessionStore` for compaction and current behavior is unchanged.
- In structured mode (`Agent.streamObject` / `Agent.generateObject`), Baton first runs the normal tool loop unchanged. When the loop would otherwise complete, Baton runs one additional terminal structured turn on the same live `Ai.Chat` using `chat.generateObject({ prompt: objectPrompt, schema, objectName, toolChoice: "none" })`. This call runs in its own `Baton.Agent.turn` span at the terminal turn index, as a sibling of the preceding model-turn span under `Baton.Agent.run`. The terminal turn emits `StructuredOutput { turn, value, content }` immediately before `Completed`. `value` is `unknown` in the event union because the union is closed and non-generic; `Agent.generateObject` returns it typed as the caller's schema type. `content` is the raw structured response parts, including any `finish` part. `Completed.text` remains the accumulated normal streamed text; `Completed.transcript` and `Completed.usage` include the structured exchange. No `TurnStarted`, `ModelPart`, or `TurnCompleted` event is emitted for the non-streaming structured turn; it is represented by `StructuredOutput`.
- If `pendingToolResults` is non-empty, the loop calls `policy.decide(info)`. `Continue` selects `overrides` for the next model call: model layer and active tools affect that call, while instructions are prepended once as a system message to its prompt and then retained by `Ai.Chat` in transcript history. If `Steering` is present, Baton drains steering input after the policy continues, emits `SteeringDrained { turn, queue: "steering", count }`, and prepends the drained prompts before the tool-result prompt with `Ai.Prompt.concat`. `Stop` fails the stream with `TurnLimitExceeded { turn, pending }` — pending results are never silently dropped, and steering does not bypass the policy cap.
- The default policy is `TurnPolicy.recurs(8)` (an eight-follow-up-turn cap).
- Built-in policy snapshots describe constructor data only. Hosts must reject an absent or unsupported snapshot instead of silently substituting different policy behavior.

## Usage & telemetry

`AgentEvent.addUsage(a, b)` fieldwise-sums upstream `Ai.Response.Usage` values. Numeric leaves that are absent on both sides stay absent; a value present on either side is summed with the other side treated as zero. Structured-output finish usage contributes to `Completed.usage`; per-turn usage remains on normal `TurnCompleted` events while the structured turn's raw usage remains available in `StructuredOutput.content`.

Baton wraps the whole run stream in an OpenTelemetry span named `Baton.Agent.run` with attribute `baton.agent.name`, and each model turn in `Baton.Agent.turn` with attribute `baton.turn`. Streamed and terminal structured model calls own separate sibling turn spans. When a `finish` part is captured, Baton annotates that model call's turn span with Effect AI GenAI attributes for operation `chat`, reported input/output token totals, and the finish reason. Effect owns each span's lifetime, so success, typed failure, defect, and interruption all close the corresponding turn span with the matching exit.

## Run errors

`Agent.RunError` is the error channel of `Agent.stream` and `Agent.generate`: `AgentError | AgentSuspended | TurnLimitExceeded | MiddlewareViolation`. `AgentError` keeps the stable tag `@batonfx/core/AgentError`; `AgentSuspended` keeps the stable tag `@batonfx/core/AgentSuspended`. Consumers match typed tags and structured fields rather than diagnostic strings.

- **`AgentError`** carries `{ message, turn, cause? }` for general loop failures and wrapped external failures. `cause` is an optional `Schema.Defect()` value preserving the live underlying error for host classification.
- Structured-output generation or schema-decoding failures map to `AgentError` at the terminal structured turn index.
- **`AgentSuspended`** carries `{ token, reason, tool_call_id, tool_name, tool_params }` when the run must be resumed out-of-band.
- **`TurnLimitExceeded`** carries `{ turn, pending }` when the policy stops while tool results are pending. `pending` is an array of `{ tool_call_id, tool_name }`.
- **`MiddlewareViolation`** carries `{ turn, detail }` for host middleware contract bugs such as dropping a `tool-call` part.

## Service seams

- **`ToolExecutor`** — optional override seam. When absent, Baton executes local tool calls through the active Effect AI toolkit handlers supplied by `Toolkit.toLayer(...)`. When present, `execute(request) => Effect<Outcome, AgentError | RemoteRetryError>` where `request` includes `{ call, turn, agentName, sessionId }` and `Outcome` is `Success | Failure | Suspend`; this override remains the durable-host and remote-tool seam. `fromToolkit` still adapts an already handled toolkit for advanced composition. `route`, `routeToolkit`, and `router` compose placement routes by Effect AI tool-call name without adding a second tool definition model; unmatched calls return a failed tool outcome. `client`, `remote`, `mcp`, and `sandbox` are thin named route constructors over the same Effect AI toolkit definitions. Placement calls receive the original `Tool` value and must return `Success | Failure | Suspend`; successful placement results are decoded and encoded against the tool's existing `success` schema before Baton re-feeds them to the model. `client`, `mcp`, `sandbox`, custom `route` values, and a default or `retrySafe: false` `remote` route execute once and have no framework retry. A legacy `schedule` on a non-retry-safe remote route is ignored so it cannot silently repeat a remote operation.

  Whole-operation remote retries require `retrySafe: true`, an `operationKey(request)` function, a non-negative finite integer `maxRetries`, and a `schedule` whose input is the route executor's typed infrastructure failure. The remote executor receives the resulting non-empty `operationKey`; its endpoint contract must atomically deduplicate committed operations by that key. Baton evaluates the key before every attempt and fails with `RemoteRetryError` before another remote call if the key is empty, missing at runtime, or differs from the first attempt's key. Baton combines the supplied schedule with `maxRetries` through Effect's retry options, so even an otherwise unbounded schedule cannot exceed that explicit retry count. Only typed failures from the placement executor are retried. Returned domain `Failure` outcomes, successful responses, defects, framework `RemoteRetryError` values, and interruption are never retried. The Agent loop maps a `RemoteRetryError` from an override into `AgentError` with the typed error retained as `cause`, preserving the closed run-error contract.

- **`ToolContext`** — ambient per-call context available while `ToolExecutor.execute` runs. `ToolContext` carries `{ signal, emit, sessionId }`; the loop provides it around execution, and `layerDefault` provides a standalone never-aborting/no-op context with session `"local"` for direct tests or tools run outside the loop. `emit({ toolCallId, message?, data? })` becomes a `ToolProgress` event for the current turn.
- **`ToolOutputStore`** — optional output spill seam used by `ToolOutput.bound`. `put(toolCallId, content) => Effect<Option<string>, ToolOutputError>` stores overflow and returns `Some(path)` when it spilled or `None` when the store declines; absent stores and `layerNoop` decline spill. The in-memory layer returns `mem:<id>` references and is non-durable. When spilling, Baton replaces both `result` and `encodedResult` with `ToolOutput { inline: { truncated: true, bytes, maxBytes, preview }, outputPaths: [path] }`; `preview` is a UTF-8 bounded string from the serialized encoded result.
- **`Permissions`** — optional policy seam consulted for every local framework-executed tool call before `ToolExecutor` and before `Ai.Tool.needsApproval` / `Approvals`. `matches(pattern, tool, params)` and `evaluate(ruleset, tool, params)` are pure; `Permissions.evaluate(request)` returns `Allow | Deny | Ask`. `Deny` becomes a failed tool result, `Ask` emits `ApprovalRequested` and calls `await(pending)`, and `Option.none()` from `await` suspends through the existing approval suspension path. If absent, Baton behaves exactly as before.
- **`Steering`** — optional two-queue live-input seam. `steer(message)` queues input drained after tool results and before the next model turn; `followUp(message)` queues input drained only when the run would otherwise complete. `takeSteering` / `takeFollowUp` are non-blocking, FIFO, and controlled by `DrainMode` (`"all" | "one-at-a-time"`). `Steering.layer` accepts explicit `QueuePolicy` values for bounded capacity and overflow (`"suspend" | "fail" | "drop-newest" | "drop-oldest"`), implemented with Effect `Queue`. Non-empty drains emit `SteeringDrained` events. `Agent.stream` resolves `Steering` optionally so its requirement set does not grow.
- **`Compaction`** — optional context-shrinking seam. `maybeCompact(request)` can return a rebuilt chat history and current prompt before a streamed turn or after a pre-emission overflow. The default strategy checks `contextTokens > contextWindow - reserveTokens`, tries tool-output microcompaction, then summarizes an older session prefix into a checkpoint while keeping the recent suffix verbatim. Ordered strategy parts can independently select lossless tool-output bounds, token-denominated recent retention, and schema-validated structured summaries while compiling to the same host-decoratable `Strategy`. `Agent.stream` resolves `Compaction`, `SessionStore`, and `Ai.Tokenizer` optionally so its static requirement set does not grow.
- **`Memory`** — optional recall/remember seam. `recall({ key, turn: 0, prompt })` returns `Memory.Item` values whose `content` is exactly Effect AI `Prompt.UserMessagePart` content to insert into one user message before the first model turn; `itemFromPromptPart` explicitly converts legacy broad parts without reinterpreting protocol content. `remember({ key, turn, transcript, terminal })` records completed turn transcripts. `Agent.stream` resolves `Memory` optionally so its requirement set does not grow. If `RunOptions.memory` or `agent.memory` is set and `Memory` is absent, the run fails before the first model call.
- **`Instructions`** — optional ordered baseline context-source registry. `openEpoch(instructions, context)` renders baseline sources once, omits `Option.none()` outputs, joins fragments with blank lines, and retains dynamic sources only for deprecated direct callers. `staticSource(id, text)` builds a baseline source for fixed instructions. `Agent.stream` resolves `Instructions` optionally so its requirement set does not grow and never calls `renderUpdate`. TurnPolicy `Continue.overrides.instructions` is independent: it prepends one system message to the selected follow-up prompt, which `Ai.Chat` retains in transcript history.
- **`SkillSource`** — optional agentskills.io skill source. `all` supplies startup listings; `get(name)` supplies one lazy skill body. `Agent.stream` resolves `SkillSource` optionally so its requirement set does not grow. When present, Baton appends selected listings to the system baseline and handles `activate_skill` tool calls through the same `SkillSource.Interface` that durable hosts such as Relay provide over pinned skill snapshots.
- **`ModelResilience`** — optional model-call retry seam. `classify(error) => "transient" | "terminal"` sees the live provider failure before Baton wraps or stringifies it; `retrySchedule` controls retries. `defaultClassify` treats retryable `Ai.AiError` values as transient and everything else as terminal. `none` disables retry, `make`/`layer` build policies, `testLayer` swaps exact behavior in tests, and `apply(model, policy)` wraps `streamText`, `generateText`, and `generateObject`. `Agent.stream` resolves this service optionally so its requirement set does not grow.
- **`Approvals`** — optional enforcement point for `Ai.Tool.needsApproval`, which `effect/unstable/ai` declares but never enforces for Baton's disabled tool-resolution loop. `check(request) => Effect<Decision>` where `Decision` is `Approved | Denied | Pending`. `needsApproval: true` gates the call; `false` or `undefined` does not. A `NeedsApprovalFunction` is evaluated with the actual call params and `{ toolCallId, messages }`; a thrown exception, failure, or defect fails closed by treating the call as gated. Tools without an approval requirement never touch the service. If a gated call needs approval and `Approvals` is absent, Baton emits the approval request and feeds a failed tool result back to the model. `Denied` re-feeds a failed tool result; `Pending` suspends the run.
- **`TurnPolicy`** — a plain value carried by the agent (like `Schedule` values), not a service. `decide(info) => Effect<Decision>` with per-turn `overrides` on `Continue`.

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

The run did NOT finish; the host resolves `token` out-of-band and re-enters via `RunOptions.resume` with the pending call. The field shape deliberately mirrors a tool call so durable hosts can persist it. On resume, the initial model call is skipped: the resumed call executes first (approval gating applies), its tool-result part becomes the pending result of pseudo-turn 0, `TurnCompleted` is emitted with the current transcript, and the loop proceeds through the normal policy-gated follow-up turns. `Agent.stream` emits a trailing `TurnCompleted { transcript, usage?, finishReason? }` before re-failing with `AgentSuspended`, so a durable host can persist the finalized transcript. That suspension transcript is a provider-valid resumable checkpoint: it includes every sibling tool result completed before suspension exactly once in call order and leaves only the suspending call unresolved. Resuming appends that call's result without re-executing completed siblings.

Interrupting the fiber running `Agent.stream` is the v1 abort primitive. The current model stream and scoped tool executions are interrupted by Effect. Baton does not clear `Steering` queues on interruption; undrained messages remain in the service layer.

## Chat persistence

`SessionStore` is intentionally not part of `Agent.RunServices` in this contract. `Agent.stream` continues to construct and operate on `Ai.Chat`; `Session` is a standalone seam for future compaction, steering, instructions, and durable host adapters.

`RunOptions.sessionId` is an opaque host-assigned identity for the active run/session. It defaults to `"local"` and is threaded into `ToolExecutor.Request`, `Approvals.Request`, and `ToolContext.sessionId`. `RunOptions.toolOutputMaxBytes` is an optional non-negative finite byte limit for successful tool-result `encodedResult` values; invalid values fail before the first model call with `AgentError`. The byte limit has no effect unless a `ToolOutputStore` is available and chooses to spill.

Baton's loop builds its `Ai.Chat` internally and discards it when the run ends, so a standalone Baton app has no conversation continuity between runs. Baton adds exactly one seam — a way to run the loop on a **persisted** chat instead of a fresh one — and delegates all storage to `effect/unstable/ai`'s `Chat.Persistence` primitive. Baton adds **no** `BackingPersistence` implementation, store schema, or package; consumers provide upstream layers (`Chat.layerPersisted({ storeId })` over a `BackingPersistence` layer such as `Persistence.layerBackingMemory` or `Persistence.layerBackingSql`).

**Contract.** `RunOptions.persistence` is `{ readonly chatId: string; readonly timeToLive?: Duration.Input }` (`@experimental`). When set, the run executes on the chat identified by `chatId`, which is created on first use and accumulates history across runs. The `Chat.Persistence` service is resolved **optionally** (`Effect.serviceOption(Ai.Chat.Persistence)`) so `Agent.stream`'s `R` does not grow — the requirement stays a runtime concern, provided by the app's layers.

**Chat-construction decision table** (replaces the unconditional `Chat.fromPrompt`):

| `options.persistence` | `Chat.Persistence` in context | Behavior                                                                                                                                                 |
| --------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| undefined             | any                           | Default: fresh `Chat.fromPrompt([system])` (or `history` verbatim, or empty)                                                                             |
| set                   | absent                        | Fail immediately with `AgentError({ message: "RunOptions.persistence requires Chat.Persistence in context" })` — misconfiguration is loud; no model call |
| set                   | present                       | `chat = yield* persistence.getOrCreate(chatId, { timeToLive })`                                                                                          |

**System-message seeding.** On a persisted chat, inspect `yield* Ref.get(chat.history)`. If the history is empty, prepend Baton's system message by including it in the **first turn's** prompt (`Ai.Prompt.fromMessages([system, ...user])`). If the history is non-empty, do **not** re-add the system message — it is already stored from the first run. This keeps stored history self-contained and prevents duplicate system messages accumulating run over run.

**Save points.** Each streamed turn commits its authoritative transformed response to Chat and then saves a persisted Chat when the stream scope closes. Baton additionally issues one explicit `chat.save` in two places: (a) after the final turn, before emitting `Completed`; (b) before propagating `AgentSuspended`, so a suspended conversation's history — including the pending transformed tool call — survives to the resume. Raw model parts are never saved through a competing Chat stream path. `PersistenceError`/`AiError` from explicit `save` or `getOrCreate` map to `AgentError` with the cause message and `cause` value.

**Mutual exclusivity.** `RunOptions.history` (in-memory transcript continuation) and `RunOptions.persistence` are mutually exclusive — both set fails immediately with `AgentError({ message: "RunOptions.history and RunOptions.persistence are mutually exclusive" })`. `ChatNotFoundError` cannot occur because Baton uses `getOrCreate`.

## Integrations

- **MCP** arrives via `@batonfx/mcp`, not Baton core. The bridge converts an MCP server's tools into `Ai.Tool.dynamic` values (a toolkit Baton consumes as-is) plus a `ToolExecutor` layer (`@batonfx/mcp/baton`) that proxies calls to the server. Each `tools/call` passes the fiber's `AbortSignal` and the optional configured `callTimeout` as SDK `RequestOptions`, so interrupting a run aborts the in-flight request and a hung server cannot wedge the loop. Baton core keeps its `effect`-only dependency rule; the MCP SDK dependency lives entirely in `@batonfx/mcp`.
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
- `README.md`
