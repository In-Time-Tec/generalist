import "../../ai/provider/suites/openai-account-auth-lifecycle-suite.js"
import { describe, expect, it } from "@effect/vitest"
import { Crypto, Effect, Encoding, Layer, Option, Redacted, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { credentialsFromAuth } from "../../../src/unstable/providers/openai-account.js"
import {
  AuthError,
  authorizationUrl,
  clientId,
  issuer,
  generatePkce,
  OAuthClient,
  originator,
  redirectUri,
  scopes,
  type OpenAIAccountAuth,
} from "../../../src/unstable/providers/openai-account-auth.js"
import { layer } from "../../../src/unstable/providers/openai-account-auth-http.js"

const digest = (_algorithm: string, data: Uint8Array) =>
  Effect.promise(() =>
    globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(data)).then((value) => new Uint8Array(value)),
  )

const provideAuth =
  (clientLayer: Layer.Layer<HttpClient.HttpClient>) =>
  <A, E>(effect: Effect.Effect<A, E, OAuthClient>) =>
    Effect.scoped(
      Layer.build(Layer.provide(layer, clientLayer)).pipe(Effect.flatMap((context) => Effect.provide(effect, context))),
    )

describe("OpenAI account authorization protocol", () => {
  it.effect("creates exact deterministic PKCE values", () =>
    Effect.gen(function* () {
      const pkce = yield* generatePkce
      const expected = Encoding.encodeBase64Url(
        new Uint8Array(
          yield* Effect.promise(() =>
            crypto.subtle.digest("SHA-256", new TextEncoder().encode(Redacted.value(pkce.verifier))),
          ),
        ),
      )
      expect(pkce.challenge).toBe(expected)
      expect(Redacted.value(pkce.verifier)).toHaveLength(86)
      expect(Redacted.value(pkce.state)).toHaveLength(43)
      const renderedState = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Redacted(Schema.String)))(
        pkce.state,
      )
      expect(renderedState).not.toContain(Redacted.value(pkce.state))
    }).pipe(
      Effect.provideService(
        Crypto.Crypto,
        Crypto.make({
          randomBytes: (() => {
            let next = 0
            return (size: number) => Uint8Array.from({ length: size }, () => next++ & 255)
          })(),
          digest,
        }),
      ),
    ),
  )

  it("constructs the exact authorization URL", () => {
    const url = authorizationUrl("challenge", Redacted.make("private-state"))
    expect(url.origin + url.pathname).toBe(`${issuer}/oauth/authorize`)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      code_challenge: "challenge",
      code_challenge_method: "S256",
      state: "private-state",
      originator,
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
    })
  })

  it.effect("sends exact exchange, refresh, and device requests and classifies pending", () => {
    const requests: Array<HttpClientRequest.HttpClientRequest> = []
    const responses = [
      new Response(JSON.stringify({ access_token: "access" }), { status: 200 }),
      new Response(JSON.stringify({ access_token: "refreshed" }), { status: 200 }),
      new Response(JSON.stringify({ device_auth_id: "device", user_code: "CODE", interval: "5" }), { status: 200 }),
      new Response("", { status: 403 }),
      new Response("", { status: 404 }),
    ]
    const client = HttpClient.make((request) => {
      requests.push(request)
      return Effect.succeed(HttpClientResponse.fromWeb(request, responses.shift()!))
    })
    return Effect.gen(function* () {
      const http = yield* OAuthClient
      yield* http.exchange({
        code: Redacted.make("code-secret"),
        verifier: Redacted.make("verifier-secret"),
        redirectUri,
      })
      yield* http.refresh(Redacted.make("refresh-secret"))
      yield* http.deviceStart
      expect(Option.isNone(yield* http.devicePoll(Redacted.make("device-secret"), "CODE"))).toBe(true)
      expect(Option.isNone(yield* http.devicePoll(Redacted.make("device-secret"), "CODE"))).toBe(true)
      expect(requests.map((request) => request.url)).toEqual([
        `${issuer}/oauth/token`,
        `${issuer}/oauth/token`,
        `${issuer}/api/accounts/deviceauth/usercode`,
        `${issuer}/api/accounts/deviceauth/token`,
        `${issuer}/api/accounts/deviceauth/token`,
      ])
      expect(requests[0]?.body._tag).toBe("Uint8Array")
      if (requests[0]?.body._tag === "Uint8Array") {
        expect(new TextDecoder().decode(requests[0].body.body)).toBe(
          `grant_type=authorization_code&code=code-secret&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${clientId}&code_verifier=verifier-secret`,
        )
      }
      expect(requests[1]?.body._tag).toBe("Uint8Array")
      if (requests[1]?.body._tag === "Uint8Array") {
        expect(new TextDecoder().decode(requests[1].body.body)).toBe(
          `{"client_id":"${clientId}","grant_type":"refresh_token","refresh_token":"refresh-secret"}`,
        )
      }
      expect(requests[2]?.body._tag).toBe("Uint8Array")
      if (requests[2]?.body._tag === "Uint8Array") {
        expect(new TextDecoder().decode(requests[2].body.body)).toBe(`{"client_id":"${clientId}"}`)
      }
      expect(requests[3]?.body._tag).toBe("Uint8Array")
      if (requests[3]?.body._tag === "Uint8Array") {
        expect(new TextDecoder().decode(requests[3].body.body)).toBe(
          '{"device_auth_id":"device-secret","user_code":"CODE"}',
        )
      }
      expect(yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(http)).not.toContain("secret")
    }).pipe(provideAuth(Layer.succeed(HttpClient.HttpClient, client)))
  })

  it.effect(
    "classifies terminal and malformed authorization responses without leaking bodies or request secrets",
    () => {
      const responses = [
        new Response("provider-body-secret", { status: 500 }),
        new Response(JSON.stringify({ error: { code: "refresh_token_reused" }, detail: "provider-body-secret" }), {
          status: 400,
        }),
        new Response("provider-body-secret", { status: 401 }),
        new Response("not-json-provider-body-secret", { status: 200 }),
      ]
      const client = HttpClient.make((request) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, responses.shift()!)),
      )
      return Effect.gen(function* () {
        const http = yield* OAuthClient
        const terminal = yield* Effect.flip(http.devicePoll(Redacted.make("device-request-secret"), "USER-SECRET"))
        const permanent = yield* Effect.flip(http.refresh(Redacted.make("refresh-request-secret")))
        const unauthorized = yield* Effect.flip(http.refresh(Redacted.make("refresh-request-secret")))
        const malformed = yield* Effect.flip(http.deviceStart)
        expect(terminal.kind).toBe("network")
        expect(permanent.kind).toBe("login-required")
        expect(unauthorized.kind).toBe("login-required")
        expect(malformed.kind).toBe("protocol")
        const rendered = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))([
          terminal,
          permanent,
          unauthorized,
          malformed,
        ])
        expect(rendered).not.toMatch(/provider-body-secret|request-secret|USER-SECRET/)
      }).pipe(provideAuth(Layer.succeed(HttpClient.HttpClient, client)))
    },
  )

  it.effect("forces redirect rejection for every fetch-based authorization request", () => {
    const redirects: Array<RequestRedirect | undefined> = []
    const fetch: typeof globalThis.fetch = Object.assign(
      (_input: URL | RequestInfo, init?: BunFetchRequestInit | RequestInit) => {
        redirects.push(init?.redirect)
        return Promise.resolve(new Response(JSON.stringify({ access_token: "access" }), { status: 200 }))
      },
      { preconnect: () => {} },
    )
    return Effect.gen(function* () {
      yield* (yield* OAuthClient).exchange({
        code: Redacted.make("code-secret"),
        verifier: Redacted.make("verifier-secret"),
        redirectUri,
      })
      expect(redirects).toEqual(["error"])
    }).pipe(provideAuth(FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)))))
  })

  it.effect("maps auth credentials and redacts all auth failure details", () =>
    Effect.gen(function* () {
      const secretError = AuthError.make({ kind: "protocol", message: "token-secret account-secret" })
      const credential = {
        accessToken: Redacted.make("access-secret"),
        idToken: Redacted.make("id-secret"),
        refreshToken: Redacted.make("refresh-secret"),
        accountId: Redacted.make("account-secret"),
        fingerprint: "fingerprint",
        generation: "generation",
        expiresAt: 1,
        refreshedAt: 1,
      }
      const service: OpenAIAccountAuth["Service"] = {
        loginBrowser: () => Effect.fail(secretError),
        loginDevice: Effect.fail(secretError),
        status: Effect.succeed({ _tag: "Present", fingerprint: "fingerprint" }),
        logout: Effect.succeed({ removed: false, revocationSupported: false }),
        acquire: Effect.fail(secretError),
        refreshRejected: () => Effect.succeed(credential),
      }
      const credentials = credentialsFromAuth(service, "fingerprint")
      const error = yield* Effect.flip(credentials.acquire)
      expect(yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(error)).not.toMatch(
        /token-secret|account-secret/,
      )
      const mappedCredential = yield* credentials.refreshRejected("old")
      expect(Redacted.value(mappedCredential.accessToken)).toBe("access-secret")
      expect(mappedCredential.accountId).toBe("account-secret")
      expect(mappedCredential.generation).toBe("generation")
      const mismatch = credentialsFromAuth(service, "another-fingerprint")
      expect((yield* Effect.flip(mismatch.refreshRejected("old"))).operation).toBe("refreshRejected")
    }),
  )
})
