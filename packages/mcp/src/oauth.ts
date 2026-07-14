import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js"
import { auth } from "@modelcontextprotocol/sdk/client/auth.js"
import type { OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js"
import type { OAuthClientInformationMixed, OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js"
import { OAuthTokensSchema } from "@modelcontextprotocol/sdk/shared/auth.js"
import { Context, Crypto, Effect, Encoding, Layer, Option, Redacted, Ref, Schema, Semaphore } from "effect"

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
export class TokenStore extends Context.Service<TokenStore, TokenStoreInterface>()("@batonfx/mcp/oauth/TokenStore") {}

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
  readonly withTransport: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | OAuthProviderError, R>
  readonly authorize: Effect.Effect<Authorization, OAuthProviderError>
  readonly pending: Effect.Effect<Option.Option<Authorization>>
  readonly callback: (url: string) => Effect.Effect<void, OAuthDeniedError | OAuthExpiredError | OAuthProviderError>
  readonly clear: Effect.Effect<void, OAuthProviderError>
}

/** @experimental */
export class OAuth extends Context.Service<OAuth, Interface>()("@batonfx/mcp/oauth") {}

/** @experimental */
export const layer = (configuration: Configuration): Layer.Layer<OAuth, never, TokenStore | Crypto.Crypto> =>
  Layer.effect(
    OAuth,
    Effect.gen(function* () {
      const store = yield* TokenStore
      const crypto = yield* Crypto.Crypto
      const verifier = yield* Ref.make(Option.none<string>())
      const pending = yield* Ref.make(Option.none<Authorization>())
      const state = yield* Ref.make(Option.none<string>())
      const clientInformation = yield* Ref.make(Option.fromUndefinedOr(configuration.clientInformation))
      const discoveryState = yield* Ref.make(Option.none<OAuthDiscoveryState>())
      const boundaryFailure = yield* Ref.make(Option.none<OAuthProviderError>())
      const stateSemaphore = yield* Semaphore.make(1)
      const lifecycleSemaphore = yield* Semaphore.make(1)
      const context = yield* Effect.context<never>()
      const runPromise = Effect.runPromiseWith(context)
      const providerFailure = (operation: string) =>
        OAuthProviderError.make({
          server: configuration.serverUrl,
          operation,
          message: `OAuth ${operation} failed`,
        })
      const providerBoundary = <A, R>(effect: Effect.Effect<A, OAuthProviderError, R>) =>
        effect.pipe(Effect.tapError((error) => Ref.set(boundaryFailure, Option.some(error))))
      const loadTokens = store.load(configuration.serverUrl).pipe(
        Effect.mapError(() => providerFailure("load tokens")),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.as(Effect.void, undefined),
            onSome: (secret) =>
              Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(Redacted.value(secret)).pipe(
                Effect.flatMap((tokens) =>
                  Effect.try({
                    try: () => OAuthTokensSchema.parse(tokens),
                    catch: () => providerFailure("load tokens"),
                  }),
                ),
                Effect.mapError(() => providerFailure("load tokens")),
              ),
          }),
        ),
      )
      const freshState = crypto.randomBytes(32).pipe(
        Effect.map(Encoding.encodeBase64Url),
        Effect.mapError(() => providerFailure("state")),
      )
      const currentState = stateSemaphore.withPermit(
        Ref.get(state).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => freshState.pipe(Effect.tap((generated) => Ref.set(state, Option.some(generated)))),
              onSome: Effect.succeed,
            }),
          ),
        ),
      )
      const provider: OAuthClientProvider = {
        redirectUrl: configuration.redirectUrl,
        clientMetadata: configuration.clientMetadata,
        state: () => runPromise(currentState),
        clientInformation: () => runPromise(Ref.get(clientInformation).pipe(Effect.map(Option.getOrUndefined))),
        saveClientInformation: (information) => runPromise(Ref.set(clientInformation, Option.some(information))),
        discoveryState: () => runPromise(Ref.get(discoveryState).pipe(Effect.map(Option.getOrUndefined))),
        saveDiscoveryState: (discovery) => runPromise(Ref.set(discoveryState, Option.some(discovery))),
        tokens: () => runPromise(loadTokens.pipe(providerBoundary)),
        saveTokens: (tokens) =>
          runPromise(
            Schema.encodeEffect(Schema.UnknownFromJsonString)(tokens).pipe(
              Effect.flatMap((encoded) => store.save(configuration.serverUrl, Redacted.make(encoded))),
              Effect.mapError(() => providerFailure("save tokens")),
              providerBoundary,
            ),
          ),
        redirectToAuthorization: (url) =>
          runPromise(
            Ref.set(pending, Option.some({ url: url.toString(), state: url.searchParams.get("state") ?? "" })),
          ),
        saveCodeVerifier: (value) => runPromise(Ref.set(verifier, Option.some(value))),
        codeVerifier: () => runPromise(Ref.get(verifier).pipe(Effect.map(Option.getOrThrow))),
        invalidateCredentials: (scope) =>
          runPromise(
            (scope === "tokens" || scope === "all"
              ? store.remove(configuration.serverUrl).pipe(Effect.mapError(() => providerFailure("remove tokens")))
              : Effect.void
            ).pipe(
              Effect.ensuring(
                Effect.all(
                  [
                    scope === "client" || scope === "all" ? Ref.set(clientInformation, Option.none()) : Effect.void,
                    scope === "verifier" || scope === "all" ? Ref.set(verifier, Option.none()) : Effect.void,
                    scope === "discovery" || scope === "all" ? Ref.set(discoveryState, Option.none()) : Effect.void,
                    scope === "all"
                      ? Effect.all([Ref.set(state, Option.none()), Ref.set(pending, Option.none())], {
                          discard: true,
                        })
                      : Effect.void,
                  ],
                  { discard: true },
                ),
              ),
              providerBoundary,
            ),
          ),
      }
      const withTransport = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | OAuthProviderError, R> =>
        lifecycleSemaphore.withPermit(
          Ref.set(boundaryFailure, Option.none()).pipe(
            Effect.andThen(
              effect.pipe(
                Effect.matchEffect({
                  onFailure: (error) =>
                    Ref.getAndSet(boundaryFailure, Option.none()).pipe(
                      Effect.flatMap(
                        (failure): Effect.Effect<never, E | OAuthProviderError> =>
                          Option.isSome(failure) ? Effect.fail(failure.value) : Effect.fail(error),
                      ),
                    ),
                  onSuccess: (value) =>
                    Ref.getAndSet(boundaryFailure, Option.none()).pipe(
                      Effect.flatMap(
                        (failure): Effect.Effect<A, OAuthProviderError> =>
                          Option.isSome(failure) ? Effect.fail(failure.value) : Effect.succeed(value),
                      ),
                    ),
                }),
              ),
            ),
          ),
        )
      const authorize = lifecycleSemaphore.withPermit(
        Effect.gen(function* () {
          yield* store.remove(configuration.serverUrl).pipe(Effect.mapError(() => providerFailure("remove tokens")))
          const generated = yield* freshState
          yield* Ref.set(state, Option.some(generated))
          yield* Ref.set(pending, Option.none())
          yield* Ref.set(verifier, Option.none())
          yield* Effect.tryPromise({
            try: () =>
              auth(provider, {
                serverUrl: configuration.serverUrl,
                ...(configuration.scope === undefined ? {} : { scope: configuration.scope }),
              }),
            catch: () => providerFailure("authorize"),
          })
          const authorization = yield* Ref.get(pending)
          if (Option.isNone(authorization)) return yield* providerFailure("authorize")
          return authorization.value
        }),
      )
      const callback = Effect.fn("OAuth.callback")((callbackUrl: string) =>
        lifecycleSemaphore.withPermit(
          Effect.gen(function* () {
            const url = yield* Effect.try({
              try: () => new URL(callbackUrl),
              catch: () => providerFailure("callback"),
            })
            const receivedState = url.searchParams.get("state")
            const matched = yield* Ref.modify(state, (expected) => {
              const matches = Option.isSome(expected) && receivedState === expected.value
              return [matches, matches ? Option.none() : expected]
            })
            if (!matched) {
              return yield* OAuthExpiredError.make({ server: configuration.serverUrl })
            }
            const denial = url.searchParams.get("error")
            if (denial !== null) {
              yield* Effect.all([Ref.set(verifier, Option.none()), Ref.set(pending, Option.none())], {
                discard: true,
              })
              return yield* OAuthDeniedError.make({ reason: denial })
            }
            const code = url.searchParams.get("code")
            if (code === null) {
              yield* Effect.all([Ref.set(verifier, Option.none()), Ref.set(pending, Option.none())], {
                discard: true,
              })
              return yield* OAuthDeniedError.make({ reason: "authorization code missing" })
            }
            yield* Effect.tryPromise({
              try: () =>
                auth(provider, {
                  serverUrl: configuration.serverUrl,
                  authorizationCode: code,
                  ...(configuration.scope === undefined ? {} : { scope: configuration.scope }),
                }),
              catch: () => providerFailure("exchange"),
            }).pipe(
              Effect.ensuring(
                Effect.all([Ref.set(verifier, Option.none()), Ref.set(pending, Option.none())], {
                  discard: true,
                }),
              ),
            )
          }),
        ),
      )
      return OAuth.of({
        provider,
        withTransport,
        authorize,
        pending: Ref.get(pending),
        callback,
        clear: lifecycleSemaphore.withPermit(
          store.remove(configuration.serverUrl).pipe(
            Effect.mapError(() => providerFailure("remove tokens")),
            Effect.ensuring(
              Effect.all(
                [
                  Ref.set(state, Option.none()),
                  Ref.set(verifier, Option.none()),
                  Ref.set(pending, Option.none()),
                  Ref.set(clientInformation, Option.none()),
                  Ref.set(discoveryState, Option.none()),
                  Ref.set(boundaryFailure, Option.none()),
                ],
                { discard: true },
              ),
            ),
          ),
        ),
      })
    }),
  )

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<OAuth> =>
  Layer.succeed(OAuth, OAuth.of(implementation))
