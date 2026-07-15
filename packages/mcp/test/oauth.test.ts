import { describe, expect, it, layer } from "@effect/vitest"
import {
  Cause,
  Context,
  Crypto,
  Deferred,
  Effect,
  Fiber,
  Layer,
  Option,
  Predicate,
  Redacted,
  Ref,
  Schema,
} from "effect"
import { beforeEach, vi } from "vitest"
import { McpToolSource, OAuth } from "../src/index"

const authMock = vi.hoisted(() => vi.fn())

vi.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({ auth: authMock }))

const configuration: OAuth.Configuration = {
  serverUrl: "https://mcp.example/rpc",
  redirectUrl: "https://app.example/oauth/callback",
  clientMetadata: {
    client_name: "Baton OAuth test",
    redirect_uris: ["https://app.example/oauth/callback"],
  },
  clientInformation: { client_id: "baton-test" },
}

const dynamicConfiguration: OAuth.Configuration = {
  serverUrl: configuration.serverUrl,
  redirectUrl: configuration.redirectUrl,
  clientMetadata: configuration.clientMetadata,
}

const cryptoTestLayer = Layer.sync(Crypto.Crypto, () => {
  let next = 1
  return Crypto.make({
    randomBytes: (size) => {
      const bytes = new Uint8Array(size)
      bytes.fill(next)
      next += 1
      return bytes
    },
    digest: (_algorithm, data) => Effect.succeed(data),
  })
})

const oauthLayer = OAuth.layer(configuration).pipe(
  Layer.provide(Layer.merge(OAuth.tokenStoreMemoryLayer, cryptoTestLayer)),
)

const dynamicOAuthLayer = OAuth.layer(dynamicConfiguration).pipe(
  Layer.provide(Layer.merge(OAuth.tokenStoreMemoryLayer, cryptoTestLayer)),
)

interface AsyncProvider {
  readonly state: () => Promise<string>
  readonly tokens: () => Promise<
    | {
        readonly access_token: string
        readonly token_type: string
        readonly refresh_token?: string | undefined
      }
    | undefined
  >
  readonly saveTokens: (tokens: {
    readonly access_token: string
    readonly token_type: string
    readonly refresh_token?: string | undefined
  }) => Promise<void>
  readonly redirectToAuthorization: (url: URL) => Promise<void>
  readonly saveCodeVerifier: (verifier: string) => Promise<void>
  readonly codeVerifier: () => Promise<string>
}

const sdkCallback = <A>(evaluate: () => A | PromiseLike<A>) =>
  Effect.suspend(() => {
    const result = evaluate()
    return Predicate.isPromiseLike(result) ? Effect.tryPromise(() => result) : Effect.succeed(result)
  })

const oauthEffect = <A, E>(name: string, test: () => Effect.Effect<A, E, OAuth.OAuth>) => {
  layer(oauthLayer)(name, (methods) => methods.effect(name, test))
}

const dynamicOAuthEffect = <A, E>(name: string, test: () => Effect.Effect<A, E, OAuth.OAuth>) => {
  layer(dynamicOAuthLayer)(name, (methods) => methods.effect(name, test))
}

