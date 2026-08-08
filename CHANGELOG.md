# Changelog

## Unreleased

## 0.19.0

- Add `decodeConfig` to the OpenRouter provider so persisted provider options
  (reasoning effort and summary verbosity, sampling parameters, provider
  routing) decode into `OpenRouterLanguageModel` request configuration with the
  same strict unknown-field rejection the OpenAI provider applies.

## 0.18.3

- Persist distinct durable checkpoints when one logical Agent turn suspends more than once. Suspension checkpoints now derive their idempotent compaction-application identity from the encoded suspension itself, so a child-group join followed by a `run_child` retry in the same turn can no longer replay the first suspension's checkpoint and fail rehydration with a blank `ResumeMismatch`.
- Preserve structured terminal failures on `AgentExecutionFailure`: the runtime now carries the exact `RunBudgetExhausted` or `ResumeMismatch` value on the optional `failure` field and always produces a non-empty actionable message instead of `Cause.squash(...).message` being blank.
- Document that hosts remove the cumulative total-token safety cap by giving every agent an explicit budget without `totalTokens`, so long subagents are governed by their pinned Compaction policy instead of accumulated input charges (the Runtime fallback keeps the cap).

## 0.15.0

- Add exact durable executable registration, admission validation, and restart reconstruction from persisted registrations.
- Add finite root-tree watching that drains through root settlement, plus cross-process cancellation watching and finalizer settlement.
- Add durable Agent Program execution, including replay, approvals, cancellation, and persisted child and fan-out recovery.
- Bring MySQL durable Runtime behavior to SQLite and PostgreSQL parity, including migration, claims, steering, cancellation, and Program recovery.
- Add typed admission failures and persisted codecs for executable registrations and Runtime events.

## 0.14.2

- Accept Effect's encoded usage shape across successful model telemetry and turn-completion events in durable Runtime stores.

## 0.14.1

- Accept model finish parts after Effect's encoded form omits undefined response and token-usage fields, preserving them through durable Runtime stores and replay.

## 0.14.0

- Add `@batonfx/runtime` as the authoritative addressable Run lifecycle with replay, inspection, waits, cancellation, memory, SQLite, and PostgreSQL stores.
- Add `@batonfx/a2a` and `@batonfx/ag-ui` as protocol projections over Runtime-owned runs, and move transport and FoldKit onto the same canonical `RunEvent` stream.
- Add the durable model-turn driver, tree run budgets, and same-run agent handoffs with deterministic operation identities and typed suspension propagation.
- Expand the lockstep release train from eight to eleven public packages, publishing thirteen checksummed GitHub assets and the exact package tarballs to npm.

## 0.13.1

- Bound inline-image token estimates across fallback thresholding, recent-context cutting, and post-microcompaction fit checks while preserving text-only estimates.
- Anchor provider-reported context usage to append-only prompt descendants and invalidate it after context rewrites or replacement finishes without valid input usage.
- Suppress unchanged threshold passes only for unchanged usage and conservatively verified plain-JSON context values. Values that serialize lossily or throw during identity inspection fail open, and overflow clears suppression on every exit.

## 0.13.0

- Establish an agent-native topology across runtime, provider, and transport facades with precise Effect AI typing and workspace validation.
- Make Handoff registration structural and closed over run options, and remove the obsolete handoff run path.
- Make tool-schema services truthful by closing their requirements, preserving toolkit dispatch typing, and rejecting inherited toolkit names.
- Tighten Wire fixed and dynamic codecs and public schema predicates, removing schema type rebranding and unsafe casts.

## 0.12.0

- Persist deterministic model-attempt identities before provider construction, settle terminal stream parts even when downstream consumption stops at the boundary, and reject exhausted call ordinals before provider entry.
- Preserve completed concurrent sibling tool results before propagating suspension or failure, including bounded and unbounded execution modes.
- Validate model-emitted tool parameters before middleware, events, authorization, execution, or history. Invalid-tool correction now uses only Baton's precise typed signal and the active provider's exact registered tool JSON Schema compiler; generic `InvalidOutputError` values never trigger correction. OpenAI, OpenAI-compatible, Anthropic, and Amazon Bedrock support schema-backed correction. OpenRouter rejects that policy before transport because its pinned adapter does not preserve a permissive dynamic tool's compiled request schema.
- Preserve provider-reported usage from a withheld invalid-tool attempt until its terminal finish, and keep failed-attempt usage separate from the successful terminal attempt.
- Remove `ResponseIdTracker` from the Baton surface and mask it inside instrumented calls so Effect's hidden incremental fallback cannot issue an uninstrumented second provider request.
- Make one instrumented model call the sole owner of provider retries and invalid-tool-call correction. Consumer-visible reasoning, text, or tool-call output is an absolute replay barrier; the separate whole-Agent consumed-stream restart path is removed.
- Replace the hidden model-stream liveness backstop with optional `ModelResilience.streamIdleTimeout`. An explicit idle deadline fails with typed `ModelStreamTimeout`, retries only before output, and reports the `timeout` telemetry category.

