import { BunHttpPlatform, BunServices } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { makeHandler } from "../../docs/server/main.js"

const services = BunHttpPlatform.layer.pipe(Layer.provideMerge(BunServices.layer))

layer(services)("documentation behind a reverse proxy", (it) => {
  it.effect("accepts the internal HTTP healthcheck while using a public HTTPS origin", () =>
    Effect.gen(function* () {
      const { handler } = yield* makeHandler({ origin: "https://docs.example.test", clientRoot: "docs/dist/client" })
      const response = yield* handler.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(new Request("http://health.railway.app/health")),
        ),
      )
      expect(response.status).toBe(200)
      expect(response.headers["content-type"]).toBe("text/plain; charset=utf-8")
    }).pipe(Effect.scoped),
  )

  it.effect("uses the configured origin rather than the inbound Host for canonical URLs", () =>
    Effect.gen(function* () {
      const { handler } = yield* makeHandler({ origin: "https://docs.example.test", clientRoot: "docs/dist/client" })
      const response = yield* handler.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(new Request("http://internal-worker:8080/docs/quickstart")),
        ),
      )
      expect(response.status).toBe(200)
      const html = yield* Effect.promise(() => HttpServerResponse.toWeb(response).text())
      expect(html).toContain("https://docs.example.test/docs/quickstart")
      expect(html).not.toContain("http://internal-worker:8080")
    }).pipe(Effect.scoped),
  )

  it.effect("keeps missing pages and unsupported methods rejected behind the proxy", () =>
    Effect.gen(function* () {
      const { handler } = yield* makeHandler({ origin: "https://docs.example.test", clientRoot: "docs/dist/client" })
      for (const [path, method, status] of [
        ["/missing", "GET", 404],
        ["/docs/tools", "POST", 405],
      ] as const) {
        const response = yield* handler.pipe(
          Effect.provideService(
            HttpServerRequest.HttpServerRequest,
            HttpServerRequest.fromWeb(new Request(`http://internal-worker:8080${path}`, { method })),
          ),
        )
        expect(response.status).toBe(status)
      }
    }).pipe(Effect.scoped),
  )
})