describe("OAuth", () => {
  beforeEach(() => {
    authMock.mockClear()
    authMock.mockImplementation((provider: AsyncProvider, options: { readonly authorizationCode?: string }) =>
      Effect.runPromise(
        Effect.gen(function* () {
          if (options.authorizationCode !== undefined) {
            const verifier = yield* Effect.tryPromise(provider.codeVerifier)
            if (options.authorizationCode === "fail-secret") {
              return yield* OAuth.OAuthProviderError.make({
                server: configuration.serverUrl,
                operation: "mock exchange",
                message: "provider included access-token-secret",
              })
            }
            yield* Effect.tryPromise(() =>
              provider.saveTokens({
                access_token: `${options.authorizationCode}-${verifier}`,
                token_type: "Bearer",
                refresh_token: "refresh",
              }),
            )
            return "AUTHORIZED"
          }

          const tokens = yield* Effect.tryPromise(provider.tokens)
          if (tokens?.refresh_token !== undefined) {
            yield* Effect.tryPromise(() =>
              provider.saveTokens({
                access_token: "refreshed-access-token",
                token_type: "Bearer",
                refresh_token: tokens.refresh_token,
              }),
            )
            return "AUTHORIZED"
          }

          const state = yield* Effect.tryPromise(provider.state)
          yield* Effect.tryPromise(() => provider.saveCodeVerifier("pkce-verifier"))
          yield* Effect.tryPromise(() =>
            provider.redirectToAuthorization(new URL(`https://auth.example/authorize?state=${state}`)),
          )
          return "REDIRECT"
        }),
      ),
    )
  })

  layer(OAuth.tokenStoreMemoryLayer)((methods) => {
    methods.effect("stores, loads, and removes redacted tokens in memory", () =>
      Effect.gen(function* () {
        const store = yield* OAuth.TokenStore
        const tokens = Redacted.make('{"access_token":"secret"}')
        yield* store.save("https://mcp.example", tokens)
        const loaded = yield* store.load("https://mcp.example")
        expect(Option.isSome(loaded)).toBe(true)
        expect(String(Option.getOrThrow(loaded))).not.toContain("secret")
        expect(Redacted.value(Option.getOrThrow(loaded))).toContain("secret")
        yield* store.remove("https://mcp.example")
        expect(Option.isNone(yield* store.load("https://mcp.example"))).toBe(true)
      }),
    )
  })

  it("exposes typed denied, expired, pending, and provider errors", () => {
    expect(OAuth.OAuthDeniedError.make({ reason: "access_denied" })._tag).toBe("OAuthDeniedError")
    expect(OAuth.OAuthExpiredError.make({ server: "server" })._tag).toBe("OAuthExpiredError")
    expect(OAuth.OAuthPendingError.make({ authorizationUrl: "https://auth.example" })._tag).toBe("OAuthPendingError")
    const provider = OAuth.OAuthProviderError.make({ server: "server", operation: "refresh", message: "failed" })
    expect(provider._tag).toBe("OAuthProviderError")
    expect(Schema.encodeSync(Schema.UnknownFromJsonString)(provider)).not.toContain("access_token")
  })

  oauthEffect("validates callback state before reporting authorization denial", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
      const error = yield* oauth
        .callback("https://app.example/oauth/callback?error=access_denied&state=unsolicited")
        .pipe(Effect.flip)

      expect(error).toBeInstanceOf(OAuth.OAuthExpiredError)
    }),
  )

  oauthEffect("initiates authorization with deterministic state and exchanges one callback", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
      const authorization = yield* oauth.authorize

      expect(authorization.url).toBe(`https://auth.example/authorize?state=${authorization.state}`)
      yield* oauth.callback(`https://app.example/oauth/callback?code=authorization-code&state=${authorization.state}`)

      const tokens = yield* sdkCallback(oauth.provider.tokens)
      expect(tokens?.access_token).toBe("authorization-code-pkce-verifier")

      const replay = yield* oauth
        .callback(`https://app.example/oauth/callback?code=replayed&state=${authorization.state}`)
        .pipe(Effect.flip)
      expect(replay).toBeInstanceOf(OAuth.OAuthExpiredError)
    }),
  )

  oauthEffect("consumes state and verifier before token exchange completes", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
      const authorization = yield* oauth.authorize
      const exchangeStarted = yield* Deferred.make<void>()
      const releaseExchange = yield* Deferred.make<void>()
      const context = yield* Effect.context<never>()
      const runPromise = Effect.runPromiseWith(context)
      authMock.mockImplementationOnce((provider: AsyncProvider) =>
        runPromise(
          Effect.gen(function* () {
            yield* Effect.tryPromise(provider.codeVerifier)
            yield* Deferred.succeed(exchangeStarted, undefined)
            yield* Deferred.await(releaseExchange)
            return "AUTHORIZED"
          }),
        ),
      )

      const callback = yield* oauth
        .callback(`https://app.example/oauth/callback?code=authorization-code&state=${authorization.state}`)
        .pipe(Effect.forkChild)
      yield* Deferred.await(exchangeStarted)

      expect((yield* sdkCallback(oauth.provider.codeVerifier).pipe(Effect.exit))._tag).toBe("Failure")
      expect(Option.isNone(yield* oauth.pending)).toBe(true)

      yield* Deferred.succeed(releaseExchange, undefined)
      yield* Fiber.join(callback)
    }),
  )

  oauthEffect("consumes a matching malformed callback", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
      const authorization = yield* oauth.authorize

      const malformed = yield* oauth
        .callback(`https://app.example/oauth/callback?state=${authorization.state}`)
        .pipe(Effect.flip)
      expect(malformed).toBeInstanceOf(OAuth.OAuthDeniedError)
      expect(Option.isNone(yield* oauth.pending)).toBe(true)
      expect((yield* sdkCallback(oauth.provider.codeVerifier).pipe(Effect.exit))._tag).toBe("Failure")

      const replay = yield* oauth
        .callback(`https://app.example/oauth/callback?code=replayed&state=${authorization.state}`)
        .pipe(Effect.flip)
      expect(replay).toBeInstanceOf(OAuth.OAuthExpiredError)
    }),
  )

  oauthEffect("allows exactly one of two concurrent duplicate callbacks", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
      const authorization = yield* oauth.authorize
      const callbackUrl = `https://app.example/oauth/callback?code=authorization-code&state=${authorization.state}`

      const outcomes = yield* Effect.all(
        [oauth.callback(callbackUrl).pipe(Effect.exit), oauth.callback(callbackUrl).pipe(Effect.exit)],
        {
          concurrency: 2,
        },
      )

      expect(outcomes.filter((outcome) => outcome._tag === "Success")).toHaveLength(1)
      expect(
        outcomes.filter(
          (outcome) => outcome._tag === "Failure" && Schema.is(OAuth.OAuthExpiredError)(Cause.squash(outcome.cause)),
        ),
      ).toHaveLength(1)
      expect(Option.isNone(yield* oauth.pending)).toBe(true)
      expect((yield* sdkCallback(oauth.provider.codeVerifier).pipe(Effect.exit))._tag).toBe("Failure")
    }),
  )

  oauthEffect("exposes captured SDK authorization as typed pending state", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
      if (oauth.provider.state === undefined) return yield* Effect.die("OAuth provider state is missing")
      const state = yield* sdkCallback(oauth.provider.state)
      yield* sdkCallback(() => oauth.provider.saveCodeVerifier("transport-pkce-verifier"))
      const url = new URL(`https://auth.example/authorize?state=${state}`)
      yield* sdkCallback(() => oauth.provider.redirectToAuthorization(url))
      const pending = Option.getOrThrow(yield* oauth.pending)
      const error = OAuth.OAuthPendingError.make({ authorizationUrl: pending.url })

      expect(pending).toEqual({ url: url.toString(), state })
      expect(error.authorizationUrl).toBe(url.toString())
    }),
  )

  dynamicOAuthEffect("persists dynamic client registration and honors client invalidation", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
      expect(yield* sdkCallback(oauth.provider.clientInformation)).toBeUndefined()
      if (oauth.provider.saveClientInformation === undefined) {
        return yield* Effect.die("OAuth provider cannot save dynamic client registration")
      }
      yield* sdkCallback(() => oauth.provider.saveClientInformation?.({ client_id: "dynamic-client" }))
      expect(yield* sdkCallback(oauth.provider.clientInformation)).toEqual({ client_id: "dynamic-client" })
      yield* sdkCallback(() => oauth.provider.invalidateCredentials?.("client"))
      expect(yield* sdkCallback(oauth.provider.clientInformation)).toBeUndefined()
    }),
  )

  oauthEffect("retains discovery state through callback exchange and clears it on invalidation", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
      const context = yield* Effect.context<never>()
      const runPromise = Effect.runPromiseWith(context)
      const sdk = yield* Effect.tryPromise(() =>
        vi.importActual<typeof import("@modelcontextprotocol/sdk/client/auth.js")>(
          "@modelcontextprotocol/sdk/client/auth.js",
        ),
      )
      const discovery = {
        authorizationServerUrl: "https://identity.example",
        resourceMetadataUrl: "https://mcp.example/oauth-resource",
        authorizationServerMetadata: {
          issuer: "https://identity.example",
          authorization_endpoint: "https://identity.example/authorize",
          token_endpoint: "https://identity.example/custom-token",
          response_types_supported: ["code"],
        },
      }
      if (oauth.provider.saveDiscoveryState === undefined || oauth.provider.discoveryState === undefined) {
        return yield* Effect.die("OAuth provider discovery state is missing")
      }

      yield* sdkCallback(() => oauth.provider.saveDiscoveryState?.(discovery))
      expect(yield* sdkCallback(oauth.provider.discoveryState)).toEqual(discovery)
      if (oauth.provider.state === undefined) return yield* Effect.die("OAuth provider state is missing")
      const state = yield* sdkCallback(oauth.provider.state)
      yield* sdkCallback(() => oauth.provider.saveCodeVerifier("discovery-verifier"))
      const tokenResponseBody = yield* Schema.encodeEffect(Schema.UnknownFromJsonString)({
        access_token: "discovered-access-token",
        token_type: "Bearer",
      })
      let tokenEndpoint = ""
      authMock.mockImplementationOnce((provider, options) =>
        sdk.auth(provider, {
          ...options,
          fetchFn: (url) =>
            runPromise(
              Effect.sync(() => {
                tokenEndpoint = url.toString()
                return new Response(tokenResponseBody, {
                  status: 200,
                  headers: { "content-type": "application/json" },
                })
              }),
            ),
        }),
      )
      yield* oauth.callback(`https://app.example/oauth/callback?code=discovered-code&state=${state}`)
      expect(tokenEndpoint).toBe("https://identity.example/custom-token")
      yield* sdkCallback(() => oauth.provider.invalidateCredentials?.("discovery"))
      expect(yield* sdkCallback(oauth.provider.discoveryState)).toBeUndefined()
    }),
  )

  oauthEffect("serializes transport authorization with explicit lifecycle operations", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
      const transportStarted = yield* Deferred.make<void>()
      const releaseTransport = yield* Deferred.make<void>()
      const transport = yield* oauth
        .withTransport(
          Deferred.succeed(transportStarted, undefined).pipe(Effect.andThen(Deferred.await(releaseTransport))),
        )
        .pipe(Effect.forkChild)
      yield* Deferred.await(transportStarted)
      const authorization = yield* oauth.authorize.pipe(Effect.forkChild)

      expect(authMock).not.toHaveBeenCalled()
      yield* Deferred.succeed(releaseTransport, undefined)
      yield* Fiber.join(transport)
      expect((yield* Fiber.join(authorization)).url).toContain("https://auth.example/authorize")
    }),
  )

  it.effect("surfaces provider persistence failure even when the SDK attempt swallows it", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Effect.context<never>()
        const runPromise = Effect.runPromiseWith(context)
        const sdk = yield* Effect.tryPromise(() =>
          vi.importActual<typeof import("@modelcontextprotocol/sdk/client/auth.js")>(
            "@modelcontextprotocol/sdk/client/auth.js",
          ),
        )
        const storedTokens = yield* Schema.encodeEffect(Schema.UnknownFromJsonString)({
          access_token: "expired-access-token",
          token_type: "Bearer",
          refresh_token: "refresh-token",
        })
        const storeLayer = OAuth.tokenStoreTestLayer({
          load: () => Effect.succeed(Option.some(Redacted.make(storedTokens))),
          save: () =>
            Effect.fail(
              OAuth.OAuthProviderError.make({
                server: configuration.serverUrl,
                operation: "save",
                message: "store leaked refresh-secret",
              }),
            ),
          remove: () => Effect.void,
        })
        const oauth = Context.get(
          yield* Layer.build(OAuth.layer(configuration).pipe(Layer.provide(Layer.merge(storeLayer, cryptoTestLayer)))),
          OAuth.OAuth,
        )
        if (oauth.provider.saveDiscoveryState === undefined) {
          return yield* Effect.die("OAuth provider discovery state is missing")
        }
        yield* sdkCallback(() =>
          oauth.provider.saveDiscoveryState?.({
            authorizationServerUrl: "https://identity.example",
            authorizationServerMetadata: {
              issuer: "https://identity.example",
              authorization_endpoint: "https://identity.example/authorize",
              token_endpoint: "https://identity.example/token",
              response_types_supported: ["code"],
            },
          }),
        )
        const error = yield* oauth
          .withTransport(
            Effect.tryPromise(() =>
              sdk.auth(oauth.provider, {
                serverUrl: configuration.serverUrl,
                fetchFn: () =>
                  runPromise(
                    Effect.succeed(
                      new Response('{"access_token":"refreshed-secret","token_type":"Bearer"}', {
                        status: 200,
                        headers: { "content-type": "application/json" },
                      }),
                    ),
                  ),
              }),
            ),
          )
          .pipe(Effect.flip)

        expect(error).toBeInstanceOf(OAuth.OAuthProviderError)
        expect(yield* Schema.encodeEffect(Schema.UnknownFromJsonString)(error)).not.toContain("secret")
      }),
    ),
  )

  it.effect("clears local authorization state when token removal fails", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const storeLayer = OAuth.tokenStoreTestLayer({
          load: () => Effect.succeed(Option.none()),
          save: () => Effect.void,
          remove: () =>
            Effect.fail(
              OAuth.OAuthProviderError.make({
                server: configuration.serverUrl,
                operation: "remove",
                message: "store unavailable",
              }),
            ),
        })
        const oauth = Context.get(
          yield* Layer.build(OAuth.layer(configuration).pipe(Layer.provide(Layer.merge(storeLayer, cryptoTestLayer)))),
          OAuth.OAuth,
        )
        if (
          oauth.provider.state === undefined ||
          oauth.provider.saveDiscoveryState === undefined ||
          oauth.provider.discoveryState === undefined
        ) {
          return yield* Effect.die("OAuth provider session state is missing")
        }
        const state = yield* sdkCallback(oauth.provider.state)
        yield* sdkCallback(() => oauth.provider.saveCodeVerifier("clear-verifier"))
        yield* sdkCallback(() =>
          oauth.provider.redirectToAuthorization(new URL(`https://auth.example/authorize?state=${state}`)),
        )
        yield* sdkCallback(() => oauth.provider.saveClientInformation?.({ client_id: "clear-client" }))
        yield* sdkCallback(() =>
          oauth.provider.saveDiscoveryState?.({ authorizationServerUrl: "https://identity.example" }),
        )

        const error = yield* oauth.clear.pipe(Effect.flip)
        expect(error).toBeInstanceOf(OAuth.OAuthProviderError)
        expect(Option.isNone(yield* oauth.pending)).toBe(true)
        expect(yield* sdkCallback(oauth.provider.clientInformation)).toBeUndefined()
        expect(yield* sdkCallback(oauth.provider.discoveryState)).toBeUndefined()
        const callback = yield* oauth
          .callback(`https://app.example/oauth/callback?code=replay&state=${state}`)
          .pipe(Effect.flip)
        expect(callback).toBeInstanceOf(OAuth.OAuthExpiredError)
      }),
    ),
  )

  oauthEffect("does not replace an unrelated connection failure with stale pending state", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
      yield* oauth.authorize
      const error = yield* Layer.build(
        McpToolSource.layer({
          name: "invalid",
          transport: { kind: "http", url: "not a URL", oauth },
        }),
      ).pipe(Effect.flip)

      expect(error).toBeInstanceOf(McpToolSource.McpConnectionError)
    }).pipe(Effect.scoped),
  )

  it.effect("preserves newly captured transport authorization as OAuthPendingError", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const reads = yield* Ref.make(0)
        const authorization = { url: "https://auth.example/authorize?state=transport", state: "transport" }
        const oauth: OAuth.Interface = {
          provider: {
            redirectUrl: configuration.redirectUrl,
            clientMetadata: configuration.clientMetadata,
            clientInformation: () => configuration.clientInformation,
            tokens: () => undefined,
            saveTokens: () => undefined,
            redirectToAuthorization: () => undefined,
            saveCodeVerifier: () => undefined,
            codeVerifier: () => "unused",
          },
          withTransport: (effect) => effect,
          authorize: Effect.die("unused"),
          pending: Ref.modify(reads, (count) => [count === 0 ? Option.none() : Option.some(authorization), count + 1]),
          callback: () => Effect.void,
          clear: Effect.void,
        }
        const error = yield* Layer.build(
          McpToolSource.layer({
            name: "pending",
            transport: { kind: "http", url: "not a URL", oauth },
          }),
        ).pipe(Effect.flip)

        expect(error).toBeInstanceOf(OAuth.OAuthPendingError)
        if (error._tag === "OAuthPendingError") expect(error.authorizationUrl).toBe(authorization.url)
      }),
    ),
  )

  oauthEffect("consumes callback state when authorization is denied or exchange fails", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth

      const deniedAuthorization = yield* oauth.authorize
      const denied = yield* oauth
        .callback(`https://app.example/oauth/callback?error=access_denied&state=${deniedAuthorization.state}`)
        .pipe(Effect.flip)
      expect(denied).toBeInstanceOf(OAuth.OAuthDeniedError)
      const deniedReplay = yield* oauth
        .callback(`https://app.example/oauth/callback?error=access_denied&state=${deniedAuthorization.state}`)
        .pipe(Effect.flip)
      expect(deniedReplay).toBeInstanceOf(OAuth.OAuthExpiredError)

      const failedAuthorization = yield* oauth.authorize
      const failed = yield* oauth
        .callback(`https://app.example/oauth/callback?code=fail-secret&state=${failedAuthorization.state}`)
        .pipe(Effect.flip)
      expect(failed).toBeInstanceOf(OAuth.OAuthProviderError)
      expect(yield* Schema.encodeEffect(Schema.UnknownFromJsonString)(failed)).not.toContain("access-token-secret")
      const failedReplay = yield* oauth
        .callback(`https://app.example/oauth/callback?code=replayed&state=${failedAuthorization.state}`)
        .pipe(Effect.flip)
      expect(failedReplay).toBeInstanceOf(OAuth.OAuthExpiredError)
    }),
  )

  it.effect("refreshes through the SDK and reloads replacement tokens after reconnect without exposure", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const values = yield* Ref.make(new Map<string, Redacted.Redacted<string>>())
        const storeLayer = OAuth.tokenStoreTestLayer({
          load: (server) => Ref.get(values).pipe(Effect.map((entries) => Option.fromUndefinedOr(entries.get(server)))),
          save: (server, tokens) => Ref.update(values, (entries) => new Map(entries).set(server, tokens)),
          remove: (server) =>
            Ref.update(values, (entries) => {
              const next = new Map(entries)
              next.delete(server)
              return next
            }),
        })
        const makeLayer = OAuth.layer(configuration).pipe(Layer.provide(Layer.merge(storeLayer, cryptoTestLayer)))
        const firstOAuth = Context.get(yield* Layer.build(makeLayer), OAuth.OAuth)
        yield* sdkCallback(() =>
          firstOAuth.provider.saveTokens({
            access_token: "expired-access-token",
            token_type: "Bearer",
            refresh_token: "refresh",
          }),
        )
        yield* Effect.tryPromise(() => authMock(firstOAuth.provider, {}))

        const stored = Option.getOrThrow(
          yield* Ref.get(values).pipe(
            Effect.map((entries) => Option.fromUndefinedOr(entries.get(configuration.serverUrl))),
          ),
        )
        expect(String(stored)).not.toContain("refreshed-access-token")
        expect(Redacted.value(stored)).toContain("refreshed-access-token")

        const reconnectedOAuth = Context.get(yield* Layer.build(makeLayer), OAuth.OAuth)
        const reloaded = yield* sdkCallback(reconnectedOAuth.provider.tokens)
        expect(reloaded?.access_token).toBe("refreshed-access-token")
      }),
    ),
  )

  it.effect("sanitizes token-store failures crossing the SDK provider boundary", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const storeError = OAuth.OAuthProviderError.make({
          server: configuration.serverUrl,
          operation: "load",
          message: "store leaked refresh-token-secret",
        })
        const storeLayer = OAuth.tokenStoreTestLayer({
          load: () => Effect.fail(storeError),
          save: () => Effect.void,
          remove: () => Effect.void,
        })
        const oauth = Context.get(
          yield* Layer.build(OAuth.layer(configuration).pipe(Layer.provide(Layer.merge(storeLayer, cryptoTestLayer)))),
          OAuth.OAuth,
        )
        const error = yield* oauth.authorize.pipe(Effect.flip)

        expect(error).toBeInstanceOf(OAuth.OAuthProviderError)
        expect(yield* Schema.encodeEffect(Schema.UnknownFromJsonString)(error)).not.toContain("refresh-token-secret")
      }),
    ),
  )
})
