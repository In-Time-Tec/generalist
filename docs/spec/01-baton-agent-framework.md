# 01 — Baton Agent Framework

Baton (`@batonfx/core`, directory `packages/core`) is a standalone, **non-durable**, Effect-native agent loop over `effect/unstable/ai`. Baton is the agent; a durable runtime such as [Relay](https://github.com/In-Time-Tec/relayfx) is the durable race it runs in. Use Baton alone when you just need an agent or chat streaming; compose it with a durable runtime when you need durability.

Baton is the _Effect_ version of an agent framework, not a port of AI SDK/Mastra vocabulary. Payload vocabulary is `Ai.Prompt`/`Ai.Response` from `effect/unstable/ai` — Baton adds loop framing only, no second wire format.

Compatibility: this spec is tested against `effect` and `@effect/vitest` `4.0.0-beta.93`.

## Scope

Baton owns:

- the model-turn loop: build an `Ai.Chat`, call `chat.streamText({ prompt, toolkit, disableToolCallResolution: true })`, fold stream parts, execute tool calls, re-feed tool results via `Ai.Prompt.fromResponseParts(...)`, repeat per policy, and optionally run one terminal structured-output turn;
- the closed loop-event union (`AgentEvent.Event`) that hosts observe and optionally persist;
- the standalone `Session` event-log seam and pure context projector;
- the loop seams: `ToolExecutor`, `ToolContext`, `ToolOutputStore`, `ModelResilience`, `Approvals`, and `TurnPolicy` (a plain value, not a service);
- the suspension contract (`AgentSuspended` on the error channel, resumable via `RunOptions.resume`);
- the provider-agnostic `ModelRegistry` for `LanguageModel` layer registration and selection.

Baton does not own (deferred, see ADR-0001): UI helpers, generic memory abstractions, evals, model-judge guardrails or detection heuristics, multi-agent/handoffs, durability of any kind. Baton owns ergonomic **Guardrail** combinators over `ModelMiddleware`, but no separate guardrail subsystem. Baton owns a standalone **Session** event-log seam and projector, but no durable/addressable session implementation. Baton owns a **chat persistence seam** (`RunOptions.persistence`, see below) but no persistence _implementation_ — consumers provide upstream `Chat.Persistence` layers. Baton also owns a non-durable **tool output spill seam** (`ToolOutputStore`, see below); durable blob stores remain host-side.

## Boundary rule

**Baton depends on `effect` only.** Baton has zero dependencies on any durable runtime's schema package, event log, or Postgres. A durable host composes Baton behind its own unchanged agent-loop interface and adapts its own vocabulary (e.g. snake_case identifiers, its own tool-call model, execution events) on the host side. In this repository the boundary is enforced structurally: the `no-relayfx-imports` ast-grep rule bans any `@relayfx/*` import — BatonFX must never depend on Relay.

## Module inventory

`packages/core/src` contains these modules, each namespace-per-file, re-exported from `src/index.ts`:

| Module                | Export namespace  | Purpose                                                                                                   |
| --------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| `agent.ts`            | `Agent`           | Agent definition value, `make`, text `stream`/`generate`, and structured `streamObject`/`generateObject`. |
| `agent-event.ts`      | `AgentEvent`      | Closed union of loop events, including `StructuredOutput`, plus tagged run errors.                        |
| `approvals.ts`        | `Approvals`       | Enforcement point for `Ai.Tool.needsApproval`; `autoApprove`, `denyAll`, and `testLayer`.                 |
| `guardrail.ts`        | `Guardrail`       | Ergonomic input/output guardrail combinators that produce `ModelMiddleware.Middleware` values.            |
| `model-middleware.ts` | `ModelMiddleware` | Interceptor seam for model input (prompt) and output (stream parts); `identityLayer` default.             |
| `model-registry.ts`   | `ModelRegistry`   | Provider-agnostic `LanguageModel` registration/selection.                                                 |
| `model-resilience.ts` | `ModelResilience` | Optional retry seam for model-call failures inside the loop.                                              |
| `session.ts`          | `Session`         | Append-only session event-log seam, memory layer, and pure `buildContext` projector.                      |
| `tool-context.ts`     | `ToolContext`     | Per-tool-call ambient context: abort signal, progress emitter, and session identity.                      |
| `tool-executor.ts`    | `ToolExecutor`    | Tool-call execution seam; `fromToolkit` default executor and `testLayer`.                                 |
| `tool-output.ts`      | `ToolOutput`      | Optional spill seam for oversized successful tool outputs.                                                |
| `turn-policy.ts`      | `TurnPolicy`      | Schedule-inspired turn continuation policy values: `recurs`, `untilToolCall`, `both`, `make`.             |

Module conventions: `Service`/`Interface`/`layer`/`testLayer` pattern; every exported symbol carries an `@experimental` JSDoc tag; errors are `Schema.TaggedErrorClass`; no `Date.now()` anywhere (callers pass timestamps if ever needed — v1 needs none).

## Turn semantics

- Turn 0 always runs (it is the initial model call; the policy is never consulted for it).
- Before each model turn calls `chat.streamText`, Baton resolves `ModelResilience` optionally. If absent, model-call behavior is unchanged. If present, Baton wraps the active `Ai.LanguageModel.Service` for that turn, including any per-turn `TurnPolicy` model override. Streaming retry is allowed only while the attempted model call has emitted no parts. Once any part is emitted, the turn is never re-run; a later typed stream failure becomes one `error` part and then follows the normal `AgentError` path. Provider-emitted in-band `error` parts are normal stream parts and are not classified or retried.
- Every raw model stream part is emitted as `ModelPart { turn, part }` — Baton does not filter; hosts decide what to persist. Text is accumulated from `text-delta` parts across all turns into `Completed.text`. `finish` parts also flow through unchanged as `ModelPart`s.
- Framework-executed `tool-call` stream parts (`providerExecuted !== true`) are executed sequentially in stream order: approval gating first (when the tool declares `needsApproval`), then `ToolExecutor.execute`. Outcomes map to tool-result parts (`Success` → `isFailure: false`, `Failure` → `isFailure: true` with `{ error: message }`) that are collected as the turn's `pendingToolResults` and re-fed to the model on the next turn. Provider-executed `tool-call` parts (`providerExecuted === true`) and their provider `tool-result` parts pass through only as `ModelPart`s; Baton never gates, dispatches, or pends them.
- Each framework-executed tool runs with a fresh `ToolContext` whose `signal` aborts when the tool/run scope is interrupted, whose `sessionId` is the active `RunOptions.sessionId` or `"local"`, and whose `emit` surfaces progress as `ToolProgress { turn, toolCallId, message?, data? }`. Event order for a locally executed tool is `ToolExecutionStarted`, zero or more `ToolProgress`, then `ToolExecutionCompleted` or suspension/failure. `ToolProgress` is observational only: it is never added to pending tool results and is never re-fed to the model.
- Successful tool outcomes may be bounded before they become tool-result parts. If `RunOptions.toolOutputMaxBytes` is set, `encodedResult` exceeds that byte limit, and a `ToolOutputStore` is present and chooses to store the overflow, Baton stores `{ result, encodedResult }` out of context and replaces both `result` and `encodedResult` with `ToolOutput { inline, outputPaths }`. Absent/no-op stores and under-limit outputs preserve today's full inline result exactly. Failures are never spilled.
- After each turn, `TurnCompleted { turn, transcript, usage?, finishReason? }` is emitted with the full chat history — hosts that persist conversation state read it from here. `usage`/`finishReason` come from that turn's transformed `finish` part when the model reported one.
- If `pendingToolResults` is empty after a turn, the loop emits `Completed { turns, text, transcript, usage? }` and ends — the policy is **not** consulted. `Completed.usage` is the fieldwise cumulative usage across all turns that reported usage.
- In structured mode (`Agent.streamObject` / `Agent.generateObject`), Baton first runs the normal tool loop unchanged. When the loop would otherwise complete, Baton runs one additional terminal structured turn on the same live `Ai.Chat` using `chat.generateObject({ prompt: objectPrompt, schema, objectName, toolChoice: "none" })`. The terminal turn emits `StructuredOutput { turn, value, content }` immediately before `Completed`. `value` is `unknown` in the event union because the union is closed and non-generic; `Agent.generateObject` returns it typed as the caller's schema type. `content` is the raw structured response parts, including any `finish` part. `Completed.text` remains the accumulated normal streamed text; `Completed.transcript` and `Completed.usage` include the structured exchange. No `TurnStarted`, `ModelPart`, or `TurnCompleted` event is emitted for the non-streaming structured turn; it is represented by `StructuredOutput`.
- If `pendingToolResults` is non-empty, the loop calls `policy.decide(info)`. `Continue` runs the next turn with `Ai.Prompt.fromResponseParts(pendingToolResults)` as prompt, applying that decision's `overrides` (instructions, model layer, active tools) for that turn only. `Stop` fails the stream with `TurnLimitExceeded { turn, pending }` — pending results are never silently dropped.
- The default policy is `TurnPolicy.recurs(8)` (an eight-follow-up-turn cap).

## Usage & telemetry

`AgentEvent.addUsage(a, b)` fieldwise-sums upstream `Ai.Response.Usage` values. Numeric leaves that are absent on both sides stay absent; a value present on either side is summed with the other side treated as zero. Structured-output finish usage contributes to `Completed.usage`; per-turn usage remains on normal `TurnCompleted` events while the structured turn's raw usage remains available in `StructuredOutput.content`.

Baton wraps the whole run stream in an OpenTelemetry span named `Baton.Agent.run` with attribute `baton.agent.name`, and each model turn in `Baton.Agent.turn` with attribute `baton.turn`. When a `finish` part is captured, Baton annotates the current turn span with Effect AI GenAI attributes for operation `chat`, reported input/output token totals, and the finish reason.

## Run errors

`Agent.RunError` is the error channel of `Agent.stream` and `Agent.generate`: `AgentError | AgentSuspended | TurnLimitExceeded | MiddlewareViolation`. `AgentError` keeps the stable tag `@batonfx/core/AgentError`; `AgentSuspended` keeps the stable tag `@batonfx/core/AgentSuspended`. Consumers match typed tags and structured fields rather than diagnostic strings.

- **`AgentError`** carries `{ message, turn, cause? }` for general loop failures and wrapped external failures. `cause` is an optional `Schema.Defect()` value preserving the live underlying error for host classification.
- Structured-output generation or schema-decoding failures map to `AgentError` at the terminal structured turn index.
- **`AgentSuspended`** carries `{ token, reason, tool_call_id, tool_name, tool_params }` when the run must be resumed out-of-band.
- **`TurnLimitExceeded`** carries `{ turn, pending }` when the policy stops while tool results are pending. `pending` is an array of `{ tool_call_id, tool_name }`.
- **`MiddlewareViolation`** carries `{ turn, detail }` for host middleware contract bugs such as dropping a `tool-call` part.

## Service seams

- **`ToolExecutor`** — `execute(request) => Effect<Outcome, AgentError>` where `request` includes `{ call, turn, agentName, sessionId }` and `Outcome` is `Success | Failure | Suspend`. The default `fromToolkit` executor runs the toolkit's own handlers in-process (`toolkit.handle`, last non-preliminary result wins). A durable host swaps in its own executor.
- **`ToolContext`** — ambient per-call context available while `ToolExecutor.execute` runs. `ToolContext` carries `{ signal, emit, sessionId }`; the loop provides it around execution, and `layerDefault` provides a standalone never-aborting/no-op context with session `"local"` for direct tests or tools run outside the loop. `emit({ toolCallId, message?, data? })` becomes a `ToolProgress` event for the current turn.
- **`ToolOutputStore`** — optional output spill seam used by `ToolOutput.bound`. `put(toolCallId, content) => Effect<Option<string>, ToolOutputError>` stores overflow and returns `Some(path)` when it spilled or `None` when the store declines; absent stores and `layerNoop` decline spill. The in-memory layer returns `mem:<id>` references and is non-durable. When spilling, Baton replaces both `result` and `encodedResult` with `ToolOutput { inline: { truncated: true, bytes, maxBytes, preview }, outputPaths: [path] }`; `preview` is a UTF-8 bounded string from the serialized encoded result.
- **`ModelResilience`** — optional model-call retry seam. `classify(error) => "transient" | "terminal"` sees the live provider failure before Baton wraps or stringifies it; `retrySchedule` controls retries. `defaultClassify` treats retryable `Ai.AiError` values as transient and everything else as terminal. `none` disables retry, `make`/`layer` build policies, `testLayer` swaps exact behavior in tests, and `apply(model, policy)` wraps `streamText`, `generateText`, and `generateObject`. `Agent.stream` resolves this service optionally so its requirement set does not grow.
- **`Approvals`** — `check(request) => Effect<Decision>` where `Decision` is `Approved | Denied | Pending`. This is the enforcement point for `Ai.Tool.needsApproval`, which `effect/unstable/ai` declares but never enforces for Baton's disabled tool-resolution loop. `needsApproval: true` gates the call; `false` or `undefined` does not. A `NeedsApprovalFunction` is evaluated with the actual call params and `{ toolCallId, messages }`; a thrown exception, failure, or defect fails closed by treating the call as gated. Tools without an approval requirement never touch the Approvals service. `Denied` re-feeds a failed tool result; `Pending` suspends the run.
- **`TurnPolicy`** — a plain value carried by the agent (like `Schedule` values), not a service. `decide(info) => Effect<Decision>` with per-turn `overrides` on `Continue`.

## Model middleware

`ModelMiddleware` (`model-middleware.ts`) is the interceptor seam for everything that goes **into** or comes **out of** the model. It is where PII scrubbing, prompt-injection screening, output filtering, and prompt logging plug in without forking the loop. Baton ships the seam, an identity default, and `Guardrail` middleware combinators only — no model-judge guardrails or detection heuristics.

- **Service** — `ModelMiddleware` holds a `ReadonlyArray<Middleware>` (the chain), applied in array order. `identityLayer` provides the empty chain and is the default; `layer(middleware)` provides an explicit chain. The loop requires `ModelMiddleware`, so `Agent.stream` / `Agent.generate` have `ModelMiddleware` in their requirements `R` alongside `LanguageModel`, `ToolExecutor`, and `Approvals`.
- **A `Middleware`** has two optional hooks; an omitted hook is identity:
  - `transformPrompt(prompt, context) => Effect<Ai.Prompt.Prompt, AgentError>` — transform the prompt for a turn before it is sent to the model. Runs for both the initial turn and every follow-up (`Ai.Prompt.fromResponseParts(...)`) turn.
  - `transformPart(part, context) => Effect<Option<Ai.Response.StreamPart>, AgentError>` — transform or drop a single model stream part before the loop processes it. `Option.none()` drops the part: it is not folded, not emitted as `ModelPart`, not persisted.
  - `context` is `TurnContext { agentName, turn }` (0-based turn).
- **Ordering** — `transformPrompt` hooks run in array order (`m2(m1(prompt))`). `transformPart` hooks run in array order; the first hook that returns `Option.none()` short-circuits — remaining hooks are skipped and the part is dropped.
- **Tool-call-drop prohibition** — `tool-call` parts may be transformed but MUST NOT be dropped. Dropping a tool-call is a middleware bug; the loop fails the run with `MiddlewareViolation { turn, detail }`.
- **Error semantics** — a hook that fails on the error channel fails the whole run with that `AgentError` (middleware are host bugs, not model failures). A `transformPrompt` failure fails the turn **before** the model is called — no model call happens.
- **Placement** — middleware runs **before** the fold that dispatches tool calls and accumulates text, so middleware sees raw model output and everything downstream (`AgentEvent`s, tool dispatch, and any host-side persistence) sees the transformed stream. A durable host that persists model output after this fold therefore persists exactly the transformed/dropped parts: guardrails act **before** durability.
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
- an `Approvals` decision of `Pending { token }` fails with `AgentSuspended { token, reason: "approval", ... }`.

The run did NOT finish; the host resolves `token` out-of-band and re-enters via `RunOptions.resume` with the pending call. The field shape deliberately mirrors a tool call so durable hosts can persist it. On resume, the initial model call is skipped: the resumed call executes first (approval gating applies), its tool-result part becomes the pending result of pseudo-turn 0, `TurnCompleted` is emitted with the current transcript, and the loop proceeds through the normal policy-gated follow-up turns. `Agent.stream` emits a trailing `TurnCompleted { transcript, usage?, finishReason? }` before re-failing with `AgentSuspended`, so a durable host can persist the finalized transcript.

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

**Save points.** `Persisted` saves history to the backing store as part of each text-generation call (happy path), plus Baton issues one explicit `chat.save` in two places: (a) after the final turn, before emitting `Completed`; (b) before propagating `AgentSuspended`, so a suspended conversation's history — including the pending tool call — survives to the resume. `PersistenceError`/`AiError` from `save` or `getOrCreate` map to `AgentError` with the cause message and `cause` value.

**Mutual exclusivity.** `RunOptions.history` (in-memory transcript continuation) and `RunOptions.persistence` are mutually exclusive — both set fails immediately with `AgentError({ message: "RunOptions.history and RunOptions.persistence are mutually exclusive" })`. `ChatNotFoundError` cannot occur because Baton uses `getOrCreate`.

## Integrations

- **MCP** arrives via `@batonfx/mcp`, not Baton core. The bridge converts an MCP server's tools into `Ai.Tool.dynamic` values (a toolkit Baton consumes as-is) plus a `ToolExecutor` layer (`@batonfx/mcp/baton`) that proxies calls to the server. Baton core keeps its `effect`-only dependency rule; the MCP SDK dependency lives entirely in `@batonfx/mcp`.

## Composing with a durable runtime

Baton is designed to be composed behind a durable runtime's own agent-loop interface: Baton owns turn iteration, tool-dispatch ordering, tool-result re-feed, the turn cap, and an optional model-call retry seam; the durable host owns everything durable (sequence allocation, an execution-event fold, prompt assembly, structured output, blob/artifact stores). The host provides the `ToolExecutor`, `Approvals`, optional `ToolOutputStore`, optional `ModelResilience`, `ModelMiddleware`, and `LanguageModel` seams per run and folds Baton's `AgentEvent` stream into its own durable events. The reference composition is [Relay](https://github.com/In-Time-Tec/relayfx); its host-side wiring, retry policy selection, blob store, and event fold live in that repository, not here.

## Related docs

- `docs/spec/decisions/ADR-0001-baton-standalone-agent-framework.md`
- `docs/spec/decisions/ADR-0002-tool-context-output-spill.md`
- `docs/spec/decisions/ADR-0003-model-resilience.md`
- `docs/spec/decisions/ADR-0004-guardrail-combinators.md`
- `docs/spec/decisions/ADR-0005-session-event-log.md`
- `docs/spec/02-session-event-log.md`
- `README.md`
