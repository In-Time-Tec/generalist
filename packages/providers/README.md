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
Deterministic.withDeterministic(selection)
├─ provides ModelRegistry
└─ registered LanguageModel selected by ModelRegistry.provide
   └─ Agent.generate
```

## Runnable program

Checked source: [`../../examples/package-composition-guides/src/providers.ts`](../../examples/package-composition-guides/src/providers.ts)

```ts
import { Console, Effect } from "effect"
import { Agent, ModelRegistry } from "@batonfx/core"
import { Deterministic } from "@batonfx/providers"

const agent = Agent.make("local-assistant")
const selection = { provider: "deterministic", model: "local" }

const program = ModelRegistry.provide(
  selection,
  Agent.generate(agent, { prompt: "Give me the deterministic response." }),
).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
  Effect.provide(Deterministic.withDeterministic(selection)),
)

await Effect.runPromise(program)
```

Run `bun examples/package-composition-guides/src/providers.ts`.

## Errors, requirements, and resources

The layer discharges `ModelRegistry` and `LanguageModel`, leaving `R = never`; success is `void`. The error channel is the agent's schema-backed `RunError` union, including `AgentError`, `AgentSuspended`, `TurnLimitExceeded`, and `MiddlewareViolation`, plus schema-backed `LanguageModelNotRegistered` from model selection. This deterministic layer owns no external resource and introduces no concurrency. Production provider layers can additionally require configuration and `HttpClient`; fetch conveniences supply the client.

OpenAI, Anthropic, and OpenRouter registrations include provider-specific context-overflow classification for Baton's bounded compact-and-replay path. OpenAI-compatible registrations remain conservative unless `classifyFailure` is explicitly supplied, for example `OpenAi.classifyFailure` for an endpoint known to preserve OpenAI error semantics.

## OpenAI account Responses

`OpenAi.openAiAccount`, `OpenAi.withOpenAiAccount`, and `OpenAi.withOpenAiAccountFetch` register Responses models backed by an OpenAI account session. The host supplies dynamic credentials; Baton reads them for every request:

```ts
const credentials: OpenAi.OpenAiAccountCredentials = {
  acquire: loadCurrentCredential,
  refreshRejected: (generation) => refreshIfGenerationIsCurrent(generation),
}

const providers = OpenAi.withOpenAiAccountFetch({
  model: "gpt-5",
  credentials,
})
```

Each credential contains a redacted access token, an account identifier, and an opaque generation. Baton owns the fixed `https://chatgpt.com/backend-api/codex/responses` destination, account request headers, Responses encoding and decoding, and at most one refresh and replay after a 401 received before stream output. Redirects are rejected by the fetch convenience. A custom `HttpClient` supplied to the base helper is a trusted transport and must not follow redirects internally. A second 401 and all other failures are surfaced without an authorization retry.

The host owns browser or device authorization, PKCE and callback UX, credential persistence, proactive refresh, and refresh serialization. `refreshRejected` receives the rejected generation so concurrent callers can share already-rotated credentials instead of rotating the same refresh token repeatedly. Credential failures use `OpenAiAccountCredentialError`; its public shape deliberately contains no provider response, token, or account data. Account credentials never choose the destination and are not added to registration identity or metadata.

## More

- Current behavior: [Providers](../../docs/features/providers.md)
- Deeper examples: [structured extraction](../../examples/structured-extraction/) and [tool-calling chatbot](../../examples/tool-calling-chatbot/)
- Canonical root namespaces are `Catalog`, `OpenAi`, `Anthropic`, `OpenRouter`, `OpenAiCompatible`, `Deterministic`, `Presets`, and `Embedding`. Their established package subpaths remain compatibility imports through the stated pre-1.0 deprecation window.