## 0.11.14

- Resolve provider `error` parts to typed failures before telemetry and replay accounting. Transient failures now retry when only withheld response metadata preceded them, while reasoning, text, and tool-call output remain strict replay barriers. Unknown custom payloads become bounded terminal `UnknownError` values unless `ModelResilience.resolve` maps them explicitly. The same rule covers malformed non-streaming responses, preserves bounded consumed-stream restart, and keeps discarded metadata and errors out of the successful attempt.
- Normalize OpenAI, Anthropic, and OpenRouter stream failures to typed `AiError` values. Known overload, timeout, and rate-limit failures use the default retry policy; request, authentication, permission, content-policy, quota, and unknown failures remain terminal. OpenAI Responses `response.failed` payloads now take the same failure path instead of appearing as successful finish events.

## 0.11.13

- Fail a run whose last turn leaves no assistant text with `RunEndedWithoutOutput` instead of completing it with an empty answer. A provider that ends a turn after reasoning, or reports `"unknown"` because it never said why it stopped, previously produced a successful run with nothing in it. The error carries the provider's finish reason for that turn plus the text and reasoning characters the provider streamed, so a provider that produced nothing is distinguishable from text that was streamed but never committed. Structured-output runs remain judged by their schema value.
- Require `classification` on `ModelCallFailed`. Attempt-level failures carried it and call-level failures did not, so a consumer reading only the call event had to infer retryability from an absent field. Both levels now decide it the same way; they differ only when resilience refuses to replay a retryable failure because output already escaped, where the call reports `terminal`.
- Bound retries of a provider stream that emits an unreplayable part before failing every time. `Stream.retry` resets its schedule as soon as an element passes through, so a lone `response-metadata` part reset it on every attempt and a repeatedly truncating stream retried forever in a busy loop instead of failing. Unreplayable parts are now withheld until the attempt commits, which also stops a discarded attempt's response metadata from being replayed alongside the attempt that replaced it.

## 0.11.9

- Fail a model attempt whose provider stream ends without its terminal `finish` part instead of reporting it as a completed turn with no finish reason and no usage. A clean end with no `finish` now fails with `ModelStreamTruncated`, a stream that goes quiet past the liveness backstop fails with `ModelStreamStalled`, and both are classified `truncated-stream` so an attempt that emitted nothing retries.
- Reset the accumulated turn text between turns. Every turn previously appended to the same buffer, so a run's final text was the concatenation of all its intermediate narration.
- Add a truncating step to the test model so a stream that stops mid-reasoning, mid-text, or mid-tool-call can be scripted.

## 0.11.8

- Retry reactive context-overflow compaction when a provider emits response metadata before its terminal error, while still refusing to replay after assistant text or tool calls escape.

## 0.11.7

- Coalesce adjacent completed response text before committing authoritative chat history so persistence encoders and durable session entries retain the full response during replay.

## 0.11.6

- Commit model responses to authoritative chat history only after the transformed stream is fully consumed, preventing interrupted, failed, or partially consumed response prefixes from conflicting with durable replay.

## 0.11.5

- Compare durable session messages by canonical content so equivalent file data representations, including a URL object and its string value, remain aligned with authoritative Chat history.

## 0.11.4

- Allow agent tool execution policies to select explicit `"unbounded"` concurrency so independent tool calls emitted by one model turn can all start together without an arbitrary numeric cap. Missing policies remain serial by default, and positive integer policies retain bounded execution.

## 0.11.3

- Coalesce adjacent same-options text parts of a user message before it enters the persisted Chat history, and compare the durable session projection against the authoritative Chat history on coalesced messages. The provider-agnostic Chat export encodes a multi-text-part user message by keeping only the first text part, silently dropping the rest; a caller that submits a prompt plus a resolved-context block as two text parts therefore persisted a Chat history that was no longer a prefix of the session projection, failing `syncSession` with "Session projection is not a prefix of authoritative Chat history" and poisoning every later turn in the thread. Coalescing is lossless — providers already concatenate adjacent text — and keeps the persisted Chat history a faithful prefix of the session.

## 0.11.2

