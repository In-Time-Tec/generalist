# `@batonfx/providers`

Focused composition guide for Effect AI provider registration and model metadata.

## Install

```sh
bun add effect @batonfx/core @batonfx/providers
```

## Imports

```ts
import { Anthropic, Catalog, Deterministic, OpenAi } from "@batonfx/providers"
```

## Layer graph

```text
Deterministic.layer(selection)
├─ provides ModelRegistry
└─ registered LanguageModel selected by ModelRegistry.operate
   └─ Agent.generate
```

## Runnable program

Checked source: [`../../examples/package-composition-guides/src/providers.ts`](../../examples/package-composition-guides/src/providers.ts)

```ts
import { Console, Effect } from "effect"
import { Agent, ModelRegistry } from "@batonfx/core"
import { Deterministic } from "@batonfx/providers"

const agent = Agent.make({ name: "local-assistant" })
const selection = { provider: "deterministic", model: "local" }

const program = ModelRegistry.operate(
  selection,
  Agent.generate(agent, { prompt: "Give me the deterministic response." }),
).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
  Effect.provide(Deterministic.layer(selection)),
)

await Effect.runPromise(program)
```

Run `bun examples/package-composition-guides/src/providers.ts`.

## Errors, requirements, and resources

The layer discharges `ModelRegistry` and `LanguageModel`, leaving `R = never`; success is `void`. The error channel is the agent's schema-backed `RunError` union, including `AgentError`, `AgentSuspended`, `TurnLimitExceeded`, and `MiddlewareViolation`, plus schema-backed `LanguageModelNotRegistered` from model selection. This deterministic layer owns no external resource and introduces no concurrency. Production provider layers can additionally require configuration and `HttpClient`; callers choosing fetch explicitly compose `FetchHttpClient.layer`.

OpenAI, Anthropic, and OpenRouter registrations include provider-specific context-overflow classification for Baton's bounded compact-and-replay path. OpenAI-compatible registrations remain conservative unless `classifyFailure` is explicitly supplied, for example `OpenAi.classifyFailure` for an endpoint known to preserve OpenAI error semantics.

## OpenAI account Responses

`OpenAi.layerAccount` registers Responses models backed by an OpenAI account session. The host supplies dynamic credentials; Baton reads them for every request:

```ts
const credentials: OpenAi.OpenAiAccountCredentials = {
  acquire: loadCurrentCredential,
  refreshRejected: (generation) => refreshIfGenerationIsCurrent(generation),
}

const providers = OpenAi.layerAccount({
  model: "gpt-5",
  credentials,
})
```

Each credential contains a redacted access token, an account identifier, and an opaque generation. Baton owns the fixed `https://chatgpt.com/backend-api/codex/responses` destination, account request headers, Responses encoding and decoding, and at most one refresh and replay after a 401 received before stream output. When callers provide `FetchHttpClient.layer`, redirects are rejected. A custom `HttpClient` is a trusted transport and must not follow redirects internally. A second 401 and all other failures are surfaced without an authorization retry.

Baton's `OpenAiAccountAuth` namespace owns the reusable OAuth protocol: PKCE and authorization URLs, device polling, token exchange and refresh semantics, token documents, proactive refresh, account identity checks, and generation-aware refresh behavior. `OpenAiAccountAuthHttp.layer` supplies the standard HTTP implementation. A host supplies `OpenAiAccountAuthHost` and `OpenAiAccountDevicePresenter` implementations for browser/callback and device display UX, plus an `OpenAiAccountCredentialStore` whose `serialized` operation provides the required coordination, including durable cross-process coordination when needed; Baton does not choose a filesystem or database.

Use `OpenAi.credentialsFromAccountAuth(service, expectedFingerprint)` to map the auth service directly to request credentials and enforce the product-owned credential-to-profile binding without exposing auth failures, token values, or account identifiers in adapter errors. `refreshRejected` receives the rejected generation so concurrent callers can share already-rotated credentials instead of rotating the same refresh token repeatedly.

## More

- Current behavior: [Providers](../../docs/features/providers.md)
- Deeper examples: [structured extraction](../../examples/structured-extraction/) and [tool-calling chatbot](../../examples/tool-calling-chatbot/)
- Canonical root namespaces include `OpenAiAccountAuth` and `OpenAiAccountAuthHttp` alongside the provider and catalog namespaces. Account auth also has `./openai-account-auth` and `./openai-account-auth-http` package subpaths.
