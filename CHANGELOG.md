# Changelog

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