- Classify provider context-window overflow by semantic evidence instead of error shape. A shared `ContextOverflow` module owns detection; `ModelRegistry.classifyFailure` falls back to it for every registration, so overflow errors that fail stream-schema decoding, arrive with unexpected framing, or come from providers without a classifier still trigger reactive compaction. Responses SSE normalization now applies regardless of response content-type, joins multi-`data:`-line frames, and flattens nested errors that carry a top-level message. Also isolates the package-smoke consumer install cache so a freshly packed tarball is never masked by a same-version cache entry.

## 0.11.0

- Add stable per-run telemetry delivery IDs, an optional ordered host delivery sink, and atomic Session checkpoint telemetry outboxes with compaction commitments. Structured output events now carry the final successful model call and attempt identity. These are breaking pre-1.0 checkpoint, compaction request, telemetry event, and transport contracts.

## 0.10.1

- Modernize the eight-package release contract around committed lockstep versions, exact Effect peers, build-once npm-compatible tarballs, clean Bun and Node consumer proofs, checksums, provenance evidence, and tag-gated GitHub releases without npm publication.

## 0.10.0

- Add the public `ModelTelemetry` contract: typed model-call, attempt, retry, and compaction lifecycle events in the agent event stream. A stable `modelCallId` joins one prepared input across provider attempts, `modelAttemptId` plus a 0-based `attempt` ordinal name each provider invocation, and every `ModelPart` now carries all three (a breaking `ModelPart` and transport wire change; update fixtures and exhaustive event matches). Timestamps are sampled from the Effect Clock at real operation boundaries, usage and provider metadata stay optional (absent means unknown), failures map onto bounded provider-neutral categories, `ModelResilience` retries emit `ModelRetryScheduled` with classification and accepted backoff, and compaction passes emit started/completed/failed events linking summary work through `compactionId` and `summaryModelCallId`. Telemetry never carries prompts, model bodies, credentials, headers, or arbitrary provider error payloads.

## 0.8.0

- Add the Effect v4 Amazon Bedrock provider with Converse and ConverseStream, tool and structured-output support, signed and redacted reasoning, AWS default-chain and bearer authentication, refreshable per-request credentials, and narrowly gated coalesced expired-credential recovery. Import it as `AmazonBedrock` from `@batonfx/providers` or from `@batonfx/providers/amazon-bedrock`.

## 0.7.1

- Normalize nested OpenAI Responses SSE `error` frames to the flat shape the Effect AI stream schema expects, for both API-key and account registrations. Transient provider server errors now surface as decoded error parts carrying the provider message and request id instead of failing the stream with an `InvalidOutputError` decode error. `OpenAi.normalizeResponsesSse` is exported for custom clients.

## 0.6.0

- Default the turn policy to the new first-class `TurnPolicy.forever`, which carries a distinct portable `Forever` snapshot. Policy-free `Agent.make` no longer caps follow-up turns at eight; a run still completes naturally when a turn leaves no pending tool results. Consumers relying on the old implicit cap must opt into `TurnPolicy.recurs(8)`, and exhaustive `Snapshot` matches must add `Forever`.
- Made `Agent` opaque and invariant in its inferred Effect requirements, added scoped `Agent.provideModel`, and split persisted runs into `persisted`, `persistedObject`, `generatePersisted`, and `generatePersistedObject` entrypoints.

## 0.5.0

- Reject ambiguous static, reserved `activate_skill`, activated-skill, and Handoff tool names with schema-backed origin evidence before advertisement or execution. Use `Agent.make({ tools: [...] })` when duplicate static declarations must remain observable; pre-built Effect AI toolkits remain accepted, but `Toolkit.make` has already erased duplicate inputs.
- Preserve declared tool failures as `DomainFailure { failure, encodedFailure }`, add schema-backed stage-specific `FrameworkFailure` on the executor and run error channels, and transport framework failures through existing failed frames. This breaks exhaustive `Outcome.Failure` matches and message-only placement failure codecs; migrate to `DomainFailure` and `Effect.catchTag("@batonfx/core/FrameworkFailure", ...)`.
- Add the public Effect-native `@batonfx/mcp` OAuth lifecycle, host-owned redacted token store, typed lifecycle errors, authenticated remote transport integration, and deterministic layers.
- Add scripted reasoning parts to `@batonfx/test` with deterministic reasoning stream events and transcript projection distinct from assistant text.
- Preserve host `HttpClient` requirements in base provider, preset, fallback, and embedding constructors; use the matching explicitly named `*Fetch` convenience to retain the previous fetch-backed behavior.
- Preserve typed FoldKit connection and command failures as structured facts while leaving defects and interruption in their Effect causes; `ChatCommand` now exposes its concrete error union instead of `any`.
