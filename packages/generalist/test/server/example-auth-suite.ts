import { expect, layer } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { Approvals, Permissions } from "generalist"
import { Host } from "generalist/host"
import { ExecutableResolver } from "generalist/runtime"
import { Server } from "generalist/server"
import { TestModel } from "generalist/testing"
import { make as coeditAuth } from "../../../../examples/co-edit/src/browser-auth.js"
import { make as researchAuth } from "../../../../examples/deep-research-agent/server/src/browser-auth.js"
import { objectRuntimeLayer } from "../runtime/execution/object.js"

const services = Layer.mergeAll(
  objectRuntimeLayer({ addresses: [] }).pipe(Layer.provide(ExecutableResolver.layerStatic([]))),
  TestModel.layer([]),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

const request = (url: string, options?: RequestInit): Request => {
  const parsed = new URL(url)
  const headers = new Headers(options?.headers)
  headers.set("host", parsed.host)
  if (parsed.protocol === "https:") headers.set("x-forwarded-proto", "https")
  return new Request(url, { ...options, headers })
}

layer(services)("Example browser authentication", (it) => {
  for (const [name, make] of [
    ["coedit", coeditAuth],
    ["research", researchAuth],
  ] as const) {
    it.effect(`${name} exchanges a supplied bearer for an origin-checked HttpOnly cookie`, () =>
      Effect.gen(function* () {
        const authentication = yield* make.pipe(
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            ConfigProvider.fromUnknown({
              GENERALIST_SERVER_TOKEN: "test-browser-token",
              GENERALIST_TENANT: "configured-tenant",
            }),
          ),
        )
        const host = yield* Host.make({ revision: "local", agents: {} })
        const session = yield* host.sessions.create({ id: `cookie-${name}` })
        const app = HttpRouter.toWebHandler(
          Layer.merge(
            authentication.login,
            Server.layer({
              host,
              auth: authentication.auth,
              authorization: {
                tenantId: authentication.tenantId,
                authorize: ({ principal }) => Effect.succeed(principal.tenantId === "configured-tenant"),
              },
            }),
          ).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose))
        const origin = "http://127.0.0.1:4400"
        for (const headers of [
          { origin },
          { origin, authorization: "Bearer incorrect" },
          { origin: "http://untrusted.test", authorization: "Bearer test-browser-token" },
        ]) {
          const denied = yield* Effect.promise(() =>
            app.handler(request(`${origin}/auth/session`, { method: "POST", headers })),
          )
          expect([401, 403]).toContain(denied.status)
          expect(denied.headers.get("set-cookie")).toBeNull()
        }
        const login = yield* Effect.promise(() =>
          app.handler(
            request(`${origin}/auth/session`, {
              method: "POST",
              headers: { origin, authorization: "Bearer test-browser-token" },
            }),
          ),
        )
        expect(login.status).toBe(204)
        expect(yield* Effect.promise(() => login.text())).toBe("")
        const setCookie = login.headers.get("set-cookie")
        expect(setCookie).toContain("HttpOnly")
        expect(setCookie).toContain("SameSite=Strict")
        expect(setCookie).toContain("Max-Age=900")
        const cookie = setCookie?.split(";")[0]
        if (cookie === undefined) return yield* Effect.die("The login did not issue a cookie")
        const snapshot = yield* Effect.promise(() =>
          app.handler(request(`${origin}/sessions/${session.id}/snapshot`, { headers: { cookie } })),
        )
        expect(snapshot.status).toBe(200)
        const missing = yield* Effect.promise(() => app.handler(request(`${origin}/sessions/${session.id}/snapshot`)))
        expect(missing.status).toBe(401)
        const deniedMutation = yield* Effect.promise(() =>
          app.handler(
            request(`${origin}/sessions`, {
              method: "POST",
              headers: { cookie, origin: "http://untrusted.test", "content-type": "application/json" },
              body: "{}",
            }),
          ),
        )
        expect(deniedMutation.status).toBe(401)
        const deniedSocket = yield* Effect.promise(() =>
          app.handler(
            request(`${origin}/sessions/${session.id}/ws`, {
              headers: { cookie, origin: "http://untrusted.test", upgrade: "websocket" },
            }),
          ),
        )
        expect(deniedSocket.status).toBe(401)
        const secureOrigin = "https://example.test"
        const secure = yield* Effect.promise(() =>
          app.handler(
            request(`${secureOrigin}/auth/session`, {
              method: "POST",
              headers: { origin: secureOrigin, authorization: "Bearer test-browser-token" },
            }),
          ),
        )
        expect(secure.status).toBe(204)
        expect(secure.headers.get("set-cookie")).toContain("Secure")
        const insecureOrigin = "http://example.test"
        const insecure = yield* Effect.promise(() =>
          app.handler(
            request(`${insecureOrigin}/auth/session`, {
              method: "POST",
              headers: { origin: insecureOrigin, authorization: "Bearer test-browser-token" },
            }),
          ),
        )
        expect(insecure.status).toBe(403)
      }),
    )
  }
})
