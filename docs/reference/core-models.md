---
title: "Models and middleware"
description: "ModelRegistry, ModelMiddleware, ModelResilience, and the Guardrail middleware combinators."
---

Four namespaces of generalist cover the model side of a run: ModelRegistry selects models per run, ModelMiddleware transforms prompts and stream parts, ModelResilience retries transient failures, and Guardrail builds common middleware.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist
```

## ModelRegistry

A registry of named model registrations. `withModel(selection, effect)` looks up the registration matching `ModelSelection = { provider, model, registrationKey? }` and provides its `LanguageModel` layer to the wrapped effect, failing with `LanguageModelNotRegistered` when nothing matches.

| Export                                     | Notes                                                                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Registration`                             | `{ provider, model, registrationKey?, layer, metadata? }` where `layer` provides the model environment                                       |
| `registration(input)`                      | Builds a `Registration` from a plain `LanguageModel` layer                                                                                   |
| `layer(registrations?, options?)`          | Registry service layer from registration effects; `GovernanceOptions.maxConcurrentModelCalls` caps concurrent provided runs with a semaphore |
| `merge(registries, options?)`              | Merges the registrations of several registry layers into one                                                                                 |
| `register` / `registrations` / `withModel` | Module-level call helpers over the service                                                                                                   |
| `layerMemory` / `layerTest`                | In-memory registry layer; layer from an explicit service                                                                                     |

<Warning title="Registry layers are not model layers">
Provider helpers like `Deterministic.layer()` return a `ModelRegistry.ModelRegistry` layer, not a `LanguageModel` layer. Wrap the run in `ModelRegistry.withModel({ provider, model }, effect)`. Never provide a registry layer where a LanguageModel is required.
</Warning>

## ModelMiddleware

Optional prompt/stream interceptor: a `ReadonlyArray<Middleware>` applied in array order. When no layer is provided, Generalist uses the empty identity chain. Both hooks are optional; omitted hooks are identity.

| Hook              | Signature                                                                | Contract                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transformPrompt` | `(prompt, context: TurnContext) => Effect<Ai.Prompt.Prompt, AgentError>` | Transforms the prompt for a turn before it is sent to the model                                                                                         |
| `transformPart`   | `(part, context: TurnContext) => Effect<Option<StreamPart>, AgentError>` | `Option.none()` drops the part. Tool-call parts may be transformed but must not be dropped: the loop fails the run with `MiddlewareViolation` if one is |

`TurnContext` is `{ agentName, turn }`. Layers: `ModelMiddleware.layerIdentity` (the empty chain, the default) and `ModelMiddleware.layer(middleware)`.

## ModelResilience

The agent loop wraps model calls with a default bounded retry policy, and this seam can replace or disable it. The interface is `{ resolve: (input) => AiError; classify: (error) => "transient" | "terminal"; retrySchedule: Schedule; invalidToolCallCorrectionLimit: number; streamIdleTimeout?: Duration.Input }`; only transient-classified errors retry. Invalid-tool correction limits are safe integers from 0 through 2, and generic InvalidOutputError values never enter that correction path. Direct custom models using correction with schema-backed tools attach their provider-exact compiler through ModelRegistry.withToolJsonSchemaCompiler. Every built-in provider registers a compiler. OpenRouter's toolJsonSchemaCompiler(model) uses the Anthropic transformer for Anthropic and Claude model IDs, the OpenAI transformer for OpenAI, GPT, o1, o3, and o4 IDs, and Effect AI's default transformer for other routes. A schema that the selected transformer cannot compile fails before transport with UnsupportedSchemaError; a compiled schema is still subject to the selected OpenRouter model and upstream provider's tool support.

| Export                           | Notes                                                                                                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaultClassify`                | Transient for retryable `AiError` values and pre-output stream termination failures                                                                                                                                    |
| `defaultResolveFailure`          | Keeps typed `AiError` values and bounds unknown error-part payloads as terminal unknown errors                                                                                                                         |
| `defaultPolicy`                  | Retry provider rate limits, internal failures, and transport failures twice with 2s and 4s backoff, bounded by a 30s schedule window                                                                                   |
| `none`                           | Resolve unknown parts safely, classify everything terminal, `Schedule.recurs(0)`                                                                                                                                       |
| `make(input?)` / `layer(input?)` | Use `defaultClassify` with the default policy's schedule and resolver; provide `none` to disable retries                                                                                                               |
| `apply(model, resilience)`       | Wraps a `LanguageModel.Service`; provider error parts retry before replayable output, while later failures become one `error` part; consumer-visible reasoning, text, or tool-call output is an absolute retry barrier |
| `layerTest(implementation)`      | Layer from an explicit service                                                                                                                                                                                         |

## Model boundary exports

These package-root exports support provider adapters, custom model hosts, and direct stream observation.

| Export                    | Purpose                                                                                                        | Minimal use                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------- |
| `ContextOverflow`         | Provider-neutral classification of context-window errors for reactive compaction                               | `ContextOverflow.classify(error)` returns `"context-overflow"                            | "other"` |
| `ModelStreamTermination`  | Rejects an idle stream or a clean end without a terminal finish part while preserving emitted-output evidence  | `stream.pipe(ModelStreamTermination.requireTerminal({ turn, provider, model, toPart }))` |
| `ModelToolCallValidation` | Projects model-facing tool schemas and validates returned calls against the original Effect schemas            | `ModelToolCallValidation.projectToolkit(toolkit, compiler)`                              |
| `withCacheBreakpoints`    | Adds transient Anthropic and Bedrock cache markers to one outgoing conversation prompt without persisting them | `withCacheBreakpoints(prompt, "conversation", idleMillis)`                               |

## Guardrail

Combinators that build `ModelMiddleware.Middleware` values.

| Combinator                                | Behavior                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `validateInput(check)`                    | Fails the run with `AgentError` when `check` returns a rejection reason for the input prompt                           |
| `redactInput({ pattern, replacement? })`  | Redacts regex matches in text-bearing prompt fields before the model sees them; replacement defaults to `"[redacted]"` |
| `redactOutput({ pattern, replacement? })` | Redacts matches in streamed text deltas before the loop folds or emits them                                            |
| `filterOutput(keep)`                      | Drops streamed parts when keep returns false; tool-call parts always pass                                              |

See [How to provide model providers](/guides/providers), [How to add guardrails, middleware, and retries](/guides/middleware), and [How to test agents and run evals in CI](/guides/testing-evals).
