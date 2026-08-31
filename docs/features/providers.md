# Providers

Provider leaves register concrete Effect AI model layers in `ModelRegistry`; callers select one exact `{ provider, model, registrationKey? }` for each run. Missing identities fail with typed `LanguageModelNotRegistered`; per-run model layers bypass selection, and core never imports provider SDKs.

## Usage

```ts
import { Config, Console, Effect } from "effect"
import { LanguageModel, ModelRegistry } from "generalist"
import { layer as openAiLayer } from "generalist/ai/openai"
import { FetchHttpClient } from "effect/unstable/http"

const models = openAiLayer({
  model: "gpt-4o-mini",
  apiKey: Config.redacted("OPENAI_API_KEY"),
})

const program = ModelRegistry.withModel(
  { provider: "openai", model: "gpt-4o-mini" },
  LanguageModel.generateText({ prompt: "Summarize the incident." }),
).pipe(Effect.flatMap((result) => Console.log(result.text)))

Effect.runPromise(program.pipe(Effect.provide(models), Effect.provide(FetchHttpClient.layer)))
```

## What runs

```text
ModelRegistry.withModel({ provider: "openai",
                          model: "gpt-4o-mini" })
├── resolve ["openai", "gpt-4o-mini", null]
├── build the registered LanguageModel layer once per registry scope
├── provide provider/model identity and registration metadata
└── LanguageModel.generateText("Summarize the incident.")
    └── @effect/ai-openai Responses client
        └── host-provided HttpClient
```

## Provider leaves

There is no executable `generalist/ai` aggregate. Each exact leaf closes over only `effect` and its optional upstream peer.

| Import                                                                                                           | Upstream peer                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `generalist/ai/openai`, `openai-responses`, `openai-embedding`                                                   | `@effect/ai-openai`                                                                     |
| `generalist/ai/anthropic`                                                                                        | `@effect/ai-anthropic`                                                                  |
| `generalist/ai/openrouter`                                                                                       | `@effect/ai-openrouter`                                                                 |
| `generalist/ai/openai-chat-completions`, `openai-compatible`, `openai-compatible-embedding`                      | `@effect/ai-openai-compat`                                                              |
| `generalist/ai/amazon-bedrock`                                                                                   | `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/credential-provider-node`, `@smithy/types` |
| `generalist/ai/deterministic`, `model-catalog`, `model-route`, `openai-account-auth`, `openai-account-auth-http` | none                                                                                    |

OpenAI and configurable OpenAI Responses use `/responses`; Chat Completions and all seven compatible presets use `/chat/completions`. Compatible adapters accept arbitrary provider/model identities and base URLs. Responses config rejects excess and transport-owned fields; Chat Completions accepts JSON extensions but rejects `model` overrides. OpenRouter applies its generated request schema, preserves routing/preferences/plugins/trace shapes, and chooses Anthropic, OpenAI, or default structured-output codecs from the model id.

Amazon Bedrock is Node-only and accepts foundation-model IDs, inference-profile IDs, and ARNs. It maps prompts, supported files, tools, structured output, cache points, and signed/redacted reasoning to Converse; ConverseStream waits for metadata before finishing so identity, stop reason, usage/cache, metrics, trace, and additional fields survive without fabricated reasoning usage.

## Model catalog

```text
{ provider: "openai", model: "gpt-4o-mini" }
    │ ModelCatalog.get()
    ▼
{ contextWindow: 128000, maxOutput: 16384,
  pricing: { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  modalities: ["text", "image"] }
```

`bundled` is a hand-maintained six-model snapshot. `layer(overrides)` replaces matching provider/model entries while preserving order; `layerTest(entries)` uses exactly its input. `find` returns `undefined`; `get` fails with typed `NotFound`; `list` returns all entries.

## Model routes

```text
candidate 0: openai/gpt-4o-mini
├── retryable failure → retry candidate 0
├── approved availability failure → candidate 1 once
└── text/reasoning/tool call escaped → never advance stream
candidate 1: anthropic/claude-3-5-haiku-latest
```

