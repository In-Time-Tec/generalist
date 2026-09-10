import { Config, Effect, Layer, Option, Redacted, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Server, type LayerOptions } from "generalist/server"

const cookieName = "generalist_coedit"

interface BrowserAuth {
  readonly auth: LayerOptions<Record<string, never>, never, never>["auth"]
  readonly login: Layer.Layer<never, never, HttpRouter.HttpRouter>
  readonly tenantId: string
}

export const make: Effect.Effect<BrowserAuth, Config.ConfigError | Schema.SchemaError> = Effect.gen(function* () {
  const expected = yield* Schema.decodeEffect(Schema.String.check(Schema.isNonEmpty()))(
    Redacted.value(yield* Config.Redacted("GENERALIST_SERVER_TOKEN")),
  )
  const tenantId = yield* Config.String("GENERALIST_TENANT")
  const principal = yield* Schema.decodeEffect(Server.Principal)({
    id: "example-controller",
    tenantId,
    role: "controller",
  })
  const sameOrigin = (request: HttpServerRequest.HttpServerRequest) =>
    Option.match(HttpServerRequest.toURL(request), {
      onNone: () => false,
      onSome: (url) => request.headers.origin === url.origin,
    })
  const auth = Layer.succeed(
    Server.Authentication,
    Server.Authentication.of({
      bearer: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          if (Redacted.value(credential) !== expected) {
            const readWithoutOrigin =
              request.method === "GET" && request.headers.upgrade === undefined && request.headers.origin === undefined
            if (request.cookies[cookieName] !== expected || (!readWithoutOrigin && !sameOrigin(request))) {
              return yield* Server.Unauthorized.make({})
            }
          }
          return yield* Effect.provideService(httpEffect, Server.CurrentPrincipal, principal)
        }),
    }),
  )
  const login = HttpRouter.add("POST", "/auth/session", (request) =>
    Effect.gen(function* () {
      const url = HttpServerRequest.toURL(request)
      if (Option.isNone(url) || !sameOrigin(request)) return HttpServerResponse.empty({ status: 403 })
      const secure = url.value.protocol === "https:"
      if (!secure && !["localhost", "127.0.0.1", "[::1]"].includes(url.value.hostname)) {
        return HttpServerResponse.empty({ status: 403 })
      }
      if (request.headers.authorization !== `Bearer ${expected}`) return HttpServerResponse.empty({ status: 401 })
      return yield* HttpServerResponse.empty({ status: 204, headers: { "cache-control": "no-store" } }).pipe(
        HttpServerResponse.setCookie(cookieName, expected, {
          httpOnly: true,
          sameSite: "strict",
          path: "/",
          secure,
          maxAge: "15 minutes",
        }),
        Effect.orDie,
      )
    }),
  )
  return { auth, login, tenantId }
})
