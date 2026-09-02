/* oxlint-disable effecttsgo/async-function, effecttsgo/global-fetch-in-effect, effecttsgo/prefer-schema-over-json, effecttsgo/process-env, effecttsgo/try-catch-in-effect-gen */
import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const endpoint = process.env.GENERALIST_CLOUDFLARE_DYNAMIC_WORKER_CONFORMANCE_URL
const token = process.env.GENERALIST_CLOUDFLARE_DYNAMIC_WORKER_CONFORMANCE_TOKEN
const describeLive = endpoint !== undefined && token !== undefined ? describe : describe.skip

const ResourceFailure = Schema.Struct({
  protocolVersion: Schema.Literal("1"),
  resource: Schema.Literals(["cpu", "subrequests"]),
  limit: Schema.Int,
})
const IsolationProbe = Schema.Struct({
  protocolVersion: Schema.Literal("1"),
  freshGlobals: Schema.Tuple([Schema.Literal(1), Schema.Literal(1)]),
  networkDenied: Schema.Literal(true),
})

describeLive("credentialed Cloudflare Dynamic Worker provider conformance", () => {
  const probe = (path: string) =>
    Effect.tryPromise(async () => {
      const response = await fetch(`${endpoint}${path}`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const body: unknown = await response.json()
      return { status: response.status, body }
    })

  it.effect("observes production CPU and subrequest termination plus freshness and egress denial", () =>
    Effect.gen(function* () {
      for (const [path, resource, limit] of [
        ["/sandbox-conformance/cpu?limit=5", "cpu", 5],
        ["/sandbox-conformance/subrequests?limit=1", "subrequests", 1],
      ] as const) {
        const response = yield* probe(path)
        expect(response.status).toBe(429)
        expect(
          yield* Schema.decodeUnknownEffect(ResourceFailure, { onExcessProperty: "error" })(response.body),
        ).toEqual({ protocolVersion: "1", resource, limit })
      }
      const isolation = yield* probe("/sandbox-conformance/isolation")
      expect(isolation.status).toBe(200)
      expect(yield* Schema.decodeUnknownEffect(IsolationProbe, { onExcessProperty: "error" })(isolation.body)).toEqual({
        protocolVersion: "1",
        freshGlobals: [1, 1],
        networkDenied: true,
      })
    }),
  )
})

if (endpoint === undefined || token === undefined)
  it.skip("Cloudflare provider gate skipped: set GENERALIST_CLOUDFLARE_DYNAMIC_WORKER_CONFORMANCE_URL and _TOKEN", () =>
    undefined)