`ModelRoute.make` requires a non-empty immutable ordered registration tuple and provider-owned availability semantics for every candidate. It returns one exact synthetic selection plus registration. Cancellation, unknown outcomes, auth/request/schema/tool/context/token failures stay terminal; attempt ordinals span retries and candidates, telemetry identifies each candidate, and failed usage stays separate from terminal success usage.

## Deterministic model and embeddings

- `Deterministic.layer()` registers `deterministic/deterministic` and always emits `"deterministic response"`; it imports no provider.
- OpenAI's `layerOrDeterministic` always registers the requested fallback and adds OpenAI only when API-key config is present; invalid or failing config remains typed.
- `openai-embedding.layer({ model, apiKey, clientConfig?, config? })` provides `EmbeddingModel` through `@effect/ai-openai`.
- `openai-compatible-embedding.layer({ model, baseUrl, apiKey?, clientConfig?, config? })` targets an arbitrary compatible endpoint.
- Both embedding layers require a host `HttpClient`; the OpenAI account endpoint has no embedding route and fails typed.

## OpenAI account auth

```text
request → acquire credential generation G1 → fixed account endpoint
  ├── success → Responses stream
  └── pre-emission 401 → refreshRejected(G1) → replay once
      └── second 401/other failure → typed failure
```

Generalist owns PKCE, authorization/device flows, polling, token exchange/refresh, token documents, rotation, expiry, fingerprint validation, and generation-aware acquire/refresh. The host owns browser/callback UX, device instructions, profile fingerprints, and `CredentialStore`, whose `serialized` operation supplies any required durable cross-process coordination; the standard HTTP layer uses the host `HttpClient` and rejects redirects.

The account client fixes the endpoint and bearer/account headers without putting credentials in registration identity or metadata. Every request streams; non-streaming generation folds `response.completed` or `response.incomplete`, and a stream without either fails typed. Credentials map to Responses only when their fingerprint matches the product profile, and adapter errors expose neither secrets nor account IDs.

## Invariants

- Registration identity is canonical `(provider, model, registrationKey?)` in an immutable hash map; later writes of the same identity replace the entry.
- A selected layer is built once in the registry scope and reused for that registry lifetime.
- `withModel` holds an optional semaphore permit for the whole Effect; `stream` holds it through failure, interruption, consumption, and early termination.
- Provider layers provide `ModelRegistry`, not `LanguageModel`; combine independent provider registries with `ModelRegistry.layerMerged`, not `Layer.mergeAll`.
- All provider config decoders fail through typed `Schema.SchemaError`; the selected model remains authoritative.
- Released providers accept user image parts only as PNG, JPEG, GIF, or WebP bytes, canonical bare base64, matching canonical data URLs, or `URL` objects; malformed data, MIME mismatch, unsupported MIME, and assistant images fail before transport.
- OpenAI Responses, both compatible protocols, Anthropic, and OpenRouter preserve remote image URLs; Bedrock rejects URLs because Converse requires bytes.
- OpenAI, Anthropic, and OpenRouter promote decoded provider error parts to typed `AiError`: overload, timeout, and rate limit are retryable; request, auth, permission, content-policy, quota, and unknown codes are terminal. Messages/codes are bounded, known identity metadata is retained, and arbitrary payloads are discarded.
- OpenAI, Anthropic, and OpenRouter classify context overflow from narrow structured evidence; reactive compaction consults only the selected registration and does not treat overflow as ordinary retry.
- Unknown compatible endpoints classify no failures unless given `classifyFailure`; `normalizeResponsesSSE` remains public for custom OpenAI clients.
- Bedrock uses strict known-event lifecycle validation, typed truncation/request/stream failures, and ignores unknown future AWS union members. Tests inject credentials/transport and do not read ambient AWS state.
- Bedrock auth uses a refreshable AWS Node default chain or redacted bearer token; configuration owns region/endpoint/profile/mode, never registration metadata. Expired-token recovery is coalesced by rejected generation, then forced-refreshes and replays once only before output.

## Related

- Source: `packages/generalist/src/ai/...`
- Site: `/docs/guides/providers`, `/docs/reference/providers`
