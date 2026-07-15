import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js"
import { auth } from "@modelcontextprotocol/sdk/client/auth.js"
import type { OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js"
import type { OAuthClientInformationMixed, OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js"
import { OAuthTokensSchema } from "@modelcontextprotocol/sdk/shared/auth.js"
import {
  Context,
  Crypto,
  Effect,
  Encoding,
  Layer,
  Option,
  Redacted,
  Ref,
  Schema,
  Semaphore,
  SynchronizedRef,
} from "effect"

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

type OAuthFlow =
  | { readonly _tag: "Idle" }
  | {
      readonly _tag: "Pending"
      readonly state: string
      readonly verifier?: string
      readonly authorization?: Authorization
    }

const Idle: OAuthFlow = { _tag: "Idle" }

/** @experimental */
export const layer = (configuration: Configuration): Layer.Layer<OAuth, never, TokenStore | Crypto.Crypto> =>
  Layer.effect(
    OAuth,
    Effect.gen(function* () {
      const store = yield* TokenStore
      const crypto = yield* Crypto.Crypto
      const flow = yield* SynchronizedRef.make<OAuthFlow>(Idle)
      const clientInformation = yield* Ref.make(Option.fromUndefinedOr(configuration.clientInformation))
      const discoveryState = yield* Ref.make(Option.none<OAuthDiscoveryState>())
      const boundaryFailure = yield* Ref.make(Option.none<OAuthProviderError>())
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
      const currentState = SynchronizedRef.modifyEffect(flow, (current) =>
        current._tag === "Pending"
          ? Effect.succeed([current.state, current] as const)
          : freshState.pipe(Effect.map((generated) => [generated, { _tag: "Pending", state: generated }] as const)),
      )
      const currentVerifier = SynchronizedRef.get(flow).pipe(
        Effect.flatMap((current) =>
          current._tag === "Pending" && current.verifier !== undefined
            ? Effect.succeed(current.verifier)
            : Effect.fail(providerFailure("code verifier")),
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
            SynchronizedRef.update(flow, (current) =>
              current._tag === "Pending"
                ? {
                    ...current,
                    authorization: { url: url.toString(), state: url.searchParams.get("state") ?? "" },
                  }
                : current,
            ),
          ),
        saveCodeVerifier: (value) =>
          runPromise(
            SynchronizedRef.update(flow, (current) =>
              current._tag === "Pending" ? { ...current, verifier: value } : current,
            ),
          ),
        codeVerifier: () => runPromise(currentVerifier),
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
                    scope === "verifier"
                      ? SynchronizedRef.update(flow, (current) => {
                          if (current._tag === "Idle") return current
                          const { verifier: _, ...withoutVerifier } = current
                          return withoutVerifier
                        })
                      : Effect.void,
                    scope === "discovery" || scope === "all" ? Ref.set(discoveryState, Option.none()) : Effect.void,
                    scope === "all" ? SynchronizedRef.set(flow, Idle) : Effect.void,
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
          yield* SynchronizedRef.set(flow, { _tag: "Pending", state: generated })
          yield* Effect.tryPromise({
            try: () =>
              auth(provider, {
                serverUrl: configuration.serverUrl,
                ...(configuration.scope === undefined ? {} : { scope: configuration.scope }),
              }),
            catch: () => providerFailure("authorize"),
          })
          const current = yield* SynchronizedRef.get(flow)
          if (current._tag === "Idle" || current.authorization === undefined) {
            return yield* providerFailure("authorize")
          }
          return current.authorization
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
            const consumed = yield* SynchronizedRef.modifyEffect(flow, (current) => {
              const matches = current._tag === "Pending" && receivedState === current.state
              return Effect.succeed([matches ? Option.some(current) : Option.none(), matches ? Idle : current] as const)
            })
            if (Option.isNone(consumed)) {
              return yield* OAuthExpiredError.make({ server: configuration.serverUrl })
            }
            const denial = url.searchParams.get("error")
            if (denial !== null) {
              return yield* OAuthDeniedError.make({ reason: denial })
            }
            const code = url.searchParams.get("code")
            if (code === null) {
              return yield* OAuthDeniedError.make({ reason: "authorization code missing" })
            }
            const callbackProvider: OAuthClientProvider = {
              ...provider,
              codeVerifier: () =>
                runPromise(
                  consumed.value.verifier === undefined
                    ? Effect.fail(providerFailure("code verifier"))
                    : Effect.succeed(consumed.value.verifier),
                ),
            }
            yield* Effect.tryPromise({
              try: () =>
                auth(callbackProvider, {
                  serverUrl: configuration.serverUrl,
                  authorizationCode: code,
                  ...(configuration.scope === undefined ? {} : { scope: configuration.scope }),
                }),
              catch: () => providerFailure("exchange"),
            })
          }),
        ),
      )
      return OAuth.of({
        provider,
        withTransport,
        authorize,
        pending: SynchronizedRef.get(flow).pipe(
          Effect.map((current) =>
            current._tag === "Pending" && current.authorization !== undefined
              ? Option.some(current.authorization)
              : Option.none(),
          ),
        ),
        callback,
        clear: lifecycleSemaphore.withPermit(
          store.remove(configuration.serverUrl).pipe(
            Effect.mapError(() => providerFailure("remove tokens")),
            Effect.ensuring(
              Effect.all(
                [
                  SynchronizedRef.set(flow, Idle),
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
