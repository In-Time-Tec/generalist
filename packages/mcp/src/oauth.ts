import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js"
import { auth } from "@modelcontextprotocol/sdk/client/auth.js"
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js"
import { Context, Effect, Layer, Option, Redacted, Ref, Schema } from "effect"

/** @experimental */
export class OAuthPendingError extends Schema.TaggedErrorClass<OAuthPendingError>()("OAuthPendingError", {
  authorizationUrl: Schema.String,
}) {}

/** @experimental */
export class OAuthDeniedError extends Schema.TaggedErrorClass<OAuthDeniedError>()("OAuthDeniedError", {
  reason: Schema.String,
}) {}

/** @experimental */
export class OAuthExpiredError extends Schema.TaggedErrorClass<OAuthExpiredError>()("OAuthExpiredError", {
  server: Schema.String,
}) {}

/** @experimental */
export class OAuthProviderError extends Schema.TaggedErrorClass<OAuthProviderError>()("OAuthProviderError", {
  server: Schema.String,
  operation: Schema.String,
  message: Schema.String,
}) {}

/** @experimental */
export interface TokenStoreInterface {
  readonly load: (server: string) => Effect.Effect<Option.Option<Redacted.Redacted<string>>, OAuthProviderError>
  readonly save: (server: string, tokens: Redacted.Redacted<string>) => Effect.Effect<void, OAuthProviderError>
  readonly remove: (server: string) => Effect.Effect<void, OAuthProviderError>
}

/** @experimental */
export class TokenStore extends Context.Service<TokenStore, TokenStoreInterface>()("@batonfx/mcp/OAuthTokenStore") {}

/** @experimental */
export const tokenStoreTestLayer = (implementation: TokenStoreInterface): Layer.Layer<TokenStore> =>
  Layer.succeed(TokenStore, TokenStore.of(implementation))

/** @experimental */
export const tokenStoreMemoryLayer: Layer.Layer<TokenStore> = Layer.effect(
  TokenStore,
  Effect.gen(function* () {
    const values = yield* Ref.make(new Map<string, Redacted.Redacted<string>>())
    return TokenStore.of({
      load: Effect.fn("OAuthTokenStore.load")((server) =>
        Ref.get(values).pipe(
          Effect.map((entries) => {
            const value = entries.get(server)
            return value === undefined ? Option.none() : Option.some(value)
          }),
        ),
      ),
      save: Effect.fn("OAuthTokenStore.save")((server, tokens) =>
        Ref.update(values, (entries) => new Map(entries).set(server, tokens)),
      ),
      remove: Effect.fn("OAuthTokenStore.remove")((server) =>
        Ref.update(values, (entries) => {
          const next = new Map(entries)
          next.delete(server)
          return next
        }),
      ),
    })
  }),
)

/** @experimental */
export interface Configuration {
  readonly serverUrl: string
  readonly redirectUrl: string
  readonly clientMetadata: OAuthClientMetadata
  readonly clientInformation?: OAuthClientInformationMixed
  readonly scope?: string
}

/** @experimental */
export interface Authorization {
  readonly url: string
  readonly state: string
}

/** @experimental */
export interface Interface {
  readonly provider: OAuthClientProvider
  readonly authorize: () => Effect.Effect<Authorization, OAuthProviderError>
  readonly callback: (url: string) => Effect.Effect<void, OAuthDeniedError | OAuthExpiredError | OAuthProviderError>
  readonly clear: Effect.Effect<void, OAuthProviderError>
}

/** @experimental */
export class OAuth extends Context.Service<OAuth, Interface>()("@batonfx/mcp/OAuth") {}

const message = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error))
const randomState = (): string => crypto.randomUUID()

/** @experimental */
export const layer = (configuration: Configuration): Layer.Layer<OAuth, never, TokenStore> =>
  Layer.effect(
    OAuth,
    Effect.gen(function* () {
      const store = yield* TokenStore
      const verifier = yield* Ref.make(Option.none<string>())
      const pending = yield* Ref.make(Option.none<Authorization>())
      const state = yield* Ref.make(Option.none<string>())
      const loadTokens = store
        .load(configuration.serverUrl)
        .pipe(
          Effect.map((value) =>
            Option.map(value, (secret) => JSON.parse(Redacted.value(secret)) as OAuthTokens).pipe(
              Option.getOrUndefined,
            ),
          ),
        )
      const provider: OAuthClientProvider = {
        redirectUrl: configuration.redirectUrl,
        clientMetadata: configuration.clientMetadata,
        state: () => Effect.runPromise(Ref.get(state).pipe(Effect.map(Option.getOrThrow))),
        clientInformation: () => configuration.clientInformation,
        tokens: () => Effect.runPromise(loadTokens),
        saveTokens: (tokens) =>
          Effect.runPromise(store.save(configuration.serverUrl, Redacted.make(JSON.stringify(tokens)))),
        redirectToAuthorization: (url) =>
          Effect.runPromise(
            Ref.set(pending, Option.some({ url: url.toString(), state: url.searchParams.get("state") ?? "" })),
          ),
        saveCodeVerifier: (value) => Effect.runPromise(Ref.set(verifier, Option.some(value))),
        codeVerifier: () => Effect.runPromise(Ref.get(verifier).pipe(Effect.map(Option.getOrThrow))),
        invalidateCredentials: (scope) =>
          Effect.runPromise(
            scope === "tokens" || scope === "all" ? store.remove(configuration.serverUrl) : Effect.void,
          ),
      }
      const providerFailure = (operation: string, cause: unknown) =>
        new OAuthProviderError({ server: configuration.serverUrl, operation, message: message(cause) })
      const authorize = Effect.fn("OAuth.authorize")(function* () {
        const generated = randomState()
        yield* Ref.set(state, Option.some(generated))
        yield* Ref.set(pending, Option.none())
        yield* Effect.tryPromise({
          try: () =>
            auth(provider, {
              serverUrl: configuration.serverUrl,
              ...(configuration.scope === undefined ? {} : { scope: configuration.scope }),
            }),
          catch: (cause) => providerFailure("authorize", cause),
        })
        const authorization = yield* Ref.get(pending)
        if (Option.isNone(authorization))
          return yield* providerFailure("authorize", "Provider did not request authorization")
        return authorization.value
      })
      const callback = Effect.fn("OAuth.callback")(function* (callbackUrl: string) {
        const url = yield* Effect.try({
          try: () => new URL(callbackUrl),
          catch: (cause) => providerFailure("callback", cause),
        })
        const denial = url.searchParams.get("error")
        if (denial !== null) return yield* new OAuthDeniedError({ reason: denial })
        const expected = yield* Ref.get(state)
        if (Option.isNone(expected) || url.searchParams.get("state") !== expected.value) {
          return yield* new OAuthExpiredError({ server: configuration.serverUrl })
        }
        const code = url.searchParams.get("code")
        if (code === null) return yield* new OAuthDeniedError({ reason: "authorization code missing" })
        yield* Effect.tryPromise({
          try: () =>
            auth(provider, {
              serverUrl: configuration.serverUrl,
              authorizationCode: code,
              ...(configuration.scope === undefined ? {} : { scope: configuration.scope }),
            }),
          catch: (cause) => providerFailure("exchange", cause),
        })
        yield* Ref.set(state, Option.none())
        yield* Ref.set(verifier, Option.none())
      })
      return OAuth.of({ provider, authorize, callback, clear: store.remove(configuration.serverUrl) })
    }),
  )

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<OAuth> =>
  Layer.succeed(OAuth, OAuth.of(implementation))
