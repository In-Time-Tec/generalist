# 13 — Deterministic Agent Test Kit

`@batonfx/test` provides a scripted Effect AI `LanguageModel` and normalized request capture for deterministic agent tests. It depends only on `@batonfx/core` and `effect`; it does not depend on providers, transport, a test runner, credentials, or Relay.

## Script vocabulary

`TestModel.text(text)` and `TestModel.toolCall(name, params, options?)` create response parts. A bare part at the top level is promoted to a one-part model turn, preserving concise scripts such as:

```ts
TestModel.layer([TestModel.toolCall("web_search", { query: "Relay docs" }), TestModel.text("Found them")])
```

`TestModel.turn(parts, options?)` groups multiple parts into one provider invocation. Its options are `finishReason`, `usage`, and an Effect `Duration.Input` delay. The default finish reason is `tool-calls` when any part is a tool call and `stop` otherwise. Every successful turn emits an explicit finish part so usage and finish behavior remain observable.

`TestModel.object(value, options?)` scripts the encoded JSON result for a structured-output request. It is valid only for the non-streaming provider hook when `responseFormat.type` is `json`. JSON serialization failure or operation mismatch fails with a non-retryable Effect AI `AiError.InvalidRequestError`.

`TestModel.failure(error, options?)` consumes one slot and fails with the supplied `AiError.AiError`. This lets tests prove retry classification and schedules without a live provider.

Text parts compile to `text-start`, `text-delta`, and `text-end` for streaming calls and one `text` part for non-streaming calls. Tool calls retain explicit ids and `providerExecuted`; omitted ids are derived deterministically from request and part indices.

## Stateful fixture

`TestModel.make(script, options?)` allocates one fixture with:

- `layer`, an already-built `LanguageModel` layer;
- `selection`, `registration`, and `registryLayer` for `ModelRegistry` tests;
- `requests`, a snapshot of captured normalized requests;
- `prompts`, the captured `Prompt.Prompt` values;
- `remaining`, the number of unclaimed script slots;
- `awaitRequests(count)`, which waits through Effect primitives until at least `count` requests have entered the provider.

Fixture options select `provider`, `model`, `registrationKey`, and metadata. Defaults are provider `test` and model `scripted`.

The fixture allocates its cursor and capture state once. Its `layer` is a `Layer.succeed` around the built model service, so rebuilding the layer or resolving it repeatedly through `ModelRegistry` does not reset the script. `TestModel.layer(script)` remains a direct convenience that allocates when the layer is built; callers that inspect captures or reuse a model across top-level runs use `make`.

`TestModel.registryLayer(fixtures, governance?)` combines already-created fixture registrations into one `ModelRegistry` layer without changing fixture state lifetime.

## Captured requests

Each captured request is a stable projection of Effect AI provider options:

- zero-based `index`;
- `operation`: `streamText`, `generateText`, or `generateObject`;
- normalized `Prompt.Prompt`;
- active tool definitions and tool choice;
- response format;
- previous response id and incremental prompt.

Tracing spans are deliberately excluded. Capture occurs atomically with script-slot claim and before any scripted delay or failure.

## Concurrency and exhaustion

One global FIFO cursor is shared by streaming and non-streaming calls. Claiming a slot and appending its request is atomic, so concurrent callers receive unique slots in provider-entry order. Once a provider call begins, its slot remains consumed after interruption or failure; a retry consumes the next slot.

An exhausted request is still captured, does not advance the cursor beyond the script length, and fails non-retryably as an Effect AI `AiError.InvalidRequestError`. Baton does not invent a second model error channel for tests.

## Acceptance coverage

The public fixture must prove, without credentials:

1. multi-turn tool calls and tool-result re-feed;
2. normalized prompt and active-tool capture;
3. steering drains and queued-run order through public Agent/transport events plus captured requests;
4. compaction and structured-output calls through captured response format and prompts;
5. finish reasons, usage, failures, retries, concurrency, interruption, and exhaustion;
6. state continuity across repeated `ModelRegistry` resolution.

Transport may use `@batonfx/test` as a development-only dependency for queue integration tests. `@batonfx/test` never imports transport.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/05-steering-and-interrupts.md`
- `docs/spec/06-compaction.md`
- `docs/spec/11-transport.md`
- `docs/spec/decisions/ADR-0020-public-deterministic-test-model.md`
