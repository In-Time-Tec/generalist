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
import { auth } from "@modelcontextprotocol/sdk/client/auth.js"
import { MCPClient, OAuth } from "../../src/mcp/index"

const fetchMock = vi.fn<typeof fetch>()
const yieldJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const configuration: OAuth.Configuration = {
  serverUrl: "https://mcp.example/rpc",
  redirectUrl: "https://app.example/oauth/callback",
  clientMetadata: {
    client_name: "TenetKit OAuth test",
    redirect_uris: ["https://app.example/oauth/callback"],
  },
  clientInformation: { client_id: "tenetkit-test" },
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
  Layer.provide(Layer.merge(OAuth.layerTokenStoreMemory, cryptoTestLayer)),
)

const dynamicOAuthLayer = OAuth.layer(dynamicConfiguration).pipe(
  Layer.provide(Layer.merge(OAuth.layerTokenStoreMemory, cryptoTestLayer)),
)

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
    fetchMock.mockReset()
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString())
      if (url.pathname.includes(".well-known/oauth-protected-resource")) {
        return Promise.resolve(
          new Response('{"resource":"https://mcp.example/rpc","authorization_servers":["https://auth.example"]}', {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        )
      }
      if (url.pathname.includes(".well-known/oauth-authorization-server")) {
        return Promise.resolve(
          new Response(
            '{"issuer":"https://auth.example","authorization_endpoint":"https://auth.example/authorize","token_endpoint":"https://auth.example/token","response_types_supported":["code"],"code_challenge_methods_supported":["S256"]}',
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        )
      }
      if (url.pathname.endsWith("/token")) {
        return new Request(input, init).text().then((body) => {
          const code = new URLSearchParams(body).get("code")
          if (code === "fail-secret") throw new Error("provider included access-token-secret")
          const accessToken = code === null ? "refreshed-access-token" : `${code}-pkce-verifier`
          return new Response(
            yieldJson({ access_token: accessToken, token_type: "Bearer", refresh_token: "refresh" }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          )
        })
      }
      return Promise.resolve(new Response(undefined, { status: 404 }))
    })
    vi.stubGlobal("fetch", fetchMock)
  })

  layer(OAuth.layerTokenStoreMemory)((methods) => {
    methods.effect("stores, loads, and removes redacted tokens in memory", () =>
      Effect.gen(function* () {
        const store = yield* OAuth.TokenStore
        const tokens = Redacted.make('{"access_token":"secret"}')
        yield* store.save("https://mcp.example", tokens)
        const loaded = yield* store.load("https://mcp.example")
        expect(Option.isSome(loaded)).toBe(true)
        const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(Option.getOrThrow(loaded))
        expect(encoded).not.toContain("secret")
        expect(Redacted.value(Option.getOrThrow(loaded))).toContain("secret")
        yield* store.remove("https://mcp.example")
        expect(Option.isNone(yield* store.load("https://mcp.example"))).toBe(true)
      }),
    )
  })

  it("exposes typed denied, expired, pending, and provider errors", () => {
    expect(OAuth.OAuthDenied.make({ reason: "access_denied" })._tag).toBe("tenetkit/mcp/OAuthDenied")
    expect(OAuth.OAuthExpired.make({ server: "server" })._tag).toBe("tenetkit/mcp/OAuthExpired")
    expect(OAuth.OAuthPending.make({ authorizationUrl: "https://auth.example" })._tag).toBe("tenetkit/mcp/OAuthPending")
    const provider = OAuth.OAuthProviderError.make({ server: "server", operation: "refresh", message: "failed" })
    expect(provider._tag).toBe("tenetkit/mcp/OAuthProviderError")
    expect(Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(provider)).not.toContain("access_token")
  })

  it.effect("persists and reloads a versioned token document", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const stored = yield* Ref.make(Option.none<Redacted.Redacted<string>>())
        const storeLayer = OAuth.layerTokenStoreTest({
          load: () => Ref.get(stored),
          save: (_server, value) => Ref.set(stored, Option.some(value)),
          remove: () => Ref.set(stored, Option.none()),
        })
        const makeLayer = OAuth.layer(configuration).pipe(Layer.provide(Layer.merge(storeLayer, cryptoTestLayer)))
        const first = Context.get(yield* Layer.build(makeLayer), OAuth.OAuth)
        yield* sdkCallback(() =>
          first.provider.saveTokens({
            access_token: "versioned-access-secret",
            id_token: "versioned-id-secret",
            token_type: "Bearer",
            expires_in: 1800,
            scope: "read write",
            refresh_token: "versioned-refresh-secret",
          }),
        )
        const document = Option.getOrThrow(yield* Ref.get(stored))
        const decoded = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(Redacted.value(document))
        const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(document)

        expect(encoded).not.toContain("secret")
        expect(decoded).toEqual({
          version: 1,
          tokens: {
            access_token: "versioned-access-secret",
            id_token: "versioned-id-secret",
            token_type: "Bearer",
            expires_in: 1800,
            scope: "read write",
            refresh_token: "versioned-refresh-secret",
          },
        })

        const reconnected = Context.get(yield* Layer.build(makeLayer), OAuth.OAuth)
        expect(yield* sdkCallback(() => reconnected.provider.tokens())).toEqual({
          access_token: "versioned-access-secret",
          id_token: "versioned-id-secret",
          token_type: "Bearer",
          expires_in: 1800,
          scope: "read write",
          refresh_token: "versioned-refresh-secret",
        })
      }),
    ),
  )

  it.effect("migrates a valid legacy token document before returning it", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const legacy = Redacted.make(
          '{"access_token":"legacy-access-secret","token_type":"Bearer","expires_in":"3600","refresh_token":"legacy-refresh-secret"}',
        )
        const stored = yield* Ref.make(legacy)
        const saves = yield* Ref.make(0)
        const storeLayer = OAuth.layerTokenStoreTest({
          load: () => Ref.get(stored).pipe(Effect.map(Option.some)),
          save: (_server, value) =>
            Ref.set(stored, value).pipe(Effect.andThen(Ref.update(saves, (count) => count + 1))),
          remove: () => Effect.void,
        })
        const oauth = Context.get(
          yield* Layer.build(OAuth.layer(configuration).pipe(Layer.provide(Layer.merge(storeLayer, cryptoTestLayer)))),
          OAuth.OAuth,
        )

        expect(yield* sdkCallback(() => oauth.provider.tokens())).toEqual({
          access_token: "legacy-access-secret",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "legacy-refresh-secret",
        })
        expect(yield* Ref.get(saves)).toBe(1)
        const decoded = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(
          Redacted.value(yield* Ref.get(stored)),
        )
        expect(decoded).toEqual({
          version: 1,
          tokens: {
            access_token: "legacy-access-secret",
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "legacy-refresh-secret",
          },
        })
        expect(yield* sdkCallback(() => oauth.provider.tokens())).toEqual({
          access_token: "legacy-access-secret",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "legacy-refresh-secret",
        })
        expect(yield* Ref.get(saves)).toBe(1)
      }),
    ),
  )

  it.effect("fails invalid persisted token documents through a sanitized typed error", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const documents = [
          '{"access_token":"syntax-secret"',
          '{"version":2,"tokens":{"access_token":"future-secret","token_type":"Bearer"}}',
          '{"version":1,"tokens":{"access_token":42,"token_type":"Bearer","refresh_token":"field-secret"}}',
        ]

        yield* Effect.forEach(documents, (document) =>
          Effect.gen(function* () {
            const storeLayer = OAuth.layerTokenStoreTest({
              load: () => Effect.succeed(Option.some(Redacted.make(document))),
              save: () => Effect.void,
              remove: () => Effect.void,
            })
            const oauth = Context.get(
              yield* Layer.build(
                OAuth.layer(configuration).pipe(Layer.provide(Layer.merge(storeLayer, cryptoTestLayer))),
              ),
              OAuth.OAuth,
            )
            const error = yield* oauth.withTransport(sdkCallback(() => oauth.provider.tokens())).pipe(Effect.flip)
            const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(error)

            expect(error).toBeInstanceOf(OAuth.OAuthProviderError)
            expect(encoded).not.toContain("secret")
            expect(error).toEqual(
              OAuth.OAuthProviderError.make({
                server: configuration.serverUrl,
                operation: "load tokens",
                message: "OAuth load tokens failed",
              }),
            )
          }),
        )
      }),
    ),
  )

  it.effect("fails a legacy migration write through a sanitized typed error", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const storeLayer = OAuth.layerTokenStoreTest({
          load: () =>
            Effect.succeed(Option.some(Redacted.make('{"access_token":"migration-secret","token_type":"Bearer"}'))),
          save: () =>
            Effect.fail(
              OAuth.OAuthProviderError.make({
                server: configuration.serverUrl,
                operation: "save",
                message: "store leaked migration-secret",
              }),
            ),
          remove: () => Effect.void,
        })
        const oauth = Context.get(
          yield* Layer.build(OAuth.layer(configuration).pipe(Layer.provide(Layer.merge(storeLayer, cryptoTestLayer)))),
          OAuth.OAuth,
        )
        const error = yield* oauth.withTransport(sdkCallback(() => oauth.provider.tokens())).pipe(Effect.flip)
        const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(error)

        expect(error).toEqual(
          OAuth.OAuthProviderError.make({
            server: configuration.serverUrl,
            operation: "load tokens",
            message: "OAuth load tokens failed",
          }),
        )
        expect(encoded).not.toContain("migration-secret")
      }),
    ),
  )

  oauthEffect("validates callback state before reporting authorization denial", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
      const error = yield* oauth
        .callback("https://app.example/oauth/callback?error=access_denied&state=unsolicited")
        .pipe(Effect.flip)

      expect(error).toBeInstanceOf(OAuth.OAuthExpired)
    }),
  )

  oauthEffect("initiates authorization with deterministic state and exchanges one callback", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
      const authorization = yield* oauth.authorize

      const authorizationUrl = new URL(authorization.url)
      expect(`${authorizationUrl.origin}${authorizationUrl.pathname}`).toBe("https://auth.example/authorize")
      expect(authorizationUrl.searchParams.get("state")).toBe(authorization.state)
      yield* oauth.callback(`https://app.example/oauth/callback?code=authorization-code&state=${authorization.state}`)

      const tokens = yield* sdkCallback(() => oauth.provider.tokens())
      expect(tokens?.access_token).toBe("authorization-code-pkce-verifier")

      const replay = yield* oauth
        .callback(`https://app.example/oauth/callback?code=replayed&state=${authorization.state}`)
        .pipe(Effect.flip)
      expect(replay).toBeInstanceOf(OAuth.OAuthExpired)
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
      fetchMock.mockImplementationOnce(() =>
        runPromise(
          Deferred.succeed(exchangeStarted, undefined).pipe(
            Effect.andThen(Deferred.await(releaseExchange)),
            Effect.as(
              new Response('{"access_token":"authorization-code-pkce-verifier","token_type":"Bearer"}', {
                status: 200,
                headers: { "content-type": "application/json" },
              }),
            ),
          ),
        ),
      )

      const callback = yield* oauth
        .callback(`https://app.example/oauth/callback?code=authorization-code&state=${authorization.state}`)
        .pipe(Effect.forkChild)
      yield* Deferred.await(exchangeStarted)

      expect((yield* sdkCallback(() => oauth.provider.codeVerifier()).pipe(Effect.exit))._tag).toBe("Failure")
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
      expect(malformed).toBeInstanceOf(OAuth.OAuthDenied)
      expect(Option.isNone(yield* oauth.pending)).toBe(true)
      expect((yield* sdkCallback(() => oauth.provider.codeVerifier()).pipe(Effect.exit))._tag).toBe("Failure")

      const replay = yield* oauth
        .callback(`https://app.example/oauth/callback?code=replayed&state=${authorization.state}`)
        .pipe(Effect.flip)
      expect(replay).toBeInstanceOf(OAuth.OAuthExpired)
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
          (outcome) => outcome._tag === "Failure" && Schema.is(OAuth.OAuthExpired)(Cause.squash(outcome.cause)),
        ),
      ).toHaveLength(1)
      expect(Option.isNone(yield* oauth.pending)).toBe(true)
      expect((yield* sdkCallback(() => oauth.provider.codeVerifier()).pipe(Effect.exit))._tag).toBe("Failure")
    }),
  )

  oauthEffect("exposes captured SDK authorization as typed pending state", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
      if (oauth.provider.state === undefined) return yield* Effect.die("OAuth provider state is missing")
      const state = yield* sdkCallback(() => oauth.provider.state!())
      yield* sdkCallback(() => oauth.provider.saveCodeVerifier("transport-pkce-verifier"))
      const url = new URL(`https://auth.example/authorize?state=${state}`)
      yield* sdkCallback(() => oauth.provider.redirectToAuthorization(url))
      const pending = Option.getOrThrow(yield* oauth.pending)
      const error = OAuth.OAuthPending.make({ authorizationUrl: pending.url })

      expect(pending).toEqual({ url: url.toString(), state })
      expect(error.authorizationUrl).toBe(url.toString())
    }),
  )

  dynamicOAuthEffect("persists dynamic client registration and honors client invalidation", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
      expect(yield* sdkCallback(() => oauth.provider.clientInformation())).toBeUndefined()
      if (oauth.provider.saveClientInformation === undefined) {
        return yield* Effect.die("OAuth provider cannot save dynamic client registration")
      }
      yield* sdkCallback(() => oauth.provider.saveClientInformation?.({ client_id: "dynamic-client" }))
      expect(yield* sdkCallback(() => oauth.provider.clientInformation())).toEqual({ client_id: "dynamic-client" })
      yield* sdkCallback(() => oauth.provider.invalidateCredentials?.("client"))
      expect(yield* sdkCallback(() => oauth.provider.clientInformation())).toBeUndefined()
    }),
  )

  oauthEffect("retains discovery state through callback exchange and clears it on invalidation", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
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
      expect(yield* sdkCallback(() => oauth.provider.discoveryState!())).toEqual(discovery)
      if (oauth.provider.state === undefined) return yield* Effect.die("OAuth provider state is missing")
      const state = yield* sdkCallback(() => oauth.provider.state!())
      yield* sdkCallback(() => oauth.provider.saveCodeVerifier("discovery-verifier"))
      const tokenResponseBody = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
        access_token: "discovered-access-token",
        token_type: "Bearer",
      })
      let tokenEndpoint = ""
      fetchMock.mockImplementation((url) => {
        tokenEndpoint = new Request(url).url
        return Promise.resolve(
          new Response(tokenResponseBody, {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        )
      })
      yield* oauth.callback(`https://app.example/oauth/callback?code=discovered-code&state=${state}`)
      expect(tokenEndpoint).toBe("https://identity.example/custom-token")
      yield* sdkCallback(() => oauth.provider.invalidateCredentials?.("discovery"))
      expect(yield* sdkCallback(() => oauth.provider.discoveryState!())).toBeUndefined()
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

      expect(fetchMock).not.toHaveBeenCalled()
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
        const storedTokens = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
          version: 1,
          tokens: {
            access_token: "expired-access-token",
            token_type: "Bearer",
            refresh_token: "refresh-token",
          },
        })
        const refreshRequests = yield* Ref.make(0)
        const storeLayer = OAuth.layerTokenStoreTest({
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
              auth(oauth.provider, {
                serverUrl: configuration.serverUrl,
                fetchFn: () =>
                  runPromise(
                    Ref.update(refreshRequests, (count) => count + 1).pipe(
                      Effect.as(
                        new Response('{"access_token":"refreshed-secret","token_type":"Bearer"}', {
                          status: 200,
                          headers: { "content-type": "application/json" },
                        }),
                      ),
                    ),
                  ),
              }),
            ),
          )
          .pipe(Effect.flip)

        expect(error).toEqual(
          OAuth.OAuthProviderError.make({
            server: configuration.serverUrl,
            operation: "save tokens",
            message: "OAuth save tokens failed",
          }),
        )
        expect(yield* Ref.get(refreshRequests)).toBeGreaterThan(0)
        expect(yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(error)).not.toContain("secret")
      }),
    ),
  )

  it.effect("clears local authorization state when token removal fails", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const storeLayer = OAuth.layerTokenStoreTest({
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
        const state = yield* sdkCallback(() => oauth.provider.state!())
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
        expect(yield* sdkCallback(() => oauth.provider.clientInformation())).toBeUndefined()
        expect(yield* sdkCallback(() => oauth.provider.discoveryState!())).toBeUndefined()
        const callback = yield* oauth
          .callback(`https://app.example/oauth/callback?code=replay&state=${state}`)
          .pipe(Effect.flip)
        expect(callback).toBeInstanceOf(OAuth.OAuthExpired)
      }),
    ),
  )

  oauthEffect("does not replace an unrelated connection failure with stale pending state", () =>
    Effect.gen(function* () {
      const oauth = yield* OAuth.OAuth
      yield* oauth.authorize
      const error = yield* Layer.build(
        MCPClient.layer({
          name: "invalid",
          transport: { kind: "http", url: "not a URL", oauth },
        }),
      ).pipe(Effect.flip)

      expect(error).toBeInstanceOf(MCPClient.MCPConnectionFailed)
    }).pipe(Effect.scoped),
  )

  it.effect("preserves newly captured transport authorization as OAuthPending", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const reads = yield* Ref.make(0)
        const authorization = { url: "https://auth.example/authorize?state=transport", state: "transport" }
        const oauth: OAuth.Service = {
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
          MCPClient.layer({
            name: "pending",
            transport: { kind: "http", url: "not a URL", oauth },
          }),
        ).pipe(Effect.flip)

        expect(error).toBeInstanceOf(OAuth.OAuthPending)
        if (error._tag === "tenetkit/mcp/OAuthPending") expect(error.authorizationUrl).toBe(authorization.url)
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
      expect(denied).toBeInstanceOf(OAuth.OAuthDenied)
      const deniedReplay = yield* oauth
        .callback(`https://app.example/oauth/callback?error=access_denied&state=${deniedAuthorization.state}`)
        .pipe(Effect.flip)
      expect(deniedReplay).toBeInstanceOf(OAuth.OAuthExpired)

      const failedAuthorization = yield* oauth.authorize
      const failed = yield* oauth
        .callback(`https://app.example/oauth/callback?code=fail-secret&state=${failedAuthorization.state}`)
        .pipe(Effect.flip)
      expect(failed).toBeInstanceOf(OAuth.OAuthProviderError)
      expect(yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(failed)).not.toContain(
        "access-token-secret",
      )
      const failedReplay = yield* oauth
        .callback(`https://app.example/oauth/callback?code=replayed&state=${failedAuthorization.state}`)
        .pipe(Effect.flip)
      expect(failedReplay).toBeInstanceOf(OAuth.OAuthExpired)
    }),
  )

  it.effect("refreshes through the SDK and reloads replacement tokens after reconnect without exposure", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const values = yield* Ref.make(new Map<string, Redacted.Redacted<string>>())
        const storeLayer = OAuth.layerTokenStoreTest({
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
        yield* Effect.tryPromise(() => auth(firstOAuth.provider, { serverUrl: configuration.serverUrl }))

        const stored = Option.getOrThrow(
          yield* Ref.get(values).pipe(
            Effect.map((entries) => Option.fromUndefinedOr(entries.get(configuration.serverUrl))),
          ),
        )
        const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(stored)
        expect(encoded).not.toContain("refreshed-access-token")
        expect(Redacted.value(stored)).toContain("refreshed-access-token")

        const reconnectedOAuth = Context.get(yield* Layer.build(makeLayer), OAuth.OAuth)
        const reloaded = yield* sdkCallback(() => reconnectedOAuth.provider.tokens())
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
        const storeLayer = OAuth.layerTokenStoreTest({
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
        expect(yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(error)).not.toContain(
          "refresh-token-secret",
        )
      }),
    ),
  )
})
